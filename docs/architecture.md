# Architecture

## Why we dropped RealClaw and the Telegram bot

RealClaw has no external API — it works by taking over a bot token's Telegram webhook. There is no programmatic bridge from Tali's server to RealClaw. `byreal-cli` is the correct integration point: it calls `https://api2.byreal.io` directly and signs Solana transactions locally. The Telegram bot was removed because the OpenClaw skill interface replaces it.

---

## Layered view

```mermaid
graph TD
    subgraph Interface
        CL[Claude<br/>agent brain · OpenClaw]
        WEB[Web dashboard<br/>Next.js · Privy auth · week 2]
    end

    subgraph Skills
        TALI[tali-cli<br/>personal finance skill]
        BYREAL[byreal-cli<br/>Byreal DeFi execution skill]
    end

    subgraph Backend
        GS[Goldsky Mirror<br/>webhook server · Hono]
        PG[(Postgres<br/>unified event ledger)]
        ALC[Alchemy RPC<br/>Mantle state reads]
    end

    subgraph Mantle[Chain · Mantle]
        AR[AutonomousRule.sol<br/>action surface]
        NFT[ERC-8004 NFT<br/>agent identity]
    end

    subgraph Solana[Chain · Solana]
        DEX[Byreal CLMM DEX<br/>yield · DCA · swaps · positions]
    end

    CL --> TALI
    CL --> BYREAL
    WEB --> PG
    TALI --> ALC
    TALI --> PG
    TALI --> AR
    TALI --> NFT
    GS --> PG
    GS --> CL
    ALC --> Mantle
    BYREAL --> DEX
```

---

## Two-tier wallet model

```mermaid
graph LR
    subgraph Tier1[Tier 1 · Watched · Read-only]
        MM[MetaMask · Mantle]
        PH[Phantom · Solana]
    end

    subgraph Tier2[Tier 2 · Active · Signing]
        PV[Privy embedded wallet<br/>Mantle · split-key non-custodial]
        BYR[byreal-cli keypair<br/>Solana · ~/.config/byreal/keys/]
    end

    Tier1 -.->|visibility only| DASH[tali-cli / dashboard]
    PV -->|user signs each tx<br/>via passkey/OAuth| DASH
    PV -->|pre-authorizes rule scope| AR[AutonomousRule.sol]
    AR -->|agent invokes executeRule| DASH
    BYR -->|signs Solana txs locally| DEX[Byreal DEX]
```

**Reading the diagram:**
- **Tier 1** wallets are visible to Tali but Tali has no signing authority.
- **Privy** wallet handles Mantle — user signs manually or pre-authorizes a rule scope once.
- **byreal-cli keypair** handles Solana DeFi — local signing, never transmitted.

---

## Data flow: rule firing

```mermaid
flowchart LR
    subgraph Trigger
        E1[USDT transfer on Mantle]
    end

    subgraph Tali backend
        GS[Goldsky webhook]
        MATCH[Rule matcher]
        LOG[Ledger write]
    end

    subgraph Execution
        CL[Claude agent]
        BC[byreal-cli execute]
        AR[AutonomousRule.sol]
        NFT[ERC-8004 NFT]
    end

    E1 --> GS
    GS --> MATCH
    MATCH -->|rule fires| CL
    CL --> BC
    BC -->|DeFi tx on Solana| BC
    CL --> AR
    AR -->|attest on Mantle| NFT
    GS --> LOG
    AR --> LOG
```

---

## Component responsibilities

| Component | Owns | Never does |
|---|---|---|
| **Claude (agent brain)** | Reasoning, NL parsing, orchestrating skills | Sign transactions; store secrets |
| **tali-cli** | Net worth, ledger writes, rule management, Mantle interactions | DeFi execution |
| **byreal-cli** | DeFi execution on Byreal/Solana — yield, DCA, swaps, positions | Personal finance data |
| **Goldsky Mirror** | Real-time event delivery via webhooks, re-org handling | On-demand state reads |
| **Alchemy RPC** | Mantle balance reads, on-demand state | Event watching |
| **Privy** | Mantle wallet keys (split-key, non-custodial) | Make decisions autonomously |
| **AutonomousRule.sol** | Store rule configs on Mantle, emit attestations | Execute Solana DeFi |
| **ERC-8004 NFT** | Agent identity, action log, public reputation on Mantle | Hold funds |
| **Postgres** | Offchain event ledger, user state | Authoritative on-chain truth |

---

## See also

- [`workflow.md`](workflow.md) — sequence diagrams for each major flow
- [`objectives.md`](objectives.md) — 3-week roadmap and submission gate
- [`intents.md`](intents.md) — NL intent contract between user input and skill layer
