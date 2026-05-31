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
  rawPayload: object;
}

export async function ingestTransfer(params: TransferParams): Promise<boolean> {
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
    return false;
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

  await db
    .insert(schema.onchainEvents)
    .values(
      matchedWallets.map((wallet) => ({
        userId: wallet.userId,
        chainId,
        txHash,
        logIndex,
        blockNumber,
        confirmedAt: new Date(blockTimestamp * 1000),
        kind: 'transfer',
        direction: (wallet.address === toAddress ? 'inflow' : 'outflow') as 'inflow' | 'outflow',
        assetCode: asset?.code ?? null,
        amountRaw,
        amountDecimal,
        tokenAddress,
        fromAddress,
        toAddress,
        source,
        rawPayload,
      })),
    )
    .onConflictDoNothing();

  logger.info(
    { wallets: matchedWallets.length, txHash, asset: asset?.code, source },
    'Recorded transfer',
  );

  return true;
}
