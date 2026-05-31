import { erc20Abi, formatUnits, type Address } from 'viem';
import { createMantleClient } from '../lib/chain.js';
import { getPrices } from '../lib/prices.js';
import { TOKENS, TESTNET_TOKENS } from '../lib/tokens.js';

export type TokenBalance = {
  symbol: string;
  amount: number;
  fiat: number;
};

export type NetworthResult = {
  wallet: Address;
  totalFiat: number;
  vsCurrency: string;
  tokens: TokenBalance[];
};

const MANTLE_TESTNET_CHAIN_ID = 5003;

export async function fetchNetworth(
  wallet: Address,
  rpcUrl: string,
  vsCurrency = 'idr',
  coingeckoApiKey?: string,
  chainId: number = 5000,
): Promise<NetworthResult> {
  const ZERO = '0x0000000000000000000000000000000000000000';
  const tokenList = (chainId === MANTLE_TESTNET_CHAIN_ID ? TESTNET_TOKENS : TOKENS).filter(
    (t) => t.isNative || t.address !== ZERO,
  );

  const nativeToken = tokenList.find((t) => t.isNative);
  if (!nativeToken) throw new Error(`No native token configured for chainId ${chainId}`);

  const client = createMantleClient(rpcUrl);
  const erc20Tokens = tokenList.filter((t) => !t.isNative);

  const [nativeBalance, ...erc20Balances] = await Promise.all([
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

  const prices = await getPrices(
    tokenList.map((t) => t.coingeckoId),
    vsCurrency,
    coingeckoApiKey,
  );

  const tokens: TokenBalance[] = [];
  let totalFiat = 0;

  const nativeAmount = Number(formatUnits(nativeBalance, nativeToken.decimals));
  const nativeFiat = nativeAmount * (prices[nativeToken.coingeckoId] ?? 0);
  tokens.push({ symbol: nativeToken.symbol, amount: nativeAmount, fiat: nativeFiat });
  totalFiat += nativeFiat;

  for (let i = 0; i < erc20Tokens.length; i++) {
    const t = erc20Tokens[i]!;
    const amount = Number(formatUnits(erc20Balances[i] as bigint, t.decimals));
    const fiat = amount * (prices[t.coingeckoId] ?? 0);
    tokens.push({ symbol: t.symbol, amount, fiat });
    totalFiat += fiat;
  }

  return { wallet, totalFiat, vsCurrency, tokens };
}
