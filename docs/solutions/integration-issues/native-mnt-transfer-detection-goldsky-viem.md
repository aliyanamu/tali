---
title: "Native MNT transfers invisible to event ingestion pipeline"
problem_type: blockchain-issues
component: "Mantle RPC poller + Goldsky Mirror webhook"
symptoms:
  - "Plain ETH-value sends (native MNT) never appeared in the events ledger"
  - "eth_getLogs / erc20_transfers source only captured ERC-20 Transfer log events"
  - "Native coin transfers emit no EVM log — pure balance delta with no indexed topic"
  - "Net worth and transaction history silently missing native transfer activity"
tags:
  - native-transfers
  - goldsky-mirror
  - rpc-poller
  - mantle
  - webhook
  - erc20
  - event-ingestion
related_files:
  - backend/src/poller/mantleTestnet.ts
  - backend/src/services/transferIngestion.ts
  - backend/src/server/routes/webhooks/goldsky.ts
  - backend/goldsky/pipeline.yaml
  - backend/src/db/schema.ts
date: 2026-05-31
---

## Problem

Native MNT transfers (plain value sends) were silently dropped by both ingestion paths. Any `cast send --value` transaction produces a receipt with `logs: []` and was never recorded in the events ledger. Net worth calculations and transaction history were incomplete for users who received or sent native MNT.

## Root Cause

Both ingestion paths relied exclusively on ERC-20 Transfer event logs. Native MNT transfers emit no logs — `eth_getLogs` and Goldsky's `mantle.erc20_transfers` dataset are both derived from the log index, so native transfers are silently dropped.

- RPC poller: `eth_getLogs` with `Transfer(address,address,uint256)` ABI captures only token contract events
- Goldsky pipeline: `mantle.erc20_transfers` dataset is derived from logs — same blind spot
- Any `cast send --value` transaction produces a receipt with `logs: []` and is never recorded

## Solution

### RPC Poller (`backend/src/poller/mantleTestnet.ts`)

Fetch full block data in parallel alongside existing log queries, then verify receipts:

```typescript
const [fromLogs, toLogs, blocks] = await Promise.all([
  client.getLogs({ event: TRANSFER_ABI, args: { from: watchedAddresses }, fromBlock, toBlock }),
  client.getLogs({ event: TRANSFER_ABI, args: { to: watchedAddresses }, fromBlock, toBlock }),
  Promise.all(blockRange.map(blockNumber =>
    client.getBlock({ blockNumber, includeTransactions: true as const })
  )),
]);

// Find native transfer candidates
const nativeCandidates = blocks.flatMap(block =>
  block.transactions.filter(tx =>
    tx.value > 0n &&
    tx.to !== null &&
    (watchedSet.has(tx.to.toLowerCase()) || watchedSet.has(tx.from.toLowerCase()))
  )
);

// Verify receipts via allSettled so one flaky call doesn't stall the cycle
const receiptResults = await Promise.allSettled(
  nativeCandidates.map(tx =>
    client.getTransactionReceipt({ hash: tx.hash }).then(r => ({ tx, ok: r.status === 'success' }))
  )
);
```

Ingest with `logIndex: -1` as a sentinel (no ERC-20 log emitted for native transfers):

```typescript
await ingestTransfer({
  tokenAddress: null,
  logIndex: -1,  // sentinel: no ERC-20 log emitted
  source: 'rpc_poll',
  // ...
});
```

Also added `MAX_BLOCKS_PER_POLL = 100n` to cap RPC calls after a long outage.

### Goldsky Pipeline (`backend/goldsky/pipeline.yaml`)

Added a second source, transform, and sink targeting `mantle.transactions` instead of `mantle.erc20_transfers`:

```yaml
sources:
  mantle_transactions:
    dataset_name: mantle.transactions
    version: 1.0.0
    type: dataset
    start_at: latest

transforms:
  native_mnt_transfers:
    primary_key: hash
    sql: >
      SELECT * FROM mantle_transactions
      WHERE CAST(value AS NUMERIC) > 0
        AND receipt_status = 1
        AND to_address IS NOT NULL

sinks:
  tali_webhook_native:
    type: webhook
    from: native_mnt_transfers
    url: ${TALI_WEBHOOK_URL}
    headers:
      X-Goldsky-Secret: ${GOLDSKY_WEBHOOK_SECRET}
    one_row_per_request: true
```

### Webhook Handler (`backend/src/server/routes/webhooks/goldsky.ts`)

Added Zod schema for `mantle.transactions` field names and a type discriminator:

```typescript
const GoldskyNativeTxSchema = z.object({
  hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  from_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  to_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  value: z.string().regex(/^\d{1,78}$/),
  block_number: z.number().int(),
  block_timestamp: z.number().int(),
  transaction_index: z.number().int(),
  receipt_status: z.number().int(),
});

function isNativeRow(row: ErcRow | NativeRow): row is NativeRow {
  return 'hash' in row && 'from_address' in row;
}
```

Auth was also migrated from `?secret=` query param to `X-Goldsky-Secret` header to prevent the secret from appearing in server access logs.

## Prevention & Key Lessons

- **Audit coverage before wiring up any event pipeline.** For every asset type you intend to track, ask explicitly: does this asset emit a log? Native coins (ETH, MNT, BNB, SOL, etc.) do not. ERC-20 tokens do. ERC-721/1155 do. If the answer is "no log", `eth_getLogs` and any log-derived dataset (Goldsky Mirror `erc20_transfers`, Alchemy `Transfer` activity filters) are blind to it by design — not by bug.

- **Never assume a single ingestion path covers all value movement.** A complete pipeline requires two parallel tracks: (1) log-based ingestion for token transfers, (2) block-transaction scanning for native transfers. If your pipeline only has track 1, document explicitly that native transfers are out of scope, or add track 2.

- **When using Goldsky Mirror or similar log-indexed datasets, treat them as token-only.** The `erc20_transfers` table is derived from `Transfer(address,address,uint256)` log events. It will never contain a row for a native coin send, even if the amount is large. Cross-check your dataset's derivation source before relying on it for net-worth or balance calculations.

- **Always filter by receipt status when scanning `block.transactions`.** Reverted transactions still appear in `block.transactions` with a valid `value` field — the balance delta never actually happened. Fetch the receipt and skip any transaction where `status !== 1`. Skipping this check will produce phantom credit/debit events.

- **Use `eth_getBlockByNumber` with `includeTransactions: true` (not `false`) to detect native transfers.** Block headers alone give you no transaction data. You need the full transaction list to filter for `tx.value > 0n` and `tx.to === watchedAddress`.

- **The `-1` logIndex sentinel convention.** EVM logs always have a non-negative `logIndex` (0, 1, 2, …). Native transfers have no log and therefore no `logIndex`. When storing both token and native transfers in a unified ledger, use `-1` as the sentinel value for `logIndex` on native transfer rows. This makes the column non-nullable (simplifying queries), clearly distinguishes native transfers at the database level, and avoids `NULL`-handling edge cases in aggregations. Document this convention in the schema file so future contributors do not mistake `-1` for a data error.

- **Write an integration test that sends native coin to a watched address and asserts the event appears in the ledger.** Unit tests on the parsing logic are not enough — the gap is often at the pipeline-wiring level (wrong filter, wrong block fetcher flag, missing receipt check). A test that actually moves value is the only reliable regression guard.

- **When adding a new chain, re-audit both tracks.** Some chains (e.g. certain L2s or Cosmos-EVM chains) have quirks around how native transfers are represented — some wrap them as synthetic ERC-20 events, others do not. Do not assume the same scanning logic that works on Ethereum mainnet works identically on Mantle, Polygon, or BSC without verification.

- **Log a warning at startup if native transfer scanning is disabled.** If the poller or webhook handler is configured without native transfer support, emit a clearly labeled startup warning (`[WARN] Native MNT transfers are NOT being tracked`). Silent gaps are harder to catch in production than noisy ones.

## Related Documentation

- [`docs/solutions/dual-ingestion-testnet-poller.md`](../dual-ingestion-testnet-poller.md) — Dual ingestion architecture: Goldsky Mirror webhook for mainnet + RPC polling for testnet; covers webhook handler, poller design, and onchain Transfer event ingestion.
- [`docs/solutions/database-issues/drizzle-schema-restructure-and-migration-collapse.md`](../database-issues/drizzle-schema-restructure-and-migration-collapse.md) — Schema redesign and Goldsky Mirror pivot; covers the unified event ledger schema and the move to Goldsky Mirror webhooks.
