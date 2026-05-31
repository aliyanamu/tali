import type { Context } from 'hono';
import { eq, or } from 'drizzle-orm';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { env } from '../../../lib/env.js';
import { logger } from '../../../lib/logger.js';
import { db, schema } from '../../../db/index.js';

function verifyGoldskySecret(incoming: string, expected: string): boolean {
  try {
    const a = Buffer.from(incoming);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Converts a raw uint256 string to a decimal string with up to 8 fractional digits.
// e.g. rawToDecimalString('1000000', 6) → '1.00000000'
function rawToDecimalString(rawValue: string, decimals: number): string {
  const raw = BigInt(rawValue);
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;
  return `${whole}.${remainder.toString().padStart(decimals, '0').slice(0, 8)}`;
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
  block_timestamp: z.number().int(),     // unix seconds
  log_index: z.number().int().optional(),
});

// Mirror webhook sink sends a flat array of rows (one row per request when one_row_per_request: true).
const GoldskyPayloadSchema = z.union([
  z.array(GoldskyTransferSchema),
  GoldskyTransferSchema,
]);

export async function handleGoldskyWebhook(c: Context): Promise<Response> {
  const rawBody = await c.req.text();
  const secret = c.req.header('goldsky-webhook-secret') ?? '';

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

  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const chainId = Number(env.MANTLE_CHAIN_ID);

  for (const row of rows) {
    const fromAddress = row.sender.toLowerCase();
    const toAddress = row.recipient.toLowerCase();

    const matchedWallets = await db
      .select()
      .from(schema.watchedWallets)
      .where(
        or(
          eq(schema.watchedWallets.address, fromAddress),
          eq(schema.watchedWallets.address, toAddress),
        ),
      );

    if (matchedWallets.length === 0) {
      logger.debug({ fromAddress, toAddress }, 'Goldsky webhook: no watched wallet matched');
      continue;
    }

    const tokenAddr = row.address?.toLowerCase() ?? null;
    const asset = tokenAddr
      ? await db.query.assets.findFirst({
          where: (a, { and, eq }) => and(eq(a.chainId, chainId), eq(a.tokenAddress, tokenAddr)),
        })
      : await db.query.assets.findFirst({
          where: (a, { and, eq, isNull }) => and(eq(a.chainId, chainId), isNull(a.tokenAddress)),
        });

    const decimals = asset?.decimals ?? 18;
    const amountDecimal = rawToDecimalString(row.amount, decimals);
    const logIndex = row.log_index ?? 0;

    for (const wallet of matchedWallets) {
      const direction = wallet.address === toAddress ? 'inflow' : 'outflow';
      try {
        await db.insert(schema.onchainEvents).values({
          userId: wallet.userId,
          chainId,
          txHash: row.transaction_hash,
          logIndex,
          blockNumber: BigInt(row.block_number),
          confirmedAt: new Date(row.block_timestamp * 1000),
          kind: 'transfer',
          direction,
          assetCode: asset?.code ?? null,
          amountRaw: row.amount,
          amountDecimal,
          tokenAddress: tokenAddr,
          fromAddress,
          toAddress,
          source: 'goldsky_mirror',
          rawPayload: row as unknown as Record<string, unknown>,
        });
        logger.info(
          { userId: wallet.userId, direction, txHash: row.transaction_hash, asset: asset?.code },
          'Recorded Goldsky transfer',
        );
      } catch (err) {
        if (err instanceof Error && /duplicate key|unique constraint/i.test(err.message)) {
          logger.debug({ txHash: row.transaction_hash, logIndex }, 'Duplicate event, skipping');
          continue;
        }
        throw err;
      }
    }
  }

  return c.json({ status: 'ok' });
}
