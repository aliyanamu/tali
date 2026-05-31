import { Command } from 'commander';
import { db, schema } from '../../db/index.js';

async function getDemoUserId(): Promise<string> {
  const user = await db.query.users.findFirst();
  if (!user) {
    console.error('No user found ��� run pnpm db:seed first');
    process.exit(1);
  }
  return user.id;
}

export const logCommand = new Command('log')
  .description('Log a fiat transaction and optionally reconcile with an onchain event')
  .option('--kind <kind>', 'p2p_trade | bank_transfer | ewallet | expense | income', 'p2p_trade')
  .option('--direction <dir>', 'inflow | outflow | neutral', 'outflow')
  .option('--fiat-amount <amount>', 'Fiat amount (e.g. 820000)')
  .option('--currency <code>', 'Fiat currency code (e.g. IDR, USD)', 'IDR')
  .option('--date <date>', 'Date of transaction (YYYY-MM-DD), defaults to today')
  .option('--note <text>', 'Free-text description')
  .option('--onchain-event-id <uuid>', 'Onchain event ID to reconcile with (from tali-cli history -o json)')
  .option('-o, --output <format>', 'Output format: text | json', 'text')
  .action(async (opts: {
    kind: string;
    direction: string;
    fiatAmount?: string;
    currency: string;
    date?: string;
    note?: string;
    onchainEventId?: string;
    output: string;
  }) => {
    const validDirections = ['inflow', 'outflow', 'neutral'];
    if (!validDirections.includes(opts.direction)) {
      const msg = `--direction must be one of: ${validDirections.join(' | ')}`;
      if (opts.output === 'json') {
        process.stderr.write(JSON.stringify({ success: false, error: msg }) + '\n');
      } else {
        console.error(msg);
      }
      process.exit(1);
    }

    const userId = await getDemoUserId();

    try {
      const result = await db
        .insert(schema.offchainEntries)
        .values({
          userId,
          kind: opts.kind,
          direction: opts.direction as 'inflow' | 'outflow' | 'neutral',
          fiatAmount: opts.fiatAmount ?? null,
          currencyCode: opts.currency,
          note: opts.note ?? null,
          occurredAt: opts.date ? new Date(opts.date) : new Date(),
          source: 'tali_log',
        })
        .returning();

      const entry = result[0];
      if (!entry) throw new Error('Insert returned no rows');

      if (opts.onchainEventId) {
        await db.insert(schema.eventReconciliations).values({
          onchainEventId: opts.onchainEventId,
          offchainEntryId: entry.id,
          kind: opts.kind,
        });
      }

      if (opts.output === 'json') {
        console.log(JSON.stringify({
          success: true,
          id: entry.id,
          reconciled: !!opts.onchainEventId,
          onchainEventId: opts.onchainEventId ?? null,
        }));
      } else {
        console.log(`✓ Logged: ${entry.id}`);
        if (opts.onchainEventId) {
          console.log(`✓ Reconciled with onchain event: ${opts.onchainEventId}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (opts.output === 'json') {
        process.stderr.write(JSON.stringify({ success: false, error: message }) + '\n');
      } else {
        console.error(`✗ Failed to log entry: ${message}`);
      }
      process.exit(1);
    }
  });
