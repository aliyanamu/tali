# Scalable Wallet Monitoring
**Added:** 2026-05-31

## Problem

Alchemy Notify registers watched addresses one-by-one in the dashboard. Fine for hackathon (one user, one wallet), but doesn't scale to multi-user — registering/unregistering per user is a manual hassle and has no programmatic API on free tier.

## Reference

CryptoAPIs has a clean REST API for dynamic address registration (`POST /blockchain-events/ethereum-mainnet/address/{address}` to watch, `DELETE` to unwatch). But it's paid and not cheap.

## Cheaper Alternatives to Evaluate

| Option | How it works | Cost | Mantle support |
|---|---|---|---|
| **Goldsky Mirror** | Define a subgraph-style pipeline; supports dynamic address lists via config; push to webhook | Free tier generous; pay at scale | Yes (was original plan) |
| **Moralis Streams** | Programmatic REST API — `POST /streams/evm/{id}/address` to add addresses dynamically | Free tier: 200 req/s, 100 addresses | Check |
| **Envio HyperSync** | Open-source self-hosted indexer; filter by address list in config; no per-address dashboard clicks | Free if self-hosted | Yes |
| **Ponder** | Open-source Node.js indexer; address list in code, re-deploy to change | Free if self-hosted | Check |

## Recommended Path

**Goldsky Mirror** is the most natural fit — it was the original architecture before we simplified for hackathon. It supports Mantle, has a free tier, and lets you define address lists in the pipeline config (YAML/JSON) rather than clicking one by one. Programmatic registration would mean updating the pipeline config via Goldsky's API and redeploying the Mirror — not perfect but better than Alchemy.

**Moralis Streams** is the closest to CryptoAPIs' UX — true REST API for dynamic address registration. Worth benchmarking on pricing once user count is known.

## When to Revisit

When Tali goes multi-user (more than 5–10 users), the Alchemy one-by-one approach breaks down. At that point, replace `ALCHEMY_WEBHOOK_SECRET` + Alchemy Notify with whichever alternative wins the benchmark. The webhook handler (`server/routes/webhooks/alchemy.ts`) only needs a new route file — the DB schema and rule engine are unchanged.
