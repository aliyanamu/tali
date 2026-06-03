import { and, eq, gt, isNull, isNotNull, or } from 'drizzle-orm';
import { keccak256, encodeAbiParameters, parseAbiParameters } from 'viem';
import { db, schema } from '../db/index.js';
import type { Rule } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';
import { getPrices } from '../lib/prices.js';
import { hashSolanaTx, attestExecution } from '../lib/contracts.js';
import { ByreaCliExecutor } from '../agent/executor.js';
import type { ExecutionPlan } from '../agent/executor.js';
import { rawToDecimalString } from './transferIngestion.js';

// ── Constants ─────────────────────────────────────────────────

// CoinGecko IDs of stablecoins — always price $1.00, skip the API call
const STABLECOIN_COINGECKO_IDS = new Set(['tether', 'usd-coin', 'ondo-us-dollar-yield']);

// Minimum execution amount — avoids dust trades
const MIN_EXECUTION_USD = 1.0;

// Solana base58 signature format (87–88 chars)
const SOLANA_SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{87,88}$/;

// ── Types ─────────────────────────────────────────────────────

export interface TriggerContext {
  chainId:        number;
  txHash:         string;        // Mantle tx hash
  fromAddress:    string;
  toAddress:      string;
  tokenAddress:   string | null; // null = native MNT
  amountRaw:      string;
  blockTimestamp: number;        // unix seconds (0 if unknown)
}

// ── Main entry point ──────────────────────────────────────────

/**
 * Match active rules against an ingested transfer and fire execution for each match.
 * Called after ingestTransfer() confirms the event is genuinely new (wasNew = true).
 * matchedWallets can be passed from ingestTransfer to avoid a redundant DB round-trip.
 */
export async function matchAndExecuteRules(
  ctx: TriggerContext,
  matchedWallets?: Array<{ userId: string; address: string }>,
): Promise<void> {
  const wallets = matchedWallets ?? await db
    .select({ userId: schema.watchedWallets.userId, address: schema.watchedWallets.address })
    .from(schema.watchedWallets)
    .where(and(
      eq(schema.watchedWallets.chainId, ctx.chainId),
      or(
        eq(schema.watchedWallets.address, ctx.fromAddress),
        eq(schema.watchedWallets.address, ctx.toAddress),
      ),
    ));

  if (wallets.length === 0) return;

  for (const wallet of wallets) {
    const direction: 'IN' | 'OUT' = wallet.address === ctx.toAddress ? 'IN' : 'OUT';

    // Branch on native vs ERC-20: using ?? '' for null tokenAddress silently breaks native rules
    const tokenFilter = ctx.tokenAddress
      ? and(isNotNull(schema.rules.triggerTokenAddress), eq(schema.rules.triggerTokenAddress, ctx.tokenAddress))
      : isNull(schema.rules.triggerTokenAddress);

    const candidates = await db
      .select()
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

      // Fire-and-forget — log full context on failure for debuggability
      executeRule(rule, ctx, wallet.userId).catch((err: unknown) => {
        logger.error(
          { err, ruleId: rule.id, txHash: ctx.txHash, tokenAddress: ctx.tokenAddress, amountRaw: ctx.amountRaw },
          'executeRule: unhandled error',
        );
      });
    }
  }
}

// ── Rule execution ────────────────────────────────────────────

async function executeRule(rule: Rule, ctx: TriggerContext, userId: string): Promise<void> {
  // 1. Compute USD execution amount
  const asset = ctx.tokenAddress
    ? await db.query.assets.findFirst({
        where: (a, { and: qAnd, eq: qEq }) =>
          qAnd(qEq(a.chainId, ctx.chainId), qEq(a.tokenAddress, ctx.tokenAddress!)),
      })
    : await db.query.assets.findFirst({
        where: (a, { and: qAnd, eq: qEq, isNull: qIsNull }) =>
          qAnd(qEq(a.chainId, ctx.chainId), qIsNull(a.tokenAddress)),
      });

  const decimals  = asset?.decimals ?? 18;
  const amountDec = parseFloat(rawToDecimalString(ctx.amountRaw, decimals));
  let   tokenPrice = 1.0;

  if (asset?.coingeckoId && !STABLECOIN_COINGECKO_IDS.has(asset.coingeckoId)) {
    const prices = await getPrices([asset.coingeckoId], 'usd', process.env['COINGECKO_API_KEY']);
    tokenPrice = prices[asset.coingeckoId] ?? 0;
    if (tokenPrice === 0) {
      logger.warn(
        { ruleId: rule.id, coingeckoId: asset.coingeckoId },
        'token price is 0 (CoinGecko unavailable) — skipping rule execution',
      );
      return;
    }
  }

  const executionAmountUsd = amountDec * tokenPrice * (rule.actionTargetPct ?? 100) / 100;

  if (executionAmountUsd < MIN_EXECUTION_USD) {
    logger.warn({ ruleId: rule.id, executionAmountUsd }, 'execution amount below $1 minimum — skipping');
    return;
  }

  // 2. Build byreal-cli args
  const args = buildExecutionArgs(rule, executionAmountUsd);
  if (!args) return; // DCA/unknown — already logged

  const plan: ExecutionPlan = {
    args,
    description: `Rule ${rule.contractRuleId}: ${rule.actionType} $${executionAmountUsd.toFixed(2)}`,
    ruleId:      rule.id,
    userId,
  };

  // 3. Insert execution row — onConflictDoNothing blocks double-execution for same (ruleId, triggerTxHash)
  const inserted = await db
    .insert(schema.ruleExecutions)
    .values({
      ruleId:            rule.id,
      triggerTxHash:     ctx.txHash,
      chainId:           ctx.chainId,
      triggerAmountRaw:  ctx.amountRaw,
      executionAmountUsd: executionAmountUsd.toFixed(6),
      byreaCliCommand:   args.join(' '),
      status:            'executing',
    })
    .onConflictDoNothing()
    .returning({ id: schema.ruleExecutions.id });

  if (inserted.length === 0) {
    logger.info({ ruleId: rule.id, triggerTxHash: ctx.txHash }, 'duplicate execution blocked by idempotency index');
    return;
  }

  const [execution] = inserted;
  if (!execution) return; // narrowing — cannot be undefined here

  // 4. Run byreal-cli
  const executor = new ByreaCliExecutor();
  const result   = await executor.execute(plan);

  if (!result.success) {
    await db.update(schema.ruleExecutions)
      .set({ status: 'failed', errorMessage: result.output })
      .where(eq(schema.ruleExecutions.id, execution.id));
    logger.error({ ruleId: rule.id, output: result.output.slice(0, 500) }, 'byreal-cli execution failed');
    return;
  }

  // 5. Extract Solana tx signature from JSON output
  const solanaTxSig = extractSolanaTxSig(result.output);

  // Record byreal-cli success before attestation — lets us distinguish Solana-done from Mantle-attested
  await db.update(schema.ruleExecutions)
    .set({ byreaCliOutput: result.output, solanaTxSig: solanaTxSig ?? undefined, status: 'executed' })
    .where(eq(schema.ruleExecutions.id, execution.id));

  // 6. Compute executionHash from inputs available BEFORE the attest call.
  //    Use solanaTxHash (content-address of Solana execution), NOT the Mantle tx hash (doesn't exist yet).
  const solanaTxHash = hashSolanaTx(solanaTxSig ?? '');
  const executionHash = keccak256(encodeAbiParameters(
    parseAbiParameters('uint256, bytes32, uint256'),
    [
      rule.contractRuleId,
      solanaTxHash,
      BigInt(ctx.amountRaw),
    ],
  ));

  // 7. Attest on Mantle (serialized queue in contracts.ts prevents nonce collisions)
  let mantleAttestTxHash: `0x${string}` | null = null;
  try {
    mantleAttestTxHash = await attestExecution({ ruleId: rule.contractRuleId, executionHash, solanaTxHash });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Contract revert string is "already attested" — treat as idempotent no-op
    if (msg.toLowerCase().includes('already attested')) {
      logger.info({ ruleId: rule.id }, 'attestExecution: already attested — idempotent');
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

// ── Plan builder ──────────────────────────────────────────────

function buildExecutionArgs(rule: Rule, amountUsd: number): string[] | null {
  switch (rule.actionType) {
    case 'FARM': {
      if (!env.BYREAL_DEFAULT_COPY_POSITION) {
        logger.error({ ruleId: rule.id }, 'BYREAL_DEFAULT_COPY_POSITION not set — cannot execute FARM rule');
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
      // Default: USDC → SOL. Amount in USDC units (≈ USD for stablecoin input).
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

// ── Helpers ───────────────────────────────────────────────────

/**
 * Extract Solana tx signature from byreal-cli JSON output.
 * Returns null on parse failure — callers handle gracefully rather than storing corrupt data.
 */
function extractSolanaTxSig(output: string): string | null {
  try {
    const parsed: unknown = JSON.parse(output);
    if (parsed !== null && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const sig = obj['txSignature'] ?? obj['signature'] ?? obj['txHash'] ?? null;
      if (typeof sig === 'string' && sig.length > 0) return sig;
    }
  } catch {
    // not JSON — try bare base58 sig
  }

  const trimmed = output.trim();
  if (SOLANA_SIG_RE.test(trimmed)) return trimmed;

  logger.warn({ output: trimmed.slice(0, 200) }, 'extractSolanaTxSig: unrecognised byreal-cli output format');
  return null;
}
