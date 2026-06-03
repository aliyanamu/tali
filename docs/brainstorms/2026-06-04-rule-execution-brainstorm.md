---
date: 2026-06-04
topic: rule-execution
---

# Rule Execution — Autonomous Loop

## What We're Building

Close the full autonomous loop: a Mantle Transfer event arrives → rule matcher checks it against active rules → byreal-cli executes the DeFi action on Solana → `attestExecution()` records proof on Mantle.

**The loop in one line:**
`ingestTransfer()` → `matchRules()` → `ByreaCliExecutor.execute()` → `contracts.attestExecution()`

---

## byreal-cli Command Mapping

No native `farm` or `dca` commands exist. The real mappings:

| Rule actionType | byreal-cli command |
|---|---|
| `FARM` | `positions open --pool <pool> --amount-usd <X> --confirm` (CLMM LP position for xStocks points or fee yield) |
| `SWAP` | `swap execute --input-mint <addr> --output-mint <addr> --amount <X> --confirm` |
| `DCA` | Not implemented (treat as SWAP for hackathon; real DCA requires scheduler) |

**FARM pool selection**: pick dynamically via `byreal-cli pools list --sort-field apr24h -o json` (category 2 = xStocks) or hardcode a known pool for the demo. Dynamic is better for the judge demo; hardcoded is safer.

**Amount calculation**: `executionAmountUsd = incomingAmountDecimal * (targetPct / 100)`. Use USD because byreal-cli `--amount-usd` handles the token split automatically.

---

## Key Problem: Rules Schema Has No Decoded Params

The `rules` table stores only `triggerHash` and `actionHash` (keccak256 — not reversible). To match an event against a rule, the matcher needs the original params. Three options:

### Option A: Add typed columns to `rules` table (Recommended)

Add six columns: `triggerTokenAddress`, `triggerDirection`, `triggerThresholdRaw`, `actionType`, `actionTargetPct`, `actionMaxSlippageBps`. Populate at `rules add` time (all values are already in scope from `ParsedRule`). Matching is a simple SQL `WHERE`.

**Pros:** Fast, type-safe, indexed. Clean SQL matcher: `WHERE active AND triggerTokenAddress = event.tokenAddress AND ...`
**Cons:** Requires one migration; existing rules (if any) need re-adding (acceptable — testnet only, few rules).

### Option B: JSONB `triggerParams` / `actionParams` columns

Store parsed rule as JSON blobs alongside hashes. Matching via JSONB operators.

**Pros:** No schema migration for future param changes.
**Cons:** Less type-safe; harder to query efficiently; no benefit over Option A for this scale.

### Option C: Re-parse from `nlText` on every match

Run LLM parse on `nlText` before each match attempt.

**Cons:** Expensive, non-deterministic, adds latency per event. Rejected.

---

## Where to Trigger Rule Matching

### Option A: Inline in poller after `ingestTransfer()` (Recommended)

The poller already has the transfer data in scope. After `ingestTransfer()` returns `true`, immediately call `matchAndExecuteRules(event)`. Sequential, simple, no extra polling loop.

```
for each log:
  matched = await ingestTransfer(params)
  if matched:
    await matchAndExecuteRules(params)
```

**Pros:** Single code path. Transfer data is in memory, no DB re-fetch needed for matching. Works for both poller and Goldsky webhook paths.
**Cons:** If rule execution is slow (byreal-cli takes up to 60s), it blocks the next poll cycle. Acceptable: poller interval is configurable, and rule execution is rare.

### Option B: Separate rule-watcher service

A background loop queries `onchainEvents` for new unprocessed events and runs the matcher.

**Cons:** Needs a processed cursor, extra DB reads, separate process. No benefit for hackathon scale.

---

## Execution Flow (Decided)

```
Event arrives (poller or webhook)
  → ingestTransfer() → writes to onchainEvents, returns true
  → matchAndExecuteRules(transferParams):
      1. Load active rules WHERE triggerTokenAddress = event.tokenAddress
         AND triggerDirection IN (matches event.direction)
         AND CAST(triggerThresholdRaw AS NUMERIC) <= event.amountDecimal
         AND (expiresAt IS NULL OR expiresAt > NOW())
      2. For each matched rule:
         a. Build ExecutionPlan (byreal-cli args, see table above)
         b. executor.execute(plan) — 60s timeout
         c. If success:
            - hashSolanaTx(txSignature) → solanaTxHash
            - attestExecution({ ruleId, executionHash, solanaTxHash })
         d. Log result (success or failure) — don't throw, don't block next event
```

**attestExecution inputs:**
- `ruleId` = `rule.contractRuleId` (bigint)
- `executionHash` = `keccak256(abi.encode(ruleId, event.txHash, amountRaw, blockTimestamp))`
- `solanaTxHash` = `hashSolanaTx(byreal-cli stdout tx signature)`

---

## FARM Pool Selection

Two approaches:

**A. Dynamic (preferred for demo):** Before `positions open`, call `byreal-cli pools list --category 2 --sort-field apr24h -o json`, take the first result's pool address. Adds one byreal-cli call per FARM execution.

**B. Hardcoded:** Store a single `BYREAL_DEFAULT_FARM_POOL` env var pointing to the best xStocks/USDC pool. Zero latency, zero API call. Update manually when needed.

For the hackathon demo, **hardcoded pool env var is safer** — dynamic pool selection adds a failure mode (empty pool list, API down). We can surface the pool address in logs so it's visible in the demo.

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Decoded params storage | Add typed columns to `rules` | Type-safe, indexed, simplest matcher |
| Rule matching trigger | Inline in poller/webhook after ingest | No extra service, data already in scope |
| FARM mapping | `positions open --amount-usd` | Matches byreal-cli capabilities + xStocks farming |
| FARM pool | Hardcoded env var | Safer for demo; avoids extra API call |
| DCA | Not implemented (treat as SWAP) | byreal-cli has no DCA; out of hackathon scope |
| Execution safety | Skip dry-run, go straight to `--confirm` | Autonomous rules imply user already approved intent |
| attest failure handling | Log + continue | Don't let Mantle tx failure block next events |

---

## Open Questions

None — all decisions resolved above.

---

## Next Steps

→ `/workflows:plan` to generate implementation steps for:
1. DB migration: add decoded param columns to `rules`
2. Update `rules add` to populate new columns
3. Implement `matchAndExecuteRules()` service
4. Wire into poller + Goldsky webhook handler
5. Implement `buildExecutionPlan()` for FARM/SWAP
6. Implement `attestExecution()` call after successful execution
