import {
  ConversationMemoryContext,
  ConversationMemoryKind,
  ConversationMemory,
  OPEN_LOOP_CHAR_LIMIT,
  OPEN_LOOP_LIMIT,
  PROFILE_SUMMARY_LIMIT,
  RECENT_SUMMARY_LIMIT,
} from './types';

export const MODEL_NAME = 'gpt-5-nano';
export const SUMMARY_MODEL_NAME = MODEL_NAME;
export const CREATE_IMAGE_MODEL = 'gpt-image-1.5';
export const IMAGE_SIZE = '1024x1024';
export const OPENAI_FALLBACK_MESSAGE =
  'ちょっと調子が悪いみたい。また少ししてから話しかけてください。';

const PERSONA_PROMPT =
  'あなたは冗談がうまい犬です。名前は「くま」です。趣味は絵を描くことです。つまり「くま」画伯です。個展を何度も開いており、いつも盛況です。返答はできるだけ短く、通常は1〜3文で自然な日本語にしてください。毎回、短い一発ギャグかオチを必ず1つ入れてください。画像生成を頼まれていない限り、自分から絵の提案や題材募集はしません。聞かれていない提案も増やしません。最長で400文字まで話せます。犬だからといって安易に「骨」の話を繰り返しません。';

function buildMemorySection(
  title: string,
  memory: ConversationMemory,
  includeProfileSummary: boolean
): string[] {
  return [
    title,
    includeProfileSummary && memory.profile_summary && `情報: ${memory.profile_summary}`,
    memory.recent_summary && `最近の流れ: ${memory.recent_summary}`,
    memory.open_loops.length > 0 && `続いている話題: ${memory.open_loops.join(' / ')}`,
  ].filter(Boolean) as string[];
}

function buildMemoryContext(context: ConversationMemoryContext): string {
  const lines = [
    '以下は会話を自然につなぐための内部メモです。必要なときだけ自然に活かし、メモの文面はそのまま言わないでください。',
  ];

  if (context.sharedMemory) {
    lines.push(
      ...buildMemorySection(
        'このグループやルーム全体の共有メモ:',
        context.sharedMemory,
        false
      )
    );
  }

  if (context.userMemory) {
    lines.push(
      ...buildMemorySection('このユーザー個人のメモ:', context.userMemory, true)
    );
  }

  lines.push('メモにない事実は作らず、今のメッセージに素直に反応してください。');

  return lines.join('\n');
}

export function buildReplyInput(
  text: string,
  context: ConversationMemoryContext
): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    { role: 'system', content: PERSONA_PROMPT },
    { role: 'system', content: buildMemoryContext(context) },
    { role: 'user', content: text },
  ];
}

export function buildImagePrompt(
  text: string,
  context: ConversationMemoryContext
): string {
  const sections = [
    'あなたの名前は「くま」という名の犬です。つまり「くま」画伯です。冗談好きで、やさしく、絵が得意です。',
    context.sharedMemory?.recent_summary &&
      `この場の最近の流れ: ${context.sharedMemory.recent_summary}`,
    context.sharedMemory && context.sharedMemory.open_loops.length > 0 &&
      `この場で続いている話題: ${context.sharedMemory.open_loops.join(' / ')}`,
    context.userMemory?.profile_summary &&
      `このユーザー情報: ${context.userMemory.profile_summary}`,
    context.userMemory?.recent_summary &&
      `このユーザーとの最近の流れ: ${context.userMemory.recent_summary}`,
    context.userMemory && context.userMemory.open_loops.length > 0 &&
      `このユーザーと続いている話題: ${context.userMemory.open_loops.join(' / ')}`,
    `今回の依頼: ${text}`,
    '上の文脈を踏まえて、一貫した内容の画像を1枚描いてください。',
  ].filter(Boolean);

  return sections.join('\n');
}

export function buildSummaryInput(
  previousMemory: ConversationMemory,
  userMessage: string,
  assistantReply: string,
  kind: ConversationMemoryKind
): Array<{ role: 'system' | 'user'; content: string }> {
  const memoryModeInstruction =
    kind === 'shared'
      ? 'これはグループやルーム全体の共有メモです。特定ユーザー個人の属性を profile_summary に溜め込まず、共有文脈を recent_summary と open_loops に短く残してください。profile_summary は通常空で構いません。'
      : 'これはユーザー個人のメモです。ユーザー固有の好みや背景で役立つものだけを profile_summary に短く残してください。';

  return [
    {
      role: 'system',
      content: [
        'あなたはLINE bot「くま」の会話メモを更新する係です。',
        'JSONのみを返してください。説明文、前置き、コードブロックは禁止です。',
        '推測はせず、会話から明確に分かることだけを残してください。',
        `profile_summary は日本語で${PROFILE_SUMMARY_LIMIT}文字以内を目標に圧縮してください。`,
        `recent_summary は日本語で${RECENT_SUMMARY_LIMIT}文字以内を目標に圧縮してください。`,
        `open_loops は最大${OPEN_LOOP_LIMIT}件、各項目は日本語で${OPEN_LOOP_CHAR_LIMIT}文字以内を目標にしてください。`,
        '古い要約をだらだら足し続けず、短く圧縮して更新してください。',
        '解決した話題は open_loops から外してください。',
        memoryModeInstruction,
        'assistant_reply の中で、くまが絵を描いた、新作を作った、制作していたと分かる場合は、その事実を recent_summary に短く残してください。',
        'ユーザーにとって次回の会話で触れそうなくま側の近況は、短ければ recent_summary に残して構いません。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify(
        {
          previous_memory: {
            profile_summary: previousMemory.profile_summary,
            recent_summary: previousMemory.recent_summary,
            open_loops: previousMemory.open_loops,
          },
          latest_turn: {
            user_message: userMessage,
            assistant_reply: assistantReply,
          },
          output_schema: {
            profile_summary: 'string',
            recent_summary: 'string',
            open_loops: ['string'],
          },
        },
        null,
        2
      ),
    },
  ];
}

export function isLikelyImageRequest(text: string): boolean {
  const normalized = text.toLowerCase();

  const mentionsArtTarget =
    /(画像|イラスト|絵|さしえ|挿絵|スケッチ|似顔絵|写真|draw|paint|sketch|image|illustration)/i.test(
      normalized
    ) || /(くま画伯|画伯)/.test(text);

  const asksToCreate =
    /(描いて|書いて|かいて|作って|つくって|生成|お願い|おねがい|ください|ちょうだい|ほしい|見せて|つづき|続き|draw|paint|create|generate|make)/i.test(
      normalized
    );

  return mentionsArtTarget && asksToCreate;
}
