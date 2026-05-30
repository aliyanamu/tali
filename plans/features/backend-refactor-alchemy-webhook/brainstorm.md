# Brainstorm: Backend Refactor + Alchemy Webhook
**Date:** 2026-05-31

## What We're Building

Two things in one pass:

1. **Backend folder refactor** — introduce a `routes/` layer under the Hono server so webhook handlers and future API endpoints each have a clear home.
2. **Alchemy webhook handler** — a POST endpoint that verifies Alchemy's HMAC signature, parses the Transfer event payload, and writes it to the `events` DB table.

## Why This Approach

Week 2 adds a web dashboard (Next.js + Privy) that needs REST API endpoints — net worth, activity feed, rules. Structuring for that now avoids a refactor under deadline pressure in week 2.

Alchemy webhook is store-only for now. Rule evaluation comes in week 2 when the rule engine and contracts are ready.

## Target Folder Structure

```
src/
  server/               ← rename from webhook/; owns the Hono app
    app.ts              ← Hono app factory (routes mounted here)
    routes/
      webhooks/
        alchemy.ts      ← POST /webhooks/alchemy (replaces goldsky.ts)
      api/              ← REST API for frontend (week 2, stubs now)
        networth.ts     ← GET /api/networth
        events.ts       ← GET /api/events
        rules.ts        ← GET/POST /api/rules
    middleware/
      hmac.ts           ← HMAC verification helper (extracted from handler)
  services/             ← unchanged
  agent/                ← unchanged
  db/                   ← unchanged
  lib/                  ← unchanged
  wallet/               ← unchanged
  cli/                  ← unchanged
```

## Alchemy Webhook Design

**Endpoint:** `POST /webhooks/alchemy`

**Flow:**
1. Read raw body as text (required for HMAC — must happen before any parsing)
2. Verify `x-alchemy-signature` header using `ALCHEMY_WEBHOOK_SECRET` + `timingSafeEqual`
3. Return 401 if HMAC fails
4. Parse body with Zod — Alchemy `TRANSFERS` activity payload
5. For each transfer activity: upsert into `events` table (idempotent on `txHash + logIndex`)
6. Return 200 always after HMAC passes (so Alchemy doesn't retry on business logic failures)

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Rename `webhook/` → `server/` | Yes | Better describes it — not just webhooks, also API |
| `routes/webhooks/` + `routes/api/` | Yes | Clear separation; api/ stubs now, filled in week 2 |
| Middleware folder | Yes | HMAC logic extracted — reusable for future webhooks |
| API stubs in week 1 | Return 501 | Reserve route structure without blocking week 1 |
| Store-only for now | Yes | Rule evaluation + byreal-cli trigger is week 2 scope |

## Resolved Questions

- **What happens after webhook fires?** → Store only. Rule evaluation is week 2.
- **How far to refactor?** → Full structure, because week 2 frontend needs API routes.
