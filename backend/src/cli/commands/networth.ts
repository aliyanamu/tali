import { Command } from 'commander';
import { fetchNetworth } from '../../services/networth.js';
import type { Address } from 'viem';

export const networthCommand = new Command('networth')
  .description('Show total net worth in IDR across all watched wallets')
  .option('-w, --wallet <address>', 'Mantle wallet address to query')
  .option('-o, --output <format>', 'Output format: table (default) or json', 'table')
  .action(async (opts: { wallet?: string; output: string }) => {
    const rpcUrl = process.env.MANTLE_ALCHEMY_RPC;
    const coingeckoKey = process.env.COINGECKO_API_KEY; // optional; omit for free-tier

    if (!rpcUrl) {
      console.error('Missing MANTLE_ALCHEMY_RPC in environment.');
      process.exit(1);
    }

    if (!opts.wallet) {
      console.error('Provide a wallet address with --wallet <address>');
      process.exit(1);
    }

    const chainId = Number(process.env.MANTLE_CHAIN_ID ?? 5000);
    const result = await fetchNetworth(opts.wallet as Address, rpcUrl, coingeckoKey, chainId);

    if (opts.output === 'json') {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`\nWallet: ${result.wallet}`);
    console.log('─'.repeat(44));
    for (const t of result.tokens) {
      if (t.amount === 0) continue;
      console.log(`  ${t.symbol.padEnd(8)} ${t.amount.toFixed(4).padStart(14)}   IDR ${Math.round(t.idr).toLocaleString('id-ID')}`);
    }
    console.log('─'.repeat(44));
    console.log(`  TOTAL              IDR ${Math.round(result.totalIdr).toLocaleString('id-ID')}`);
    console.log();
  });
