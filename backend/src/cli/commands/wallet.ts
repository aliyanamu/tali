import { Command } from 'commander';

export const walletCommand = new Command('wallet')
  .description('Manage watched wallets')
  .addCommand(
    new Command('watch')
      .description('Add a wallet address to watch (read-only)')
      .argument('<address>', 'EVM or Solana address')
      .option('--label <label>', 'Human-readable label, e.g. "MetaMask main"')
      .action(async (address: string, opts: { label?: string }) => {
        // TODO: write to watchedWallets table + register Goldsky pipeline
        console.log(`[stub] Would watch: ${address}${opts.label ? ` (${opts.label})` : ''}`);
        console.log('Wallet watching not yet implemented — coming in week 2.');
      }),
  )
  .addCommand(
    new Command('list').description('List all watched wallets').action(async () => {
      // TODO: query watchedWallets table
      console.log('[stub] No wallets watched yet.');
    }),
  );
