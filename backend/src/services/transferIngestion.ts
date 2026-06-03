import { and, eq, or } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logger } from '../lib/logger.js';

export function rawToDecimalString(rawValue: string, decimals: number): string {
  const raw = BigInt(rawValue);
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;
  return `${whole}.${remainder.toString().padStart(decimals, '0').slice(0, 8)}`;
}

export interface TransferParams {
  chainId: number;
  fromAddress: string;
  toAddress: string;
  amountRaw: string;
  tokenAddress: string | null;
  txHash: string;
  logIndex: number;
  blockNumber: bigint;
  blockTimestamp: number; // unix seconds
  source: string;
  rawPayload: Record<string, unknown>;
}

export interface IngestResult {
  wasNew:         boolean;                                         // true if at least one new row was inserted
  matchedWallets: Array<{ userId: string; address: string }>;     // wallets that matched this transfer
}

export async function ingestTransfer(params: TransferParams): Promise<IngestResult> {
  const {
    chainId,
    fromAddress,
    toAddress,
    amountRaw,
    tokenAddress,
    txHash,
    logIndex,
    blockNumber,
    blockTimestamp,
    source,
    rawPayload,
  } = params;

  const matchedWallets = await db
    .select()
    .from(schema.watchedWallets)
    .where(
      and(
        eq(schema.watchedWallets.chainId, chainId),
        or(
          eq(schema.watchedWallets.address, fromAddress),
          eq(schema.watchedWallets.address, toAddress),
        ),
      ),
    );

  if (matchedWallets.length === 0) {
    logger.debug({ fromAddress, toAddress, chainId }, 'transferIngestion: no watched wallet matched');
    return { wasNew: false, matchedWallets: [] };
  }

  const asset = tokenAddress
    ? await db.query.assets.findFirst({
        where: (a, { and: qAnd, eq: qEq }) =>
          qAnd(qEq(a.chainId, chainId), qEq(a.tokenAddress, tokenAddress)),
      })
    : await db.query.assets.findFirst({
        where: (a, { and: qAnd, eq: qEq, isNull }) =>
          qAnd(qEq(a.chainId, chainId), isNull(a.tokenAddress)),
      });

  const decimals = asset?.decimals ?? 18;
  const amountDecimal = rawToDecimalString(amountRaw, decimals);

  // Use RETURNING to detect genuinely new rows — onConflictDoNothing returns [] on duplicate.
  // This distinguishes "first time we see this tx" from "Goldsky webhook retry" so callers
  // only fire rule execution for new events.
  const inserted = await db
    .insert(schema.onchainEvents)
    .values(
      matchedWallets.map((wallet) => {
        const direction: 'inflow' | 'outflow' | 'neutral' =
          fromAddress === toAddress
            ? 'neutral'
            : wallet.address === toAddress
              ? 'inflow'
              : 'outflow';

        return {
          userId: wallet.userId,
          chainId,
          txHash,
          logIndex,
          blockNumber,
          confirmedAt: new Date(blockTimestamp * 1000),
          kind: 'transfer',
          direction,
          assetCode: asset?.code ?? null,
          amountRaw,
          amountDecimal,
          tokenAddress,
          fromAddress,
          toAddress,
          source,
          rawPayload,
        };
      }),
    )
    .onConflictDoNothing()
    .returning({ id: schema.onchainEvents.id });

  const wasNew = inserted.length > 0;

  if (wasNew) {
    logger.info(
      { wallets: matchedWallets.length, txHash, asset: asset?.code, source },
      'Recorded transfer',
    );
  } else {
    logger.debug({ txHash, source }, 'transferIngestion: duplicate event, skipped');
  }

  return {
    wasNew,
    matchedWallets: matchedWallets.map(w => ({ userId: w.userId, address: w.address })),
  };
}
