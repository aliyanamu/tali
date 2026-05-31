import { Command } from 'commander';
import { eq } from 'drizzle-orm';
import { env } from '../../lib/env.js';
import { db, schema } from '../../db/index.js';
import { addWatchAddress, removeWatchAddress } from '../../integrations/goldsky.js';

async function getDemoUserId(): Promise<string> {
  const user = await db.query.users.findFirst();
  if (!user) {
    console.error('No user found — run pnpm db:seed first');
    process.exit(1);
  }
  return user.id;
}

export const walletCommand = new Command('wallet')
  .description('Manage watched wallets')
  .addCommand(
    new Command('watch')
      .description('Add a wallet address to watch (registers locally + Goldsky pipeline)')
      .argument('<address>', 'EVM address to watch (0x...)')
      .option('--label <label>', 'Human-readable label, e.g. "MetaMask main"')
      .option('--chain-id <chainId>', 'Chain ID (default: MANTLE_CHAIN_ID from env)', String(env.MANTLE_CHAIN_ID))
      .option('-o, --output <format>', 'Output format: text | json', 'text')
      .action(async (address: string, opts: { label?: string; chainId: string; output: string }) => {
        const normalized = address.toLowerCase();
        const chainId = Number(opts.chainId);
        const userId = await getDemoUserId();

        try {
          await addWatchAddress(normalized);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (opts.output === 'json') {
            process.stderr.write(JSON.stringify({ success: false, error: message }) + '\n');
          } else {
            console.error(`✗ Goldsky registration failed: ${message}`);
          }
          process.exit(1);
        }

        await db
          .insert(schema.watchedWallets)
          .values({ userId, address: normalized, label: opts.label ?? null, chainId })
          .onConflictDoNothing();

        if (opts.output === 'json') {
          console.log(JSON.stringify({ success: true, address: normalized, chainId, label: opts.label ?? null }));
        } else {
          console.log(`✓ Saved to DB (chainId: ${chainId}${opts.label ? `, label: ${opts.label}` : ''})`);
          console.log(`\nWatching: ${normalized}`);
          console.log();
          console.log(`  Note: Goldsky pipeline watches a static address list baked into`);
          console.log(`  backend/goldsky/pipeline.yaml. New addresses only receive events`);
          console.log(`  after the pipeline.yaml is updated and redeployed.`);
        }
      }),
  )
  .addCommand(
    new Command('unwatch')
      .description('Stop watching a wallet address')
      .argument('<address>', 'EVM address to unwatch (0x...)')
      .option('-o, --output <format>', 'Output format: text | json', 'text')
      .action(async (address: string, opts: { output: string }) => {
        const normalized = address.toLowerCase();

        try {
          await removeWatchAddress(normalized);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (opts.output === 'json') {
            process.stderr.write(JSON.stringify({ success: false, error: message }) + '\n');
          } else {
            console.error(`✗ Goldsky deregistration failed: ${message}`);
          }
          process.exit(1);
        }

        await db.delete(schema.watchedWallets).where(eq(schema.watchedWallets.address, normalized));

        if (opts.output === 'json') {
          console.log(JSON.stringify({ success: true, address: normalized }));
        } else {
          console.log(`✓ Removed ${normalized} from DB`);
        }
      }),
  )
  .addCommand(
    new Command('list')
      .description('List all watched wallets')
      .option('-o, --output <format>', 'Output format: text | json', 'text')
      .action(async (opts: { output: string }) => {
        try {
          const wallets = await db
            .select()
            .from(schema.watchedWallets)
            .orderBy(schema.watchedWallets.createdAt);

          if (opts.output === 'json') {
            console.log(
              JSON.stringify({
                wallets: wallets.map((w) => ({ address: w.address, chainId: w.chainId, label: w.label })),
              }),
            );
            return;
          }

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
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (opts.output === 'json') {
            process.stderr.write(JSON.stringify({ success: false, error: message }) + '\n');
          } else {
            console.error(`✗ Failed to list wallets: ${message}`);
          }
          process.exit(1);
        }
      }),
  );
