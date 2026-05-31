import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { serve } from '@hono/node-server';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { handleGoldskyWebhook } from './routes/webhooks/goldsky.js';
import { handleGetNetworth } from './routes/api/networth.js';
import { handleGetEvents } from './routes/api/events.js';
import { handleGetRules, handlePostRules } from './routes/api/rules.js';

export const app = new Hono();

// Health
app.get('/health', (c) => c.json({ status: 'ok' }));

// Webhooks — 512 KB cap before auth to prevent memory exhaustion
app.post(
  '/webhooks/goldsky',
  bodyLimit({ maxSize: 512 * 1024, onError: (c) => c.json({ error: 'payload too large' }, 413) }),
  handleGoldskyWebhook,
);

// API (week-2 — stubs return 501 until implemented)
app.get('/api/networth', handleGetNetworth);
app.get('/api/events', handleGetEvents);
app.get('/api/rules', handleGetRules);
app.post('/api/rules', handlePostRules);

export async function startWebhookServer(): Promise<void> {
  await new Promise<void>((resolve) => {
    serve({ fetch: app.fetch, port: env.PORT }, (info) => {
      logger.info({ port: info.port }, 'Webhook server listening');
      resolve();
    });
  });
}
