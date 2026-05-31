---
status: pending
priority: p1
issue_id: "003"
tags: [code-review, webhook, performance, correctness]
---

# Asset lookup in webhook missing chainId filter — seq scan + non-deterministic on multi-chain

## Problem Statement

The ERC-20 asset lookup in `goldsky.ts` filters only on `token_address`, not `chain_id`. This means:
1. The partial unique index `assets_token_address_unique` on `(chain_id, token_address)` is NOT used — every webhook call does a full table scan.
2. If the same token address exists on two different chains, `findFirst` returns whichever row Postgres returns first (non-deterministic).

## Findings

File: `backend/src/server/routes/webhooks/goldsky.ts:91-95`

```ts
const asset = tokenAddr
  ? await db.query.assets.findFirst({
      where: (a, { eq }) => eq(a.tokenAddress, tokenAddr),  // ❌ missing chainId
    })
```

## Fix

```ts
const asset = tokenAddr
  ? await db.query.assets.findFirst({
      where: (a, { and, eq }) => and(eq(a.chainId, chainId), eq(a.tokenAddress, tokenAddr)),
    })
  : await db.query.assets.findFirst({
      where: (a, { and, eq, isNull }) => and(eq(a.chainId, chainId), isNull(a.tokenAddress)),
    });
```

## Acceptance Criteria

- [ ] Asset lookup uses both `chainId` and `tokenAddress` in the WHERE clause
- [ ] Query uses the partial unique index (verify with EXPLAIN ANALYZE)

## Work Log

- 2026-05-31: Identified by architecture + performance review agents
