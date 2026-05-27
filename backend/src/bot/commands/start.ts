import type { CommandContext, Context } from 'grammy';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { createWalletForUser } from '../../wallet/privy.js';
import { logger } from '../../lib/logger.js';

const COPY = {
  en: {
    welcomeNew: (address: string): string =>
      `Welcome to Tali.\n\n` +
      `Your wallet on Mantle: \`${address}\`\n\n` +
      `Non-custodial — your keys are split between Privy's secure enclave and your authentication. ` +
      `Tali never sees your private key.\n\n` +
      `Next steps:\n` +
      `• /networth to see what you hold\n` +
      `• /log to record a transaction\n` +
      `• /rules to set up an autonomous rule`,
    welcomeBack: (address: string): string =>
      `Welcome back.\n\nYour wallet: \`${address}\``,
    error: 'Sorry, something went wrong setting up your account. Try /start again in a moment.',
  },
  id: {
    welcomeNew: (address: string): string =>
      `Selamat datang di Tali.\n\n` +
      `Dompet kamu di Mantle: \`${address}\`\n\n` +
      `Non-kustodial — kunci kamu terbagi antara enclave aman Privy dan autentikasi kamu sendiri. ` +
      `Tali tidak pernah melihat private key kamu.\n\n` +
      `Langkah selanjutnya:\n` +
      `• /networth untuk lihat aset kamu\n` +
      `• /log untuk mencatat transaksi\n` +
      `• /rules untuk atur aturan otomatis`,
    welcomeBack: (address: string): string =>
      `Selamat datang kembali.\n\nDompet kamu: \`${address}\``,
    error: 'Maaf, ada masalah saat menyiapkan akun. Coba /start lagi sebentar lagi.',
  },
} as const;

type Lang = keyof typeof COPY;

function pickLang(code: string | undefined | null): Lang {
  if (code?.startsWith('id')) return 'id';
  return 'en';
}

function asLang(value: string): Lang {
  return value === 'id' ? 'id' : 'en';
}

export async function handleStart(ctx: CommandContext<Context>): Promise<void> {
  const from = ctx.from;
  if (!from) {
    logger.warn('Received /start with no from');
    return;
  }

  const telegramId = BigInt(from.id);
  const detectedLang = pickLang(from.language_code);

  try {
    const existing = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.telegramId, telegramId))
      .limit(1);

    if (existing.length > 0) {
      const user = existing[0]!;
      const userLang = asLang(user.lang);
      const address = user.walletAddress ?? '(not yet created)';
      await ctx.reply(COPY[userLang].welcomeBack(address), { parse_mode: 'Markdown' });
      return;
    }

    // New user — create wallet then insert.
    const { walletId, address } = await createWalletForUser(telegramId);

    await db.insert(schema.users).values({
      telegramId,
      lang: detectedLang,
      privyWalletId: walletId,
      walletAddress: address,
    });

    await ctx.reply(COPY[detectedLang].welcomeNew(address), { parse_mode: 'Markdown' });

    logger.info(
      { telegramId: telegramId.toString(), address, lang: detectedLang },
      'New user onboarded',
    );
  } catch (err) {
    logger.error({ err, telegramId: telegramId.toString() }, '/start failed');
    await ctx.reply(COPY[detectedLang].error);
  }
}
