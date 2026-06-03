import type { Context } from 'hono';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { env } from '../../../lib/env.js';
import { logger } from '../../../lib/logger.js';
import { ingestTransfer } from '../../../services/transferIngestion.js';
import { matchAndExecuteRules } from '../../../services/ruleExecutor.js';

// Parsed once at module load — not on every request.
const CHAIN_ID = Number(env.MANTLE_CHAIN_ID);

// Secret is passed as X-Goldsky-Secret header (not a query param) to avoid appearing in logs.
function verifyGoldskySecret(incoming: string, expected: string): boolean {
  try {
    const a = Buffer.from(incoming, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Goldsky Mirror mantle.erc20_transfers dataset field names.
// NOTE: field names are sender/recipient/amount — NOT from/to/value.
const GoldskyErc20Schema = z.object({
  id: z.string(),
  sender: z.string(),
  recipient: z.string(),
  amount: z.string().regex(/^\d{1,78}$/, 'must be a non-negative uint256 decimal string'),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(), // token contract; absent for native
  transaction_hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  block_number: z.number().int(),
  block_timestamp: z.number().int(), // unix seconds
  log_index: z.number().int().optional(),
});

// Goldsky Mirror mantle.transactions dataset field names.
// Pipeline transform filters to value > 0 AND receipt_status = 1 before delivery;
// the handler also checks receipt_status for defense-in-depth.
const GoldskyNativeTxSchema = z.object({
  hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  from_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  to_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  value: z.string().regex(/^\d{1,78}$/, 'must be a non-negative uint256 decimal string'),
  block_number: z.number().int(),
  block_timestamp: z.number().int(), // unix seconds
  transaction_index: z.number().int(),
  receipt_status: z.number().int(), // 1 = success
});

type ErcRow = z.infer<typeof GoldskyErc20Schema>;
type NativeRow = z.infer<typeof GoldskyNativeTxSchema>;

// Mirror webhook sinks send one row per request (one_row_per_request: true).
// Array branch is a defensive catch-all; pipeline config guarantees single-row delivery.
const GoldskyPayloadSchema = z.union([
  z.array(z.union([GoldskyErc20Schema, GoldskyNativeTxSchema])).max(500),
  GoldskyErc20Schema,
  GoldskyNativeTxSchema,
]);

// 'hash' and 'from_address' are only present in NativeRow — these field names are
// load-bearing discriminators; do not rename without updating this guard.
function isNativeRow(row: ErcRow | NativeRow): row is NativeRow {
  return 'hash' in row && 'from_address' in row;
}

export async function handleGoldskyWebhook(c: Context): Promise<Response> {
  const rawBody = await c.req.text();
  const secret = c.req.header('x-goldsky-secret') ?? '';

  if (!verifyGoldskySecret(secret, env.GOLDSKY_WEBHOOK_SECRET)) {
    logger.warn('Goldsky webhook: invalid secret');
    return c.json({ error: 'invalid secret' }, 403);
  }

  let parsed: z.infer<typeof GoldskyPayloadSchema>;
  try {
    parsed = GoldskyPayloadSchema.parse(JSON.parse(rawBody));
  } catch (err) {
    logger.warn({ err }, 'Goldsky webhook: invalid payload');
    return c.json({ error: 'invalid payload' }, 400);
  }

  try {
    const rows = Array.isArray(parsed) ? parsed : [parsed];

    for (const row of rows) {
      if (isNativeRow(row)) {
        if (row.receipt_status !== 1) {
          logger.warn({ txHash: row.hash, status: row.receipt_status }, 'Goldsky: skipping failed native tx');
          continue;
        }
        const { wasNew, matchedWallets } = await ingestTransfer({
          chainId: CHAIN_ID,
          fromAddress: row.from_address.toLowerCase(),
          toAddress: row.to_address.toLowerCase(),
          amountRaw: row.value,
          tokenAddress: null,
          txHash: row.hash,
          logIndex: -1, // sentinel: no log event emitted for native transfers
          blockNumber: BigInt(row.block_number),
          blockTimestamp: row.block_timestamp,
          source: 'goldsky_mirror',
          rawPayload: { ...row },
        });

        if (wasNew) {
          // Non-blocking — must not delay the 200 response past Goldsky's delivery timeout
          void matchAndExecuteRules({
            chainId:        CHAIN_ID,
            txHash:         row.hash,
            fromAddress:    row.from_address.toLowerCase(),
            toAddress:      row.to_address.toLowerCase(),
            tokenAddress:   null,
            amountRaw:      row.value,
            blockTimestamp: row.block_timestamp,
          }, matchedWallets).catch((err: unknown) =>
            logger.error({ err, txHash: row.hash }, 'matchAndExecuteRules error (goldsky native)')
          );
        }
      } else {
        const { wasNew, matchedWallets } = await ingestTransfer({
          chainId: CHAIN_ID,
          fromAddress: row.sender.toLowerCase(),
          toAddress: row.recipient.toLowerCase(),
          amountRaw: row.amount,
          tokenAddress: row.address?.toLowerCase() ?? null,
          txHash: row.transaction_hash,
          logIndex: row.log_index ?? 0,
          blockNumber: BigInt(row.block_number),
          blockTimestamp: row.block_timestamp,
          source: 'goldsky_mirror',
          rawPayload: { ...row },
        });

        if (wasNew) {
          void matchAndExecuteRules({
            chainId:        CHAIN_ID,
            txHash:         row.transaction_hash,
            fromAddress:    row.sender.toLowerCase(),
            toAddress:      row.recipient.toLowerCase(),
            tokenAddress:   row.address?.toLowerCase() ?? null,
            amountRaw:      row.amount,
            blockTimestamp: row.block_timestamp,
          }, matchedWallets).catch((err: unknown) =>
            logger.error({ err, txHash: row.transaction_hash }, 'matchAndExecuteRules error (goldsky erc20)')
          );
        }
      }
    }

    return c.json({ status: 'ok' });
  } catch (err) {
    logger.error({ err }, 'Goldsky webhook: unexpected error');
    return c.json({ error: 'internal error' }, 500);
  }
}
