# Architecture

High-level view of how Tali's components fit together.

## Layered view

```mermaid
graph TD
    subgraph Interface
        TG[Telegram bot<br/>grammY · chat surface]
        WEB[Desktop dashboard<br/>Next.js · Privy auth]
    end

    subgraph Agent
        RC[RealClaw<br/>automation engine · Byreal]
        NL[NL intent parser<br/>Claude]
        RULES[Rule engine + scheduler]
        RECON[Reconciliation engine]
    end

    subgraph Data
        PG[(Postgres<br/>unified event ledger<br/>offchain log)]
        GS[Goldsky Mirror<br/>event webhooks]
        ALC[Alchemy RPC<br/>state reads]
    end

    subgraph Chain[Chain · Solana]
        NFT[ERC-8004 NFT<br/>agent identity]
        USDY[Ondo USDY]
        DEX[Solana DEX swap<br/>via RealClaw/Byreal]
    end

    TG --> RC
    WEB --> PG
    RC --> NL
    RC --> RULES
    RC --> RECON
    RC --> PG
    GS --> RC
    RC --> ALC
    RC --> DEX
    DEX --> USDY
    RC --> NFT
```

## The two-tier wallet model

In this branch, AutonomousRule.sol is not used — RealClaw handles pre-authorized automation natively. The wallet model simplifies to two tiers.

```mermaid
graph LR
    subgraph Tier1[Tier 1 · Watched · Read-only]
        MM[MetaMask 0xABC]
        PH[Phantom · Solana]
        IDX[Indodax · read-only API]
    end

    subgraph Tier2[Tier 2 · Tali Wallet · User-signed]
        TALI[Privy embedded<br/>Split-key non-custodial]
    end

    Tier1 -.->|visibility only| DASH[Dashboard]
    Tier2 -->|user authenticates<br/>via passkey/OAuth| DASH
    Tier2 -->|pre-authorizes RealClaw<br/>strategies once| RC[RealClaw]
    RC -->|executes on Solana<br/>via Byreal| DASH
```

**Reading the diagram:**
- **Tier 1** wallets are visible to Tali but Tali has no signing authority. Like Etherscan, but for your unified picture.
- **Tier 2** is the wallet Privy creates for you. You authenticate each manual send. Actions execute on Solana via RealClaw/Byreal.

## Component responsibilities

| Component | What it owns | What it never does |
|---|---|---|
| **Telegram bot (grammY)** | User-facing chat surface, NL input, push notifications | Sign transactions directly (delegates to RealClaw/Privy); store secrets |
| **RealClaw** | DeFi automation engine — yield, DCA, swaps via Byreal on Solana; rule execution | Hold personal finance data (that's Tali's job) |
| **Tali backend** | Personal finance data layer — unified ledger, IDR net worth, P2P log, bank import, reconciliation | Execute DeFi actions directly (delegates to RealClaw) |
| **Goldsky Mirror** | Real-time event delivery via webhooks, re-org handling, retry | Read state on demand (that's RPC's job) |
| **Alchemy RPC** | Balance queries, read state on demand | Watch events (Goldsky's job); sign transactions (Privy's job) |
| **Privy** | Non-custodial wallet keys (split between secure enclave + user auth) | Make decisions; act without explicit user/contract auth |
| **ERC-8004 NFT** | Agent identity, action attestation log, public reputation surface | Hold funds; control wallet authority |
| **Postgres** | Offchain log, unified event ledger, user state | Hold authoritative on-chain truth (chain is canonical) |
| **Next.js dashboard** | Calm daily-use surface, activity feed, net-worth screen | Mutate state (calls Tali backend API for writes) |

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
        E2[Wallet swap on Solana]
        E3[USDY accrual]
    end

    U1 --> NL[NL parser<br/>+ ledger write]
    U2 --> SET[Arm RealClaw strategy<br/>+ user confirms once]
    U3 --> AGG[Aggregate balances<br/>+ render]
    U4 --> OCR[OCR/CSV parse<br/>+ ledger write<br/>+ reconcile]

    E1 --> WH[Goldsky webhook]
    WH --> MATCH[Rule match]
    MATCH --> EXEC[RealClaw executes<br/>Byreal strategy]
    EXEC --> E2
    E2 --> E3

    NL --> LEDGER[(Unified ledger)]
    SET --> LEDGER
    OCR --> LEDGER
    EXEC --> LEDGER
    WH --> LEDGER
```

## Why this shape

**Pattern B: agent-orchestrated action.** RealClaw is the agent; Tali provides the personal finance context that makes it useful beyond DeFi. Key reasons:

1. RealClaw already has pre-authorized autonomous execution — no custom contract needed
2. Byreal primitives (Kamino yield, CLMM, DCA) are richer than anything we could build in the hackathon timeline
3. Tali's value add is the data layer: P2P reconciliation, bank imports, IDR net worth — things RealClaw doesn't have
4. The integration demonstrates genuine RealClaw Real-Life Expansion, which is the scoring criterion

## Data sovereignty (planned — week 2+)

Tali will offer an opt-in self-sovereign mode for user financial data:

- **Default:** data stored on Tali's server (Drizzle ORM + PostgreSQL)
- **Self-sovereign mode (planned):** user data encrypted client-side with the user's own private key, stored permanently on Arweave/IPFS/Filecoin. Tali cannot read it. If Tali shuts down, the user's complete financial history remains accessible via their private key.

**Important:** this is never transparent-by-default onchain storage. Financial data is never written to a public blockchain in readable form. Always encrypted client-side before storage. The onchain layer is a neutral carrier.

User-facing framing: *"Your data, encrypted with your key, stored permanently. Tali could disappear tomorrow and you'd still have everything."*

This is the direct answer to the Mint shutdown problem (2024). See `idea-bank/later/data-sovereignty.md` for full concept.

## See also

- [`workflow.md`](workflow.md) — step-by-step user flows
- [`objectives.md`](objectives.md) — 3-week roadmap, MVP scope, what we won't build
