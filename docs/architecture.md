# Architecture

High-level view of how Tali's components fit together. Source-of-truth product spec lives at `../../context/13_project_locked.md`.

## Layered view

```mermaid
graph TD
    subgraph Interface
        TG[Telegram bot<br/>grammY · chat surface]
        CLI[tali-cli<br/>RealClaw skill · OpenClaw]
        WEB[Desktop dashboard<br/>Next.js · Privy auth]
    end

    subgraph Agent
        SKILL[TaliSkill<br/>OpenClaw custom Skill]
        NL[NL intent parser<br/>Claude]
        RULES[Rule engine + scheduler]
        RECON[Reconciliation engine]
    end

    subgraph Data
        PG[(Postgres<br/>unified event ledger<br/>offchain log)]
        GS[Goldsky Mirror<br/>event webhooks]
        ALC[Alchemy RPC<br/>state reads]
    end

    subgraph Chain
        AR[AutonomousRule.sol<br/>action surface]
        NFT[ERC-8004 NFT<br/>agent identity]
        USDY[Ondo USDY]
        AGNI[Agni DEX swap]
    end

    TG --> SKILL
    CLI --> SKILL
    WEB --> PG
    SKILL --> NL
    SKILL --> RULES
    SKILL --> RECON
    SKILL --> PG
    GS --> SKILL
    SKILL --> ALC
    ALC --> AR
    AR --> AGNI
    AGNI --> USDY
    SKILL --> NFT
```

## The three-tier wallet model

This is the single most important honesty for users — what Tali can read vs sign vs auto-execute.

```mermaid
graph LR
    subgraph Tier1[Tier 1 · Watched · Read-only]
        MM[MetaMask 0xABC]
        PH[Phantom · Solana]
        IDX[Indodax · read-only API]
    end

    subgraph Tier2[Tier 2 · Tali Wallet · User-signed]
        TALI[Privy embedded 0xDEF<br/>Split-key non-custodial]
    end

    subgraph Tier3[Tier 3 · Rule Execution · Agent-orchestrated]
        AR[AutonomousRule.sol 0xGHI<br/>Pre-authorized actions only]
    end

    Tier1 -.->|visibility only| DASH[Dashboard]
    Tier2 -->|user authenticates<br/>via passkey/OAuth| DASH
    Tier2 -->|pre-authorizes once<br/>at rule setup| Tier3
    Tier3 -->|agent invokes<br/>executeRule| DASH
```

**Reading the diagram:**
- **Tier 1** wallets are visible to Tali but Tali has no signing authority. Like Etherscan, but for your unified picture.
- **Tier 2** is the new wallet Privy creates for you. You authenticate each manual send. Same address works on all EVM chains; we act on Mantle.
- **Tier 3** is the smart contract where rules execute. User pre-authorizes once at rule setup; agent invokes `executeRule()` thereafter within the rule's scope.

Full security and failure-mode discussion: `../../context/13_project_locked.md` "Wallet model" section.

## Component responsibilities

| Component | What it owns | What it never does |
|---|---|---|
| **Telegram bot (grammY)** | User-facing chat surface, NL input, push notifications | Sign transactions directly (delegates to Privy); store secrets |
| **tali-cli (RealClaw skill)** | OpenClaw-registered skill entry point; exposes `networth`, `wallet`, `log`, `rules` to any RealClaw-compatible agent | Hold keys; bypass user authorization |
| **TaliSkill (OpenClaw Skill)** | Rule engine, reconciliation, ledger writes, agent decisions | Hold keys; bypass user authorization |
| **Goldsky Mirror** | Real-time event delivery via webhooks, re-org handling, retry | Read state on demand (that's RPC's job) |
| **Alchemy RPC** | Balance queries, read state on demand, RPC transport for Privy tx submission | Watch events (Goldsky's job); sign transactions (Privy's job) |
| **Privy** | Non-custodial wallet keys (split between secure enclave + user auth) | Make decisions; act without explicit user/contract auth |
| **AutonomousRule.sol** | Storing rule configs on-chain, executing constrained actions, emitting attestations | Hold rule logic; act without agent invocation |
| **ERC-8004 NFT** | Agent identity, action attestation log, public reputation surface | Hold funds; control wallet authority |
| **Postgres** | Offchain log, unified event ledger, user state | Hold authoritative on-chain truth (chain is canonical) |
| **Next.js dashboard** | Calm daily-use surface, activity feed, net-worth screen | Mutate state (calls TaliSkill API for writes) |

## Data flow at a glance

```mermaid
flowchart LR
    subgraph User Actions
        U1[Log P2P trade]
        U2[Set savings rule]
        U3[Check net worth]
        U4[Import bank CSV]
    end

    subgraph On-chain Events
        E1[USDT received]
        E2[Wallet swap]
        E3[USDY accrual]
    end

    U1 --> NL[NL parser<br/>+ ledger write]
    U2 --> SET[Sign setRule tx<br/>+ contract config]
    U3 --> AGG[Aggregate balances<br/>+ render]
    U4 --> OCR[OCR/CSV parse<br/>+ ledger write<br/>+ reconcile]

    E1 --> WH[Goldsky webhook]
    WH --> MATCH[Rule match]
    MATCH --> EXEC[Sign executeRule tx]
    EXEC --> E2
    E2 --> E3

    NL --> LEDGER[(Unified ledger)]
    SET --> LEDGER
    OCR --> LEDGER
    EXEC --> LEDGER
    WH --> LEDGER
```

## Why this shape

The key architectural decision is **Pattern B: agent-orchestrated action**. We picked it over Pattern A (contract self-executes) because:

1. The agent doing the reasoning is what makes this on-thesis for "agent autonomy" scoring
2. Rule logic in TypeScript is faster to iterate than rule logic in Solidity
3. Complex rule conditions (multi-trigger, time-aware, cross-asset) are agent territory, not contract territory
4. Smart contract stays minimal — just a constrained action surface the agent can invoke

The contract has authority bounded by what the user signed for. The agent has the reasoning. Together they form an autonomous loop without custodial trust.

Full Pattern A vs B reasoning: `../../context/13_project_locked.md` "Tier 3 — AutonomousRule.sol" section.

## See also

- [`workflow.md`](workflow.md) — step-by-step user flows (onboarding, rule firing, P2P trade logging, monthly bank import)
- [`objectives.md`](objectives.md) — 3-week roadmap, MVP scope, what we won't build
- `../../context/13_project_locked.md` — locked spec (source of truth)
