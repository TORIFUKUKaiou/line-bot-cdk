import OpenAI from 'openai';
import { createSakuraAiClient, SAKURA_AI_BASE_URL } from '../lib/sakura-ai';
import { askSakuraAI, summarizeConversationMemory } from '../lib/line-bot-worker';
import { ConversationMemory, EMPTY_CONVERSATION_MEMORY } from '../lib/types';

function mockResponsesClient(outputText: string): OpenAI {
  return {
    responses: {
      create: jest.fn().mockResolvedValue({ output_text: outputText }),
    },
  } as unknown as OpenAI;
}

test('creates a Sakura AI client with the documented endpoint', () => {
  const client = createSakuraAiClient('uuid:secret');

  expect(client.baseURL).toBe(SAKURA_AI_BASE_URL);
});

test('uses Responses API and the Sakura model for replies', async () => {
  const client = mockResponsesClient('こんにちは、今日も元気だワン。');
  const create = client.responses.create as jest.Mock;

  await expect(
    askSakuraAI('こんにちは', { userMemory: EMPTY_CONVERSATION_MEMORY }, client)
  ).resolves.toBe('こんにちは、今日も元気だワン。');

  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      model: 'gpt-oss-120b',
      input: expect.any(Array),
    })
  );
});

test('uses output_text for conversation summaries', async () => {
  const memory: ConversationMemory = { ...EMPTY_CONVERSATION_MEMORY };
  const client = mockResponsesClient(
    JSON.stringify({
      profile_summary: '',
      recent_summary: '挨拶をした。',
      open_loops: [],
    })
  );
  const create = client.responses.create as jest.Mock;

  await expect(
    summarizeConversationMemory(memory, 'こんにちは', '元気だよ。', 'user', client)
  ).resolves.toMatchObject({
    profile_summary: '',
    recent_summary: '挨拶をした。',
    open_loops: [],
  });

  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      model: 'gpt-oss-120b',
      input: expect.any(Array),
    })
  );
});
