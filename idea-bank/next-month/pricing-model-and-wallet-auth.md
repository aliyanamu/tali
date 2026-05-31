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

## Wallet ownership verification (narrower than originally framed)

**Industry norm:** Delta, CoinTracker, Zapper, and DeBank all allow adding any public address
with no ownership proof. Blockchain addresses are public by design — watching an address is a
read-only observation, not a claim of ownership. Watching someone else's wallet (whale, treasury,
friend) is expected and standard.

`tali-cli wallet watch <address>` adding any address without verification is therefore **correct
and industry-standard behavior.** No fix needed for watching.

**Where ownership proof actually matters — rule execution only.**

The real concern is autonomous rules: "sell X when condition met" should only fire on wallets
the user actually controls. This is already gated:
- Privy wallets (Tier 2) — Privy verifies server-side control at wallet creation; no extra auth needed.
- MetaMask / Phantom (Tier 1) — user-signed transactions; the wallet can't be drained without the
  user's key. Rule execution on Tier 1 wallets requires a push-to-device confirmation flow (already
  in idea-bank as a later feature).

**Nothing needs to change now.** If a multi-user product context ever requires distinguishing
"this is my wallet" from "I'm watching this whale," add an `ownership_verified boolean default false`
column to `watched_wallets` and gate personal-finance-specific features (alerts, net worth roll-up)
on it. But this is not a pre-launch blocker — it's a product UX decision.
