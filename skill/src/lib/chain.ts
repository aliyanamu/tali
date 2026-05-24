import { createPublicClient, http } from 'viem';
import { mantle } from 'viem/chains';
import { env } from './env.js';

export const publicClient = createPublicClient({
  chain: mantle,
  transport: http(env.ALCHEMY_MANTLE_RPC),
});
