import type { Context } from 'hono';

export async function handleGetRules(c: Context): Promise<Response> {
  return c.json({ error: 'Not implemented' }, 501);
}

export async function handlePostRules(c: Context): Promise<Response> {
  return c.json({ error: 'Not implemented' }, 501);
}
