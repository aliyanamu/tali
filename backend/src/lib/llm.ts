import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject, generateText, type LanguageModel } from 'ai';
import { env } from './env';

export { generateObject, generateText };

type Provider = 'anthropic' | 'openai' | 'google';

function buildModel(): LanguageModel {
  const provider = (env.LLM_PROVIDER ?? 'anthropic') as Provider;
  const modelId = env.LLM_MODEL;

  switch (provider) {
    case 'openai':
      return createOpenAI({ apiKey: env.LLM_API_KEY })(modelId);
    case 'google':
      return createGoogleGenerativeAI({ apiKey: env.LLM_API_KEY })(modelId);
    case 'anthropic':
    default:
      return createAnthropic({ apiKey: env.LLM_API_KEY })(modelId);
  }
}

// Single model instance shared across the process lifetime.
// All LLM calls go through this — swap provider via LLM_PROVIDER env var.
export const model = buildModel();
