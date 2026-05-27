# Tokenized Stock Watching (Future Vision)

**Added:** 2026-05-27

## The idea

Users who want exposure to international stocks (e.g. NVDA, AAPL) can buy tokenized versions on-chain instead of going through a traditional brokerage. Tali's agent watches their wallet and surfaces these positions automatically — no brokerage account, no separate app, no scraping.

**Why on-chain watching is better than stock platform integration:**
- Blockchain data is public and push-able via Goldsky Mirror — no scraping or paid data feeds needed
- No brokerage API OAuth, no per-provider integration maintenance
- Works for any tokenized equity on any supported chain
- The agent can alert on price moves, auto-rebalance, or trigger rules — same pattern as DeFi positions

## User story

> "I want NVDA exposure but I don't want to sign up for a stock brokerage. I buy tokenized NVDA on-chain, add my wallet to Tali, and it shows up in my net worth next to my MNT and ETH — automatically."

## Why this is compelling for Indonesia

- IDX (Indonesian stock exchange) has friction: KYC, local broker accounts, rupiah on/off ramp
- International stocks have even more friction (IBKR, etc.)
- Tokenized equities remove the account-opening step entirely
- Tali gives the monitoring layer for free, as a side effect of wallet watching

## What to research before building

- Which tokenized equity issuers are live on Mantle or Solana (e.g. Backed Finance xStocks, Ondo OUSG)
- Whether Goldsky Mirror can index those token contracts
- Legal/regulatory framing for Indonesian users (display only, not advice)

## Submission mention

Frame in submission as: "Tali's wallet-watching infrastructure is chain-agnostic — a future version surfaces tokenized stock positions alongside DeFi, giving users international equity exposure without a brokerage account."

## Timeline

`later` — not week 1/2/3. Mention as v2 vision in hackathon submission narrative.
