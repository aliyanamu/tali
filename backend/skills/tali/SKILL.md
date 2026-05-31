---
name: tali-cli
description: "Tali personal finance layer for crypto-active Southeast Asians. Unified IDR net worth across Mantle wallets + offchain accounts, P2P trade reconciliation, autonomous rule management. Use when user mentions net worth, IDR balance, P2P trade, bank reconciliation, USDT P2P, BCA, GoPay, or autonomous financial rules."
metadata:
  openclaw:
    homepage: https://github.com/your-org/tali
    requires:
      bins:
        - tali-cli
        - byreal-cli
      config:
        - ~/.config/tali/
    install:
      - kind: node
        package: "@tali/backend"
        global: true
---

# Tali — Personal Finance Layer

## Get Full Documentation

```bash
tali-cli skill
tali-cli --help
```

## Installation

```bash
# Check if installed
which tali-cli && tali-cli --version

# Install
npm install -g @tali/backend
```

## Required peer: byreal-cli

Tali handles personal finance. Byreal handles DeFi execution.
Always check if byreal-cli is installed for DeFi actions:

```bash
which byreal-cli && byreal-cli --version
# If missing: npm install -g @byreal-io/byreal-cli
```

## Commands

| Command | Description |
|---|---|
| `networth` | Show total IDR net worth across watched wallets |
| `log` | Log a P2P trade or manual transaction in natural language |
| `rules list` | List active autonomous rules |
| `rules add <rule>` | Add a rule in natural language |
| `rules remove <id>` | Remove a rule by ID |
| `wallet watch <address>` | Add a wallet to watch (read-only) |
| `wallet unwatch <address>` | Stop watching a wallet address |
| `wallet list` | List all watched wallets |
| `skill` | Print full skill documentation |

## Key Workflows

### Check net worth
```bash
tali-cli networth --wallet <mantle-address>
tali-cli networth --wallet <address> -o json
```

### Log a P2P trade
```bash
tali-cli log "sold 50 USDT got 820000 IDR via Binance P2P"
tali-cli log "received 1000000 IDR for 60 USDT from BCA transfer"
```

### Set up an autonomous rule
```bash
tali-cli rules add "when MNT balance > 500, farm yield on Byreal"
tali-cli rules list
```

### Watch a wallet
```bash
tali-cli wallet watch 0xABC... --label "MetaMask main"
tali-cli wallet list
tali-cli wallet list -o json
tali-cli wallet unwatch 0xABC...
```

## Hard Constraints

1. **Never sign transactions directly** — DeFi execution goes through `byreal-cli`. Tali reads and logs; Byreal executes.
2. **Never display private keys** — Tali never stores or transmits keys.
3. **Watched wallets are read-only** — no signing authority on Tier 1 wallets.
4. **P2P log entries require user confirmation** before linking to onchain events.
5. **IDR amounts are estimates** — CoinGecko prices; not financial advice.

## Architecture Context

- **Tali's role:** personal finance data layer — unified ledger, IDR net worth, P2P reconciliation, bank import
- **Byreal's role:** DeFi execution — yield farming, DCA, swaps on Byreal/Solana
- **Chain:** Mantle (ERC-8004 NFT, on-chain attestation), Solana (DeFi via byreal-cli)
- **Event delivery:** Alchemy Webhooks push onchain Transfer events to Tali's backend
- **Agent identity:** ERC-8004 NFT on Mantle records every agent action for on-chain reputation

## Environment Variables Required

```
MANTLE_ALCHEMY_RPC=https://rpc.mantle.xyz          # or https://rpc.sepolia.mantle.xyz for testnet
SOLANA_HELIUS_RPC=https://mainnet.helius-rpc.com/?api-key=<key>
LLM_PROVIDER=anthropic                              # anthropic | openai | google
LLM_API_KEY=<key>
LLM_MODEL=claude-haiku-4-5-20251001
DATABASE_URL=postgresql://...
COINGECKO_API_KEY=                                  # optional — free tier works without a key
```
