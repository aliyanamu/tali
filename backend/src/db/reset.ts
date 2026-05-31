import postgres from 'postgres';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

async function main(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    logger.error('reset.ts must not run in production — aborting');
    process.exit(1);
  }

  const client = postgres(env.DATABASE_URL, { max: 1 });

  logger.info('Dropping public schema and drizzle metadata...');
  await client`DROP SCHEMA IF EXISTS public CASCADE`;
  await client`CREATE SCHEMA public`;
  await client`GRANT ALL ON SCHEMA public TO PUBLIC`;
  await client`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  logger.info('Done — run pnpm db:migrate to recreate');

  await client.end();
}

main().catch((err) => {
  logger.error({ err }, 'Reset failed');
  process.exit(1);
});
