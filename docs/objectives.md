# Objectives & roadmap

What we're shipping, when, and why. Single source of truth for scope decisions during the build.

---

## North star

**Mufidah opens Tali every day, and her financial life makes more sense because of it.**

If that's not true by 2026-06-15, nothing else matters.

---

## Three-week roadmap

```mermaid
gantt
    title Tali — 3-week build (2026-05-24 → 2026-06-15)
    dateFormat YYYY-MM-DD
    section Setup
    Privy + accounts + repo init :done, setup, 2026-05-24, 2d
    RealClaw access follow-up :crit, realclaw, 2026-05-24, 7d
    section Week 1 — Visibility
    Telegram bot scaffold :w1a, 2026-05-26, 3d
    Privy wallet creation :w1b, 2026-05-26, 2d
    Goldsky pipeline + webhook :w1c, after w1a, 3d
    NL parser (P2P log) :w1d, after w1b, 3d
    Unified ledger schema :w1e, 2026-05-27, 2d
    /networth command :w1f, after w1e, 2d
    Daily dogfood :w1g, 2026-05-28, 6d
    section Week 2 — Polish + Agent
    Reconciliation suggestions :w2a, 2026-06-01, 3d
    Forgotten-balance detector :w2b, 2026-06-01, 2d
    Bank CSV / OCR import :w2c, 2026-06-02, 3d
    Web dashboard scaffold :w2d, 2026-06-03, 4d
    AutonomousRule.sol :w2e, 2026-06-02, 3d
    ERC-8004 NFT contract :w2f, after w2e, 2d
    Deploy contracts to Sepolia :w2g, after w2f, 1d
    section Week 3 — Ship
    Deploy Mainnet + verify :w3a, 2026-06-08, 2d
    Wire rule end-to-end :w3b, after w3a, 2d
    First live rule firing :crit, w3c, 2026-06-10, 1d
    Demo video recording :w3d, 2026-06-11, 2d
    README + pitch :w3e, after w3d, 2d
    Name check + rename if needed :w3f, 2026-06-12, 1d
    Submit DoraHacks :crit, submit, 2026-06-15, 1d
```

---

## MVP scope (what ships by 2026-06-15)

### Visibility (week 1)

```mermaid
mindmap
  root((Visibility MVP))
    Onboarding
      Telegram /start
      Privy embedded wallet on Mantle
      Optional MetaMask watch
    Unified net worth
      Mantle balances via Alchemy
      External wallet via public address
      Indodax via read-only API
      Offchain accounts via manual log
      Total in IDR
    P2P trade logging
      NL parse "sold X got Y"
      Auto-link to onchain outflow
      Tag in unified ledger
```

### Polish + agent foundation (week 2)

```mermaid
mindmap
  root((Polish + Agent MVP))
    Reconciliation
      Same-day match suggestions
      Orphan deposit prompts
      Confirmation flow
    Bank import
      CSV upload via Telegram
      Screenshot OCR via Claude
      Auto-link to onchain
    Dashboard
      Next.js on Vercel
      Privy auth
      Net-worth screen
      Activity feed
    Agent contracts
      AutonomousRule.sol
      ERC-8004 NFT
      Sepolia deployment
```

### Ship + demo (week 3)

```mermaid
mindmap
  root((Ship + Demo MVP))
    Mainnet
      Contracts deployed
      Verified on Explorer
      Live rule wired end-to-end
    Demo artifact
      ≥2 min video
      Live rule firing capture
      Dashboard tour
      Agent NFT public page
    Submission
      README with deployed addresses
      One-line pitch + deck
      Track-specific answers
      DoraHacks filed
```

---

## Out of scope (deliberately not building for MVP)

- Multi-user / families / shared accounts (was TKI's territory)
- Tax filing automation (downstream of reconciliation — v2)
- Trading / portfolio strategies (we're not a trader's tool)
- Custodial features (everything user-held via Privy)
- Bank-connect auto-sync via Brick API (v2 — removes daily logging fatigue)
- Multi-chain action (Mantle-only at MVP; watch other EVM read-only if time permits)
- Beneficiary / dead-man switch (Kubera-borrow for v2)
- Multiple rules per user (single rule at MVP; multi-rule library is v1.5)
- ERC-4337 session keys (Option B pre-authorized contract at MVP; session keys v2)

---

## Honest risks

```mermaid
graph TD
    R1[RealClaw beta access<br/>delayed past 2026-05-31] -->|fallback| F1[Build standalone<br/>Telegram bot<br/>submit to AI×RWA]
    R2[Sample size 1 dogfood<br/>features over-fit Mufidah] -->|mitigation| F2[Acceptable for hackathon<br/>expand to 5-10 users post]
    R3[Manual logging fatigue] -->|mitigation| F3[Monthly CSV import<br/>complements live log]
    R4[Multi-chain visibility<br/>integration complexity] -->|mitigation| F4[Mantle-only at MVP<br/>other chains if time]
    R5[Agent inference accuracy<br/>P2P mis-link] -->|mitigation| F5[Always require user<br/>confirmation MVP]
    R6[Smart contract bug] -->|mitigation| F6[Emergency pause function<br/>user withdraw always works]
```

Full risk discussion: `../../context/13_project_locked.md` "Honest known risks" section.

---

## Submission gate (everything below must be ✅ before submitting)

```mermaid
graph LR
    A[Contracts deployed<br/>Mantle] --> B[Verified on<br/>Mantle Explorer]
    B --> C[AI-callable<br/>on-chain function]
    C --> D[Public frontend<br/>accessible]
    D --> E[Deployment address<br/>in submission]
    E --> F[Demo video<br/>≥ 2 min]
    F --> G[Open-source repo<br/>+ README]
    G --> H[One-line pitch<br/>+ deck]
    H --> I[Track-specific<br/>answers prepared]
    I --> J[ERC-8004 NFT<br/>minted for Mufidah]
    J --> K[Submit DoraHacks<br/>before 15:59]
    style K fill:#90ee90
```

Working checklist with check-as-you-go status: `../../todo.md` "Submission checklist" section.

---

## Next-session queue (deferred from 2026-05-24 work session)

When the next work session begins (after `pnpm install` + Drizzle migrations + Telegram bot setup), the queued artifacts I should produce on request:

1. **Goldsky Mirror pipeline config** — YAML/dashboard steps for a Transfer-event indexer covering USDT, USDC, USDY, mETH on Mantle Mainnet, filtered to user wallet addresses, delivering to the `/webhooks/goldsky` endpoint with HMAC signing.
2. **Mantle Explorer token-address verification checklist** — exact addresses to confirm on mantlescan.xyz for USDT (bridged), USDC (bridged), mETH (Mantle staked ETH), USDY (Ondo). Currently `skill/src/lib/tokens.ts` has placeholders marked TODO.

Both are queued in `../../todo.md` "Next session pickup" section.

## Decision principles (resolve disputes against these)

1. **Mufidah's daily-use happiness > judges' applause.** If something polishes the demo but Mufidah wouldn't use it daily, deprioritize.
2. **Ship > perfect.** Better to have one working autonomous rule than three half-finished ones.
3. **Honest scope > overclaiming.** Better to under-promise in the pitch and over-deliver than vice versa.
4. **Clarity, calm, control** — the Kubera language register. Every UI surface and every notification.
5. **Pattern B agent-orchestrated** — when in doubt, the agent reasons, the contract executes.
6. **No more pivots until 2026-06-15.** New ideas go to `parking_lot.md`, not into active scope.

---

## After 2026-06-15

If Tali ships and Mufidah genuinely uses it daily, the v1.5 / v2 directions are sketched in `../../context/parking_lot.md`. Otherwise the lessons get written up and we move on. Either way, no decisions about post-hackathon scope during the hackathon.
