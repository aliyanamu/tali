import { logger } from './lib/logger.js';
import { startWebhookServer } from './server/app.js';

async function main(): Promise<void> {
  logger.info('Tali webhook server starting...');
  await startWebhookServer();
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
