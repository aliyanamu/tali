import { PrivyClient } from '@privy-io/server-auth';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

const privy = new PrivyClient(env.PRIVY_APP_ID, env.PRIVY_APP_SECRET);

export type CreatedWallet = {
  walletId: string;
  address: `0x${string}`;
};

/**
 * Create a new server-managed Privy wallet for a user.
 *
 * MVP note: this uses Privy's server-managed wallets (HSM-backed, Privy holds key shares).
 * For the truly non-custodial split-key model described in the spec, users would authenticate
 * via Privy's web flow (passkey/OAuth) so a share derives from their auth. That requires a
 * web onboarding step, which is a week-2 enhancement. Week-1 MVP keeps it simple.
 *
 * The wallet address is the same on every EVM chain (Mantle, Ethereum, Arbitrum, etc.).
 * We use Mantle by default for any transaction signing.
 */
export async function createWalletForUser(userId: number): Promise<CreatedWallet> {
  try {
    const wallet = await privy.walletApi.create({
      chainType: 'ethereum',
    });

    logger.info(
      { userId, walletId: wallet.id, address: wallet.address },
      'Created Privy wallet',
    );

    return {
      walletId: wallet.id,
      address: wallet.address as `0x${string}`,
    };
  } catch (err) {
    logger.error({ err, userId }, 'Failed to create Privy wallet');
    throw err;
  }
}

/**
 * Submit a signed transaction via Privy's wallet API.
 * Used by the rule executor (TaliSkill) to invoke AutonomousRule.executeRule().
 * The wallet must have pre-authorized the rule contract via setRule() at rule setup time.
 */
export async function sendTransactionFromWallet(params: {
  walletId: string;
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
  chainId: number;
}): Promise<{ hash: `0x${string}` }> {
  const result = await privy.walletApi.ethereum.sendTransaction({
    walletId: params.walletId,
    caip2: `eip155:${params.chainId}`,
    transaction: {
      to: params.to,
      data: params.data,
      value: params.value !== undefined ? `0x${params.value.toString(16)}` : undefined,
    },
  });

  return { hash: result.hash as `0x${string}` };
}
