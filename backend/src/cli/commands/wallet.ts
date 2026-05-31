import { Command } from 'commander';
import { eq } from 'drizzle-orm';
import { env } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';
import { db, schema } from '../../db/index.js';
import { addWatchAddress, removeWatchAddress } from '../../integrations/alchemy.js';

export const walletCommand = new Command('wallet')
  .description('Manage watched wallets')
  .addCommand(
    new Command('watch')
      .description('Add a wallet address to watch (registers with Alchemy + stores locally)')
      .argument('<address>', 'EVM address to watch (0x...)')
      .option('--label <label>', 'Human-readable label, e.g. "MetaMask main"')
      .option('--chain-id <chainId>', 'Chain ID (default: MANTLE_CHAIN_ID from env)', String(env.MANTLE_CHAIN_ID))
      .action(async (address: string, opts: { label?: string; chainId: string }) => {
        const normalized = address.toLowerCase();
        const chainId = Number(opts.chainId);

        // 1. Register with Alchemy Notify
        try {
          await addWatchAddress(normalized);
          console.log(`✓ Registered ${normalized} with Alchemy webhook`);
        } catch (err: any) {
          console.error(`✗ Alchemy registration failed: ${err.message}`);
          console.error('  Set ALCHEMY_WEBHOOK_AUTH_TOKEN and ALCHEMY_WEBHOOK_ID in .env');
          process.exit(1);
        }

        // 2. Upsert into watchedWallets table (default userId=1 for single-user MVP)
        await db
          .insert(schema.watchedWallets)
          .values({ userId: 1, address: normalized, label: opts.label ?? null, chainId })
          .onConflictDoNothing();

        console.log(`✓ Saved to DB (chainId: ${chainId}${opts.label ? `, label: ${opts.label}` : ''})`);
        console.log(`\nWatching: ${normalized}`);
      }),
  )
  .addCommand(
    new Command('unwatch')
      .description('Stop watching a wallet address')
      .argument('<address>', 'EVM address to unwatch (0x...)')
      .action(async (address: string) => {
        const normalized = address.toLowerCase();

        // 1. Deregister from Alchemy Notify
        try {
          await removeWatchAddress(normalized);
          console.log(`✓ Removed ${normalized} from Alchemy webhook`);
        } catch (err: any) {
          console.error(`✗ Alchemy deregistration failed: ${err.message}`);
          process.exit(1);
        }

        // 2. Remove from DB
        await db
          .delete(schema.watchedWallets)
          .where(eq(schema.watchedWallets.address, normalized));

        console.log(`✓ Removed from DB`);
      }),
  )
  .addCommand(
    new Command('list')
      .description('List all watched wallets')
      .action(async () => {
        const wallets = await db.select().from(schema.watchedWallets).orderBy(schema.watchedWallets.createdAt);

        if (wallets.length === 0) {
          console.log('No wallets watched. Run: tali-cli wallet watch <address>');
          return;
        }

        console.log('\nWatched wallets:');
        console.log('─'.repeat(60));
        for (const w of wallets) {
          const label = w.label ? ` (${w.label})` : '';
          console.log(`  ${w.address}  chain:${w.chainId}${label}`);
        }
        console.log();
      }),
  );
