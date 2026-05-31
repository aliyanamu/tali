import { Command } from 'commander';

const notImplemented = (opts?: { output?: string }) => {
  const msg = 'Not implemented — rules engine ships in week 2';
  if (opts?.output === 'json') {
    process.stderr.write(JSON.stringify({ success: false, error: msg }) + '\n');
  } else {
    console.error(msg);
  }
  process.exit(1);
};

export const rulesCommand = new Command('rules')
  .description('Manage autonomous financial rules')
  .addCommand(
    new Command('list')
      .description('List active rules')
      .option('-o, --output <format>', 'Output format: table | json', 'table')
      .action(async (opts) => notImplemented(opts)),
  )
  .addCommand(
    new Command('add')
      .description('Add a rule in natural language')
      .argument('<rule>', 'e.g. "when USDT balance > 100, farm yield on Byreal"')
      .option('-o, --output <format>', 'Output format: table | json', 'table')
      .action(async (_rule, opts) => notImplemented(opts)),
  )
  .addCommand(
    new Command('remove')
      .description('Remove a rule by ID')
      .argument('<id>', 'Rule ID')
      .option('-o, --output <format>', 'Output format: table | json', 'table')
      .action(async (_id, opts) => notImplemented(opts)),
  );
