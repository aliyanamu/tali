import { logger } from './lib/logger.js';
import { startBot } from './bot/index.js';
import { startWebhookServer } from './webhooks/server.js';

async function main(): Promise<void> {
  logger.info('Tali starting...');
  await startWebhookServer();
  // bot.start() blocks (long polling), so launch without await.
  startBot().catch((err) => {
    logger.error({ err }, 'Bot stopped unexpectedly');
    process.exit(1);
  });
  logger.info('Tali running.');
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup');
  process.exit(1);
});

// Graceful shutdown
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'Received shutdown signal');
    process.exit(0);
  });
}
