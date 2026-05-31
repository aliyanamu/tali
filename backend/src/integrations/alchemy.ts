import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

const ALCHEMY_API_BASE = 'https://dashboard.alchemy.com/api';

async function updateWebhookAddresses(
  addressesToAdd: string[],
  addressesToRemove: string[],
): Promise<void> {
  if (!env.ALCHEMY_WEBHOOK_AUTH_TOKEN || !env.ALCHEMY_WEBHOOK_ID) {
    throw new Error('ALCHEMY_WEBHOOK_AUTH_TOKEN and ALCHEMY_WEBHOOK_ID are required');
  }

  const res = await fetch(`${ALCHEMY_API_BASE}/update-webhook-addresses`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Alchemy-Token': env.ALCHEMY_WEBHOOK_AUTH_TOKEN,
    },
    body: JSON.stringify({
      webhook_id: env.ALCHEMY_WEBHOOK_ID,
      addresses_to_add: addressesToAdd,
      addresses_to_remove: addressesToRemove,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alchemy API error ${res.status}: ${text}`);
  }

  logger.debug({ added: addressesToAdd, removed: addressesToRemove }, 'Alchemy webhook addresses updated');
}

export async function addWatchAddress(address: string): Promise<void> {
  await updateWebhookAddresses([address], []);
}

export async function removeWatchAddress(address: string): Promise<void> {
  await updateWebhookAddresses([], [address]);
}
