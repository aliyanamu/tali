import { Command } from 'commander';

export const logCommand = new Command('log')
  .description('Log a P2P trade or manual transaction in natural language')
  .argument('[entry]', 'Natural language entry, e.g. "sold 50 USDT got 820000 IDR via Binance P2P"')
  .option('-o, --output <format>', 'Output format: table (default) or json', 'table')
  .action(async (entry: string | undefined, opts: { output: string }) => {
    if (!entry) {
      if (opts.output === 'json') {
        process.stderr.write(JSON.stringify({ success: false, error: 'Provide a log entry' }) + '\n');
      } else {
        console.error('Provide a log entry, e.g.: tali-cli log "sold 50 USDT got 820000 IDR"');
      }
      process.exit(1);
    }

    // Not implemented — P2P reconciliation ships in week 2
    if (opts.output === 'json') {
      process.stderr.write(JSON.stringify({ success: false, error: 'Not implemented — P2P reconciliation ships in week 2' }) + '\n');
    } else {
      console.error('P2P reconciliation not yet implemented — coming in week 2.');
    }
    process.exit(1);
  });
