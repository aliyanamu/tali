import type { Context } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { or, eq } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { db, schema } from '../db/index.js';

/**
 * Goldsky Mirror webhook payload schema for a Transfer event indexer.
 *
 * The exact shape depends on the Mirror pipeline configuration we deploy.
 * This schema assumes the standard ERC-20 Transfer indexer pattern. Adjust
 * field names once the actual pipeline is configured (week-1 pipeline-config task).
 */
const TransferEventSchema = z.object({
  op: z.enum(['INSERT', 'UPDATE', 'DELETE']).default('INSERT'),
  data: z.object({
    transaction_hash: z.string(),
    log_index: z.number().int(),
    block_number: z.number().int(),
    from_address: z.string(),
    to_address: z.string(),
    value: z.string(), // wei as decimal string — never parse to number, would lose precision
    token_address: z.string(),
    chain_id: z.number().int().default(env.MANTLE_CHAIN_ID),
  }),
});

type TransferEvent = z.infer<typeof TransferEventSchema>;

/**
 * Constant-time HMAC verification. The header name is the most likely Goldsky
 * convention; if the actual header differs in production, adjust the lookup
 * in handleGoldskyWebhook below.
 */
function verifySignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', env.GOLDSKY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const provided = signature.startsWith('sha256=') ? signature.slice(7) : signature;

  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
  } catch {
    return false;
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  return err instanceof Error && /duplicate key|unique constraint/i.test(err.message);
}

async function insertEventForUser(params: {
  userId: number;
  direction: 'inflow' | 'outflow';
  payload: TransferEvent;
  fromAddress: string;
  toAddress: string;
}): Promise<void> {
  const { userId, direction, payload, fromAddress, toAddress } = params;
  const kind = direction === 'inflow' ? 'onchain_transfer_in' : 'onchain_transfer_out';

  try {
    await db.insert(schema.events).values({
      userId,
      kind,
      onchainChainId: payload.data.chain_id,
      onchainTxHash: payload.data.transaction_hash,
      onchainLogIndex: payload.data.log_index,
      onchainBlockNumber: BigInt(payload.data.block_number),
      onchainAmount: payload.data.value,
      onchainToken: payload.data.token_address.toLowerCase(),
      onchainFrom: fromAddress,
      onchainTo: toAddress,
      rawPayload: payload as unknown as Record<string, unknown>,
    });

    logger.info(
      {
        userId,
        direction,
        txHash: payload.data.transaction_hash,
        token: payload.data.token_address,
        amount: payload.data.value,
      },
      'Recorded onchain event',
    );
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      logger.debug(
        { txHash: payload.data.transaction_hash, logIndex: payload.data.log_index },
        'Duplicate event, skipping',
      );
      return;
    }
    throw err;
  }
}

export async function handleGoldskyWebhook(c: Context): Promise<Response> {
  const rawBody = await c.req.text();
  // Header name is best-guess; verify against actual Goldsky Mirror docs once pipeline is live.
  const signature = c.req.header('x-goldsky-signature') ?? c.req.header('x-signature');

  if (!verifySignature(rawBody, signature)) {
    logger.warn('Goldsky webhook: invalid signature');
    return c.json({ error: 'invalid signature' }, 401);
  }

  let payload: TransferEvent;
  try {
    payload = TransferEventSchema.parse(JSON.parse(rawBody));
  } catch (err) {
    logger.warn({ err }, 'Goldsky webhook: invalid payload');
    return c.json({ error: 'invalid payload' }, 400);
  }

  // UPDATE/DELETE on Mirror indicates re-orgs. v2 will handle re-org reversal properly.
  if (payload.op !== 'INSERT') {
    logger.info({ op: payload.op, txHash: payload.data.transaction_hash }, 'Skipping non-INSERT op');
    return c.json({ status: 'skipped' });
  }

  const fromAddress = payload.data.from_address.toLowerCase();
  const toAddress = payload.data.to_address.toLowerCase();

  // Find any users whose Tier 2 wallet matches either side of the transfer.
  const matchedUsers = await db
    .select()
    .from(schema.users)
    .where(or(eq(schema.users.walletAddress, fromAddress), eq(schema.users.walletAddress, toAddress)));

  if (matchedUsers.length === 0) {
    logger.warn(
      { fromAddress, toAddress, txHash: payload.data.transaction_hash },
      'Goldsky webhook: no user matched, ignoring',
    );
    // 200 so Goldsky won't retry — this event simply isn't ours to process.
    return c.json({ status: 'no_user' });
  }

  for (const user of matchedUsers) {
    if (!user.walletAddress) continue;
    const direction: 'inflow' | 'outflow' =
      user.walletAddress.toLowerCase() === toAddress ? 'inflow' : 'outflow';
    await insertEventForUser({ userId: user.id, direction, payload, fromAddress, toAddress });
  }

  return c.json({ status: 'ok' });
}
