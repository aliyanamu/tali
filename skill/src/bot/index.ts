import { Bot } from 'grammy';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { handleStart } from './commands/start.js';

export const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

bot.catch((err) => {
  logger.error({ err }, 'Bot error');
});

// Command registry — append new commands here as they're added.
bot.command('start', handleStart);

bot.command('help', async (ctx) => {
  await ctx.reply(
    'Commands:\n' +
      '/start — onboard / view your Tali wallet\n' +
      '/networth — see your total assets\n' +
      '/log — record a transaction in natural language\n' +
      '/rules — manage your autonomous rules\n' +
      '/help — show this message',
  );
});

export async function startBot(): Promise<void> {
  logger.info('Starting Telegram bot in long-polling mode...');
  await bot.start({
    onStart: (botInfo) => {
      logger.info({ username: botInfo.username }, 'Telegram bot online');
    },
  });
}
