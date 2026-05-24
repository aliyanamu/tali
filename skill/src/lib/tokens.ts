import type { Address } from 'viem';

export type TokenInfo = {
  symbol: string;
  /** Native token uses 0x0 sentinel; ERC-20s use their contract address. */
  address: Address;
  decimals: number;
  /** CoinGecko ID used for off-chain price lookup. */
  coingeckoId: string;
  isNative?: boolean;
};

/**
 * Mantle token registry.
 *
 * IMPORTANT: Verify each ERC-20 address on Mantle Explorer (mantlescan.xyz) before
 * relying on these for production. Addresses below are best-known references —
 * if any are wrong, balanceOf calls will fail or return zero.
 *
 * Native MNT is handled separately via publicClient.getBalance().
 */
export const TOKENS: TokenInfo[] = [
  {
    symbol: 'MNT',
    address: '0x0000000000000000000000000000000000000000',
    decimals: 18,
    coingeckoId: 'mantle',
    isNative: true,
  },
  {
    symbol: 'USDT',
    // Mantle bridged USDT — verify on Mantle Explorer before trusting.
    address: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE',
    decimals: 6,
    coingeckoId: 'tether',
  },
  {
    symbol: 'USDC',
    // Mantle bridged USDC — verify.
    address: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9',
    decimals: 6,
    coingeckoId: 'usd-coin',
  },
  {
    symbol: 'mETH',
    // Mantle staked ETH — verify.
    address: '0xcDA86A272531e8640cD7F1a92c01839911B90bb0',
    decimals: 18,
    coingeckoId: 'mantle-staked-ether',
  },
  {
    symbol: 'USDY',
    // Ondo USDY on Mantle — verify.
    address: '0x5bE26527e817998A7206475496fDE1E68957c5A6',
    decimals: 18,
    coingeckoId: 'ondo-us-dollar-yield',
  },
];
