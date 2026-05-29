type CacheEntry = { price: number; fetchedAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

export async function getPricesInIdr(
  coingeckoIds: string[],
  apiKey: string,
): Promise<Record<string, number>> {
  const now = Date.now();
  const result: Record<string, number> = {};
  const stale: string[] = [];

  for (const id of coingeckoIds) {
    const cached = cache.get(id);
    if (cached && now - cached.fetchedAt < TTL_MS) {
      result[id] = cached.price;
    } else {
      stale.push(id);
    }
  }

  if (stale.length === 0) return result;

  const url = new URL('https://api.coingecko.com/api/v3/simple/price');
  url.searchParams.set('ids', stale.join(','));
  url.searchParams.set('vs_currencies', 'idr');
  url.searchParams.set('x_cg_demo_api_key', apiKey);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = (await res.json()) as Record<string, { idr?: number }>;

    for (const id of stale) {
      const price = data[id]?.idr ?? 0;
      cache.set(id, { price, fetchedAt: now });
      result[id] = price;
      if (price === 0) {
        console.warn(`[prices] zero price for ${id}`);
      }
    }
  } catch (err) {
    console.error('[prices] CoinGecko fetch failed', err);
    for (const id of stale) {
      // Use stale cache value if available, else 0
      result[id] = cache.get(id)?.price ?? 0;
    }
  }

  return result;
}
