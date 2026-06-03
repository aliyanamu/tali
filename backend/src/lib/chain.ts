import { createPublicClient, defineChain, http } from 'viem';
import { mantle } from 'viem/chains';

export function createMantleClient(rpcUrl: string) {
  return createPublicClient({ chain: mantle, transport: http(rpcUrl) });
}

// Mantle Sepolia testnet — used when MANTLE_TESTNET_RPC is set (local dev / CI)
const mantleSepolia = defineChain({
  id: 5003,
  name: 'Mantle Sepolia Testnet',
  nativeCurrency: { name: 'MNT', symbol: 'MNT', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.sepolia.mantle.xyz'] } },
  blockExplorers: {
    default: { name: 'Mantle Testnet Explorer', url: 'https://sepolia.mantlescan.xyz' },
  },
  testnet: true,
});

/** Returns a PublicClient targeting either Mantle mainnet or Sepolia testnet based on chainId + rpcUrl. */
export function createMantlePublicClient(rpcUrl: string, chainId: number) {
  const chain = chainId === 5003 ? mantleSepolia : mantle;
  return createPublicClient({ chain, transport: http(rpcUrl) });
}
