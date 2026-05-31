import type { Context } from 'hono';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { env } from '../../../lib/env.js';
import { logger } from '../../../lib/logger.js';
import { ingestTransfer } from '../../../services/transferIngestion.js';

// Parsed once at module load — not on every request.
const CHAIN_ID = Number(env.MANTLE_CHAIN_ID);

// Constant-time comparison padded to a fixed size to prevent length-based timing leaks.
function verifyGoldskySecret(incoming: string, expected: string): boolean {
  try {
    const SIZE = 64;
    const a = Buffer.alloc(SIZE);
    const b = Buffer.alloc(SIZE);
    Buffer.from(incoming, 'utf8').copy(a);
    Buffer.from(expected, 'utf8').copy(b);
    return timingSafeEqual(a, b) && incoming.length === expected.length;
  } catch {
    return false;
  }
}

// Goldsky Mirror mantle.erc20_transfers dataset field names.
// NOTE: field names are sender/recipient/amount — NOT from/to/value (those are Alchemy's).
const GoldskyTransferSchema = z.object({
  id: z.string(),
  sender: z.string(),
  recipient: z.string(),
  amount: z.string().regex(/^\d{1,78}$/, 'must be a non-negative uint256 decimal string'),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(), // token contract address; absent for native
  transaction_hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  block_number: z.number().int(),
  block_timestamp: z.number().int(), // unix seconds
  log_index: z.number().int().optional(),
});

// Mirror webhook sink sends a flat array of rows (one row per request when one_row_per_request: true).
const GoldskyPayloadSchema = z.union([
  z.array(GoldskyTransferSchema),
  GoldskyTransferSchema,
]);

export async function handleGoldskyWebhook(c: Context): Promise<Response> {
  const rawBody = await c.req.text();
  const secret = c.req.query('secret') ?? '';

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
      await ingestTransfer({
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
    }

    return c.json({ status: 'ok' });
  } catch (err) {
    logger.error({ err }, 'Goldsky webhook: unexpected error');
    return c.json({ error: 'internal error' }, 500);
  }
}
