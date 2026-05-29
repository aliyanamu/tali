import { z } from 'zod';

const EnvSchema = z.object({
  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().min(1),

  // Privy
  PRIVY_APP_ID: z.string().min(1),
  PRIVY_APP_SECRET: z.string().min(1),

  // Alchemy (RPC for state reads + tx submission)
  ALCHEMY_API_KEY: z.string().min(1),
  ALCHEMY_MANTLE_RPC: z.string().url(),

  // Goldsky (webhook secret for HMAC verification)
  GOLDSKY_WEBHOOK_SECRET: z.string().min(1),

  // Anthropic (NL parsing + OCR)
  ANTHROPIC_API_KEY: z.string().min(1),

  // CoinGecko (price data with caching)
  COINGECKO_API_KEY: z.string().min(1),

  // Postgres
  DATABASE_URL: z.string().min(1),

  // Mantle chain config
  MANTLE_CHAIN_ID: z.coerce.number().default(5000),
  AUTONOMOUS_RULE_CONTRACT: z.string().optional(),
  ERC8004_NFT_CONTRACT: z.string().optional(),

  // Server
  PORT: z.coerce.number().default(3000),
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
