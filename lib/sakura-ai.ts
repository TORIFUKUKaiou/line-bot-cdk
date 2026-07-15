import OpenAI from 'openai';

export const SAKURA_AI_BASE_URL = 'https://api.ai.sakura.ad.jp/v1';

export function createSakuraAiClient(token: string): OpenAI {
  return new OpenAI({
    baseURL: SAKURA_AI_BASE_URL,
    apiKey: token,
  });
}
