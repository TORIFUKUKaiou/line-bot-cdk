import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import {
  ConversationMemory,
  EMPTY_CONVERSATION_MEMORY,
  OPEN_LOOP_CHAR_LIMIT,
  OPEN_LOOP_LIMIT,
  PROFILE_SUMMARY_LIMIT,
  RECENT_SUMMARY_LIMIT,
} from './types';

const dynamoDbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

function truncateText(value: string, maxLength: number): string {
  return Array.from(value).slice(0, maxLength).join('');
}

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim();
}

function normalizeOpenLoops(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueValues = new Set<string>();
  for (const item of value) {
    const normalized = truncateText(normalizeText(item), OPEN_LOOP_CHAR_LIMIT);
    if (normalized) {
      uniqueValues.add(normalized);
    }
    if (uniqueValues.size >= OPEN_LOOP_LIMIT) {
      break;
    }
  }

  return Array.from(uniqueValues);
}

function parseStringAttribute(value: AttributeValue | undefined): string {
  return value?.S ?? '';
}

function parseStringListAttribute(value: AttributeValue | undefined): string[] {
  if (!value?.L) {
    return [];
  }

  return value.L
    .map((item) => item.S ?? '')
    .filter((item) => item.length > 0);
}

function toItem(memory: ConversationMemory, pk: string): Record<string, AttributeValue> {
  return {
    pk: { S: pk },
    profile_summary: { S: memory.profile_summary },
    recent_summary: { S: memory.recent_summary },
    open_loops: { L: memory.open_loops.map((item) => ({ S: item })) },
    updated_at: { S: memory.updated_at },
  };
}

function fromItem(item: Record<string, AttributeValue>): ConversationMemory {
  return clampConversationMemory({
    profile_summary: parseStringAttribute(item.profile_summary),
    recent_summary: parseStringAttribute(item.recent_summary),
    open_loops: parseStringListAttribute(item.open_loops),
    updated_at: parseStringAttribute(item.updated_at),
  });
}

function getTableName(): string | undefined {
  return process.env.CONVERSATION_MEMORY_TABLE_NAME;
}

export function buildConversationMemoryPk(lineUserId: string): string {
  return `USER#${lineUserId}`;
}

export function clampConversationMemory(
  memory: Partial<ConversationMemory>
): ConversationMemory {
  return {
    profile_summary: truncateText(
      normalizeText(memory.profile_summary),
      PROFILE_SUMMARY_LIMIT
    ),
    recent_summary: truncateText(
      normalizeText(memory.recent_summary),
      RECENT_SUMMARY_LIMIT
    ),
    open_loops: normalizeOpenLoops(memory.open_loops),
    updated_at: normalizeText(memory.updated_at) || new Date().toISOString(),
  };
}

export async function loadConversationMemory(
  lineUserId: string
): Promise<ConversationMemory> {
  const tableName = getTableName();
  if (!tableName) {
    console.warn('Conversation memory table name is not configured');
    return { ...EMPTY_CONVERSATION_MEMORY };
  }

  try {
    const response = await dynamoDbClient.send(
      new GetItemCommand({
        TableName: tableName,
        Key: {
          pk: { S: buildConversationMemoryPk(lineUserId) },
        },
      })
    );

    if (!response.Item) {
      return { ...EMPTY_CONVERSATION_MEMORY };
    }

    return fromItem(response.Item);
  } catch (error) {
    console.error('Failed to load conversation memory', { error, lineUserId });
    return { ...EMPTY_CONVERSATION_MEMORY };
  }
}

export async function saveConversationMemory(
  lineUserId: string,
  memory: Partial<ConversationMemory>
): Promise<void> {
  const tableName = getTableName();
  if (!tableName) {
    console.warn('Conversation memory table name is not configured');
    return;
  }

  const clampedMemory = clampConversationMemory(memory);

  await dynamoDbClient.send(
    new PutItemCommand({
      TableName: tableName,
      Item: toItem(clampedMemory, buildConversationMemoryPk(lineUserId)),
    })
  );
}

export { truncateText };
