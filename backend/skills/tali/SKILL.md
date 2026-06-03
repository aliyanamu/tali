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

| Command | Description | Status |
|---|---|---|
| `networth` | Show total IDR net worth across watched wallets | ✓ Live |
| `history` | Show recent onchain transfers for watched wallets | ✓ Live |
| `wallet watch <address>` | Add a wallet to watch (read-only) | ✓ Live |
| `wallet unwatch <address>` | Stop watching a wallet address | ✓ Live |
| `wallet list` | List all watched wallets | ✓ Live |
| `log` | Log a P2P trade or manual transaction | ⏳ Week 2 |
| `rules list` | List active autonomous rules | ✓ Live |
| `rules add <rule>` | Add a rule in natural language | ✓ Live |
| `rules remove <id>` | Remove a rule by ID | ✓ Live |
| `skill` | Print full skill documentation | ✓ Live |

## What Tali Records Automatically

Tali's backend ingests onchain Transfer events in real time via **Goldsky Mirror** (production) and an optional **Mantle Sepolia RPC poller** (local dev). Every ERC-20 and native MNT transfer touching a watched wallet is recorded automatically — no manual logging needed for onchain activity. Use `tali-cli history` to query this data.

## Key Workflows

### Check net worth
```bash
tali-cli networth --wallet <mantle-address>
tali-cli networth --wallet <address> -o json
```

### View recent transfers
```bash
tali-cli history
tali-cli history --wallet <address>
tali-cli history --wallet <address> --chain-id 5000 --limit 50
tali-cli history -o json
```

### Watch a wallet
```bash
tali-cli wallet watch 0xABC... --label "MetaMask main"
tali-cli wallet list
tali-cli wallet list -o json
tali-cli wallet unwatch 0xABC... --chain-id 5000
```

### Log a P2P trade (week 2)
```bash
tali-cli log "sold 50 USDT got 820000 IDR via Binance P2P"
```

### Set up an autonomous rule (week 2)
```bash
tali-cli rules add "when MNT balance > 500, farm yield on Byreal"
tali-cli rules list
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
- **Event delivery:** Goldsky Mirror webhook pushes onchain Transfer events to Tali's backend in real time
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
