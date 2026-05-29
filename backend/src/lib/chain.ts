import { createPublicClient, http } from 'viem';
import { mantle } from 'viem/chains';

export function createMantleClient(rpcUrl: string) {
  return createPublicClient({ chain: mantle, transport: http(rpcUrl) });
}
