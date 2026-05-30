import type { Context } from 'hono';
import { or, eq } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '../../../lib/env.js';
import { logger } from '../../../lib/logger.js';
import { db, schema } from '../../../db/index.js';
import { verifyHmacSha256 } from '../../middleware/hmac.js';

const AlchemyLogSchema = z.object({
  address: z.string(),
  topics: z.array(z.string()),
  data: z.string(),
  blockNumber: z.string(),
  transactionHash: z.string(),
  transactionIndex: z.string(),
  blockHash: z.string(),
  logIndex: z.string(), // hex
  removed: z.boolean(),
});

const AlchemyActivitySchema = z.object({
  blockNum: z.string(), // hex
  hash: z.string(),
  fromAddress: z.string(),
  toAddress: z.string(),
  value: z.number(),
  asset: z.string(),
  category: z.string(),
  rawContract: z.object({
    rawValue: z.string(), // hex — use this for lossless amounts
    address: z.string(),  // empty string for native MNT
    decimals: z.number(),
  }),
  log: AlchemyLogSchema.nullable(),
});

const AlchemyWebhookSchema = z.object({
  webhookId: z.string(),
  id: z.string(),
  createdAt: z.string(),
  type: z.literal('ADDRESS_ACTIVITY'),
  event: z.object({
    network: z.string(),
    activity: z.array(AlchemyActivitySchema),
  }),
});

type AlchemyActivity = z.infer<typeof AlchemyActivitySchema>;

function isDuplicateKeyError(err: unknown): boolean {
  return err instanceof Error && /duplicate key|unique constraint/i.test(err.message);
}

async function insertEvent(params: {
  userId: number;
  direction: 'inflow' | 'outflow';
  activity: AlchemyActivity;
  logIndex: number;
}): Promise<void> {
  const { userId, direction, activity, logIndex } = params;
  const kind = direction === 'inflow' ? 'onchain_transfer_in' : 'onchain_transfer_out';

  try {
    await db.insert(schema.events).values({
      userId,
      kind,
      onchainChainId: env.MANTLE_CHAIN_ID,
      onchainTxHash: activity.hash,
      onchainLogIndex: logIndex,
      onchainBlockNumber: BigInt(parseInt(activity.blockNum, 16)),
      onchainAmount: activity.rawContract.rawValue,
      onchainToken: activity.rawContract.address.toLowerCase() || null,
      onchainFrom: activity.fromAddress.toLowerCase(),
      onchainTo: activity.toAddress.toLowerCase(),
      offchainSource: 'alchemy_webhook',
      rawPayload: activity as unknown as Record<string, unknown>,
    });

    logger.info(
      { userId, direction, txHash: activity.hash, asset: activity.asset },
      'Recorded Alchemy transfer event',
    );
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      logger.debug({ txHash: activity.hash, logIndex }, 'Duplicate event, skipping');
      return;
    }
    throw err;
  }
}

export async function handleAlchemyWebhook(c: Context): Promise<Response> {
  const rawBody = await c.req.text();
  const signature = c.req.header('x-alchemy-signature') ?? '';

  if (!verifyHmacSha256(rawBody, env.ALCHEMY_WEBHOOK_SECRET ?? '', signature)) {
    logger.warn('Alchemy webhook: invalid signature');
    return c.json({ error: 'invalid signature' }, 403);
  }

  let payload: z.infer<typeof AlchemyWebhookSchema>;
  try {
    payload = AlchemyWebhookSchema.parse(JSON.parse(rawBody));
  } catch (err) {
    logger.warn({ err }, 'Alchemy webhook: invalid payload');
    return c.json({ error: 'invalid payload' }, 400);
  }

  for (const activity of payload.event.activity) {
    // Skip reorg events — chain reorganization reversed this transfer
    if (activity.log?.removed === true) {
      logger.warn({ txHash: activity.hash }, 'Alchemy webhook: skipping reorg activity');
      continue;
    }

    const fromAddress = activity.fromAddress.toLowerCase();
    const toAddress = activity.toAddress.toLowerCase();

    // Match against watched wallets (Tier 1 — user's MetaMask/Phantom addresses)
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
      logger.debug({ fromAddress, toAddress }, 'Alchemy webhook: no watched wallet matched');
      continue;
    }

    // logIndex: parse from hex log field; native MNT transfers have no log → use 0
    const logIndex = activity.log ? parseInt(activity.log.logIndex, 16) : 0;

    for (const wallet of matchedWallets) {
      const direction: 'inflow' | 'outflow' = wallet.address === toAddress ? 'inflow' : 'outflow';
      await insertEvent({ userId: wallet.userId, direction, activity, logIndex });
    }
  }

  // Always 200 after HMAC passes — Alchemy won't retry on 200
  return c.json({ status: 'ok' });
}
