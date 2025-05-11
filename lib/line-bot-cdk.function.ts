import { Context, APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda';
import * as line from '@line/bot-sdk'
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import OpenAI from "openai";

const SYSTEM_PROMPT = "あなたは冗談がうまい犬です。名前はくまです。一言だけで笑いを取れます。最長で400文字まで返せます。犬だからといって安易に「骨」の話はしません。";
const MODEL_NAME = "gpt-4.1";
const CREATE_IMAGE_MODEL = "dall-e-2"

const IMAGE_KEYWORDS = [
  "絵", "描いて", "イラスト", "画像", "写真", "スケッチ", "アート", "グラフィック", "図", "図解",
  "picture", "draw", "image", "painting", "描写", "ペイント", "イメージ", "生成", "描画", "デッサン"
];

function isImageRequest(text: string): boolean {
  return IMAGE_KEYWORDS.some(keyword => text.includes(keyword));
}

interface Clients {
  lineClient: line.messagingApi.MessagingApiClient;
  openaiClient: OpenAI;
  channelSecret: string;
}

const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

async function getParameter(name: string): Promise<string> {
  try {
    const command = new GetParameterCommand({
      Name: name,
      WithDecryption: true
    });
    const response = await ssmClient.send(command);
    if (!response.Parameter?.Value) {
      throw new Error(`Parameter ${name} not found`);
    }
    return response.Parameter.Value;
  } catch (error) {
    console.error(`Error fetching parameter ${name}:`, error);
    throw error;
  }
}

async function initialize(): Promise<Clients> {
  const [channelSecret, channelAccessToken, openAIAPIKey] = await Promise.all([
    getParameter(process.env.CHANNEL_SECRET_PARAM_NAME!),
    getParameter(process.env.CHANNEL_ACCESS_TOKEN_PARAM_NAME!),
    getParameter(process.env.OPENAI_API_KEY_PARAM_NAME!)
  ]);

  return {
    lineClient: new line.messagingApi.MessagingApiClient({
      channelAccessToken
    }),
    openaiClient: new OpenAI({ apiKey: openAIAPIKey }),
    channelSecret
  };
}

async function askOpenAI(text: string, openai: OpenAI): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: MODEL_NAME,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text }
    ],
    temperature: 1.0,
    store: true,
  });
  return completion.choices[0].message.content ?? 'ワンワン！';
}

async function generateImages(text: string, openai: OpenAI): Promise<string> {
  const result = await openai.images.generate({
    model: CREATE_IMAGE_MODEL,
    prompt: text,
    n: 1,
    response_format: "url"
  });
  return result.data[0].url ?? '';
}

export const handler = async (event: APIGatewayEvent, _context: Context): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      throw new Error('Bad Request: No body');
    }

    const clients = await initialize();
    
    if (!line.validateSignature(event.body, clients.channelSecret, event.headers['x-line-signature']!)) {
      throw new Error('Bad Request: Invalid signature');
    }

    const body = JSON.parse(event.body);
    const events: line.WebhookEvent[] = body.events;

    await Promise.all(events.map(async (ev) => {
      if (ev.type === 'message' && ev.message.type === 'text') {
        if (isImageRequest(ev.message.text)) {
          const url = await generateImages(ev.message.text, clients.openaiClient);
          await clients.lineClient.replyMessage({
            replyToken: ev.replyToken,
            messages: [{ type: 'image', originalContentUrl: url, previewImageUrl: url }]
          });
        } else {
          const reply = await askOpenAI(ev.message.text, clients.openaiClient);
          await clients.lineClient.replyMessage({
            replyToken: ev.replyToken,
            messages: [{ type: 'text', text: reply }]
          });
        }
      }
    }));

    return { statusCode: 200, body: 'OK' };
  } catch (error: any) {
    console.error('Error:', error);
    return {
      statusCode: error.message.includes('Bad Request') ? 400 : 500,
      body: error.message
    };
  }
};