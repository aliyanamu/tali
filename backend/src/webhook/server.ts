import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { handleGoldskyWebhook } from './goldsky.js';

export const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok' }));

app.post('/webhooks/goldsky', handleGoldskyWebhook);

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
