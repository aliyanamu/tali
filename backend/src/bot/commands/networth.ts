import type { CommandContext, Context } from 'grammy';
import { eq } from 'drizzle-orm';
import type { Address } from 'viem';
import { db, schema } from '../../db/index.js';
import { fetchNetworth } from '../../services/networth.js';
import { formatIdr, formatAmount } from '../../lib/format.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../lib/env.js';

export async function handleNetworth(ctx: CommandContext<Context>): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const telegramId = BigInt(from.id);

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.telegramId, telegramId))
    .limit(1);

  if (!user?.walletAddress) {
    await ctx.reply('Run /start first to set up your wallet.');
    return;
  }

  try {
    const { wallet, totalIdr, tokens } = await fetchNetworth(
      user.walletAddress as Address,
      env.ALCHEMY_MANTLE_RPC,
      env.COINGECKO_API_KEY,
    );

    const nonZero = tokens.filter((t) => t.amount > 0);
    const lines: string[] = [];
    lines.push(`*Net worth: ${formatIdr(totalIdr)}*`);
    lines.push('');
    lines.push('On-chain (Mantle):');

    if (nonZero.length === 0) {
      lines.push('_Empty — fund your wallet to see balances._');
    } else {
      for (const t of nonZero) {
        lines.push(`• ${t.symbol}: ${formatAmount(t.amount)} (${formatIdr(t.idr)})`);
      }
    }

    lines.push('');
    lines.push(`Wallet: \`${wallet}\``);

    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    logger.error({ err, telegramId: telegramId.toString() }, '/networth failed');
    await ctx.reply('Sorry, could not fetch your balances right now. Try again in a moment.');
  }
}
