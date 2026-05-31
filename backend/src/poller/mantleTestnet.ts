import { createPublicClient, defineChain, http, parseAbiItem, type Transaction } from 'viem';
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

      const watchedSet = new Set(watchedAddresses.map((a) => a.toLowerCase()));

      // Build block range array for fetching full block data (native transfer detection)
      const blockRange: bigint[] = [];
      for (let b = fromBlock; b <= toBlock; b += 1n) blockRange.push(b);

      // Fetch ERC-20 logs AND full blocks (with transactions) in parallel.
      // Blocks give us both timestamps and native transfer data — one fetch covers both.
      const [fromLogs, toLogs, blocks] = await Promise.all([
        client.getLogs({ event: TRANSFER_ABI, args: { from: watchedAddresses }, fromBlock, toBlock }),
        client.getLogs({ event: TRANSFER_ABI, args: { to: watchedAddresses }, fromBlock, toBlock }),
        Promise.all(blockRange.map((blockNumber) => client.getBlock({ blockNumber, includeTransactions: true }))),
      ]);

      // Build timestamp map from the fetched blocks
      const blockTimestamps = new Map<bigint, number>();
      for (const block of blocks) {
        blockTimestamps.set(block.number!, Number(block.timestamp));
      }

      // Deduplicate ERC-20 logs (from + to queries can overlap)
      const seen = new Set<string>();
      const erc20Logs = [...fromLogs, ...toLogs].filter((log) => {
        const key = `${log.transactionHash}:${log.logIndex}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Find native transfer candidates: value > 0, address matches a watched wallet
      const nativeCandidates = blocks.flatMap((block) =>
        (block.transactions as Transaction[]).filter(
          (tx) =>
            tx.value > 0n &&
            tx.to !== null &&
            (watchedSet.has(tx.to!.toLowerCase()) || watchedSet.has(tx.from.toLowerCase())),
        ),
      );

      // Fetch receipts for candidates only; filter out failed transactions
      const successfulNative =
        nativeCandidates.length > 0
          ? await Promise.all(
              nativeCandidates.map((tx) =>
                client.getTransactionReceipt({ hash: tx.hash }).then((r) => ({ tx, ok: r.status === 'success' })),
              ),
            ).then((results) => results.filter((r) => r.ok).map((r) => r.tx))
          : [];

      // Ingest ERC-20 transfers
      for (const log of erc20Logs) {
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
            args: { from: log.args.from, to: log.args.to, value: log.args.value.toString() },
          },
        });
      }

      // Ingest native MNT transfers. logIndex -1 is a sentinel (no log event emitted for native transfers).
      for (const tx of successfulNative) {
        await ingestTransfer({
          chainId: CHAIN_ID,
          fromAddress: tx.from.toLowerCase(),
          toAddress: tx.to!.toLowerCase(),
          amountRaw: tx.value.toString(),
          tokenAddress: null,
          txHash: tx.hash,
          logIndex: -1,
          blockNumber: tx.blockNumber!,
          blockTimestamp: blockTimestamps.get(tx.blockNumber!) ?? Math.floor(Date.now() / 1000),
          source: 'rpc_poll',
          rawPayload: {
            blockNumber: tx.blockNumber?.toString(),
            transactionHash: tx.hash,
            transactionIndex: tx.transactionIndex,
            from: tx.from,
            to: tx.to,
            value: tx.value.toString(),
          },
        });
      }

      if (erc20Logs.length > 0 || successfulNative.length > 0) {
        logger.info(
          {
            fromBlock: fromBlock.toString(),
            toBlock: toBlock.toString(),
            erc20: erc20Logs.length,
            native: successfulNative.length,
          },
          'Mantle testnet poll complete',
        );
      }

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
