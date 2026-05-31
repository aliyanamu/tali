---
status: pending
priority: p2
issue_id: "008"
tags: [code-review, security, webhook]
---

# No body size limit on /webhooks/goldsky — memory exhaustion possible before auth check

## Problem Statement

`handleGoldskyWebhook` calls `c.req.text()` to read the full body before verifying the secret. An attacker who knows the endpoint path can send a multi-gigabyte payload to exhaust heap and crash the server process.

## Findings

File: `backend/src/server/routes/webhooks/goldsky.ts:52`

```ts
const rawBody = await c.req.text(); // full body buffered before auth check
const secret = c.req.header('goldsky-webhook-secret') ?? '';
if (!verifyGoldskySecret(secret, env.GOLDSKY_WEBHOOK_SECRET)) { ... } // auth is after
```

## Fix

Add Hono's `bodyLimit` middleware in `app.ts` before the handler:

```ts
import { bodyLimit } from 'hono/body-limit';

app.post(
  '/webhooks/goldsky',
  bodyLimit({ maxSize: 512 * 1024, onError: (c) => c.json({ error: 'payload too large' }, 413) }),
  handleGoldskyWebhook,
);
```

Alternatively, read the secret header before buffering the body — header reads are zero-copy.

## Acceptance Criteria

- [ ] Requests larger than 512 KB receive a 413 response
- [ ] Legitimate Goldsky payloads (always < 10 KB) are unaffected

## Work Log

- 2026-05-31: Identified by security review agent
