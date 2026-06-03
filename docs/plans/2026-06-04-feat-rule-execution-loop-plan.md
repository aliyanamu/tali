---
title: "feat: Autonomous rule execution loop — Transfer → match → byreal-cli → attest"
type: feat
status: active
date: 2026-06-04
---

# Autonomous Rule Execution Loop

## Enhancement Summary

**Deepened on:** 2026-06-04  
**Research agents used:** architecture-strategist, security-sentinel, kieran-typescript-reviewer, data-integrity-guardian, performance-oracle, code-simplicity-reviewer, data-migration-expert, agent-native-reviewer, best-practices-researcher, framework-docs-researcher + all 4 solution learnings

### Critical Fixes Applied vs. Original Plan

| # | Fix | Severity |
|---|---|---|
| 1 | `executionHash` was circular (used Mantle tx hash that doesn't exist yet) → use `solanaTxHash` as input | Critical |
| 2 | `ingestTransfer()` returns `boolean` regardless of conflict → use `.returning()` to detect genuinely new inserts | Critical |
| 3 | No idempotency constraint on `rule_executions` → add unique index on `(ruleId, triggerTxHash)` | Critical |
| 4 | `ctx.tokenAddress ?? ''` in query breaks native MNT matching → branch query on native vs ERC-20 | Critical |
| 5 | `process.env` spread passes `AGENT_PRIVATE_KEY` to byreal-cli subprocess → explicit env allowlist | High |
| 6 | No byreal-cli subcommand allowlist → add `ALLOWED_SUBCOMMANDS` set | High |
| 7 | `returning()` after insert can return `undefined` — guard added | High |
| 8 | AlreadyExecuted revert string is `"already attested"` not `"AlreadyExecuted"` | Medium |
| 9 | Intermediate `status='executed'` missing — byreal-cli success must be recorded before attest | Medium |
| 10 | Missing CHECK constraints on `triggerDirection`, `actionType`, `actionTargetPct`, `actionMaxSlippageBps` | Medium |
| 11 | `extractSolanaTxSig` fallback silently truncated stdout — returns `null` on failure instead | Medium |
| 12 | No `waitForTransactionReceipt` timeout → viem hangs indefinitely on RPC degradation | Medium |
| 13 | Goldsky webhook must return 200 immediately, not after `matchAndExecuteRules` | Medium |

### Key Simplifications Applied

- Dropped `solanaTxHash` column (derivable from `solanaTxSig` in one line)
- Dropped `mantleExecutionHash` column (canonical record is on Mantle; `mantleAttestTxHash` is sufficient)
- Dropped `'triggered'` status value (never written — dead code)
- Dropped `ExecutionGateway` interface and `createExecutor()` wrapper (premature abstraction, one instantiation site)

### New Additions

- `tali-cli rules executions` command — makes the autonomous loop observable (required for demo)
- Attestation nonce-collision protection — serialize `attestExecution` calls via promise queue
- Partial matcher index `WHERE active = true AND triggerTokenAddress IS NOT NULL`
- `updatedAt` column on `rule_executions`
- Migration Option B (clean regenerate) to avoid Drizzle snapshot drift

---

## Overview

Close the full autonomous loop: a Mantle Transfer event is ingested → a rule matcher checks it against active rules stored in Postgres → byreal-cli executes the DeFi action on Solana → `attestExecution()` records proof on-chain → a `rule_executions` row captures the audit trail.

This is the core week-3 deliverable. Everything else (contracts, poller, ingestion) was built to reach this moment.

```
Mantle Transfer (testnet poller OR Goldsky webhook)
  → ingestTransfer()          [existing — writes onchain_events, returns matched wallets]
  → matchAndExecuteRules()    [NEW — queries rules, fires if match]
      → buildExecutionPlan()  [NEW — maps rule.actionType → byreal-cli args]
      → ByreaCliExecutor      [existing — subprocess, 30s timeout]
      → attestExecution()     [existing in contracts.ts — writes to Mantle]
      → rule_executions row   [NEW — audit trail per execution]
```

---

## Key Decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Decoded rule params | Add 6 typed columns to `rules` table (not JSONB) |
| Rule matching trigger | Inline after `ingestTransfer()` — only when insert was genuinely new |
| FARM mapping | `positions copy --position <env-var PDA> --amount-usd <X>` |
| SWAP mapping | `swap execute --input-mint <env> --output-mint <env> --amount <X>` |
| DCA | Not implemented — log warning and skip |
| Execution mode | Straight to `--confirm` (no dry-run in autonomous path) |
| Amount calculation | `amountDecimalUsd * targetPct / 100` (stablecoins: price=1.0; others: CoinGecko) |
| attest failure | Log + continue — never block next event |

---

## Phase 1: DB Schema Changes

### 1a. Add decoded param columns to `rules` table

**File:** `backend/src/db/schema.ts`

Add 6 nullable columns after `actionHash`. Nullable for backward compat (existing rules have NULL; matcher skips them). Add `updatedAt` for tracking state transitions.

```typescript
// Add inside the rules pgTable column map:
triggerTokenAddress:  varchar('trigger_token_address', { length: 64 }),
triggerDirection:     varchar('trigger_direction', { length: 4 }),    // 'IN' | 'OUT' | 'BOTH'
triggerThresholdRaw:  varchar('trigger_threshold_raw', { length: 80 }),
actionType:           varchar('action_type', { length: 16 }),         // 'FARM' | 'SWAP' | 'DCA'
actionTargetPct:      integer('action_target_pct'),                   // 1–100
actionMaxSlippageBps: integer('action_max_slippage_bps'),             // 0–1000
```

Add CHECK constraints (match existing `onchain_events` pattern) and a **partial index** for the matcher:

```typescript
// Add inside rules indexes:
matcherIdx: index('rules_matcher_idx')
  .on(t.triggerTokenAddress, t.triggerDirection)
  .where(sql`${t.active} = true AND ${t.triggerTokenAddress} IS NOT NULL`),

// Add CHECK constraints inline on the columns:
triggerDirection: varchar('trigger_direction', { length: 4 })
  .$check(sql`trigger_direction IS NULL OR trigger_direction IN ('IN','OUT','BOTH')`),

actionType: varchar('action_type', { length: 16 })
  .$check(sql`action_type IS NULL OR action_type IN ('FARM','SWAP','DCA')`),

actionTargetPct: integer('action_target_pct')
  .$check(sql`action_target_pct IS NULL OR (action_target_pct >= 1 AND action_target_pct <= 100)`),

actionMaxSlippageBps: integer('action_max_slippage_bps')
  .$check(sql`action_max_slippage_bps IS NULL OR (action_max_slippage_bps >= 0 AND action_max_slippage_bps <= 1000)`),
```

> **Note on index:** Partial index is more efficient than `(active, triggerTokenAddress, triggerDirection)` — `active` as leading column has near-100% TRUE rows and kills selectivity. Partial index also removes the need for an `isNotNull` filter in the query.

> **Existing rules have NULL in all 6 columns.** The partial index excludes them. They will never fire until re-added via `tali-cli rules add`. This is intentional — backfilling from `nlText` via LLM risks hash mismatches with on-chain anchors.

### 1b. Add `rule_executions` table

New table — every execution attempt (success or failure) gets a row. Powers `tali-cli rules executions`.

```typescript
export const ruleExecutions = pgTable(
  'rule_executions',
  {
    id:                  uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    ruleId:              uuid('rule_id').notNull().references(() => rules.id, { onDelete: 'cascade' }),
    triggerTxHash:       varchar('trigger_tx_hash', { length: 66 }).notNull(),
    chainId:             integer('chain_id').notNull(),
    triggerAmountRaw:    varchar('trigger_amount_raw', { length: 80 }).notNull(),
    executionAmountUsd:  numeric('execution_amount_usd', { precision: 20, scale: 6 }),
    byreaCliCommand:     text('byreal_cli_command'),     // args array for audit
    byreaCliOutput:      text('byreal_cli_output'),
    solanaTxSig:         varchar('solana_tx_sig', { length: 128 }), // raw Solana base58 signature
    mantleAttestTxHash:  varchar('mantle_attest_tx_hash', { length: 66 }),
    // status: executing → executed (byreal ok) → attested (Mantle ok) | failed
    status:              varchar('status', { length: 16 }).notNull().default('executing'),
    errorMessage:        text('error_message'),
    createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:           timestamp('updated_at', { withTimezone: true })
                           .notNull().defaultNow().$onUpdate(() => new Date()),
    attestedAt:          timestamp('attested_at', { withTimezone: true }),
  },
  (t) => ({
    ruleIdIdx:        index('rule_executions_rule_id_idx').on(t.ruleId),
    // Idempotency: one execution attempt per (rule, trigger tx). Prevents double-execution
    // on Goldsky webhook retries or RPC poller restarts with overlapping lookback window.
    idempotencyIdx:   uniqueIndex('rule_executions_idempotency').on(t.ruleId, t.triggerTxHash),
    statusCheck:      check(
      'rule_executions_status_check',
      sql`${t.status} IN ('executing', 'executed', 'attested', 'failed')`,
    ),
  }),
);

export type RuleExecution    = typeof ruleExecutions.$inferSelect;
export type NewRuleExecution = typeof ruleExecutions.$inferInsert;
```

**Columns dropped vs. original plan:**
- `solanaTxHash` — derivable: `hashSolanaTx(solanaTxSig)` is one line; no need to persist
- `mantleExecutionHash` — canonical record is on Mantle; `mantleAttestTxHash` is sufficient to look up

**Status state machine** (4 states, not 5):
```
'executing'  →  byreal-cli running
'executed'   →  byreal-cli succeeded, awaiting Mantle attest
'attested'   →  attestExecution() confirmed on Mantle
'failed'     →  any step failed (see errorMessage)
```

### 1c. Migration approach — Option B (clean regenerate, recommended)

The project is missing `drizzle/meta/0001_snapshot.json` (only `0000_snapshot.json` exists). Running `db:generate` naively would diff against the wrong snapshot, likely generating a spurious `CREATE TABLE rules` in the new migration.

**Safe steps:**

```bash
# 1. Delete the hand-written migration (it will be regenerated clean)
rm backend/drizzle/0001_add_rules_table.sql

# 2. Update schema.ts: add the 6 nullable columns to rules + add ruleExecutions table
#    (do both in the same edit — one migration for everything)

# 3. Generate — Drizzle diffs from 0000_snapshot.json (all changes since init)
pnpm --filter @tali/backend db:generate
# Drizzle writes: backend/drizzle/0001_<random_name>.sql

# 4. Rename
mv backend/drizzle/0001_<random_name>.sql \
   backend/drizzle/0001_add_rules_and_executions.sql

# 5. Update _journal.json — change ONLY the idx:1 entry's "tag" field:
#   "tag": "0001_add_rules_and_executions"
#   Verify: tag must be the filename stem exactly (no .sql)
#   Do NOT touch the idx:0 entry
grep '"tag"' backend/drizzle/meta/_journal.json  # verify
ls backend/drizzle/0001*                          # verify filename matches

# 6. Reset + migrate + seed
pnpm --filter @tali/backend db:reset
pnpm --filter @tali/backend db:migrate
pnpm --filter @tali/backend db:seed

# 7. Verify
pnpm typecheck
```

**Post-migration verification queries:**

```sql
-- All 6 new columns exist on rules, all nullable
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name = 'rules'
  AND column_name IN ('trigger_token_address','trigger_direction','action_type');
-- Expect: 3 rows, is_nullable = YES

-- rule_executions table exists with idempotency index
SELECT indexname FROM pg_indexes WHERE tablename = 'rule_executions';
-- Expect: rule_executions_idempotency (unique), rule_executions_rule_id_idx
```

---

## Phase 2: Update `rules add` to populate decoded params

**File:** `backend/src/cli/commands/rules.ts`

All 6 decoded param values are already in scope at insert time. Add them to the `db.insert(schema.rules).values(...)` call (~line 208):

```typescript
await db.insert(schema.rules).values({
  userId:               seedUser.id,
  contractRuleId,
  agentId:              env.AGENT_ERC8004_ID,
  nlText,
  triggerHash,
  actionHash,
  contractAddress:      env.AUTONOMOUS_RULE_CONTRACT!,
  active:               true,
  // Decoded params — enables rule matching without recomputing hashes
  triggerTokenAddress:  tokenInfo.address,
  triggerDirection:     parsed.direction,
  triggerThresholdRaw:  parsed.thresholdRaw,
  actionType:           parsed.actionType,
  actionTargetPct:      parsed.targetPct,
  actionMaxSlippageBps: parsed.maxSlippageBps,
});
```

> **Deploy atomically with Phase 1.** The window between schema migration (Phase 1) and this code change is where new rules would be inserted with NULL decoded params. Deploy both in the same release.

---

## Phase 3: New env vars

**File:** `backend/src/lib/env.ts` — add to `EnvSchema`:

```typescript
BYREAL_DEFAULT_COPY_POSITION: z.string().optional(),   // Solana position PDA for FARM copy
BYREAL_SWAP_INPUT_MINT:       z.string().optional(),   // Solana mint for SWAP input
BYREAL_SWAP_OUTPUT_MINT:      z.string().optional(),   // Solana mint for SWAP output
```

**File:** `backend/.env.example`:

```bash
# Rule execution — byreal-cli targets
# FARM: position PDA to copy.
# Get it: byreal-cli positions top-positions --pool <POOL> --sort-field apr24h -o json
BYREAL_DEFAULT_COPY_POSITION=

# SWAP: Solana token mints (defaults below work for USDC→SOL)
BYREAL_SWAP_INPUT_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v   # USDC on Solana
BYREAL_SWAP_OUTPUT_MINT=So11111111111111111111111111111111111111112      # SOL
```

---

## Phase 4: Security fixes in existing executor

Before wiring rule execution, patch the executor.

### 4a. Scope byreal-cli child process environment

**File:** `backend/src/agent/executor.ts`

The current `...process.env` spread passes `AGENT_PRIVATE_KEY`, `DATABASE_URL`, `PRIVY_APP_SECRET` etc. to byreal-cli. Replace with an explicit allowlist:

```typescript
// Replace the childEnv block with:
const childEnv: NodeJS.ProcessEnv = {
  // Minimal OS context for byreal-cli to function
  HOME:  process.env['HOME'],
  PATH:  process.env['PATH'],
  USER:  process.env['USER'],
  LANG:  process.env['LANG'],
  TERM:  process.env['TERM'],
  // Solana RPC — byreal-cli needs this
  ...(env.SOLANA_HELIUS_RPC  && { SOLANA_RPC_URL: env.SOLANA_HELIUS_RPC }),
  ...(!env.SOLANA_HELIUS_RPC && env.SOLANA_ALCHEMY_RPC && { SOLANA_RPC_URL: env.SOLANA_ALCHEMY_RPC }),
  // byreal-cli key directory
  ...(env.BYREAL_KEYS_DIR && { BYREAL_KEYS_DIR: env.BYREAL_KEYS_DIR }),
  // Never pass: AGENT_PRIVATE_KEY, DATABASE_URL, PRIVY_APP_SECRET, LLM_API_KEY, etc.
};
```

### 4b. Add subcommand allowlist and reduce timeout

```typescript
// In ByreaCliExecutor.execute(), after the args[0] check:
const ALLOWED_SUBCOMMANDS = new Set(['positions', 'swap', 'pools', 'wallet', 'tokens']);
if (!ALLOWED_SUBCOMMANDS.has(args[0])) {
  return { success: false, output: `Rejected: subcommand '${args[0]}' is not allowed` };
}

// Change timeout from 60_000 to 30_000 (byreal-cli responds in < 10s normally):
const { stdout } = await execFileAsync(bin, args, {
  encoding: 'utf-8',
  timeout: 30_000,  // was 60_000
  maxBuffer: 2 * 1024 * 1024,  // 2 MB — byreal-cli JSON can be verbose
  env: childEnv,
});
```

### 4c. Add waitForTransactionReceipt timeout in contracts.ts

**File:** `backend/src/lib/contracts.ts`

Viem's `waitForTransactionReceipt` has no default timeout — it hangs indefinitely on RPC degradation. Add `timeout` to all three calls (setRule ~line 122, deactivateRule ~line 157, attestExecution ~line 176):

```typescript
await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
```

### 4d. Serialize attestExecution calls (nonce collision prevention)

**File:** `backend/src/lib/contracts.ts` — add at module level:

```typescript
// Serialize all attestExecution calls: concurrent calls from the same EOA key
// cause nonce collisions. A promise chain ensures at most one attest at a time.
let _attestQueue: Promise<void> = Promise.resolve();

// Wrap the existing attestExecution export:
const _attestExecutionInner = attestExecution; // rename the original
export async function attestExecution(params: { ... }): Promise<`0x${string}`> {
  let resolve!: () => void;
  const ticket = new Promise<void>(r => { resolve = r; });
  _attestQueue = _attestQueue.then(() => ticket);
  try {
    return await _attestExecutionInner(params);
  } finally {
    resolve();
  }
}
```

---

## Phase 5: Rule executor service

**New file:** `backend/src/services/ruleExecutor.ts`

### 5a. Constants

```typescript
// Stablecoin CoinGecko IDs — price is always $1.00, skip the API call
const STABLECOIN_COINGECKO_IDS = new Set(['tether', 'usd-coin', 'ondo-us-dollar-yield']);

// Minimum execution amount to avoid dust trades
const MIN_EXECUTION_USD = 1.0;

// Solana base58 signature shape for validation
const SOLANA_SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{87,88}$/;
```

### 5b. `TriggerContext` type

```typescript
export interface TriggerContext {
  chainId:        number;
  txHash:         string;       // Mantle tx hash
  fromAddress:    string;
  toAddress:      string;
  tokenAddress:   string | null; // null = native MNT
  amountRaw:      string;
  blockTimestamp: number;        // unix seconds (0 if unknown)
}
```

### 5c. `matchAndExecuteRules(ctx, matchedWallets?)`

Takes the matched wallets if already available (from `ingestTransfer` return value) to avoid a redundant DB round-trip. Falls back to querying if not provided.

```typescript
import { and, eq, or, isNotNull, isNull, gt } from 'drizzle-orm';

export async function matchAndExecuteRules(
  ctx: TriggerContext,
  matchedWallets?: Array<{ userId: string; address: string }>,
): Promise<void> {
  const wallets = matchedWallets ?? await db.select({
    userId: schema.watchedWallets.userId,
    address: schema.watchedWallets.address,
  }).from(schema.watchedWallets)
    .where(and(
      eq(schema.watchedWallets.chainId, ctx.chainId),
      or(
        eq(schema.watchedWallets.address, ctx.fromAddress),
        eq(schema.watchedWallets.address, ctx.toAddress),
      ),
    ));

  if (wallets.length === 0) return;

  for (const wallet of wallets) {
    const direction: 'IN' | 'OUT' =
      wallet.address === ctx.toAddress ? 'IN' : 'OUT';

    // Build token filter — branch on native vs ERC-20.
    // Native transfers (tokenAddress=null) only match rules with no token address stored.
    // Using ?? '' would silently fail native rules.
    const tokenFilter = ctx.tokenAddress
      ? and(
          isNotNull(schema.rules.triggerTokenAddress),
          eq(schema.rules.triggerTokenAddress, ctx.tokenAddress),
        )
      : isNull(schema.rules.triggerTokenAddress);

    const candidates = await db.select()
      .from(schema.rules)
      .where(and(
        eq(schema.rules.active, true),
        eq(schema.rules.userId, wallet.userId),
        tokenFilter,
        or(
          eq(schema.rules.triggerDirection, direction),
          eq(schema.rules.triggerDirection, 'BOTH'),
        ),
        or(
          isNull(schema.rules.expiresAt),
          gt(schema.rules.expiresAt, new Date()),
        ),
      ));

    for (const rule of candidates) {
      // Threshold check — BigInt raw uint256 comparison
      if (!ctx.amountRaw) continue;
      const threshold = BigInt(rule.triggerThresholdRaw ?? '0');
      if (BigInt(ctx.amountRaw) < threshold) continue;

      // Fire-and-forget — log ctx fields on failure for debuggability
      executeRule(rule, ctx, wallet.userId).catch((err: unknown) => {
        logger.error(
          { err, ruleId: rule.id, txHash: ctx.txHash, tokenAddress: ctx.tokenAddress,
            amountRaw: ctx.amountRaw },
          'executeRule: unhandled error',
        );
      });
    }
  }
}
```

### 5d. `executeRule(rule, ctx, userId)`

```typescript
async function executeRule(
  rule: Rule,
  ctx: TriggerContext,
  userId: string,
): Promise<void> {
  // 1. Compute execution USD amount
  const asset = ctx.tokenAddress
    ? await db.query.assets.findFirst({
        where: (a, { and: qAnd, eq: qEq }) =>
          qAnd(qEq(a.chainId, ctx.chainId), qEq(a.tokenAddress, ctx.tokenAddress)),
      })
    : await db.query.assets.findFirst({
        where: (a, { and: qAnd, eq: qEq, isNull: qIsNull }) =>
          qAnd(qEq(a.chainId, ctx.chainId), qIsNull(a.tokenAddress)),
      });

  const decimals  = asset?.decimals ?? 18;
  const amountDec = parseFloat(rawToDecimalString(ctx.amountRaw, decimals));
  let   tokenPrice = 1.0;

  if (asset?.coingeckoId && !STABLECOIN_COINGECKO_IDS.has(asset.coingeckoId)) {
    const prices = await getPrices([asset.coingeckoId], 'usd', env.COINGECKO_API_KEY);
    tokenPrice = prices[asset.coingeckoId] ?? 0;
    if (tokenPrice === 0) {
      logger.warn(
        { ruleId: rule.id, coingeckoId: asset.coingeckoId },
        'token price is 0 (CoinGecko unavailable) — skipping execution',
      );
      return;
    }
  }

  const executionAmountUsd = amountDec * tokenPrice * (rule.actionTargetPct ?? 100) / 100;

  if (executionAmountUsd < MIN_EXECUTION_USD) {
    logger.warn({ ruleId: rule.id, executionAmountUsd }, 'execution amount below minimum — skipping');
    return;
  }

  // 2. Build execution plan
  const args = buildExecutionArgs(rule, executionAmountUsd);
  if (!args) return;

  const plan: ExecutionPlan = {
    args,
    description: `Rule ${rule.contractRuleId}: ${rule.actionType} $${executionAmountUsd.toFixed(2)}`,
    ruleId:      rule.id,
    userId,
  };

  // 3. Insert execution row — onConflictDoNothing prevents double-execution
  //    (same rule + same trigger tx = idempotency violation)
  const inserted = await db.insert(schema.ruleExecutions).values({
    ruleId:            rule.id,
    triggerTxHash:     ctx.txHash,
    chainId:           ctx.chainId,
    triggerAmountRaw:  ctx.amountRaw,
    executionAmountUsd: executionAmountUsd.toFixed(6),
    byreaCliCommand:   args.join(' '),
    status:            'executing',
  }).onConflictDoNothing().returning({ id: schema.ruleExecutions.id });

  if (inserted.length === 0) {
    // Duplicate — this (ruleId, triggerTxHash) was already processed
    logger.info({ ruleId: rule.id, triggerTxHash: ctx.txHash }, 'duplicate execution blocked by idempotency');
    return;
  }

  const [execution] = inserted;
  if (!execution) return; // TypeScript narrowing

  // 4. Run byreal-cli
  const executor = new ByreaCliExecutor();
  const result   = await executor.execute(plan);

  if (!result.success) {
    await db.update(schema.ruleExecutions)
      .set({ status: 'failed', errorMessage: result.output })
      .where(eq(schema.ruleExecutions.id, execution.id));
    logger.error({ ruleId: rule.id, output: result.output }, 'byreal-cli execution failed');
    return;
  }

  // 5. Extract Solana tx signature — byreal-cli outputs JSON with -o json flag
  const solanaTxSig = extractSolanaTxSig(result.output);

  // Record byreal-cli success before attempting Mantle attestation.
  // If attest fails, the row stays 'executed' and can be retried independently.
  await db.update(schema.ruleExecutions)
    .set({
      byreaCliOutput: result.output,
      solanaTxSig:    solanaTxSig ?? undefined,
      status:         'executed',
    })
    .where(eq(schema.ruleExecutions.id, execution.id));

  // 6. Compute executionHash from inputs available BEFORE the attest call.
  //    Uses solanaTxHash (content-address of the Solana execution), NOT the Mantle tx hash
  //    (which doesn't exist yet). This avoids a circular definition.
  const solanaTxHash = hashSolanaTx(solanaTxSig ?? '');
  const executionHash = keccak256(encodeAbiParameters(
    parseAbiParameters('uint256, bytes32, uint256'),
    [
      rule.contractRuleId,
      solanaTxHash,                // bytes32 — keccak256 of Solana sig
      BigInt(ctx.amountRaw),       // uint256 — trigger amount
    ],
  ));

  // 7. Attest on Mantle (serialized via module-level queue to prevent nonce collisions)
  let mantleAttestTxHash: `0x${string}` | null = null;
  try {
    mantleAttestTxHash = await attestExecution({
      ruleId:        rule.contractRuleId,
      executionHash,
      solanaTxHash,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Contract revert string is "already attested" (not "AlreadyExecuted")
    if (msg.toLowerCase().includes('already attested')) {
      logger.info({ ruleId: rule.id }, 'attestExecution: already attested — idempotent no-op');
    } else {
      logger.error({ ruleId: rule.id, err: msg }, 'attestExecution failed');
    }
  }

  // 8. Final update
  await db.update(schema.ruleExecutions)
    .set({
      mantleAttestTxHash: mantleAttestTxHash ?? undefined,
      status:             mantleAttestTxHash ? 'attested' : 'executed',
      attestedAt:         mantleAttestTxHash ? new Date() : undefined,
    })
    .where(eq(schema.ruleExecutions.id, execution.id));

  logger.info(
    { ruleId: rule.id, solanaTxSig, mantleAttestTxHash, executionAmountUsd },
    'rule execution complete',
  );
}
```

### 5e. `buildExecutionArgs(rule, amountUsd): string[] | null`

```typescript
function buildExecutionArgs(rule: Rule, amountUsd: number): string[] | null {
  switch (rule.actionType) {
    case 'FARM': {
      if (!env.BYREAL_DEFAULT_COPY_POSITION) {
        logger.error({ ruleId: rule.id }, 'BYREAL_DEFAULT_COPY_POSITION not set — cannot execute FARM');
        return null;
      }
      return [
        'byreal-cli', 'positions', 'copy',
        '--position', env.BYREAL_DEFAULT_COPY_POSITION,
        '--amount-usd', amountUsd.toFixed(2),
        '--confirm', '-o', 'json',
      ];
    }

    case 'SWAP': {
      // Defaults: USDC → SOL. Amount in USDC (≈ USD for stablecoin input).
      const inputMint  = env.BYREAL_SWAP_INPUT_MINT  ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const outputMint = env.BYREAL_SWAP_OUTPUT_MINT ?? 'So11111111111111111111111111111111111111112';
      return [
        'byreal-cli', 'swap', 'execute',
        '--input-mint',  inputMint,
        '--output-mint', outputMint,
        '--amount',      amountUsd.toFixed(2),
        '--slippage',    String(rule.actionMaxSlippageBps ?? 50),
        '--confirm', '-o', 'json',
      ];
    }

    case 'DCA':
      logger.warn({ ruleId: rule.id }, 'DCA action not implemented — skipping');
      return null;

    default:
      logger.warn({ ruleId: rule.id, actionType: rule.actionType }, 'Unknown actionType — skipping');
      return null;
  }
}
```

### 5f. `extractSolanaTxSig(output): string | null`

Returns `null` on parse failure so callers handle failure explicitly rather than storing a corrupted hash.

```typescript
function extractSolanaTxSig(output: string): string | null {
  try {
    const parsed: unknown = JSON.parse(output);
    if (parsed !== null && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const sig = obj['txSignature'] ?? obj['signature'] ?? obj['txHash'] ?? null;
      if (typeof sig === 'string' && sig.length > 0) return sig;
    }
  } catch {
    // not JSON
  }

  // Try raw output as a bare base58 signature (some CLI tools output just the sig)
  const trimmed = output.trim();
  if (SOLANA_SIG_RE.test(trimmed)) return trimmed;

  logger.warn({ output: trimmed.slice(0, 200) }, 'extractSolanaTxSig: unrecognised byreal-cli output');
  return null;
}
```

---

## Phase 6: Wire into poller + webhook

### 6a. Update `ingestTransfer` return type (optional but recommended)

**File:** `backend/src/services/transferIngestion.ts`

Change return type to expose matched wallets (avoids redundant query in `matchAndExecuteRules`):

```typescript
// Change signature from:
export async function ingestTransfer(params: TransferParams): Promise<boolean>

// To:
export async function ingestTransfer(
  params: TransferParams,
): Promise<{ wasNew: boolean; matchedWallets: Array<{ userId: string; address: string }> }>
```

Use `.returning()` to detect genuinely new rows (not suppressed by onConflictDoNothing):

```typescript
const rows = await db.insert(schema.onchainEvents).values(insertRows).onConflictDoNothing().returning({
  id: schema.onchainEvents.id,
});
const wasNew = rows.length > 0;
return { wasNew, matchedWallets: matchedWallets.map(w => ({ userId: w.userId, address: w.address })) };
```

> **If skipping this refactor**: keep `ingestTransfer` returning `boolean`. The poller fires `matchAndExecuteRules` on `true`, but `matchAndExecuteRules` will query wallets again. The `rule_executions` idempotency index handles any duplicates that slip through.

### 6b. Mantle testnet poller

**File:** `backend/src/poller/mantleTestnet.ts`

Add import:
```typescript
import { matchAndExecuteRules } from '../services/ruleExecutor.js';
```

After each `ingestTransfer()` call, fire rule matching (non-blocking):

```typescript
// ERC-20 loop:
const { wasNew, matchedWallets } = await ingestTransfer({ ... });
if (wasNew) {
  matchAndExecuteRules({
    chainId:        CHAIN_ID,
    txHash:         log.transactionHash ?? '',
    fromAddress:    log.args.from!.toLowerCase(),
    toAddress:      log.args.to!.toLowerCase(),
    tokenAddress:   log.address.toLowerCase(),
    amountRaw:      log.args.value!.toString(),
    blockTimestamp: blockTimestamps.get(log.blockNumber!) ?? 0,
  }, matchedWallets).catch((err: unknown) =>
    logger.error({ err, txHash: log.transactionHash }, 'matchAndExecuteRules error')
  );
}

// Native MNT loop:
const { wasNew, matchedWallets } = await ingestTransfer({ ... });
if (wasNew) {
  matchAndExecuteRules({
    chainId:        CHAIN_ID,
    txHash:         tx.hash,
    fromAddress:    tx.from.toLowerCase(),
    toAddress:      tx.to!.toLowerCase(),
    tokenAddress:   null,
    amountRaw:      tx.value.toString(),
    blockTimestamp: blockTimestamps.get(tx.blockNumber!) ?? 0,
  }, matchedWallets).catch((err: unknown) =>
    logger.error({ err, txHash: tx.hash }, 'matchAndExecuteRules error (native)')
  );
}
```

**Why non-blocking (`.catch()` not `await`):** byreal-cli can take up to 30s + Mantle attest ~5-10s. Awaiting would block every subsequent transfer in the loop. Fire-and-forget + idempotency index = correct.

> **Also recommended:** replace `setInterval` with recursive `setTimeout` in `finally` to prevent overlapping poll cycles when one cycle is slow.

### 6c. Goldsky webhook handler

**File:** `backend/src/server/routes/webhooks/goldsky.ts`

**Critical:** The webhook handler must return 200 immediately. Goldsky retries on non-2xx. If `matchAndExecuteRules` is awaited, a 30s byreal-cli execution will delay the 200 response past Goldsky's timeout.

```typescript
// After successful ingestTransfer() call in the ERC-20 path:
const { wasNew, matchedWallets } = await ingestTransfer({ ... });
if (wasNew) {
  // Non-blocking — must not delay the 200 response
  void matchAndExecuteRules({
    chainId:      CHAIN_ID,
    txHash:       row.transaction_hash,
    fromAddress:  row.sender.toLowerCase(),
    toAddress:    row.recipient.toLowerCase(),
    tokenAddress: row.address?.toLowerCase() ?? null,
    amountRaw:    row.amount,
    blockTimestamp: row.block_timestamp,
  }, matchedWallets).catch((err: unknown) =>
    logger.error({ err, txHash: row.transaction_hash }, 'matchAndExecuteRules error')
  );
}
```

---

## Phase 7: Add `tali-cli rules executions` command

**File:** `backend/src/cli/commands/rules.ts`

Add a new `executions` subcommand to make the autonomous loop observable (required for demo — a judge will ask "what did Tali just do?"):

```typescript
.addCommand(
  new Command('executions')
    .description('Show recent rule execution history')
    .option('-n, --limit <n>', 'Max rows to show', '10')
    .option('-s, --status <status>', 'Filter by status: executing|executed|attested|failed')
    .option('-o, --output <format>', 'Output format: table | json', 'table')
    .action(async (opts: { limit: string; status?: string; output: string }) => {
      const limit  = Math.min(parseInt(opts.limit, 10) || 10, 100);
      const rows = await db
        .select({
          id:                  schema.ruleExecutions.id,
          ruleId:              schema.ruleExecutions.ruleId,
          status:              schema.ruleExecutions.status,
          executionAmountUsd:  schema.ruleExecutions.executionAmountUsd,
          solanaTxSig:         schema.ruleExecutions.solanaTxSig,
          mantleAttestTxHash:  schema.ruleExecutions.mantleAttestTxHash,
          createdAt:           schema.ruleExecutions.createdAt,
          errorMessage:        schema.ruleExecutions.errorMessage,
          nlText:              schema.rules.nlText,
        })
        .from(schema.ruleExecutions)
        .innerJoin(schema.rules, eq(schema.ruleExecutions.ruleId, schema.rules.id))
        .where(opts.status ? eq(schema.ruleExecutions.status, opts.status) : undefined)
        .orderBy(desc(schema.ruleExecutions.createdAt))
        .limit(limit);

      if (opts.output === 'json') {
        process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
        return;
      }
      // table output
      if (rows.length === 0) {
        console.log('No executions found.');
        return;
      }
      console.log(`\n${'WHEN'.padEnd(12)} ${'STATUS'.padEnd(10)} ${'USD'.padEnd(8)} RULE`);
      console.log('─'.repeat(80));
      for (const r of rows) {
        const when   = r.createdAt.toISOString().slice(0, 10);
        const usd    = r.executionAmountUsd ? `$${parseFloat(r.executionAmountUsd).toFixed(2)}` : '-';
        const status = r.status.padEnd(10);
        console.log(`${when.padEnd(12)} ${status} ${usd.padEnd(8)} ${r.nlText.slice(0, 40)}`);
      }
      console.log();
    }),
)
```

Register in `backend/skills/tali/SKILL.md`:

```markdown
- `tali-cli rules executions [--limit N] [--status attested|failed] [-o json]` — Show rule execution history
```

---

## Acceptance Criteria

### Functional

- [ ] `tali-cli rules add "when USDC comes in, farm 10%"` populates all 6 decoded param columns
- [ ] A simulated USDC inflow on testnet triggers rule matcher within one poll cycle (~10s)
- [ ] FARM rule fires `byreal-cli positions copy --position ... --amount-usd ...` with correct amount
- [ ] SWAP rule fires `byreal-cli swap execute ...` with correct mints and slippage
- [ ] DCA rule logs warning and skips — no crash, no execution row
- [ ] `rule_executions` row created per execution attempt
- [ ] Status progression: `'executing'` → `'executed'` (byreal ok) → `'attested'` (Mantle ok)
- [ ] `attestExecution()` called on Mantle; `mantleAttestTxHash` stored
- [ ] Second identical trigger event blocked by `rule_executions` idempotency index
- [ ] byreal-cli failure → `status='failed'`, polling continues unblocked
- [ ] `"already attested"` revert → logged as no-op, no status change
- [ ] `tali-cli rules executions` shows the execution with status and USD amount
- [ ] `AGENT_PRIVATE_KEY` never appears in byreal-cli child process environment
- [ ] `pnpm typecheck` passes

### Non-functional

- [ ] Rule matching does not block the Mantle poller loop
- [ ] Goldsky webhook returns 200 immediately regardless of rule execution duration
- [ ] Migration applied cleanly: `pnpm db:reset && pnpm db:migrate && pnpm db:seed` with zero errors

---

## Risk Analysis

| Risk | Likelihood | Mitigation |
|---|---|---|
| `byreal-cli positions copy` output format unknown | Medium | `extractSolanaTxSig` tries `txSignature`/`signature`/`txHash` fields + bare base58 validation; returns null on failure (no silent corruption) |
| `BYREAL_DEFAULT_COPY_POSITION` not set at demo time | High | Guard in `buildExecutionArgs` with clear error log; fill from `byreal-cli positions top-positions` output before demo |
| byreal-cli Solana wallet has insufficient balance | Medium | `ExecutionResult.success=false` → `status='failed'`; run `byreal-cli wallet balance` before demo |
| Attestation nonce collision (2 rules fire simultaneously) | Low | Serialized via promise queue in `contracts.ts` |
| Drizzle snapshot drift causes `CREATE TABLE rules` in new migration | High | Option B (clean regenerate from `0000_snapshot.json`) eliminates this |
| `rule_executions.onDelete: 'cascade'` destroys audit trail if rule deleted | Low | `rules remove` only sets `active=false` — no physical DELETE today; document as future risk |
| `waitForTransactionReceipt` hangs (Mantle RPC degraded) | Low | `timeout: 30_000` added to all three call sites |

---

## File Change Summary

| File | Change |
|---|---|
| `backend/src/db/schema.ts` | Add 6 columns + CHECK constraints to `rules`; add `ruleExecutions` table; export types |
| `backend/drizzle/0001_add_rules_and_executions.sql` | Clean regenerated migration (replaces 0001_add_rules_table.sql) |
| `backend/drizzle/meta/_journal.json` | Update idx:1 `"tag"` to match new migration filename |
| `backend/src/lib/contracts.ts` | Add `timeout: 30_000` to all `waitForTransactionReceipt` calls; add attestation serialization queue |
| `backend/src/agent/executor.ts` | Scope child env to explicit allowlist; add subcommand allowlist; reduce timeout to 30s |
| `backend/src/lib/env.ts` | Add `BYREAL_DEFAULT_COPY_POSITION`, `BYREAL_SWAP_INPUT_MINT`, `BYREAL_SWAP_OUTPUT_MINT` |
| `backend/.env.example` | Document new env vars with instructions |
| `backend/src/services/transferIngestion.ts` | Change return type to `{ wasNew, matchedWallets }` |
| `backend/src/cli/commands/rules.ts` | Add 6 decoded param fields to insert; add `rules executions` subcommand |
| `backend/src/services/ruleExecutor.ts` | **NEW** — full rule execution service |
| `backend/src/poller/mantleTestnet.ts` | Import + fire `matchAndExecuteRules()` non-blocking after `ingestTransfer()` |
| `backend/src/server/routes/webhooks/goldsky.ts` | Import + fire `matchAndExecuteRules()` non-blocking after `ingestTransfer()` |
| `backend/skills/tali/SKILL.md` | Document `rules executions` command |

---

## References

### Internal

- Brainstorm: `docs/brainstorms/2026-06-04-rule-execution-brainstorm.md`
- Contract helpers: `backend/src/lib/contracts.ts` — `hashTrigger`, `hashAction`, `hashSolanaTx`, `attestExecution`
- Executor: `backend/src/agent/executor.ts`
- Transfer ingestion: `backend/src/services/transferIngestion.ts`
- Prices: `backend/src/lib/prices.ts` — `getPrices(ids, vsCurrency, apiKey)`
- Schema: `backend/src/db/schema.ts:107` (rules), `assets` (coingeckoId)
- Rules CLI: `backend/src/cli/commands/rules.ts:208` (insert site)
- Poller: `backend/src/poller/mantleTestnet.ts:129` (ingest loop)
- Webhook: `backend/src/server/routes/webhooks/goldsky.ts`
- Solutions: `docs/solutions/autonomous-rule-and-erc8004.md` — EOA pattern, AlreadyExecuted, ruleId parsing
- Solutions: `docs/solutions/dual-ingestion-testnet-poller.md` — Goldsky field names, blockTimestamp

### External

- byreal-cli positions copy: https://github.com/byreal-git/byreal-agent-skills
- xStocks farming: https://docs.byreal.io/byreal-ai-agent-skills/xstocks-points-farming
- ERC-8004: Mantle Sepolia, agentId=114, `0x7f958B9556Be6FA6Ddf876f929FEa36Df077d750`
