---
title: Dual ingestion — Goldsky mainnet + RPC poll testnet
date: 2026-05-31
tags: [architecture, onchain-events, webhook, polling, mantle]
---

## Problem

Goldsky Mirror only indexes Mantle **mainnet**. There is no Goldsky dataset for Mantle Sepolia.
We needed real-time ERC-20 Transfer events on testnet for local development.

QuickNode Streams was evaluated but rejected: it charges 30 credits per delivered payload, which
burns credits fast during testnet iteration.

## Decision

Two ingestion paths, both writing to `onchain_events`, distinguished by `source`:

| Path | Chain | Mechanism | Source value |
|---|---|---|---|
| Goldsky Mirror webhook | Mantle mainnet (5000) | Push — Goldsky delivers each transfer to `POST /webhooks/goldsky` | `goldsky_mirror` |
| RPC poll loop | Mantle Sepolia (5003) | Pull — `eth_getLogs` via viem every `POLL_INTERVAL_MS` ms | `rpc_poll` |

The poller starts automatically when `MANTLE_PUBLIC_RPC` is set in the environment. If the var
is absent, the mainnet-only path is used unchanged.

## Why not self-poll mainnet too?

Goldsky Mirror is free at hackathon scale and delivers events with lower latency and no RPC rate
limit concerns. The push model is strictly better for mainnet. The poll loop exists only to cover
the testnet gap.

## Key implementation detail: two `eth_getLogs` queries per cycle

`eth_getLogs` cannot filter "topic1 OR topic2 matches address" in a single call — topics are
ANDed across positions. So the poller makes two queries per poll cycle:
1. `args: { from: watchedAddresses }` — catches outflows
2. `args: { to: watchedAddresses }` — catches inflows

Results are deduplicated by `txHash:logIndex` before ingestion.

## Shared ingestion service

Both paths use `backend/src/services/transferIngestion.ts:ingestTransfer()`. This ensures
identical DB write logic, asset lookup, decimal conversion, and idempotency handling regardless
of which path delivered the event.

## Wallet chainId matters

Wallets in `watched_wallets` must have the correct `chainId` to be matched by either path.
Mainnet wallets: `chainId = 5000`. Testnet wallets: `chainId = 5003`.
The ingestion service filters by `chainId` before matching addresses.
