---
status: pending
priority: p1
issue_id: "002"
tags: [code-review, schema, data-integrity]
---

# Idempotency index missing user_id — multi-user same-tx events silently dropped

## Problem Statement

The unique index `onchain_events_idempotency` is on `(chain_id, tx_hash, log_index)`. If two users both watch the same wallet address, the second user's insert for the same transaction is silently dropped as a "duplicate" by the catch block. This is a real scenario (shared wallets, internal transfers between two of the same user's watched addresses).

## Findings

File: `backend/src/db/schema.ts:123`

```ts
onchainIdempotency: uniqueIndex('onchain_events_idempotency').on(t.chainId, t.txHash, t.logIndex),
```

File: `backend/src/server/routes/webhooks/goldsky.ts:128-130`

```ts
if (err instanceof Error && /duplicate key|unique constraint/i.test(err.message)) {
  logger.debug({ txHash: row.transaction_hash, logIndex }, 'Duplicate event, skipping');
  continue;
}
```

The catch fires for the second user's legitimate insert of the same tx.

## Proposed Solution (recommended)

Add `user_id` to the index so it is unique per user, not globally:

```ts
onchainIdempotency: uniqueIndex('onchain_events_idempotency').on(t.chainId, t.txHash, t.logIndex, t.userId),
```

Regenerate migration: `pnpm db:generate`.

## Acceptance Criteria

- [ ] Two users watching the same wallet both get their own `onchain_events` row for the same tx
- [ ] Retry delivery of the same tx to the same user is still deduplicated (only one row per user)

## Work Log

- 2026-05-31: Identified by data-integrity review agent
