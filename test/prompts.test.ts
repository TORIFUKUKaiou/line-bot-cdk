import {
  buildReplyInput,
  buildSummaryInput,
} from '../lib/prompts';
import { EMPTY_CONVERSATION_MEMORY } from '../lib/types';

test('reply prompt requires short replies, a joke, and no unsolicited art suggestion', () => {
  const input = buildReplyInput('こんにちは。元気ですか！？', EMPTY_CONVERSATION_MEMORY);
  const prompt = input[0]?.content ?? '';

  expect(prompt).toContain('できるだけ短く');
  expect(prompt).toContain('一発ギャグ');
  expect(prompt).toContain('絵の提案や題材募集はしません');
});

test('summary prompt keeps track of when Kuma says he painted something', () => {
  const input = buildSummaryInput(
    EMPTY_CONVERSATION_MEMORY,
    'こんにちは。元気ですか！？',
    'こんにちは、元気だよ。今日は草原の絵を描いたよ。布団がふっとんだ、ワン。'
  );
  const prompt = input[0]?.content ?? '';

  expect(prompt).toContain('くまが絵を描いた');
  expect(prompt).toContain('recent_summary');
});
