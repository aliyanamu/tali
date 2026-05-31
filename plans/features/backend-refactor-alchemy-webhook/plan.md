# Plan: Backend Refactor + Alchemy Webhook
**Date:** 2026-05-31
**Type:** refactor + feat
**Status:** active

---

## Overview

Two deliverables in one pass:

1. **Folder refactor** — rename `webhook/` → `server/`, add `routes/webhooks/` and `routes/api/` structure so week-2 frontend API routes have a home without another refactor under deadline.
2. **Alchemy webhook handler** — `POST /webhooks/alchemy` — HMAC-verified, idempotent Transfer event ingestion that writes to the `events` table.

---

## Acceptance Criteria

### Refactor
- [ ] `src/webhook/` renamed to `src/server/`
- [ ] Hono app factory in `src/server/app.ts`; `startWebhookServer` stays in `src/index.ts`
- [ ] `routes/webhooks/` subfolder for webhook handlers
- [ ] `routes/api/` subfolder with stub files for week-2 routes (return `501 Not Implemented`)
- [ ] `middleware/hmac.ts` extracted and shared
- [ ] All imports updated; `pnpm typecheck` passes

### Alchemy webhook
- [ ] `POST /webhooks/alchemy` returns `403` on bad HMAC
- [ ] Returns `200` on valid HMAC (even if no matching user)
- [ ] Skips reorg events (`activity.log.removed === true`)
- [ ] Idempotent: duplicate deliveries do not insert duplicate rows
- [ ] Upserts native MNT transfers (where `activity.log` is `null`) correctly
- [ ] `logIndex` stored as integer (parsed from hex)
- [ ] `onchainAmount` stored as raw hex value (`rawContract.rawValue`) not float
- [ ] Alchemy webhook registered in Alchemy dashboard, events landing in DB

### Quality
- [ ] `pnpm typecheck` passes
- [ ] No `goldsky` references remain in the codebase (except git history)
- [ ] `.env.example` and `CLAUDE.md` repo layout updated

---

## Technical Approach

### New folder structure

```
src/
  server/
    app.ts                        ← Hono app factory + route mounting
    middleware/
      hmac.ts                     ← verifyHmacSha256() shared helper
    routes/
      webhooks/
        alchemy.ts                ← POST /webhooks/alchemy handler
      api/
        networth.ts               ← GET /api/networth (501 stub)
        events.ts                 ← GET /api/events (501 stub)
        rules.ts                  ← GET /POST /api/rules (501 stub)
  index.ts                        ← unchanged entrypoint
  agent/ cli/ db/ lib/ services/ wallet/   ← all unchanged
```

### HMAC fix (critical)

`goldsky.ts` strips a `sha256=` prefix before comparing. **Alchemy does not use this prefix** — the signature is the raw SHA-256 hex digest. The new shared helper must NOT strip any prefix:

```typescript
// src/server/middleware/hmac.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyHmacSha256(
  rawBody: string,
  signingKey: string,
  signature: string,
): boolean {
  if (!signingKey || !signature) return false;
  const digest = createHmac('sha256', signingKey).update(rawBody, 'utf8').digest('hex');
  try {
    return timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false; // length mismatch = definitely invalid
  }
}
```

### Alchemy payload → DB mapping

| Alchemy field | DB column | Notes |
|---|---|---|
| `payload.event.activity[].hash` | `onchainTxHash` | |
| `parseInt(activity.log.logIndex, 16)` | `onchainLogIndex` | hex → int; use `0` if `log` is null (native transfer) |
| `parseInt(activity.blockNum, 16)` | `onchainBlockNumber` | hex → bigint |
| `activity.rawContract.rawValue` | `onchainAmount` | raw hex string, lossless |
| `activity.rawContract.address` | `onchainToken` | null for native MNT |
| `activity.fromAddress` | `onchainFrom` | |
| `activity.toAddress` | `onchainTo` | |
| `"alchemy_webhook"` | `offchainSource` | |
| whole activity object | `rawPayload` | jsonb, for debugging |

**`kind` field:**
- `"onchain_transfer_in"` — if user's `walletAddress` matches `toAddress`
- `"onchain_transfer_out"` — if user's `walletAddress` matches `fromAddress`

### Idempotency

The `events` table already has a unique index on `(onchainChainId, onchainTxHash, onchainLogIndex)`. Use:
```sql
INSERT INTO events (...) VALUES (...) ON CONFLICT DO NOTHING
```
Drizzle: `.onConflictDoNothing()`.

For native MNT transfers where `log` is null, `logIndex` will be `0`. Two native MNT transfers in the same tx are not possible, so this is safe.

### Reorg handling

Skip activities where `activity.log?.removed === true`. Log the skip at `warn` level. Full reversal logic is out of scope for now (week-2+).

---

## Implementation Phases

### Phase 1 — Extract HMAC middleware (no behaviour change)
**Files:**
- Create `src/server/middleware/hmac.ts` with `verifyHmacSha256`
- Update `src/webhook/goldsky.ts` to import and use the shared helper (removes the buggy sha256= stripping from its local `verifySignature` — fixes the existing handler too)

**Test:** existing webhook smoke test (if any) still passes.

### Phase 2 — Refactor folder structure
**Files:**
- Create `src/server/app.ts` (content of `webhook/server.ts` + route mounting expanded)
- Create `src/server/routes/webhooks/` directory; move goldsky handler as `goldsky.ts` (temporary, will be deleted Phase 4)
- Create `src/server/routes/api/networth.ts`, `events.ts`, `rules.ts` (501 stubs)
- Update `src/index.ts` import: `./webhook/server.js` → `./server/app.js`
- Delete `src/webhook/server.ts`, `src/webhook/goldsky.ts`

**Verify:** `pnpm typecheck` passes. `curl localhost:3000/health` returns 200.

### Phase 3 — Alchemy webhook handler
**Files:**
- Create `src/server/routes/webhooks/alchemy.ts`
- Mount in `src/server/app.ts`: `app.post('/webhooks/alchemy', handleAlchemyWebhook)`

**Handler logic (pseudocode):**
```
1. rawBody = await c.req.text()
2. sig = c.req.header('x-alchemy-signature') ?? ''
3. if !verifyHmacSha256(rawBody, env.ALCHEMY_WEBHOOK_SECRET, sig) → return 403
4. payload = JSON.parse(rawBody) as AlchemyWebhookPayload
5. for each activity in payload.event.activity:
   a. if activity.log?.removed → logger.warn + continue (reorg)
   b. find user where walletAddress matches fromAddress OR toAddress (case-insensitive)
   c. if no user → continue (not our wallet)
   d. determine kind: transfer_in or transfer_out
   e. logIndex = activity.log ? parseInt(activity.log.logIndex, 16) : 0
   f. blockNumber = BigInt(parseInt(activity.blockNum, 16))
   g. upsert into events ON CONFLICT DO NOTHING
6. return 200
```

### Phase 4 — Remove Goldsky
**Files:**
- Remove `src/server/routes/webhooks/goldsky.ts`
- Remove goldsky route from `app.ts`
- Remove any goldsky references from `CLAUDE.md`, `README.md`, `SKILL.md`, `week-2.md`, `week-3.md`

### Phase 5 — Env + config
**Files:**
- `src/lib/env.ts`: make `ALCHEMY_WEBHOOK_SECRET` required (`.string().min(1)`)
- `backend/.env.example`: add `ALCHEMY_WEBHOOK_SECRET=` entry with comment
- `CLAUDE.md` repo layout: update `backend/src/webhook/` → `backend/src/server/`

### Phase 6 — Alchemy dashboard setup
1. Go to Alchemy dashboard → Notify → Create Webhook
2. Type: **Address Activity**
3. Network: **Mantle Mainnet** (or Sepolia for testing)
4. Address: your watched wallet `0x6b008E19887b109319C5fA859e552bb65455432D`
5. URL: use `ngrok` or similar to expose `localhost:3000/webhooks/alchemy` for local testing
6. Copy signing key → paste into `backend/.env` as `ALCHEMY_WEBHOOK_SECRET`
7. Send test event from Alchemy dashboard → verify row appears in `events` table

---

## Files to Create / Modify

| Action | File |
|---|---|
| CREATE | `src/server/app.ts` |
| CREATE | `src/server/middleware/hmac.ts` |
| CREATE | `src/server/routes/webhooks/alchemy.ts` |
| CREATE | `src/server/routes/api/networth.ts` (501 stub) |
| CREATE | `src/server/routes/api/events.ts` (501 stub) |
| CREATE | `src/server/routes/api/rules.ts` (501 stub) |
| MODIFY | `src/index.ts` (import path) |
| MODIFY | `src/lib/env.ts` (make ALCHEMY_WEBHOOK_SECRET required) |
| MODIFY | `backend/.env.example` |
| MODIFY | `CLAUDE.md` (repo layout) |
| MODIFY | `README.md` |
| MODIFY | `backend/skills/tali/SKILL.md` |
| MODIFY | `plans/week-2.md` (remove Goldsky references) |
| MODIFY | `plans/week-3.md` (remove Goldsky references) |
| DELETE | `src/webhook/server.ts` |
| DELETE | `src/webhook/goldsky.ts` |

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `log` is `null` for native MNT — crash on `log.logIndex` | Guard: `activity.log ? parseInt(...) : 0` |
| Two activities in same block with same tx hash — logIndex collision | Alchemy guarantees unique `(txHash, logIndex)` per ERC-20 log; native transfers don't emit logs so logIndex=0 is safe |
| HMAC length mismatch throws in `timingSafeEqual` | Wrap in try/catch → return false |
| Alchemy retries on any non-200 after auth | Return 200 always after HMAC passes; only return 403 on auth failure |
| Reorg delivers `removed: true` event — written to DB as real transfer | Skip on `activity.log?.removed === true` |
| ngrok URL changes on restart during local testing | Use `ngrok http 3000 --subdomain tali-dev` (paid) or update dashboard URL each restart |

---

## Out of Scope

- Rule engine trigger on webhook receipt (week 2)
- Replay-attack protection via `createdAt` window (post-hackathon)
- Multi-user webhook routing (post-hackathon)
- `removed: true` reversal writes (week 2+)
