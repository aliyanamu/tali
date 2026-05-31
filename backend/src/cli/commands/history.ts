import { Command } from 'commander';
import { and, desc, eq, gte, lte, or } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

export const historyCommand = new Command('history')
  .description('Show recent onchain transfers for watched wallets')
  .option('--wallet <address>', 'Filter by wallet address (from or to)')
  .option('--chain-id <chainId>', 'Filter by chain ID')
  .option('--asset <code>', 'Filter by asset code (e.g. USDT, MNT)')
  .option('--from <date>', 'Start date inclusive (YYYY-MM-DD)')
  .option('--to <date>', 'End date inclusive (YYYY-MM-DD)')
  .option('--limit <n>', 'Number of events to show (max 100)', '20')
  .option('-o, --output <format>', 'Output format: text | json', 'text')
  .action(async (opts: {
    wallet?: string;
    chainId?: string;
    asset?: string;
    from?: string;
    to?: string;
    limit: string;
    output: string;
  }) => {
    const limit = Math.min(parseInt(opts.limit, 10) || 20, 100);
    const chainId = opts.chainId ? Number(opts.chainId) : undefined;
    const address = opts.wallet?.toLowerCase();
    const asset = opts.asset?.toUpperCase();

    try {
      const where = and(
        chainId !== undefined ? eq(schema.onchainEvents.chainId, chainId) : undefined,
        asset ? eq(schema.onchainEvents.assetCode, asset) : undefined,
        address
          ? or(
              eq(schema.onchainEvents.fromAddress, address),
              eq(schema.onchainEvents.toAddress, address),
            )
          : undefined,
        opts.from ? gte(schema.onchainEvents.confirmedAt, new Date(opts.from)) : undefined,
        opts.to
          ? lte(schema.onchainEvents.confirmedAt, new Date(opts.to + 'T23:59:59.999Z'))
          : undefined,
      );

      const events = await db
        .select()
        .from(schema.onchainEvents)
        .where(where)
        .orderBy(desc(schema.onchainEvents.confirmedAt))
        .limit(limit);

      if (opts.output === 'json') {
        console.log(
          JSON.stringify({
            events: events.map((e) => ({
              id: e.id, // pass to tali-cli log --onchain-event-id to reconcile
              txHash: e.txHash,
              direction: e.direction,
              assetCode: e.assetCode,
              amountDecimal: e.amountDecimal,
              confirmedAt: e.confirmedAt?.toISOString() ?? null,
              chainId: e.chainId,
              fromAddress: e.fromAddress,
              toAddress: e.toAddress,
            })),
          }),
        );
        return;
      }

      if (events.length === 0) {
        console.log('No transfer events found.');
        return;
      }

      console.log('\nRecent transfers:');
      console.log('─'.repeat(80));
      for (const e of events) {
        const dir = e.direction === 'inflow' ? '↓ IN ' : e.direction === 'outflow' ? '↑ OUT' : '↔    ';
        const amount = e.amountDecimal
          ? `${e.amountDecimal} ${e.assetCode ?? '?'}`
          : `? ${e.assetCode ?? '?'}`;
        const when = e.confirmedAt?.toISOString().slice(0, 19).replace('T', ' ') ?? 'pending';
        console.log(`  ${dir}  ${amount.padEnd(24)}  ${e.txHash.slice(0, 14)}…  ${when}`);
      }
      console.log();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (opts.output === 'json') {
        process.stderr.write(JSON.stringify({ success: false, error: message }) + '\n');
      } else {
        console.error(`✗ Failed to fetch history: ${message}`);
      }
      process.exit(1);
    }
  });
