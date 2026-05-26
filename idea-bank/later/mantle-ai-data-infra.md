# Cheap, AI-aware data infrastructure for Mantle

- **Logged:** 2026-05-24
- **Category:** later (project-level pivot — reviewed well after 2026-06-15)
- **Status:** parked — not pursued

> Project-level pivot idea, not a Tali feature. Lands here so it doesn't trigger a re-lock discussion during the build (strict rule #1).

## One-liner

An affordable open-source indexing + monitoring layer for Mantle, with an AI query/anomaly surface on top. Thesis: *"decentralization can't spread if infrastructure isn't affordable."*

## Why it's interesting

- Real builder pain (Alchemy + CoinGecko subscriptions add up quickly)
- Maps to **Alpha & Data Path A** track for any future hackathon (Mirana Ventures sponsored)
- Mission-aligned with Kraken's "spread decentralization" thesis — could be a strong portfolio artifact for the user's career goal
- Mantle ecosystem genuinely lacks a first-party affordable indexer; market gap is real
- Existing competitors (Goldsky, Subsquid, The Graph) are general-purpose; a Mantle-specific, AI-augmented layer could differentiate

## Why parked, not pursued

- Would have been the 3rd pivot in ~30 hours (TKI → Tali → infra). Execution cost compounding.
- User's gut-check answer: *"No — I'd build Tali if it were just for the hackathon."* The pivot was career-instrumental ("Kraken might like it"), not mission-genuine.
- Kraken hiring signal was unverified — the pivot was being driven by speculation about what Kraken values, not researched preference.
- B2D infrastructure is harder to demo in 2 minutes; Alpha & Data is more crowded with funded competitors than Agentic Economy.
- Tali's "indexer-first cheap monitoring" architecture (Goldsky Mirror + WebSocket fan-out) already captures the engineering essence of the infra idea — it lives as Tali's backbone, just unbranded.

## What needs to happen before reviving this

- Spend 30 min reading Kraken's engineering blog + recent job postings to confirm what they actually value in candidates
- Validate the pain with 2-3 Mantle developers (do they actually feel API costs as a top-3 problem?)
- Sharpen the AI angle — what makes ours different from Goldsky? Natural-language queries? Auto-derived schemas? Anomaly agents?
- Decide if it's a hackathon project or a longer-arc portfolio project (the latter probably fits Kraken better anyway)

## Working name candidates for if/when revived

- MantleStream
- ChainTap
- Watu (Bahasa: *stone/rock/foundation*)
- Akar (Bahasa: *root*)
- Lentera (Bahasa: *lantern/lamp* — casting light on chain data)

## Related artifacts

- Research summary on Alchemy webhook + Mantle costs (currently in chat history; can be re-run if needed)
- Tali's locked-spec "Cost-aware infrastructure stack" section — these stack decisions inform the future project
