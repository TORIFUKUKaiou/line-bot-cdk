import { Context, APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda';
import * as line from '@line/bot-sdk'
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import OpenAI from "openai";
import { randomUUID } from 'crypto';

const SYSTEM_PROMPT = "あなたは冗談がうまい犬です。名前はくまです。一言だけで笑いを取れます。最長で400文字まで返せます。犬だからといって安易に「骨」の話はしません。";
const MODEL_NAME = "gpt-4.1";
const CREATE_IMAGE_MODEL = "dall-e-2"
const SIZE = "256x256"

const IMAGE_DETECT_PROMPT =
  "ユーザーが画像生成を望んでいるかだけを yes か no で答えてください。";

async function isImageRequest(
  text: string,
  openai: OpenAI
): Promise<boolean> {
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: IMAGE_DETECT_PROMPT },
        { role: "user", content: text }
      ],
      temperature: 0,
    });
    if (!completion.choices?.length) {
      console.warn("Unexpected OpenAI response", completion);
      return false;
    }
    const msg = completion.choices[0].message;
    const content = msg && "content" in msg ? msg.content : undefined;
    const answer = content ?? "";
    return /^\s*yes\s*$/i.test(answer) || /^\s*はい\s*$/.test(answer);
  } catch (error) {
    console.error("isImageRequest error:", error);
    return false;
  }
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
    temperature: 1.2,
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
    
    // S3にアップロード - ACLパラメータを削除
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.IMAGES_BUCKET_NAME,
      Key: fileName,
      Body: imageBuffer,
      ContentType: 'image/png'
    }));
    
    // 署名付きURLを生成（有効期限7日）
    const command = new GetObjectCommand({
      Bucket: process.env.IMAGES_BUCKET_NAME,
      Key: fileName
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 60 * 60 * 24 * 7 });
    
    // 署名付きURLを返す
    return url;
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
        if (await isImageRequest(ev.message.text, clients.openaiClient)) {
          try {
            const url = await generateImages(ev.message.text, clients.openaiClient);
            await clients.lineClient.replyMessage({
              replyToken: ev.replyToken,
              messages: [{ type: 'image', originalContentUrl: url, previewImageUrl: url }]
            });
          } catch (error: any) {
            await clients.lineClient.replyMessage({
              replyToken: ev.replyToken,
              messages: [{ type: 'text', text: `画像生成に失敗しました: ${error.message}` }]
            });
          }
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