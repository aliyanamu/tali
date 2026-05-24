# Workflow

How users interact with Tali, end-to-end, with sequence diagrams for each major flow.

---

## 1. User onboarding (first 5 min)

```mermaid
sequenceDiagram
    actor U as User (Mufidah)
    participant TG as Telegram bot
    participant SK as TaliSkill
    participant PV as Privy
    participant M as Mantle

    U->>TG: /start
    TG->>U: "Welcome — pick a language"
    U->>TG: English / Bahasa
    TG->>SK: createUser(lang)
    SK->>PV: requestEmbeddedWallet(user)
    PV-->>U: Auth prompt (passkey / Google)
    U->>PV: Authenticate
    PV-->>SK: Wallet 0xDEF (Mantle-ready)
    SK->>U: "Your Tali wallet: 0xDEF..."
    U->>TG: Optional — paste MetaMask address to watch
    SK->>SK: Add 0xABC to Tier 1 watched
    SK->>M: (not yet — no contract calls during onboarding)
    SK->>U: "All set. Fund your wallet and we'll start watching."
```

**What's NOT happening here:**
- No ERC-8004 NFT minted yet (that happens at first rule activation)
- No `AutonomousRule.sol` deployed per user (it's a singleton on Mantle)
- No funds moved anywhere

**User feels:** *"That was easier than I expected. I have a wallet without a seed phrase."*

---

## 2. Setting up a rule (one-time, ~30 sec)

```mermaid
sequenceDiagram
    actor U as User
    participant TG as Telegram
    participant SK as TaliSkill
    participant PV as Privy
    participant AR as AutonomousRule.sol
    participant NFT as ERC-8004 NFT

    U->>TG: "set rule: every USDT in, save 10% to USDY"
    TG->>SK: parseIntent(message)
    SK->>SK: NL → {trigger: incoming_USDT, action: swap_USDY, ratio: 0.10}
    SK->>U: "Confirm: when USDT arrives, swap 10% to USDY. OK?"
    U->>TG: Yes
    SK->>PV: requestSignature(setRule + approve)
    PV-->>U: Auth prompt
    U->>PV: Authenticate
    PV->>AR: setRule(user, rule_id, params)
    PV->>AR: approve(rule contract, max_per_day)
    AR-->>SK: Rule stored, scope authorized
    SK->>NFT: mintAgent(user) [first rule only]
    NFT-->>SK: tokenId = 1
    SK->>U: "Rule active. Agent identity #1 minted."
```

**Why one signature covers many future actions:** Option B (pre-authorized rule contract). The single `approve` call gives `AutonomousRule.sol` bounded authority to pull USDT from the user's wallet up to a daily limit. The agent invokes `executeRule()` thereafter without fresh user auth.

**User feels:** *"I told it once. Now it watches my back."*

---

## 3. Rule firing autonomously (the demo moment)

This is the 30-second screen-worthy moment for the hackathon live stream.

```mermaid
sequenceDiagram
    actor C as Client
    participant W as User wallet 0xDEF
    participant GS as Goldsky
    participant SK as TaliSkill
    participant PV as Privy
    participant AR as AutonomousRule.sol
    participant AG as Agni DEX
    participant NFT as ERC-8004 NFT
    actor U as User

    C->>W: Send 500 USDT (payment)
    Note over W: Transfer event emitted
    W->>GS: (chain) event indexed
    GS->>SK: POST /webhooks/goldsky<br/>{transfer: 500 USDT to 0xDEF}
    SK->>SK: HMAC verify ✓<br/>Idempotency check ✓<br/>Match active rules ✓
    SK->>SK: Compute: 10% of 500 = 50 USDT
    SK->>PV: requestSignature(executeRule)
    PV->>AR: executeRule(50, USDT)
    AR->>W: transferFrom(0xDEF, AR, 50 USDT)
    AR->>AG: swap(50 USDT → USDY)
    AG-->>AR: ~49.85 USDY
    AR->>AR: Hold USDY in vault
    AR-->>SK: ExecutionEvent emitted
    SK->>NFT: emitAgentAction(tokenId, "swap_to_USDY", context)
    SK->>U: Telegram: "✅ 50 USDT auto-saved as USDY. Vault: 1,247 USDY"
    SK->>SK: Update offchain ledger (tag inflow, link outflow)
```

**RealClaw/TaliSkill is involved at every step except the chain mechanics.** That's where the agent earns its "agent autonomy" scoring.

**User feels:** *"It just happened. I didn't lift a finger. And there's a verifiable record of what my agent did."*

---

## 4. Logging a P2P trade (manual, real-time)

The killer reconciliation moment: USDT outflow + IDR inflow linked as one event.

```mermaid
sequenceDiagram
    actor U as User
    participant TG as Telegram
    participant SK as TaliSkill
    participant GS as Goldsky
    participant DB as Postgres

    U->>TG: "sold 2000 USDT to p2p, got 35.38M IDR in BCA"
    TG->>SK: parseIntent(message)
    SK->>SK: NL → {onchain_side: -2000 USDT, offchain_side: +35.38M IDR, link: "p2p_sale"}

    Note over SK,GS: Tali had previously seen the<br/>2000 USDT outflow via Goldsky webhook<br/>and stored it as unlabeled
    SK->>DB: Lookup recent unlabeled USDT outflow ~2000
    DB-->>SK: tx 0x123 (2 hours ago)
    SK->>DB: Link tx 0x123 + new IDR inflow as one event
    SK->>U: "Linked. Your BCA deposit is now tagged 'P2P sale, 2000 USDT @ 17,690 IDR/USDT'"
    SK->>DB: Update unified ledger
```

**Why this matters:** that BCA deposit goes from "mystery transfer from random name" to "P2P sale, 2000 USDT at known rate" — automatically. Tax recon, mental clarity, and trust-with-family all benefit.

**User feels:** *"Finally. I don't have to remember what that 35M deposit was for."*

---

## 5. Monthly bank-record import (catch-up flow)

For everything you didn't log in real time, drop a CSV or screenshot once a month.

```mermaid
sequenceDiagram
    actor U as User
    participant TG as Telegram
    participant SK as TaliSkill
    participant CL as Claude vision API
    participant DB as Postgres

    U->>TG: [uploads BCA statement screenshot.jpg]
    TG->>SK: receive document
    SK->>CL: extract_transactions(image)
    CL-->>SK: [{date, amount, note}, ...]
    SK->>SK: For each entry, try to auto-link with onchain events
    SK->>DB: Bulk insert entries; mark some as linked, some as orphan
    SK->>U: "Imported 23 transactions. 18 auto-linked. 5 need your review:<br/>1. 1.2M IDR on May 15 — what was this?"
    U->>TG: "That was a friend paying me back"
    SK->>DB: Tag entry, learn pattern
```

**Complement to live logging:** real-time NL log captures intent at the moment; monthly import catches up the noise. Neither replaces the other — they merge in the same ledger.

---

## 6. Daily check (calm dashboard)

```mermaid
sequenceDiagram
    actor U as User
    participant W as Web dashboard
    participant PV as Privy
    participant SK as TaliSkill
    participant ALC as Alchemy
    participant DB as Postgres

    U->>W: Open tali.app
    W->>PV: Auth check
    PV-->>W: Session for user
    W->>SK: GET /api/networth
    SK->>ALC: getBalance(0xDEF), getUSDY(AR), etc.
    SK->>DB: SELECT recent events, offchain log
    SK->>W: {netWorth: 87M IDR, breakdown: [...], recentActivity: [...]}
    W->>U: Render calm dashboard (one screen, all money)
```

**User feels:** *"I know exactly where I stand. No anxiety, no five tabs open."*

---

## How the flows connect

```mermaid
graph TD
    A[Onboarding] -->|once| B[Setting up a rule]
    B -->|every time relevant event fires| C[Rule firing autonomously]
    A -->|whenever a real-world trade happens| D[Logging a P2P trade]
    A -->|monthly| E[Bank record import]
    A -->|daily / weekly| F[Daily check]
    C --> G[(Unified ledger)]
    D --> G
    E --> G
    G --> F
```

Each flow writes to the same unified ledger. The dashboard is the read surface. The agent acts on triggers across all of them.
