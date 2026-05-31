---
status: pending
priority: p2
issue_id: "007"
tags: [code-review, security, privacy]
---

# Real PII committed to seed.ts — email, wallet address, Privy IDs

## Problem Statement

`seed.ts` contains `mufidah.hanaaliyah@gmail.com`, wallet address `0x8a5B7bBAba77920744bd91643cc0E16A8aCFF061`, and Privy internal IDs. These are committed in git history (commit `950dd0e`). If the repo is made public before the hackathon demo, the email and wallet are permanently indexed by GitHub search.

## Findings

File: `backend/src/db/seed.ts:43-50`

```ts
email: 'mufidah.hanaaliyah@gmail.com',      // real PII
walletAddress: '0x8a5B7bBAba77920744bd91643cc0E16A8aCFF061', // real wallet
linkedUserId: 'cmptj8akr00cd0dl1rv7vf7ay',  // Privy user ID
linkedWalletId: 'l0frktpc4w0xk2sxtsw9cdbb', // Privy wallet ID
```

## Proposed Solutions

**Option A (recommended for public repo):** Replace with clearly fake values:
- Email: `demo@example.com`
- Wallet: `0x000000000000000000000000000000000000dEaD` or any well-known test address
- Privy IDs: `privy_user_demo` / `privy_wallet_demo`
- Then git rebase to purge from history before making repo public

**Option B (keep real values, keep repo private):** Acceptable if the repo stays private until after the hackathon. Add a `.env`-based override so seed values come from env vars, not hardcoded.

## Acceptance Criteria

- [ ] No real email addresses, wallet addresses, or auth provider IDs in committed files
- [ ] Or: explicit confirmation that the repo will remain private

## Work Log

- 2026-05-31: Identified by security review agent
