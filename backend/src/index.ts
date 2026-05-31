import { logger } from './lib/logger.js';
import { env } from './lib/env.js';
import { startWebhookServer } from './server/app.js';
import { startMantleTestnetPoller } from './poller/mantleTestnet.js';

async function main(): Promise<void> {
  logger.info('Tali webhook server starting...');
  await startWebhookServer();

  if (env.MANTLE_TESTNET_RPC) {
    const stopPoller = startMantleTestnetPoller(env.MANTLE_TESTNET_RPC, env.POLL_INTERVAL_MS);
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, stopPoller);
    }
  }

  logger.info('Tali running — webhook server ready, tali-cli available.');
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup');
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'Received shutdown signal');
    process.exit(0);
  });
}
