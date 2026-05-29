# Workflow

How users interact with Tali, end-to-end. Claude is the agent brain; `tali-cli` and `byreal-cli` are the skills.

---

## 1. Onboarding (first 10 min)

```mermaid
sequenceDiagram
    actor U as User (Mufidah)
    participant CL as Claude agent
    participant TC as tali-cli
    participant BC as byreal-cli
    participant PV as Privy
    participant MNT as Mantle RPC

    U->>CL: "set me up"
    CL->>BC: byreal-cli setup
    BC-->>U: Solana wallet created at ~/.config/byreal/keys/
    CL->>PV: createEmbeddedWallet(user)
    PV-->>CL: Mantle wallet 0xDEF (split-key, non-custodial)
    CL->>TC: tali-cli wallet watch 0xDEF --label "Tali wallet"
    TC->>MNT: verify address
    CL->>U: "Ready. Mantle wallet: 0xDEF. Solana wallet configured."
```

---

## 2. Checking net worth

```mermaid
sequenceDiagram
    actor U as User
    participant CL as Claude agent
    participant TC as tali-cli
    participant ALC as Alchemy (Mantle)
    participant CG as CoinGecko

    U->>CL: "what's my net worth"
    CL->>TC: tali-cli networth --wallet 0xDEF
    TC->>ALC: getBalance + ERC-20 balances
    TC->>CG: prices in IDR
    TC-->>CL: {totalIdr: 87_000_000, tokens: [...]}
    CL->>U: "Total: Rp 87.000.000\n MNT: 245 (Rp 52M)\n USDT: 2.000 (Rp 35M)"
```

---

## 3. Setting up an autonomous rule (the agent demo)

```mermaid
sequenceDiagram
    actor U as User
    participant CL as Claude agent
    participant TC as tali-cli
    participant PV as Privy
    participant AR as AutonomousRule.sol
    participant NFT as ERC-8004 NFT

    U->>CL: "whenever USDT comes in, farm 10% yield on Byreal"
    CL->>CL: parse → {trigger: inflow_USDT, action: byreal_farm, ratio: 0.10}
    CL->>U: "Confirm: when USDT arrives, put 10% into Byreal yield. OK?"
    U->>CL: yes
    CL->>TC: tali-cli rules add ...
    TC->>PV: requestSignature(setRule)
    PV-->>U: auth prompt
    U->>PV: authenticate
    PV->>AR: setRule(user, params)
    AR-->>TC: rule stored on Mantle
    TC->>NFT: mintAgent(user) [first rule only]
    NFT-->>TC: tokenId = 1
    CL->>U: "Rule active. Agent identity #1 minted on Mantle."
```

---

## 4. Rule firing autonomously (the demo moment)

```mermaid
sequenceDiagram
    participant W as Wallet 0xDEF
    participant GS as Goldsky Mirror
    participant TC as tali-cli backend
    participant CL as Claude agent
    participant BC as byreal-cli
    participant AR as AutonomousRule.sol
    participant NFT as ERC-8004 NFT
    actor U as User

    Note over W: USDT transfer received
    W->>GS: Transfer event emitted on Mantle
    GS->>TC: POST /webhooks/goldsky {500 USDT → 0xDEF}
    TC->>TC: HMAC verify ✓ · rule match ✓ · compute 10% = 50 USDT
    TC->>CL: trigger rule execution
    CL->>BC: byreal-cli positions open --pool <USDT/USDY> --amount 50
    BC-->>CL: position opened on Byreal
    CL->>AR: executeRule(50 USDT, Byreal farm)
    AR-->>TC: ExecutionEvent on Mantle
    TC->>NFT: emitAgentAction(tokenId=1, "byreal_farm", context)
    TC->>U: "✅ 50 USDT auto-farmed on Byreal. Rule fired."
```

**This is the 30-second screen-worthy moment.** Onchain event → agent reasons → DeFi executes → Mantle attests. Zero user interaction.

---

## 5. DeFi directly via byreal-cli

```mermaid
sequenceDiagram
    actor U as User
    participant CL as Claude agent
    participant BC as byreal-cli
    participant BY as Byreal DEX (Solana)

    U->>CL: "copy the top farmer on SOL/USDC"
    CL->>BC: byreal-cli positions top-positions --pool <SOL/USDC>
    BC-->>CL: top position details
    CL->>U: "Top farmer: 142% APR, range 140–180. Copy with $100?"
    U->>CL: yes
    CL->>BC: byreal-cli positions copy --position <addr> --amount-usd 100 --confirm
    BC->>BY: transaction signed + submitted
    BY-->>BC: position NFT minted
    BC-->>CL: position opened
    CL->>U: "Copied. Position open at 142% APR."
```

---

## How the flows connect

```mermaid
graph TD
    A[Onboarding] -->|once| B[Rule setup]
    B -->|every trigger event| C[Rule fires autonomously]
    A -->|anytime| D[Net worth check]
    A -->|anytime| E[Direct DeFi via byreal-cli]
    C --> F[(Unified ledger + Mantle attestation)]
    D --> F
    E --> F
```
