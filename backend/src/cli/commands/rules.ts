import { Command } from 'commander';

export const rulesCommand = new Command('rules')
  .description('Manage autonomous financial rules')
  .addCommand(
    new Command('list').description('List active rules').action(async () => {
      // TODO: query Postgres rules table
      console.log('[stub] No rules configured yet.');
    }),
  )
  .addCommand(
    new Command('add')
      .description('Add a rule in natural language')
      .argument('<rule>', 'e.g. "when USDT balance > 100, farm yield on Byreal"')
      .action(async (rule: string) => {
        // TODO: NL parse → AutonomousRule.sol → Postgres
        console.log(`[stub] Would add rule: "${rule}"`);
        console.log('Rules engine not yet implemented — coming in week 2.');
      }),
  )
  .addCommand(
    new Command('remove')
      .description('Remove a rule by ID')
      .argument('<id>', 'Rule ID')
      .action(async (id: string) => {
        console.log(`[stub] Would remove rule: ${id}`);
      }),
  );
