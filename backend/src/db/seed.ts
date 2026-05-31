import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, inArray } from 'drizzle-orm';
import { env } from '../lib/env.js';
import * as schema from './schema.js';

const client = postgres(env.DATABASE_URL, { max: 1 });
const db = drizzle(client, { schema });

// ── Step 1: Seed fiat + native/ERC-20 assets (chainId null initially) ──
// chainId is patched in step 3 after networks exist to resolve the circular FK.
await db
  .insert(schema.assets)
  .values([
    // SEA fiat (no chain)
    { code: 'IDR', name: 'Indonesian Rupiah',  symbol: 'Rp',   decimals: 0, assetType: 'fiat',        vsCurrency: 'idr' },
    { code: 'SGD', name: 'Singapore Dollar',   symbol: 'S$',   decimals: 2, assetType: 'fiat',        vsCurrency: 'sgd' },
    { code: 'MYR', name: 'Malaysian Ringgit',  symbol: 'RM',   decimals: 2, assetType: 'fiat',        vsCurrency: 'myr' },
    { code: 'PHP', name: 'Philippine Peso',    symbol: '₱',    decimals: 2, assetType: 'fiat',        vsCurrency: 'php' },
    { code: 'THB', name: 'Thai Baht',          symbol: '฿',    decimals: 2, assetType: 'fiat',        vsCurrency: 'thb' },
    { code: 'VND', name: 'Vietnamese Dong',    symbol: '₫',    decimals: 0, assetType: 'fiat',        vsCurrency: 'vnd' },
    { code: 'USD', name: 'US Dollar',          symbol: '$',    decimals: 2, assetType: 'fiat',        vsCurrency: 'usd' },
    // Native tokens (chainId patched below)
    { code: 'MNT', name: 'Mantle',             symbol: 'MNT',  decimals: 18, assetType: 'native',     coingeckoId: 'mantle'   },
    { code: 'SOL', name: 'Solana',             symbol: 'SOL',  decimals: 9,  assetType: 'native',     coingeckoId: 'solana'   },
    // Mantle ERC-20 tokens (chainId + tokenAddress patched below)
    { code: 'USDT', name: 'Tether USD', symbol: 'USDT', decimals: 6, assetType: 'stablecoin', coingeckoId: 'tether',   tokenAddress: '0x201eba5cc46d216ce6dc03f6a759e8e766e956ae' },
    { code: 'USDC', name: 'USD Coin',   symbol: 'USDC', decimals: 6, assetType: 'stablecoin', coingeckoId: 'usd-coin', tokenAddress: '0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9' },
  ])
  .onConflictDoNothing();
console.log('Seeded assets (chainId null — will patch after networks)');

// ── Step 2: Seed networks ──────────────────────────────────────────────
// networks.native_currency_code FKs assets.code — assets must exist first.
await db
  .insert(schema.networks)
  .values([
    { chainId: 5000,       name: 'Mantle Mainnet', rpcUrl: 'https://rpc.mantle.xyz',              explorerUrl: 'https://explorer.mantle.xyz',         nativeCurrencyCode: 'MNT', isTestnet: false, isActive: true  },
    { chainId: 5003,       name: 'Mantle Sepolia', rpcUrl: 'https://rpc.sepolia.mantle.xyz',       explorerUrl: 'https://explorer.sepolia.mantle.xyz', nativeCurrencyCode: 'MNT', isTestnet: true,  isActive: true  },
    { chainId: 1399811149, name: 'Solana Mainnet', rpcUrl: 'https://api.mainnet-beta.solana.com',  explorerUrl: 'https://solscan.io',                  nativeCurrencyCode: 'SOL', isTestnet: false, isActive: true  },
    { chainId: 1399811150, name: 'Solana Devnet',  rpcUrl: 'https://api.devnet.solana.com',        explorerUrl: 'https://solscan.io/?cluster=devnet',  nativeCurrencyCode: 'SOL', isTestnet: true,  isActive: false },
  ])
  .onConflictDoNothing();
console.log('Seeded networks');

// ── Step 3: Patch asset chainIds now that networks exist ───────────────
await db.update(schema.assets).set({ chainId: 5000 }).where(inArray(schema.assets.code, ['MNT', 'USDT', 'USDC']));
await db.update(schema.assets).set({ chainId: 1399811149 }).where(eq(schema.assets.code, 'SOL'));
console.log('Patched asset chainIds');

// ── Step 4: Demo user ──────────────────────────────────────────────────
// Values read from env so real credentials are never committed.
// Set these in backend/.env (see .env.example for keys).
const seedUser = {
  linkedUserId: process.env.SEED_USER_PRIVY_ID   ?? 'privy_user_placeholder',
  email:        process.env.SEED_USER_EMAIL       ?? 'demo@example.com',
  linkedWalletId: process.env.SEED_USER_WALLET_ID ?? 'privy_wallet_placeholder',
  walletAddress:  (process.env.SEED_USER_WALLET_ADDRESS ?? '0x0000000000000000000000000000000000000001').toLowerCase(),
  preferredCurrency: 'IDR',
};

await db
  .insert(schema.users)
  .values(seedUser)
  .onConflictDoUpdate({
    target: schema.users.linkedUserId,
    set: {
      email:         seedUser.email,
      walletAddress: seedUser.walletAddress,
      preferredCurrency: 'IDR',
    },
  });
console.log(`Seeded demo user: ${seedUser.email}`);

await client.end();
