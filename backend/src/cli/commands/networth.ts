import { Command } from 'commander';
import type { Address } from 'viem';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { fetchNetworth } from '../../services/networth.js';

export const networthCommand = new Command('networth')
  .description('Show total net worth across all watched wallets')
  .option('-w, --wallet <address>', 'Mantle wallet address to query')
  .option('-o, --output <format>', 'Output format: table (default) or json', 'table')
  .action(async (opts: { wallet?: string; output: string }) => {
    try {
      const rpcUrl = process.env.MANTLE_ALCHEMY_RPC;
      const coingeckoKey = process.env.COINGECKO_API_KEY;

      if (!rpcUrl) {
        console.error('Missing MANTLE_ALCHEMY_RPC in environment.');
        process.exit(1);
      }

      if (!opts.wallet) {
        console.error('Provide a wallet address with --wallet <address>');
        process.exit(1);
      }

      // Normalize to lowercase — EVM convention; seed and DB store addresses lowercase.
      const walletAddr = opts.wallet.toLowerCase();

      // Look up the user's preferred currency from DB; default to IDR.
      const user = await db.query.users.findFirst({
        where: eq(schema.users.walletAddress, walletAddr),
      });
      const currencyCode = user?.preferredCurrency ?? 'IDR';

      const asset = await db.query.assets.findFirst({
        where: eq(schema.assets.code, currencyCode),
      });
      const vsCurrency = asset?.vsCurrency ?? 'idr';
      const currencySymbol = asset?.symbol ?? currencyCode;

      const chainId = Number(process.env.MANTLE_CHAIN_ID ?? 5000);
      const result = await fetchNetworth(
        walletAddr as Address,
        rpcUrl,
        vsCurrency,
        coingeckoKey,
        chainId,
      );

      if (opts.output === 'json') {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`\nWallet: ${result.wallet}`);
      console.log('─'.repeat(52));
      for (const t of result.tokens) {
        if (t.amount === 0) continue;
        const fiatLabel = `${currencySymbol} ${Math.round(t.fiat).toLocaleString('id-ID')}`;
        console.log(`  ${t.symbol.padEnd(8)} ${t.amount.toFixed(4).padStart(14)}   ${fiatLabel}`);
      }
      console.log('─'.repeat(52));
      console.log(`  TOTAL              ${currencySymbol} ${Math.round(result.totalFiat).toLocaleString('id-ID')}`);
      console.log();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });
