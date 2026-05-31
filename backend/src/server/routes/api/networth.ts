import type { Context } from 'hono';

export async function handleGetNetworth(c: Context): Promise<Response> {
  return c.json({ error: 'Not implemented' }, 501);
}
