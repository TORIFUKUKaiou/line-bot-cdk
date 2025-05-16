import { Context, APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda';
import * as line from '@line/bot-sdk'
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import OpenAI from "openai";
import { randomUUID } from 'crypto';

const SYSTEM_PROMPT = "あなたは冗談がうまい犬です。名前はくまです。一言だけで笑いを取れます。最長で400文字まで返せます。犬だからといって安易に「骨」の話はしません。";
const MODEL_NAME = "gpt-4.1";
const CREATE_IMAGE_MODEL = "dall-e-2"
const SIZE = "256x256"

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
const s3Client = new S3Client({ region: process.env.AWS_REGION });

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
  try {
    // OpenAIでBase64形式の画像を生成
    const result = await openai.images.generate({
      model: CREATE_IMAGE_MODEL,
      prompt: text,
      n: 1,
      response_format: "b64_json",
      size: SIZE
    });
    
    if (!result.data[0].b64_json) {
      throw new Error('画像生成に失敗しました');
    }
    
    // Base64データをバッファに変換
    const imageBuffer = Buffer.from(result.data[0].b64_json, "base64");
    
    // S3に保存するためのユニークなファイル名を生成
    const fileName = `${randomUUID()}.png`;
    
    // S3にアップロード
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.IMAGES_BUCKET_NAME,
      Key: fileName,
      Body: imageBuffer,
      ContentType: 'image/png',
      ACL: 'public-read' // パブリックアクセス可能に設定
    }));
    
    // S3オブジェクトのURLを構築して返す
    return `https://${process.env.IMAGES_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
  } catch (error) {
    console.error('画像生成エラー:', error);
    throw error;
  }
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
          // ソースタイプごとに適切なchatIdを取得
          let chatId: string | undefined;
          if (ev.source) {
            switch (ev.source.type) {
              case 'user':
                chatId = ev.source.userId;
                break;
              case 'group':
                chatId = ev.source.groupId;
                break;
              case 'room':
                chatId = ev.source.roomId;
                break;
            }
          }

          // ローディング表示を開始
          if (chatId) {
            try {
              await clients.lineClient.showLoadingAnimation({
                chatId: chatId,
                loadingSeconds: 60 // 最大60秒
              });
            } catch (loadingError) {
              console.warn('ローディング表示エラー:', loadingError);
            }
          }

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