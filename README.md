# Tali

An autonomous financial agent for Southeast Asian users who live across two financial systems: Indonesian bank accounts and onchain crypto wallets.

Built for the **Mantle Turing Test Hackathon 2026** (Phase 2 "AI Awakening"). Deadline: 2026-06-15.

## What it does

Two OpenClaw skills that Claude orchestrates together:

- **`tali-cli`** — personal finance layer: unified IDR net worth across Mantle wallets
- **`byreal-cli`** — DeFi execution on Byreal/Solana: yield farming, DCA, swaps, positions

## Quick start

```bash
# Install tali-cli
npm install -g @tali/backend

# Install byreal-cli (DeFi execution)
npm install -g @byreal-io/byreal-cli
byreal-cli setup   # configure Solana wallet

# Install both as OpenClaw skills
npx skills add byreal-git/byreal-agent-skills
# tali skill: install from this repo

# Check net worth
tali-cli networth --wallet 0xYourMantleAddress

# DeFi via byreal-cli
byreal-cli pools list --sort-field apr24h
byreal-cli swap execute --input-mint <MINT> --output-mint <MINT> --amount 1 --dry-run
```

## Running the webhook server

```bash
pnpm install
cp backend/.env.example backend/.env   # fill in API keys
pnpm db:migrate
pnpm dev:backend                        # starts Goldsky webhook server on :3000
```

## Required env vars

See `backend/.env.example`:
- `PRIVY_APP_ID` / `PRIVY_APP_SECRET`
- `ALCHEMY_API_KEY` / `ALCHEMY_MANTLE_RPC`
- `GOLDSKY_WEBHOOK_SECRET`
- `ANTHROPIC_API_KEY`
- `COINGECKO_API_KEY`
- `DATABASE_URL`

## Stack

- `tali-cli` — TypeScript, Commander, viem, Drizzle ORM
- `byreal-cli` — `@byreal-io/byreal-cli`, Solana, Byreal CLMM DEX
- Goldsky Mirror — push-based real-time onchain event delivery
- Alchemy — Mantle RPC
- Privy — non-custodial Mantle wallet
- Anthropic Claude — agent brain
- Postgres — unified event ledger
- Hono — webhook server

## License

MIT (open-source per hackathon requirements)
