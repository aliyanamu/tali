import { erc20Abi, formatUnits, type Address } from 'viem';
import { createMantleClient } from '../lib/chain.js';
import { getPricesInIdr } from '../lib/prices.js';
import { TOKENS, TESTNET_TOKENS } from '../lib/tokens.js';

export type TokenBalance = {
  symbol: string;
  amount: number;
  idr: number;
};

export type NetworthResult = {
  wallet: Address;
  totalIdr: number;
  tokens: TokenBalance[];
};

const MANTLE_TESTNET_CHAIN_ID = 5003;

export async function fetchNetworth(
  wallet: Address,
  rpcUrl: string,
  coingeckoApiKey?: string,
  chainId: number = 5000,
): Promise<NetworthResult> {
  const tokenList = chainId === MANTLE_TESTNET_CHAIN_ID ? TESTNET_TOKENS : TOKENS;
  const client = createMantleClient(rpcUrl);
  const erc20Tokens = tokenList.filter((t) => !t.isNative);
  const nativeToken = tokenList.find((t) => t.isNative)!;

  const [mntBalance, ...erc20Balances] = await Promise.all([
    client.getBalance({ address: wallet }),
    ...erc20Tokens.map((t) =>
      client.readContract({
        address: t.address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [wallet],
      }),
    ),
  ]);

  const prices = await getPricesInIdr(
    tokenList.map((t) => t.coingeckoId),
    coingeckoApiKey,
  );

  const tokens: TokenBalance[] = [];
  let totalIdr = 0;

  const mntAmount = Number(formatUnits(mntBalance, nativeToken.decimals));
  const mntIdr = mntAmount * (prices[nativeToken.coingeckoId] ?? 0);
  tokens.push({ symbol: nativeToken.symbol, amount: mntAmount, idr: mntIdr });
  totalIdr += mntIdr;

  for (let i = 0; i < erc20Tokens.length; i++) {
    const t = erc20Tokens[i]!;
    const amount = Number(formatUnits(erc20Balances[i] as bigint, t.decimals));
    const idr = amount * (prices[t.coingeckoId] ?? 0);
    tokens.push({ symbol: t.symbol, amount, idr });
    totalIdr += idr;
  }

  return { wallet, totalIdr, tokens };
}
