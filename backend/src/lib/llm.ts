import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject, generateText } from 'ai';
import { env } from './env.js';

export { generateObject, generateText };

export const model = createAnthropic({ apiKey: env.LLM_API_KEY })(env.LLM_MODEL);
