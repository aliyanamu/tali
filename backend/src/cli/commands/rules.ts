import { Command } from 'commander';
import { createInterface } from 'readline';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { generateObject, model } from '../../lib/llm.js';
import { env } from '../../lib/env.js';
import { db, schema } from '../../db/index.js';
import { TOKENS, TESTNET_TOKENS } from '../../lib/tokens.js';
import {
  hashTrigger,
  hashAction,
  setRule as contractSetRule,
  deactivateRule as contractDeactivateRule,
  type TriggerDirection,
  type ActionType,
} from '../../lib/contracts.js';

// ── NL parsing schema ──────────────────────────────────────────

const ParsedRuleSchema = z.object({
  tokenSymbol:    z.enum(['USDT', 'USDC', 'MNT', 'mETH', 'USDY']).describe('Token to watch'),
  direction:      z.enum(['IN', 'OUT', 'BOTH']).describe('Transfer direction relative to watched wallet'),
  thresholdRaw:   z.string().regex(/^\d+$/, 'must be a non-negative integer string').describe('Minimum amount in raw token units (0 = any amount)'),
  actionType:     z.enum(['FARM', 'SWAP', 'DCA']).describe('DeFi action to execute'),
  targetPct:      z.number().int().min(1).max(100).describe('Percentage of incoming amount to act on'),
  maxSlippageBps: z.number().int().min(0).max(1000).default(50).describe('Max slippage in basis points (50 = 0.5%)'),
});

type ParsedRule = z.infer<typeof ParsedRuleSchema>;

// ── Helpers ────────────────────────────────────────────────────

function getTokens() {
  return env.MANTLE_CHAIN_ID === 5003 ? TESTNET_TOKENS : TOKENS;
}

function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

async function parseRuleNL(nlText: string): Promise<ParsedRule> {
  const { object } = await generateObject({
    model,
    schema: ParsedRuleSchema,
    system: `You are a rule parser for Tali, an autonomous financial agent.
Extract rule parameters from natural language. Be conservative — if you cannot confidently extract a field, use the default.
Supported tokens: USDT, USDC, MNT, mETH, USDY.
Supported actions: FARM (yield farming), SWAP (token swap), DCA (dollar-cost average).
"whenever X comes in" → direction: IN. "whenever X goes out" → direction: OUT.
If no amount threshold is mentioned, use thresholdRaw: "0" (any amount).
targetPct: what percentage of the incoming amount to act on. If not specified, default to 100.`,
    prompt: `Parse this rule: "${nlText}"`,
  });
  return object;
}

function formatRule(parsed: ParsedRule, tokenAddress: string): string {
  const threshold = parsed.thresholdRaw === '0'
    ? 'any amount'
    : `≥ ${parsed.thresholdRaw} raw units`;
  return (
    `  Token:    ${parsed.tokenSymbol} (${tokenAddress})\n` +
    `  Trigger:  ${parsed.direction} · ${threshold}\n` +
    `  Action:   ${parsed.actionType} ${parsed.targetPct}% · max slippage ${parsed.maxSlippageBps} bps`
  );
}

// ── Commands ───────────────────────────────────────────────────

export const rulesCommand = new Command('rules')
  .description('Manage autonomous financial rules')

  // ── rules list ──────────────────────────────────────────────
  .addCommand(
    new Command('list')
      .description('List active rules')
      .option('-o, --output <format>', 'Output format: table | json', 'table')
      .action(async (opts: { output: string }) => {
        // Filter by active contract address so testnet and mainnet rules don't mix
        const contractAddress = env.AUTONOMOUS_RULE_CONTRACT;
        const rows = await db
          .select()
          .from(schema.rules)
          .where(
            contractAddress
              ? and(eq(schema.rules.active, true), eq(schema.rules.contractAddress, contractAddress))
              : eq(schema.rules.active, true),
          )
          .orderBy(schema.rules.createdAt);

        if (opts.output === 'json') {
          process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
          return;
        }

        if (rows.length === 0) {
          console.log('No active rules. Add one with: tali-cli rules add "<rule>"');
          return;
        }

        console.log(`\n${'ID'.padEnd(4)} ${'CONTRACT ID'.padEnd(12)} ${'CREATED'.padEnd(12)} RULE`);
        console.log('─'.repeat(80));
        for (const r of rows) {
          const created = r.createdAt.toISOString().slice(0, 10);
          const contractId = String(r.contractRuleId);
          console.log(`${String(r.id.slice(0, 4)).padEnd(4)} ${contractId.padEnd(12)} ${created.padEnd(12)} ${r.nlText}`);
        }
        console.log();
      }),
  )

  // ── rules add ───────────────────────────────────────────────
  .addCommand(
    new Command('add')
      .description('Add a rule in natural language')
      .argument('<rule>', 'e.g. "when USDT comes in, farm 10% yield on Byreal"')
      .option('-o, --output <format>', 'Output format: table | json', 'table')
      .option('-y, --yes', 'Skip confirmation prompt')
      .action(async (nlText: string, opts: { output: string; yes?: boolean }) => {
        if (nlText.length > 500) {
          console.error('Rule description too long (max 500 characters).');
          process.exit(1);
        }
        if (!env.AUTONOMOUS_RULE_CONTRACT) {
          console.error('AUTONOMOUS_RULE_CONTRACT not set. Deploy the contract first and set it in .env');
          process.exit(1);
        }
        if (!env.AGENT_PRIVATE_KEY) {
          console.error('AGENT_PRIVATE_KEY not set. Configure the agent server wallet in .env');
          process.exit(1);
        }

        // 1. Parse NL
        process.stdout.write('Parsing rule...\n');
        let parsed: ParsedRule;
        try {
          parsed = await parseRuleNL(nlText);
        } catch (err) {
          console.error(
            'Could not parse rule. Try: "when USDT comes in, farm 10% yield on Byreal"\n' +
            `Error: ${err instanceof Error ? err.message : String(err)}`,
          );
          process.exit(1);
        }

        // 2. Resolve token address
        const tokens = getTokens();
        const tokenInfo = tokens.find((t) => t.symbol === parsed.tokenSymbol);
        if (!tokenInfo) {
          console.error(`Unsupported token: ${parsed.tokenSymbol}. Supported: ${tokens.map((t) => t.symbol).join(', ')}`);
          process.exit(1);
        }

        // 3. Show parsed rule and confirm
        console.log('\nParsed rule:');
        console.log(formatRule(parsed, tokenInfo.address));
        console.log(`  AgentId:  ${env.AGENT_ERC8004_ID} (ERC-8004 NFT — replace with real Mantle ID at mainnet deploy)`);

        if (!opts.yes) {
          const ok = await confirm('\nAdd this rule? [y/N] ');
          if (!ok) {
            console.log('Cancelled.');
            process.exit(0);
          }
        }

        // 4. Compute hashes
        const triggerHash = hashTrigger(
          tokenInfo.address as `0x${string}`,
          parsed.direction as TriggerDirection,
          BigInt(parsed.thresholdRaw),
        );
        const actionHash = hashAction(
          parsed.actionType as ActionType,
          BigInt(parsed.targetPct),
          BigInt(parsed.maxSlippageBps),
        );

        // 5. Send on-chain tx
        process.stdout.write('Sending tx to Mantle...\n');
        let contractRuleId: bigint;
        try {
          contractRuleId = await contractSetRule({
            agentId:     env.AGENT_ERC8004_ID,
            triggerHash,
            actionHash,
            expiry:      0n, // never expires
          });
        } catch (err) {
          console.error(`Contract call failed: ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }

        // 6. Persist to DB
        // Single-user hack: use a fixed seed user. Week-2 dashboard will wire up real userId.
        const [seedUser] = await db.select().from(schema.users).limit(1);
        if (!seedUser) {
          console.error('No user found in DB. Run: pnpm db:seed');
          process.exit(1);
        }

        await db.insert(schema.rules).values({
          userId:               seedUser.id,
          contractRuleId,
          agentId:              env.AGENT_ERC8004_ID,
          nlText,
          triggerHash,
          actionHash,
          contractAddress:      env.AUTONOMOUS_RULE_CONTRACT!,
          active:               true,
          // Decoded params — enables rule matching without recomputing keccak256 hashes
          triggerTokenAddress:  tokenInfo.address,
          triggerDirection:     parsed.direction,
          triggerThresholdRaw:  parsed.thresholdRaw,
          actionType:           parsed.actionType,
          actionTargetPct:      parsed.targetPct,
          actionMaxSlippageBps: parsed.maxSlippageBps,
        });

        if (opts.output === 'json') {
          process.stdout.write(JSON.stringify({ success: true, contractRuleId: String(contractRuleId) }) + '\n');
        } else {
          console.log(`\nRule #${contractRuleId} created on Mantle.`);
          console.log(`  Contract: ${env.AUTONOMOUS_RULE_CONTRACT}`);
        }
      }),
  )

  // ── rules remove ─────────────────────────────────────────────
  .addCommand(
    new Command('remove')
      .description('Remove a rule by contract rule ID')
      .argument('<contractRuleId>', 'Contract rule ID (from rules list)')
      .option('-o, --output <format>', 'Output format: table | json', 'table')
      .option('-y, --yes', 'Skip confirmation prompt')
      .action(async (contractRuleIdStr: string, opts: { output: string; yes?: boolean }) => {
        if (!env.AUTONOMOUS_RULE_CONTRACT) {
          console.error('AUTONOMOUS_RULE_CONTRACT not set in .env');
          process.exit(1);
        }
        if (!env.AGENT_PRIVATE_KEY) {
          console.error('AGENT_PRIVATE_KEY not set in .env');
          process.exit(1);
        }

        if (!/^\d+$/.test(contractRuleIdStr)) {
          console.error(`Invalid rule ID: "${contractRuleIdStr}". Must be a positive integer (from rules list).`);
          process.exit(1);
        }
        const contractRuleId = BigInt(contractRuleIdStr);

        // Look up rule in DB
        const [rule] = await db
          .select()
          .from(schema.rules)
          .where(
            and(
              eq(schema.rules.contractRuleId, contractRuleId),
              eq(schema.rules.contractAddress, env.AUTONOMOUS_RULE_CONTRACT!),
              eq(schema.rules.active, true),
            ),
          )
          .limit(1);

        if (!rule) {
          console.error(`No active rule with contract ID ${contractRuleId} found.`);
          process.exit(1);
        }

        console.log(`\nDeactivate rule #${contractRuleId}: ${rule.nlText}`);
        if (!opts.yes) {
          const ok = await confirm('Confirm deactivation? [y/N] ');
          if (!ok) {
            console.log('Cancelled.');
            process.exit(0);
          }
        }

        // Deactivate on-chain
        process.stdout.write('Sending tx to Mantle...\n');
        let txHash: `0x${string}`;
        try {
          txHash = await contractDeactivateRule(contractRuleId);
        } catch (err) {
          console.error(`Contract call failed: ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }

        // Mark inactive in DB
        await db
          .update(schema.rules)
          .set({ active: false })
          .where(eq(schema.rules.id, rule.id));

        if (opts.output === 'json') {
          process.stdout.write(JSON.stringify({ success: true, txHash }) + '\n');
        } else {
          console.log(`\nRule #${contractRuleId} deactivated. tx: ${txHash}`);
        }
      }),
  )

  // ── rules executions ─────────────────────────────────────────
  .addCommand(
    new Command('executions')
      .description('Show autonomous rule execution history')
      .option('-n, --limit <n>', 'Max rows to show', '10')
      .option('-s, --status <status>', 'Filter by status: executing|executed|attested|failed')
      .option('-o, --output <format>', 'Output format: table | json', 'table')
      .action(async (opts: { limit: string; status?: string; output: string }) => {
        const limit = Math.min(parseInt(opts.limit, 10) || 10, 100);
        const rows = await db
          .select({
            id:                 schema.ruleExecutions.id,
            status:             schema.ruleExecutions.status,
            executionAmountUsd: schema.ruleExecutions.executionAmountUsd,
            solanaTxSig:        schema.ruleExecutions.solanaTxSig,
            mantleAttestTxHash: schema.ruleExecutions.mantleAttestTxHash,
            createdAt:          schema.ruleExecutions.createdAt,
            errorMessage:       schema.ruleExecutions.errorMessage,
            nlText:             schema.rules.nlText,
            triggerTxHash:      schema.ruleExecutions.triggerTxHash,
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
  );
