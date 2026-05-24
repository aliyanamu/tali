import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

export const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok' }));

// Webhook routes are registered in src/webhooks/* — wired into here as they're added.
// Goldsky webhook will land at POST /webhooks/goldsky.

export async function startWebhookServer(): Promise<void> {
  await new Promise<void>((resolve) => {
    serve(
      {
        fetch: app.fetch,
        port: env.PORT,
      },
      (info) => {
        logger.info({ port: info.port }, 'Webhook server listening');
        resolve();
      },
    );
  });
}
