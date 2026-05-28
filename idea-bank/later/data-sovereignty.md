# Data Sovereignty — Self-Sovereign Mode

- **Added:** 2026-05-28
- **Category:** later (week 2+ planned feature; mention in submission as v2 vision)
- **Status:** concept defined, not yet built

## The problem it solves: the Mint shutdown

In 2024, Mint shut down. Users who had tracked their finances there for years lost their complete financial history. The data was held by a SaaS company that no longer had a business reason to keep it.

Every personal finance tool in existence has this problem. Your data is in their database. If they disappear, so does your history.

Tali's answer: **the Mint-proof guarantee.**

## What self-sovereign mode is

An opt-in mode where user financial data is:
1. **Encrypted client-side** with the user's own private key before leaving their device
2. **Stored permanently** on decentralized storage (Arweave, IPFS, or Filecoin)
3. **Unreadable by Tali** — only the private key holder can decrypt

If Tali shuts down tomorrow, the user's complete financial history is still accessible forever via their private key and any IPFS/Arweave gateway.

**User-facing framing:** *"Your data, encrypted with your key, stored permanently. Tali could disappear tomorrow and you'd still have everything."*

## What it is NOT

- **Not transparent-by-default onchain storage.** Financial data is never written to a public blockchain in readable form. A public ledger showing "Mufidah spent Rp 2.4jt on groceries" is worse than a SaaS database.
- **Not automatic.** Opt-in only, clearly explained. Default mode remains Tali's server (Drizzle ORM + PostgreSQL) for performance.
- **Not a blockchain feature.** The onchain layer (Arweave/IPFS) is a neutral storage carrier. The privacy comes from client-side encryption, not from chain properties.

## Architecture sketch (not yet designed in detail)

```
User device
  → encrypt blob with user private key (or Privy-managed key)
  → upload encrypted blob to Arweave/IPFS/Filecoin
  → store CID/txid in Postgres (pointer only, not data)

To read back:
  → fetch blob from CID
  → decrypt with user key
  → hydrate local state
```

## Why Arweave over IPFS or Filecoin

- **Arweave:** permanent by design (pay once, stored forever). Best fit for financial history which should never expire.
- **IPFS:** content-addressed but not permanent — requires pinning service or it may be garbage collected.
- **Filecoin:** permanent + verified storage proofs. More complex. May be worth it for users who want cryptographic proof of storage.

Recommendation: Arweave for simplicity. Offer Filecoin as an advanced option.

## Submission mention

Frame in submission: *"Tali's data layer is built for permanence. In self-sovereign mode (planned v2), your financial history is encrypted with your own key and stored permanently on Arweave — Tali could shut down and you'd still have everything. The direct answer to the Mint problem."*

## Why this matters competitively

Traditional fintech cannot offer this. Their business model depends on holding user data. Tali's architecture makes it technically possible to give users full data ownership — and the SEA crypto-native user is exactly the user who would value and understand this guarantee.

## Timeline

`later` — not week 1/2/3. Mention as v2 guarantee in hackathon submission narrative. No code changes required now.
