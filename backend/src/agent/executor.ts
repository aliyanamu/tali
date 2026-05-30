import { execSync } from 'child_process';
import { env } from '../lib/env';
import { logger } from '../lib/logger';

export interface ExecutionPlan {
  command: string;       // full byreal-cli command string
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
 * Option 2 (hackathon): byreal-cli runs on the server with a dedicated agent wallet.
 * Keys live at ~/.config/byreal/keys/ — isolated from the webhook server process,
 * never accessible via the Hono HTTP handler.
 *
 * Migration path → Option 1 (production):
 *   Replace this class with PushNotificationExecutor.
 *   The rule matcher, Claude planner, and attestation logic are unchanged.
 *   See docs/architecture.md § "Execution model: current vs. production".
 */
export class ByreaCliExecutor implements ExecutionGateway {
  async execute(plan: ExecutionPlan): Promise<ExecutionResult> {
    logger.info({ ruleId: plan.ruleId, command: plan.command }, 'executing byreal-cli plan');
    try {
      const output = execSync(plan.command, {
        encoding: 'utf-8',
        timeout: 60_000,
        env: {
          ...process.env,
          // byreal-cli reads SOLANA_RPC_URL; prefer Helius mainnet, fall back to Alchemy
          ...(env.SOLANA_HELIUS_RPC && { SOLANA_RPC_URL: env.SOLANA_HELIUS_RPC }),
          ...(!env.SOLANA_HELIUS_RPC && env.SOLANA_ALCHEMY_RPC && { SOLANA_RPC_URL: env.SOLANA_ALCHEMY_RPC }),
          ...(env.BYREAL_KEYS_DIR && { BYREAL_KEYS_DIR: env.BYREAL_KEYS_DIR }),
        },
      });
      logger.info({ ruleId: plan.ruleId }, 'byreal-cli execution succeeded');
      return { success: true, output: output.trim() };
    } catch (err: any) {
      logger.error({ ruleId: plan.ruleId, err: err.message }, 'byreal-cli execution failed');
      return { success: false, output: err.message };
    }
  }
}

export function createExecutor(): ExecutionGateway {
  return new ByreaCliExecutor();
}
