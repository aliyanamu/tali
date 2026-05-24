import type { CommandContext, Context } from 'grammy';
import { eq } from 'drizzle-orm';
import { erc20Abi, formatUnits, type Address } from 'viem';
import { db, schema } from '../../db/index.js';
import { publicClient } from '../../lib/chain.js';
import { TOKENS } from '../../lib/tokens.js';
import { getPricesInIdr } from '../../lib/prices.js';
import { logger } from '../../lib/logger.js';

function formatIdr(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatTokenAmount(amount: number): string {
  if (amount === 0) return '0';
  if (amount < 0.0001) return amount.toExponential(2);
  if (amount < 1) return amount.toFixed(4);
  if (amount < 1000) return amount.toFixed(2);
  return amount.toFixed(0);
}

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

  const wallet = user.walletAddress as Address;

  try {
    const erc20Tokens = TOKENS.filter((t) => !t.isNative);
    const nativeToken = TOKENS.find((t) => t.isNative);

    const [mntBalance, ...erc20Balances] = await Promise.all([
      publicClient.getBalance({ address: wallet }),
      ...erc20Tokens.map((t) =>
        publicClient.readContract({
          address: t.address,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [wallet],
        }),
      ),
    ]);

    const coingeckoIds = TOKENS.map((t) => t.coingeckoId);
    const prices = await getPricesInIdr(coingeckoIds);

    const rows: { symbol: string; amount: number; idr: number }[] = [];
    let totalIdr = 0;

    if (nativeToken) {
      const amount = Number(formatUnits(mntBalance, nativeToken.decimals));
      const idr = amount * (prices[nativeToken.coingeckoId] ?? 0);
      rows.push({ symbol: nativeToken.symbol, amount, idr });
      totalIdr += idr;
    }

    for (let i = 0; i < erc20Tokens.length; i++) {
      const t = erc20Tokens[i]!;
      const balance = erc20Balances[i] as bigint;
      const amount = Number(formatUnits(balance, t.decimals));
      const idr = amount * (prices[t.coingeckoId] ?? 0);
      rows.push({ symbol: t.symbol, amount, idr });
      totalIdr += idr;
    }

    const lines: string[] = [];
    lines.push(`*Net worth: ${formatIdr(totalIdr)}*`);
    lines.push('');
    lines.push('On-chain (Mantle):');

    const nonZeroRows = rows.filter((r) => r.amount > 0);

    if (nonZeroRows.length === 0) {
      lines.push('_Empty — fund your wallet to see balances._');
    } else {
      for (const row of nonZeroRows) {
        lines.push(`• ${row.symbol}: ${formatTokenAmount(row.amount)} (${formatIdr(row.idr)})`);
      }
    }

    lines.push('');
    lines.push(`Wallet: \`${wallet}\``);

    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    logger.error(
      { err, wallet, telegramId: telegramId.toString() },
      '/networth failed',
    );
    await ctx.reply('Sorry, could not fetch your balances right now. Try again in a moment.');
  }
}
