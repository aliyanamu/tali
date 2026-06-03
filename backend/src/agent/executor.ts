import { execFile } from 'child_process';
import { promisify } from 'util';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

const execFileAsync = promisify(execFile);

export interface ExecutionPlan {
  args: string[];       // byreal-cli argv: ['byreal-cli', 'swap', '--amount', '100', ...]
  description: string;  // human-readable, for logging + attestation
  ruleId: string;
  userId: string;
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  txSignature?: string;
}

export interface ExecutionGateway {
  execute(plan: ExecutionPlan): Promise<ExecutionResult>;
}

// Allowed byreal-cli subcommands — prevents DB-corrupted args from invoking wallet management cmds
const ALLOWED_BYREAL_SUBCOMMANDS = new Set(['positions', 'swap', 'pools', 'wallet', 'tokens', 'overview']);

/**
 * Hackathon executor: byreal-cli runs server-side with a dedicated agent wallet.
 * Keys live at ~/.config/byreal/keys/ — never accessible via the Hono HTTP handler.
 *
 * Uses execFile (not execSync/shell) to prevent command injection.
 * plan.args[0] must be 'byreal-cli'; remaining args are passed directly without shell interpretation.
 * Child env is an explicit allowlist — AGENT_PRIVATE_KEY and other secrets are NOT passed.
 */
export class ByreaCliExecutor implements ExecutionGateway {
  async execute(plan: ExecutionPlan): Promise<ExecutionResult> {
    if (plan.args[0] !== 'byreal-cli') {
      return { success: false, output: `Rejected: expected byreal-cli, got ${plan.args[0]}` };
    }

    const [bin, ...args] = plan.args;

    // Validate subcommand — args[0] is the subcommand (e.g. 'positions', 'swap')
    if (args[0] !== undefined && !ALLOWED_BYREAL_SUBCOMMANDS.has(args[0])) {
      return { success: false, output: `Rejected: subcommand '${args[0]}' is not permitted` };
    }

    logger.info({ ruleId: plan.ruleId, subcommand: args[0] }, 'executing byreal-cli plan');

    // Explicit env allowlist — never pass AGENT_PRIVATE_KEY, DATABASE_URL, PRIVY_APP_SECRET, etc.
    const childEnv: NodeJS.ProcessEnv = {
      HOME: process.env['HOME'],
      PATH: process.env['PATH'],
      USER: process.env['USER'],
      LANG: process.env['LANG'],
      TERM: process.env['TERM'],
      ...(env.SOLANA_HELIUS_RPC  && { SOLANA_RPC_URL: env.SOLANA_HELIUS_RPC }),
      ...(!env.SOLANA_HELIUS_RPC && env.SOLANA_ALCHEMY_RPC && { SOLANA_RPC_URL: env.SOLANA_ALCHEMY_RPC }),
      ...(env.BYREAL_KEYS_DIR    && { BYREAL_KEYS_DIR: env.BYREAL_KEYS_DIR }),
    };

    try {
      const { stdout } = await execFileAsync(bin, args, {
        encoding: 'utf-8',
        timeout: 30_000,           // 30s — byreal-cli normally responds in < 10s
        maxBuffer: 2 * 1024 * 1024, // 2 MB
        env: childEnv,
      });
      logger.info({ ruleId: plan.ruleId }, 'byreal-cli execution succeeded');
      return { success: true, output: stdout.trim() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ ruleId: plan.ruleId, err: message }, 'byreal-cli execution failed');
      return { success: false, output: message };
    }
  }
}

export function createExecutor(): ExecutionGateway {
  return new ByreaCliExecutor();
}
