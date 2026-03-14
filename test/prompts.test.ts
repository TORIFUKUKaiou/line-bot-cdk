import {
  buildReplyInput,
  buildSummaryInput,
} from '../lib/prompts';
import { ConversationMemory, EMPTY_CONVERSATION_MEMORY } from '../lib/types';

const SHARED_MEMORY: ConversationMemory = {
  profile_summary: '',
  recent_summary: '家族みんなで旅行の話をしていた。',
  open_loops: ['次の行き先'],
  updated_at: '2026-03-14T00:00:00.000Z',
};

test('reply prompt requires short replies, a joke, and no unsolicited art suggestion', () => {
  const input = buildReplyInput('こんにちは。元気ですか！？', {
    userMemory: EMPTY_CONVERSATION_MEMORY,
  });
  const prompt = input[0]?.content ?? '';

  expect(prompt).toContain('できるだけ短く');
  expect(prompt).toContain('一発ギャグ');
  expect(prompt).toContain('絵の提案や題材募集はしません');
});

test('reply prompt includes shared group context when present', () => {
  const input = buildReplyInput('次はどこへ行く？', {
    userMemory: EMPTY_CONVERSATION_MEMORY,
    sharedMemory: SHARED_MEMORY,
  });
  const memoryPrompt = input[1]?.content ?? '';

  expect(memoryPrompt).toContain('このグループやルーム全体の共有メモ');
  expect(memoryPrompt).toContain('家族みんなで旅行の話をしていた');
  expect(memoryPrompt).toContain('次の行き先');
});

test('summary prompt keeps track of when Kuma says he painted something', () => {
  const input = buildSummaryInput(
    EMPTY_CONVERSATION_MEMORY,
    'こんにちは。元気ですか！？',
    'こんにちは、元気だよ。今日は草原の絵を描いたよ。布団がふっとんだ、ワン。',
    'user'
  );
  const prompt = input[0]?.content ?? '';

  expect(prompt).toContain('くまが絵を描いた');
  expect(prompt).toContain('recent_summary');
});

test('shared summary prompt avoids storing personal profile detail', () => {
  const input = buildSummaryInput(
    SHARED_MEMORY,
    'じゃあ次は海かな？',
    '海もいいね。波で話がなみのり気分、ワン。',
    'shared'
  );
  const prompt = input[0]?.content ?? '';

  expect(prompt).toContain('共有メモ');
  expect(prompt).toContain('profile_summary は通常空');
});
