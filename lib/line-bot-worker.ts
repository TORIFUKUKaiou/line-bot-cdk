import { Context } from 'aws-lambda';
import * as line from '@line/bot-sdk';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { createSakuraAiClient } from './sakura-ai';
import {
  clampConversationMemory,
  buildConversationMemoryPk,
  buildSharedConversationMemoryPk,
  loadConversationMemory,
  loadConversationMemoryByPk,
  saveConversationMemoryByPk,
  truncateText,
} from './memory';
import {
  buildImagePrompt,
  buildReplyInput,
  buildSummaryInput,
  CREATE_IMAGE_MODEL,
  IMAGE_SIZE,
  isLikelyImageRequest,
  MODEL_NAME,
  AI_FALLBACK_MESSAGE,
  SUMMARY_MODEL_NAME,
} from './prompts';
import {
  ConversationMemory,
  ConversationMemoryContext,
  ConversationMemoryKind,
  EMPTY_CONVERSATION_MEMORY,
} from './types';

interface Clients {
  lineClient: line.messagingApi.MessagingApiClient;
  sakuraAiClient: OpenAI;
  geminiApiKey: string;
}

type TextMessageEvent = line.webhook.MessageEvent & { message: line.webhook.TextMessageContent };

const ssmClient = new SSMClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });
let cachedClientsPromise: Promise<Clients> | undefined;

function logAIError(errorType: string, error: unknown, prompt?: string): void {
  const details = error instanceof Error ? error : new Error(String(error));
  console.error('[AI_ERROR]', {
    errorType,
    timestamp: new Date().toISOString(),
    message: details.message,
    stack: details.stack,
    prompt,
  });
}

async function getParameter(name: string): Promise<string> {
  const response = await ssmClient.send(
    new GetParameterCommand({
      Name: name,
      WithDecryption: true,
    })
  );

  if (!response.Parameter?.Value) {
    throw new Error(`Parameter ${name} not found`);
  }

  return response.Parameter.Value;
}

async function loadClients(): Promise<Clients> {
  const [channelAccessToken, sakuraAiToken, geminiApiKey] = await Promise.all([
    getParameter(process.env.CHANNEL_ACCESS_TOKEN_PARAM_NAME!),
    getParameter(process.env.SAKURA_AI_TOKEN_PARAM_NAME!),
    getParameter(process.env.GEMINI_API_KEY_PARAM_NAME!),
  ]);

  return {
    lineClient: new line.messagingApi.MessagingApiClient({
      channelAccessToken,
    }),
    sakuraAiClient: createSakuraAiClient(sakuraAiToken),
    geminiApiKey,
  };
}

async function initialize(): Promise<Clients> {
  if (!cachedClientsPromise) {
    cachedClientsPromise = loadClients().catch((error) => {
      cachedClientsPromise = undefined;
      throw error;
    });
  }

  return cachedClientsPromise;
}

function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text.trim();
}

function parseConversationMemory(text: string): Partial<ConversationMemory> {
  const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;
  return {
    profile_summary:
      typeof parsed.profile_summary === 'string' ? parsed.profile_summary : '',
    recent_summary:
      typeof parsed.recent_summary === 'string' ? parsed.recent_summary : '',
    open_loops: Array.isArray(parsed.open_loops)
      ? parsed.open_loops.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

function describeImageReply(text: string): string {
  const topic = truncateText(text.replace(/\s+/g, ' ').trim(), 50);
  if (!topic) {
    return 'くま画伯が絵を1枚描いて見せた。';
  }

  return `くま画伯が「${topic}」の絵を1枚描いて見せた。`;
}

async function sendTextReply(
  client: line.messagingApi.MessagingApiClient,
  replyToken: string,
  text: string
): Promise<boolean> {
  try {
    await client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text }],
    });
    return true;
  } catch (error) {
    console.error('Failed to send LINE text reply', { error, replyToken });
    return false;
  }
}

async function sendImageReply(
  client: line.messagingApi.MessagingApiClient,
  replyToken: string,
  imageUrl: string
): Promise<boolean> {
  try {
    await client.replyMessage({
      replyToken,
      messages: [
        {
          type: 'image',
          originalContentUrl: imageUrl,
          previewImageUrl: imageUrl,
        },
      ],
    });
    return true;
  } catch (error) {
    console.error('Failed to send LINE image reply', { error, replyToken });
    return false;
  }
}

export async function askSakuraAI(
  text: string,
  context: ConversationMemoryContext,
  sakuraAi: OpenAI
): Promise<string> {
  try {
    const response = await sakuraAi.responses.create({
      model: MODEL_NAME,
      input: buildReplyInput(text, context),
    });

    return response.output_text?.trim() || 'ワンワン！';
  } catch (error) {
    console.error('Sakura AI Responses API error', { error, prompt: text });
    logAIError('ChatAPI', error, text);
    throw error;
  }
}

export async function summarizeConversationMemory(
  previousMemory: ConversationMemory,
  userMessage: string,
  assistantReply: string,
  kind: ConversationMemoryKind,
  sakuraAi: OpenAI
): Promise<ConversationMemory> {
  try {
    const response = await sakuraAi.responses.create({
      model: SUMMARY_MODEL_NAME,
      input: buildSummaryInput(previousMemory, userMessage, assistantReply, kind),
    });

    const output = response.output_text?.trim();
    if (!output) {
      throw new Error('Summary response was empty');
    }

    return clampConversationMemory(parseConversationMemory(output));
  } catch (error) {
    console.error('Sakura AI summary error', { error, userMessage, assistantReply });
    logAIError('SummaryAPI', error, userMessage);
    throw error;
  }
}

async function generateImages(
  text: string,
  context: ConversationMemoryContext,
  geminiApiKey: string
): Promise<string> {
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${CREATE_IMAGE_MODEL}:generateContent`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: buildImagePrompt(text, context) }],
          },
        ],
        generationConfig: {
          responseModalities: ['Image'],
          imageConfig: {
            imageSize: IMAGE_SIZE,
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini image generation failed: ${response.status} ${errorText}`);
    }

    const result = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }>;
        };
      }>;
    };

    const imagePart = result.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .find((part) => part.inlineData?.data);

    const imageData = imagePart?.inlineData?.data;
    if (!imageData) {
      throw new Error('画像生成に失敗しました');
    }

    const imageBuffer = Buffer.from(imageData, 'base64');
    const contentType = imagePart?.inlineData?.mimeType ?? 'image/png';
    const extension = contentType === 'image/jpeg' ? 'jpg' : 'png';
    const fileName = `${randomUUID()}.${extension}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.IMAGES_BUCKET_NAME,
        Key: fileName,
        Body: imageBuffer,
        ContentType: contentType,
      })
    );

    const command = new GetObjectCommand({
      Bucket: process.env.IMAGES_BUCKET_NAME,
      Key: fileName,
    });

    return getSignedUrl(s3Client, command, {
      expiresIn: 60 * 60 * 24 * 7,
    });
  } catch (error) {
    console.error('Gemini image generation error', { error, prompt: text });
    logAIError('ImageAPI', error, text);
    throw error;
  }
}

function getSharedConversationMemoryPkFromSource(
  source: line.webhook.Source
): string | undefined {
  if (source.type === 'group') {
    return buildSharedConversationMemoryPk('group', source.groupId);
  }

  if (source.type === 'room') {
    return buildSharedConversationMemoryPk('room', source.roomId);
  }

  return undefined;
}

async function updateConversationMemoryForTurn(
  pk: string | undefined,
  previousMemory: ConversationMemory,
  userMessage: string,
  assistantReply: string,
  kind: ConversationMemoryKind,
  sakuraAi: OpenAI
): Promise<void> {
  if (!pk) {
    return;
  }

  try {
    const nextMemory = await summarizeConversationMemory(
      previousMemory,
      userMessage,
      assistantReply,
      kind,
      sakuraAi
    );

    await saveConversationMemoryByPk(pk, nextMemory);
  } catch (error) {
    console.error('Failed to update conversation memory', {
      error,
      pk,
      kind,
      userMessage,
    });
  }
}

async function handleTextMessageEvent(
  ev: TextMessageEvent,
  clients: Clients
): Promise<void> {
  if (!ev.replyToken) {
    console.warn('No replyToken in event', ev);
    return;
  }

  const lineUserId = ev.source?.userId;
  const userMemoryPk = lineUserId
    ? buildConversationMemoryPk(lineUserId)
    : undefined;
  const sharedMemoryPk = ev.source
    ? getSharedConversationMemoryPkFromSource(ev.source)
    : undefined;

  const [userMemory, sharedMemory] = await Promise.all([
    lineUserId
      ? loadConversationMemory(lineUserId)
      : Promise.resolve<ConversationMemory | undefined>(undefined),
    sharedMemoryPk
      ? loadConversationMemoryByPk(sharedMemoryPk)
      : Promise.resolve<ConversationMemory | undefined>(undefined),
  ]);

  const context: ConversationMemoryContext = {
    userMemory,
    sharedMemory,
  };

  if (isLikelyImageRequest(ev.message.text)) {
    try {
      const imageUrl = await generateImages(
        ev.message.text,
        context,
        clients.geminiApiKey
      );
      const replySent = await sendImageReply(
        clients.lineClient,
        ev.replyToken,
        imageUrl
      );

      if (replySent) {
        const imageReplyDescription = describeImageReply(ev.message.text);
        await Promise.all([
          updateConversationMemoryForTurn(
            userMemoryPk,
            userMemory ?? { ...EMPTY_CONVERSATION_MEMORY },
            ev.message.text,
            imageReplyDescription,
            'user',
            clients.sakuraAiClient
          ),
          updateConversationMemoryForTurn(
            sharedMemoryPk,
            sharedMemory ?? { ...EMPTY_CONVERSATION_MEMORY },
            ev.message.text,
            imageReplyDescription,
            'shared',
            clients.sakuraAiClient
          ),
        ]);
      }
      return;
    } catch (_error) {
      await sendTextReply(
        clients.lineClient,
        ev.replyToken,
        AI_FALLBACK_MESSAGE
      );
      return;
    }
  }

  try {
    const reply = await askSakuraAI(ev.message.text, context, clients.sakuraAiClient);
    const replySent = await sendTextReply(clients.lineClient, ev.replyToken, reply);

    if (!replySent) {
      return;
    }

    await Promise.all([
      updateConversationMemoryForTurn(
        userMemoryPk,
        userMemory ?? { ...EMPTY_CONVERSATION_MEMORY },
        ev.message.text,
        reply,
        'user',
        clients.sakuraAiClient
      ),
      updateConversationMemoryForTurn(
        sharedMemoryPk,
        sharedMemory ?? { ...EMPTY_CONVERSATION_MEMORY },
        ev.message.text,
        reply,
        'shared',
        clients.sakuraAiClient
      ),
    ]);
  } catch (_error) {
    await sendTextReply(
      clients.lineClient,
      ev.replyToken,
      AI_FALLBACK_MESSAGE
    );
  }
}

interface WorkerEvent {
  body: string;
}

export const handler = async (
  event: WorkerEvent,
  _context: Context
): Promise<void> => {
  try {
    const clients = await initialize();
    const body = JSON.parse(event.body);
    const events: line.webhook.Event[] = Array.isArray(body.events) ? body.events : [];

    for (const ev of events) {
      if (ev.type === 'message' && ev.message.type === 'text') {
        await handleTextMessageEvent(ev as TextMessageEvent, clients);
      }
    }
  } catch (error) {
    console.error('Error handling LINE event in worker', { error });
  }
};
