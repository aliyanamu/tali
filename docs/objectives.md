# Objectives & roadmap

What we're shipping, when, and why. Single source of truth for scope decisions.

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
    Accounts + repo init :done, setup, 2026-05-24, 2d
    section Week 1 — Visibility
    byreal-cli OpenClaw setup :w1a, 2026-05-26, 2d
    tali-cli networth live :w1b, 2026-05-26, 2d
    Goldsky pipeline + webhook :w1c, after w1a, 3d
    Unified ledger schema :done, w1e, 2026-05-27, 1d
    Daily dogfood :w1g, 2026-05-28, 6d
    section Week 2 — Agent
    AutonomousRule.sol :w2a, 2026-06-01, 3d
    ERC-8004 NFT contract :w2b, after w2a, 2d
    Deploy contracts Sepolia :w2c, after w2b, 1d
    Rule setup flow end-to-end :w2d, after w2c, 3d
    Web dashboard scaffold :w2e, 2026-06-03, 4d
    section Week 3 — Ship
    Deploy Mainnet + verify :w3a, 2026-06-08, 2d
    Wire rule end-to-end live :w3b, after w3a, 2d
    First live rule firing :crit, w3c, 2026-06-10, 1d
    Demo video recording :w3d, 2026-06-11, 2d
    README + pitch :w3e, after w3d, 2d
    Submit DoraHacks :crit, submit, 2026-06-15, 1d
```

---

## MVP scope

### Week 1 — Visibility

- `byreal-cli` OpenClaw agent running DeFi on Byreal/Solana
- `tali-cli networth` live with real API keys
- Goldsky webhook server receiving Mantle transfer events

### Week 2 — Agent

- `AutonomousRule.sol` + ERC-8004 NFT deployed on Mantle Sepolia
- Rule setup flow: NL → Privy signature → contract
- Goldsky event → byreal-cli execution → Mantle attestation
- Web dashboard scaffold on Vercel

### Week 3 — Ship

- Contracts live on Mantle Mainnet, verified on mantlescan.xyz
- At least one live rule firing on record
- Demo video ≥ 2 min
- DoraHacks submitted

---

## Submission gate (all must be ✅)

```mermaid
graph LR
    A[Contracts on Mantle] --> B[Verified on mantlescan.xyz]
    B --> C[byreal-cli agent running]
    C --> D[ERC-8004 NFT minted]
    D --> E[Live rule firing captured]
    E --> F[Demo video ≥ 2 min]
    F --> G[Open-source repo + README]
    G --> H[DoraHacks filed before 15:59]
    style H fill:#90ee90
```

---

## Competitive moat

1. **Autonomous agent with real on-chain identity** — ERC-8004 NFT on Mantle records every action. Not stored in a SaaS database.
2. **Real DeFi execution** — `byreal-cli` runs production Byreal/Solana strategies, not a demo. Genuine value created.
3. **Personal finance layer** — IDR net worth across Mantle wallets. No other DeFi agent speaks IDR or understands Southeast Asian users.
4. **Agentic Economy Path B** — Tali extends Byreal into real-life financial management. The demo story is: *set a rule once, agent acts while you sleep, every action verifiable onchain.*
5. **P2P trade reconciliation** — future differentiator in `idea-bank/next-month/`. No competing tool models this problem.

---

## Decision principles

1. **Ship > perfect.** One working autonomous rule beats three half-finished ones.
2. **Honest scope > overclaiming.** Under-promise, over-deliver.
3. **No pivots until 2026-06-15.** New ideas → `idea-bank/`, not active scope.
4. **Mufidah's daily-use happiness > judges' applause.**
