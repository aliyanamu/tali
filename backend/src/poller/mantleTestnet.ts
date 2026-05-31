import { createPublicClient, defineChain, http, parseAbiItem } from 'viem';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logger } from '../lib/logger.js';
import { ingestTransfer } from '../services/transferIngestion.js';

const CHAIN_ID = 5003;
// ~24s lookback at ~1.2s/block — covers restarts without re-processing large history
const LOOKBACK_BLOCKS = 20n;

const mantleSepolia = defineChain({
  id: CHAIN_ID,
  name: 'Mantle Sepolia Testnet',
  nativeCurrency: { name: 'MNT', symbol: 'MNT', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.sepolia.mantle.xyz'] } },
  blockExplorers: {
    default: { name: 'Mantle Testnet Explorer', url: 'https://explorer.sepolia.mantle.xyz' },
  },
  testnet: true,
});

const TRANSFER_ABI = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

export function startMantleTestnetPoller(rpcUrl: string, intervalMs: number): () => void {
  const client = createPublicClient({ chain: mantleSepolia, transport: http(rpcUrl) });

  let lastBlock: bigint | null = null;
  let stopped = false;

  async function poll(): Promise<void> {
    if (stopped) return;

    try {
      const latestBlock = await client.getBlockNumber();

      if (lastBlock === null) {
        lastBlock = latestBlock - LOOKBACK_BLOCKS;
      }

      if (lastBlock >= latestBlock) return;

      const fromBlock = lastBlock + 1n;
      const toBlock = latestBlock;

      const wallets = await db
        .select({ address: schema.watchedWallets.address })
        .from(schema.watchedWallets)
        .where(eq(schema.watchedWallets.chainId, CHAIN_ID));

      const watchedAddresses = wallets.map((w) => w.address as `0x${string}`);

      if (watchedAddresses.length === 0) {
        lastBlock = toBlock;
        return;
      }

      // Two queries because eth_getLogs can't OR across different topic positions in one call
      const [fromLogs, toLogs] = await Promise.all([
        client.getLogs({ event: TRANSFER_ABI, args: { from: watchedAddresses }, fromBlock, toBlock }),
        client.getLogs({ event: TRANSFER_ABI, args: { to: watchedAddresses }, fromBlock, toBlock }),
      ]);

      const seen = new Set<string>();
      const allLogs = [...fromLogs, ...toLogs].filter((log) => {
        const key = `${log.transactionHash}:${log.logIndex}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (allLogs.length === 0) {
        lastBlock = toBlock;
        return;
      }

      // Batch fetch timestamps for unique block numbers seen in this poll window
      const uniqueBlockNums = [...new Set(allLogs.map((l) => l.blockNumber!))];
      const blockTimestamps = new Map<bigint, number>();
      await Promise.all(
        uniqueBlockNums.map(async (blockNumber) => {
          const block = await client.getBlock({ blockNumber });
          blockTimestamps.set(blockNumber, Number(block.timestamp));
        }),
      );

      for (const log of allLogs) {
        if (!log.args.from || !log.args.to || log.args.value === undefined) continue;

        await ingestTransfer({
          chainId: CHAIN_ID,
          fromAddress: log.args.from.toLowerCase(),
          toAddress: log.args.to.toLowerCase(),
          amountRaw: log.args.value.toString(),
          tokenAddress: log.address.toLowerCase(),
          txHash: log.transactionHash!,
          logIndex: log.logIndex ?? 0,
          blockNumber: log.blockNumber!,
          blockTimestamp: blockTimestamps.get(log.blockNumber!) ?? Math.floor(Date.now() / 1000),
          source: 'rpc_poll',
          rawPayload: {
            blockNumber: log.blockNumber?.toString(),
            transactionHash: log.transactionHash,
            address: log.address,
            logIndex: log.logIndex,
            args: {
              from: log.args.from,
              to: log.args.to,
              value: log.args.value.toString(),
            },
          },
        });
      }

      logger.info(
        { fromBlock: fromBlock.toString(), toBlock: toBlock.toString(), logs: allLogs.length },
        'Mantle testnet poll complete',
      );

      lastBlock = toBlock;
    } catch (err) {
      logger.warn({ err }, 'Mantle testnet poller: poll error (will retry)');
    }
  }

  void poll();
  const timer = setInterval(() => { void poll(); }, intervalMs);

  logger.info({ rpcUrl, intervalMs, chainId: CHAIN_ID }, 'Mantle testnet poller started');

  return () => {
    stopped = true;
    clearInterval(timer);
    logger.info('Mantle testnet poller stopped');
  };
}
