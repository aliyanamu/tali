import postgres from 'postgres';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

async function main(): Promise<void> {
  const client = postgres(env.DATABASE_URL, { max: 1 });

  logger.info('Dropping all tables...');
  await client`DROP TABLE IF EXISTS events, watched_wallets, users CASCADE`;
  await client`DROP TABLE IF EXISTS drizzle.__drizzle_migrations CASCADE`;
  await client`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  logger.info('Done — run db:migrate to recreate');

  await client.end();
}

main().catch((err) => {
  logger.error({ err }, 'Reset failed');
  process.exit(1);
});
