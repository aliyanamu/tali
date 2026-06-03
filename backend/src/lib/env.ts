import { z } from 'zod';

const EnvSchema = z.object({
  // Privy (Tier 2 wallet management)
  PRIVY_APP_ID: z.string().min(1),
  PRIVY_APP_SECRET: z.string().min(1),

  // Goldsky Mirror (webhook raw secret — NOT HMAC)
  GOLDSKY_WEBHOOK_SECRET: z.string().min(1),

  // LLM
  LLM_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().default('claude-sonnet-4-6'),

  // Postgres
  DATABASE_URL: z.string().min(1),

  // Mantle chain config (ERC-8004 NFT + on-chain attestation)
  MANTLE_CHAIN_ID: z.coerce.number().default(5000),
  MANTLE_ALCHEMY_RPC: z.string().url(),
  // Mantle testnet (Sepolia) — when set, starts the RPC poll loop for local dev/testing
  MANTLE_TESTNET_RPC: z.string().url().optional(),
  POLL_INTERVAL_MS: z.coerce.number().default(5000),
  SOLANA_HELIUS_RPC: z.string().url().optional(),
  SOLANA_ALCHEMY_RPC: z.string().url().optional(),

  // byreal-cli (server-side agent wallet)
  BYREAL_KEYS_DIR: z.string().optional(),
  // Rule execution targets — byreal-cli Solana execution config
  // FARM: position PDA to copy (from: byreal-cli positions top-positions --pool <X>)
  BYREAL_DEFAULT_COPY_POSITION: z.string().optional(),
  // SWAP: Solana token mints (defaults: USDC → SOL)
  BYREAL_SWAP_INPUT_MINT:       z.string().optional(),
  BYREAL_SWAP_OUTPUT_MINT:      z.string().optional(),

  // On-chain contracts (Mantle)
  // AUTONOMOUS_RULE_CONTRACT: deployed AutonomousRule.sol address
  // AGENT_PRIVATE_KEY:        private key of the agent server wallet (signs setRule + attestExecution)
  //                           Generate with: cast wallet new
  //                           Never commit. Production: rotate to hardware wallet or Privy server wallet.
  // AGENT_WALLET_ADDRESS:     EVM address derived from AGENT_PRIVATE_KEY (set both after cast wallet new)
  // ERC8004_NFT_CONTRACT:     reserved — Mantle issues ERC-8004 NFTs; we don't deploy this
  AUTONOMOUS_RULE_CONTRACT: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'must be an EVM address').optional(),
  AGENT_PRIVATE_KEY:        z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 0x-prefixed 32-byte hex key').optional(),
  AGENT_WALLET_ADDRESS:     z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'must be an EVM address').optional(),
  ERC8004_NFT_CONTRACT:     z.string().optional(),

  // Hackathon: agentId is the Mantle-issued ERC-8004 NFT token ID for this agent.
  // Set to 1 as placeholder; replace with real value after Mantle hackathon registration.
  AGENT_ERC8004_ID:         z.coerce.bigint().default(1n),

  // Server
  PORT: z.coerce.number().default(8000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
