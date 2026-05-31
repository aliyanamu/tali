# Pricing Model + Wallet Ownership Auth

Date surfaced: 2026-05-31

## How competitors read wallet data (research finding)

No major tracker uses raw `eth_getLogs` for history display. They all sit on top of a
pre-indexed API:
- **Covalent / GoldRush**, **Moralis** — third-party indexer APIs, full history from block 0
- **Alchemy Enhanced APIs** (`alchemy_getAssetTransfers`) — layered on Alchemy's own node index
- **Zapper, DeBank, Zerion** — proprietary in-house indexers; index the whole chain proactively,
  not per-user. Instant because data is already there before any user adds the address.

For Mantle specifically, **Alchemy `alchemy_getAssetTransfers` is already in the stack** and
covers full transfer history for any address on demand. No self-hosted indexer needed.

## Revised pricing model

**Free tier** — read-only, nothing persisted
- Current balance: RPC on-demand ✅
- Transfer history: `alchemy_getAssetTransfers` on-demand, not stored in `onchain_events` ✅
- No `watched_wallets` entry, no recording, no DB writes

**Paid tier** — recording + intelligence layer
- Onchain ↔ offchain reconciliation (pair crypto receive with bank transfer / P2P trade)
- Real-time rule triggers and alerts
- Both require events recorded in `onchain_events` — that's the gate, not history display

`watched_wallets` + `onchain_events` recording infrastructure exists to power reconciliation
and rules, not to gate history display. Free users read history from Alchemy; paid users get
reconciliation and rules on top of the stored event stream.

### Competitive context

| App | Free gate | Free history | Paid unlock |
|---|---|---|---|
| [Delta](https://delta.app/en) | 2 wallet connections | Full history (Alchemy/Covalent) | More connections |
| [CoinTracker](https://www.cointracker.io) | 25 transactions | Full backfill on connect | More transactions + tax reports |
| [Zapper](https://zapper.xyz) | None | Full history (own indexer) | Premium portfolio features |
| **Tali (proposed)** | No gate on balance/history | Full history via Alchemy on-demand | Reconciliation + rule triggers |

Tali's moat is the onchain ↔ offchain reconciliation skill — not history display, which every
tracker gives away free.

### Recording gate implementation

Add `recording_enabled boolean default false` to `watched_wallets`. Poller and Goldsky webhook
filter on `recording_enabled = true` instead of any watched wallet. Free users can have
`watched_wallets` rows (for label/display purposes) with recording off; paid users flip the flag.
No new table needed.

### 30-day backfill on paid upgrade (flagged, not built)

When `recording_enabled` flips to true, run a one-shot `alchemy_getAssetTransfers` over the
last 30 days feeding into `ingestTransfer`. Gives the reconciliation layer immediate data to
work with instead of starting from zero.

Implementation hook: `tali-cli wallet watch <address> --record` or automatic on plan upgrade.

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
