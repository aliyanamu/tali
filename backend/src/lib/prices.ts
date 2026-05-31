import { logger } from './logger.js';

type CacheEntry = { price: number; fetchedAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

export async function getPrices(
  coingeckoIds: string[],
  vsCurrency: string,
  apiKey?: string,
): Promise<Record<string, number>> {
  const now = Date.now();
  const result: Record<string, number> = {};
  const stale: string[] = [];

  for (const id of coingeckoIds) {
    const key = `${id}:${vsCurrency}`;
    const cached = cache.get(key);
    if (cached && now - cached.fetchedAt < TTL_MS) {
      result[id] = cached.price;
    } else {
      stale.push(id);
    }
  }

  if (stale.length === 0) return result;

  const url = new URL('https://api.coingecko.com/api/v3/simple/price');
  url.searchParams.set('ids', stale.join(','));
  url.searchParams.set('vs_currencies', vsCurrency);
  if (apiKey) url.searchParams.set('x_cg_demo_api_key', apiKey);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = (await res.json()) as Record<string, Record<string, number>>;

    for (const id of stale) {
      const price = data[id]?.[vsCurrency] ?? 0;
      cache.set(`${id}:${vsCurrency}`, { price, fetchedAt: now });
      result[id] = price;
      if (price === 0) logger.warn({ id, vsCurrency }, 'Zero price from CoinGecko');
    }
  } catch (err) {
    logger.error({ err }, 'CoinGecko fetch failed');
    for (const id of stale) {
      result[id] = cache.get(`${id}:${vsCurrency}`)?.price ?? 0;
    }
  }

  return result;
}
