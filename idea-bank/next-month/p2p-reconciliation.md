# P2P reconciliation — two-sided event ledger

**Added:** 2026-05-29

When a user sells USDT via P2P, two things happen in separate systems:
- USDT outflow appears onchain
- IDR inflow appears in BCA/GoPay 20–30 min later

No tool links these as one event. The concept: user logs in plain language ("sold 2000 USDT got 35.38M IDR"), Tali's NL parser extracts both sides, looks up a matching Goldsky-indexed USDT outflow within a time window, and links them as one reconciled ledger event.

**What's needed to build this:**
- Claude NL parser wired to `tali-cli log` (intent: `log_p2p_trade`)
- Goldsky Mirror pipeline deployed for the user's wallet
- Ledger write + auto-link logic in Postgres
- User confirmation step before linking

**Why it's the hero feature:** no other fintech product (Mint, Kubera, Cointracker) models the P2P crypto↔IDR bridge. It's structurally only possible for a tool that watches both sides simultaneously.
