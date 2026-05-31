# Pricing Model + Wallet Ownership Auth

Date surfaced: 2026-05-31

## Pricing model

**Free tier** — on-demand RPC only, nothing persisted
- Page load / refresh → direct RPC call → current balances → not stored
- No entry in `watched_wallets` → poller and Goldsky webhook skip them entirely
- No rows ever written to `onchain_events`

**Paid tier** — real-time recording
- `wallet watch` adds to `watched_wallets`
- Poller + Goldsky webhook start recording transfers into `onchain_events`
- Enables: transfer history, net worth over time, alerts, autonomous rule triggers

Implementation note: the gate already exists in code — both the poller and webhook
filter by `watched_wallets`. Removing a user from that table immediately stops recording.
No new infrastructure needed to enforce the free/paid split.

### 30-day backfill on upgrade (flagged, not built)

Cold-start problem: a user who just upgraded sees an empty ledger for weeks, which
feels broken. Fix: on `wallet watch`, run a one-shot `eth_getLogs` over the last 30 days
of blocks (~2.2M blocks on Mantle at ~1.2s/block) feeding into the existing `ingestTransfer`
service. One RPC call, fast, gives immediate history.

Implementation hook: `tali-cli wallet watch <address> --backfill` flag.

### Competitive context

| App | Free gate | Free history | Backfill on upgrade |
|---|---|---|---|
| [Delta](https://delta.app/en) | 2 wallet connections | Full history on connected wallets | Immediate — add wallet, it backfills |
| [CoinTracker](https://www.cointracker.io) | 25 transactions | Full backfill on connect (hits cap fast for active wallets) | Already imported, just unlocked on upgrade |
| **Tali (proposed)** | No watched address recording | Balance only (RPC on-demand) | 30-day backfill on upgrade |

Delta gates on connection count; CoinTracker gates on transaction count (backfills aggressively
on connect so active wallets hit the limit instantly — good conversion mechanic). Tali's model
is closest to Delta but gates on recording depth rather than connection count.

---

## Wallet ownership verification (flagged, required before public launch)

**Current gap:** `tali-cli wallet watch <address>` adds any address to `watched_wallets`
with no proof of ownership. A user can add someone else's wallet and receive their transfer
history.

**Required fix:** prove ownership before watching a wallet as "your own."

Standard approach — sign-message challenge (SIWE pattern):
1. Server issues a nonce: `"Tali: verify ownership of <address> — nonce: <uuid>"`
2. User signs with MetaMask / Phantom
3. Server calls `viem.verifyMessage({ address, message, signature })` and stores the wallet
   only if it matches

This requires a frontend (OpenClaw skill UI or web app) since the CLI cannot drive MetaMask
signing. For the hackathon demo this is not an attack vector (single-user), but it is a
pre-launch blocker for any multi-user deployment.

**Distinction to preserve:**
- "Watch" (read-only, no ownership proof) — valid for watching whales, protocol treasuries, etc.
- "Add as mine" — requires signature proof, enables recording and personal finance features

The `watched_wallets` table could add an `ownership_verified boolean default false` column
to distinguish the two modes.
