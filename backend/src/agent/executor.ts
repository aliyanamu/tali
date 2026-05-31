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

/**
 * Hackathon executor: byreal-cli runs server-side with a dedicated agent wallet.
 * Keys live at ~/.config/byreal/keys/ — never accessible via the Hono HTTP handler.
 *
 * Uses execFile (not execSync/shell) to prevent command injection.
 * plan.args[0] must be 'byreal-cli'; remaining args are passed directly without shell interpretation.
 */
export class ByreaCliExecutor implements ExecutionGateway {
  async execute(plan: ExecutionPlan): Promise<ExecutionResult> {
    if (plan.args[0] !== 'byreal-cli') {
      return { success: false, output: `Rejected: expected byreal-cli, got ${plan.args[0]}` };
    }

    const [bin, ...args] = plan.args;
    logger.info({ ruleId: plan.ruleId, subcommand: args[0] }, 'executing byreal-cli plan');

    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...(env.SOLANA_HELIUS_RPC && { SOLANA_RPC_URL: env.SOLANA_HELIUS_RPC }),
      ...(!env.SOLANA_HELIUS_RPC && env.SOLANA_ALCHEMY_RPC && { SOLANA_RPC_URL: env.SOLANA_ALCHEMY_RPC }),
      ...(env.BYREAL_KEYS_DIR && { BYREAL_KEYS_DIR: env.BYREAL_KEYS_DIR }),
    };

    try {
      const { stdout } = await execFileAsync(bin, args, {
        encoding: 'utf-8',
        timeout: 60_000,
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
