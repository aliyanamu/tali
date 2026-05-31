---
status: pending
priority: p2
issue_id: "011"
tags: [code-review, webhook, error-handling]
---

# No outer try/catch in webhook handler — DB connection drops produce unstructured 500s

## Problem Statement

If the `watched_wallets` DB query throws (e.g. connection pool exhausted), the error propagates to Hono's default handler and produces an unstructured 500 response. Goldsky's retry behaviour on 5xx is not documented, creating potential retry storms.

## Findings

File: `backend/src/server/routes/webhooks/goldsky.ts:50-140`

The main handler body has no outer try/catch. Only the per-wallet insert is guarded.

## Fix

Wrap the entire handler body in a try/catch that returns a structured 500:

```ts
export async function handleGoldskyWebhook(c: Context): Promise<Response> {
  const rawBody = await c.req.text();
  // ... auth check ...

  try {
    // ... all processing logic ...
    return c.json({ status: 'ok' });
  } catch (err) {
    logger.error({ err }, 'Goldsky webhook: unexpected error');
    return c.json({ error: 'internal error' }, 500);
  }
}
```

## Acceptance Criteria

- [ ] DB connection failure returns structured `{ error: 'internal error' }` with pino log
- [ ] No unhandled Hono frame errors visible in server logs

## Work Log

- 2026-05-31: Identified by architecture review agent
