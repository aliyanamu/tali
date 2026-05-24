import { Bot } from 'grammy';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

export const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

bot.catch((err) => {
  logger.error({ err }, 'Bot error');
});

export async function startBot(): Promise<void> {
  // Commands are registered in src/bot/commands/ — wired into here as they're added.
  // For MVP we use long polling. Webhook mode can be a later optimization.
  logger.info('Starting Telegram bot in long-polling mode...');
  await bot.start({
    onStart: (botInfo) => {
      logger.info({ username: botInfo.username }, 'Telegram bot online');
    },
  });
}
