import { Command } from 'commander';

export const logCommand = new Command('log')
  .description('Log a P2P trade or manual transaction in natural language')
  .argument('[entry]', 'Natural language entry, e.g. "sold 50 USDT got 820000 IDR via Binance P2P"')
  .option('-o, --output <format>', 'Output format: table (default) or json', 'table')
  .action(async (entry: string | undefined, opts: { output: string }) => {
    if (!entry) {
      console.error('Provide a log entry, e.g.: tali-cli log "sold 50 USDT got 820000 IDR"');
      process.exit(1);
    }

    // TODO: wire Claude NL parser → ledger write → auto-link to onchain outflow
    console.log(`[stub] Would parse and log: "${entry}"`);
    console.log('P2P reconciliation not yet implemented — coming in week 2.');
  });
