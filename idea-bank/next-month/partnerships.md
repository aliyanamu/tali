# Potential Partnerships

Date surfaced: 2026-05-31

Strategic partners that could accelerate Tali's data layer, distribution, and credibility.
Prioritised by effort-to-impact and ecosystem overlap.

---

## Tier 1 — Already in the Mantle Turing Hackathon ecosystem

These partners are confirmed sponsors or judges of the hackathon Tali is competing in.
Engaging them during the hackathon window has the highest leverage.

### Goldsky *(already integrated)*
Real-time blockchain data streaming via Mirror CDC pipelines.
Tali's Goldsky Mirror pipeline is live — this is the strongest existing partner story.
**Opportunity:** co-marketing ("built with Goldsky Mirror"), deeper integration with
Goldsky's subgraph query layer for on-demand history reads.

### Byreal *(already integrated)*
Co-sponsor of the hackathon, runs the `byreal-cli` DeFi execution layer Tali uses.
**Opportunity:** Tali is a showcase app for Byreal's agent SDK. Worth coordinating on
demo narrative and mutual mention in submissions.

### Nansen *(hackathon judge + analytics platform)*
On-chain analytics and wallet intelligence. Judges this hackathon.
**Opportunity:** Tali's networth and transfer history UX maps to what Nansen does for
power users, but for everyday SE Asian crypto users. Reference Nansen's UX patterns in
the demo to speak the judge's language. Longer term: Nansen data as a premium enrichment
layer (wallet labels, entity tagging).

### Allora Network *(hackathon judge + on-chain AI inference)*
Decentralised AI inference weights on-chain.
**Opportunity:** Tali's rule engine could consume Allora price-prediction weights as one
input signal. Mentioning this integration path in the submission increases judge engagement
from Allora's team.

### Tencent Cloud *(infrastructure sponsor)*
Infrastructure credits for finalists.
**Action:** Apply for Tencent Cloud credits post-submission if Tali advances.

### Mirana Ventures *(Mantle's investment arm, judge)*
Potential follow-on funding for strong submissions.
**Action:** Ensure the demo narrative speaks to product-market fit, not just tech.

---

## Tier 2 — Data layer (evaluate when building history display)

| Partner | What they offer | Why Tali |
|---|---|---|
| **GoldRush (Covalent)** | Single API call: all token balances + full tx history, block 0 to now. Mantle mainnet confirmed. GoldRush x402 adds per-request micropayment for agent use. | Leading candidate for free-tier history display once that feature is built. Simpler than raw viem calls. |
| **Moralis** | Wallet history API, cross-chain, decoded events. Streams webhooks similar to Alchemy Notify. | Backup if GoldRush Mantle data is incomplete. Overlaps Goldsky for streaming — probably redundant. |
| **The Graph** | Decentralised subgraph indexing, GraphQL. | Fallback indexer if Goldsky gaps appear. Higher ops overhead than hosted APIs. |
| **Envio / Subsquid** | Lightweight self-hosted indexers, cheaper than Alchemy at scale. | Relevant only if Tali outgrows hosted API tiers. Not needed for hackathon or early product. |

---

## Tier 3 — AI / agent infrastructure

### Phala Network
Trusted Execution Environment (TEE) confidential compute for AI agents.
Tali handles real financial data — running agent logic inside a Phala enclave gives users
verifiable proof that Tali isn't leaking wallet data or transaction history.
**Pitch differentiator:** "Your financial AI agent, provably private." Strong narrative for
SE Asian users wary of data leakage.
**Effort:** Medium — wrapping the Claude calls in a Phala worker. Worth evaluating post-hackathon.

### Ritual
On-chain AI coprocessor — verifiable model inference proofs on EVM.
Relevant if Tali adds on-chain rule execution with provable AI decisions.
Not needed for current scope.

---

## Tier 4 — Distribution / ecosystem

| Partner | What they offer | When relevant |
|---|---|---|
| **Encode Club** | Accelerator batches, VC intros, technical workshops. | Post-hackathon if pursuing a seed round. |
| **ETHGlobal** | Prize bounties, alumni network, follow-on hackathons. | Not running this hackathon, but good for future exposure and builder network. |
| **Espresso Systems** | Decentralised sequencing and confirmation layer. | Only relevant if Tali builds on a chain using Espresso for fast finality. Not current scope. |
| **DoraHacks** | Submission platform, BUIDLer profile, quadratic funding. | Ensure Tali's DoraHacks profile is complete — judges reference it during scoring. |

---

## Priority actions

1. **Now**: make sure DoraHacks profile is complete before the submission deadline.
2. **During demo**: reference Goldsky Mirror, Byreal, and Nansen by name — all are in the room.
3. **Post-hackathon**: evaluate GoldRush for history display feature.
4. **Post-hackathon**: explore Phala TEE wrapper as a privacy/trust differentiator if Tali pitches to privacy-conscious markets.
5. **Funding path**: Mirana Ventures (Mantle ecosystem fund) → Encode Club accelerator.
