import {
  clampConversationMemory,
  truncateText,
} from '../lib/memory';
import {
  OPEN_LOOP_CHAR_LIMIT,
  OPEN_LOOP_LIMIT,
  PROFILE_SUMMARY_LIMIT,
  RECENT_SUMMARY_LIMIT,
} from '../lib/types';

test('clampConversationMemory enforces size limits', () => {
  const profileSeed = 'あ'.repeat(PROFILE_SUMMARY_LIMIT + 20);
  const recentSeed = 'い'.repeat(RECENT_SUMMARY_LIMIT + 30);
  const openLoopSeed = 'う'.repeat(OPEN_LOOP_CHAR_LIMIT + 10);

  const memory = clampConversationMemory({
    profile_summary: `   ${profileSeed}   `,
    recent_summary: ` ${recentSeed}`,
    open_loops: [
      openLoopSeed,
      openLoopSeed,
      'え'.repeat(OPEN_LOOP_CHAR_LIMIT + 5),
      'お'.repeat(OPEN_LOOP_CHAR_LIMIT + 5),
      'か'.repeat(OPEN_LOOP_CHAR_LIMIT + 5),
    ],
  });

  expect(Array.from(memory.profile_summary)).toHaveLength(PROFILE_SUMMARY_LIMIT);
  expect(Array.from(memory.recent_summary)).toHaveLength(RECENT_SUMMARY_LIMIT);
  expect(memory.open_loops).toHaveLength(OPEN_LOOP_LIMIT);
  for (const loop of memory.open_loops) {
    expect(Array.from(loop).length).toBeLessThanOrEqual(OPEN_LOOP_CHAR_LIMIT);
  }
});

test('truncateText counts Japanese characters correctly', () => {
  expect(truncateText('くま画伯', 3)).toBe('くま画');
});
