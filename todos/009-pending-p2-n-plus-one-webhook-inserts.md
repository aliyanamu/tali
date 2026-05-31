---
status: pending
priority: p2
issue_id: "009"
tags: [code-review, performance, webhook]
---

# N+1 inserts in webhook — one db.insert per matched wallet instead of bulk

## Problem Statement

The inner loop in `handleGoldskyWebhook` calls `db.insert(...).values({...})` once per matched wallet per row. For a transfer between two watched wallets (internal transfer) this is 2 round-trips. With batch payloads (`one_row_per_request: false`) and multiple matched wallets this scales to N×M round-trips.

## Findings

File: `backend/src/server/routes/webhooks/goldsky.ts:102-134`

```ts
for (const wallet of matchedWallets) {
  // ...
  await db.insert(schema.onchainEvents).values({ ... }); // one per wallet
}
```

## Fix

Collect all insert values and bulk-insert with `onConflictDoNothing()`:

```ts
const insertValues = matchedWallets.map((wallet) => ({
  userId: wallet.userId,
  direction: (wallet.address === toAddress ? 'inflow' : 'outflow') as 'inflow' | 'outflow',
  // ... all other fields
}));

await db.insert(schema.onchainEvents).values(insertValues).onConflictDoNothing();
// No try/catch needed — onConflictDoNothing handles duplicates
```

This also eliminates the fragile `err.message` string-match for duplicate detection (see todo 010).

## Acceptance Criteria

- [ ] Single `db.insert` call for all matched wallets in one row
- [ ] Internal transfer (user sends to self between two watched addresses) creates 2 rows in one INSERT

## Work Log

- 2026-05-31: Identified by performance review agent
