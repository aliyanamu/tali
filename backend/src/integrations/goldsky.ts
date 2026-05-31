// Goldsky pipeline has no address filter — all Mantle ERC-20 transfers are delivered
// to the webhook. The handler filters against watched_wallets in the DB, so
// tali-cli wallet watch/unwatch takes effect immediately without pipeline redeployment.
export async function addWatchAddress(_address: string): Promise<void> {}
export async function removeWatchAddress(_address: string): Promise<void> {}
