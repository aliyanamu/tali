import { z } from 'zod';

const EnvSchema = z.object({
  // Privy (Tier 2 wallet management — required for wallet commands, not for networth)
  PRIVY_APP_ID: z.string().optional(),
  PRIVY_APP_SECRET: z.string().optional(),

  // Alchemy Notify (webhook HMAC + address management)
  ALCHEMY_WEBHOOK_SECRET: z.string().optional(),
  ALCHEMY_WEBHOOK_AUTH_TOKEN: z.string().optional(),
  ALCHEMY_WEBHOOK_ID: z.string().optional(),

  // LLM (provider-agnostic — swap via LLM_PROVIDER)
  LLM_PROVIDER: z.enum(['anthropic', 'openai', 'google']).default('anthropic'),
  LLM_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().default('claude-haiku-4-5-20251001'),

  // Postgres
  DATABASE_URL: z.string().min(1),

  // Mantle chain config (ERC-8004 NFT + on-chain attestation)
  MANTLE_CHAIN_ID: z.coerce.number().default(5000),
  MANTLE_ALCHEMY_RPC: z.string().url(),
  SOLANA_HELIUS_RPC: z.string().url().optional(),
  SOLANA_ALCHEMY_RPC: z.string().url().optional(),

  // byreal-cli (server-side agent wallet)
  BYREAL_KEYS_DIR: z.string().optional(),
  AUTONOMOUS_RULE_CONTRACT: z.string().optional(),
  ERC8004_NFT_CONTRACT: z.string().optional(),

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
