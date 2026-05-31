---
status: pending
priority: p2
issue_id: "010"
tags: [code-review, webhook, reliability]
---

# Duplicate detection uses err.message string-match — fragile across locales and driver versions

## Problem Statement

The duplicate-event guard in `goldsky.ts` and matches on `err.message` text (`/duplicate key|unique constraint/i`). This is locale-dependent (PostgreSQL error messages differ on non-English installations) and version-fragile. The correct check is Postgres SQLSTATE `23505`.

## Findings

File: `backend/src/server/routes/webhooks/goldsky.ts:128-130`

```ts
if (err instanceof Error && /duplicate key|unique constraint/i.test(err.message)) {
```

## Fix

The `postgres.js` driver (used via Drizzle) exposes the error code on the caught error:

```ts
if ((err as { code?: string }).code === '23505') {
  logger.debug({ txHash: row.transaction_hash, logIndex }, 'Duplicate event, skipping');
  continue;
}
```

Or import the specific error type:
```ts
import { PostgresError } from 'postgres';
if (err instanceof PostgresError && err.code === '23505') { ... }
```

Note: if todo 009 (bulk insert with `onConflictDoNothing`) is implemented first, this try/catch can be removed entirely.

## Acceptance Criteria

- [ ] Duplicate detection uses SQLSTATE `23505`, not message string-match
- [ ] Or: replaced by `onConflictDoNothing()` (see todo 009)

## Work Log

- 2026-05-31: Identified by architecture review agent
