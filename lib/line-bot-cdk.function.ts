import { Context, APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda';
import * as line from '@line/bot-sdk'
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import OpenAI from "openai";

const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

async function getParameter(name: string): Promise<string> {
  const command = new GetParameterCommand({
    Name: name,
    WithDecryption: true
  });
  const response = await ssmClient.send(command);
  return response.Parameter?.Value || '';
}

let client: line.messagingApi.MessagingApiClient;
let channelSecret: string;
let openai: OpenAI;

const initialize = async () => {
  channelSecret = await getParameter(process.env.CHANNEL_SECRET_PARAM_NAME!);
  const channelAccessToken = await getParameter(process.env.CHANNEL_ACCESS_TOKEN_PARAM_NAME!);
  const openAIAPIKey = await getParameter(process.env.OPENAI_API_KEY_PARAM_NAME!);

  client = new line.messagingApi.MessagingApiClient({
    channelAccessToken: channelAccessToken,
  });

  openai = new OpenAI({ apiKey: openAIAPIKey });
};

const askOpenAI = async (text: string, openai: OpenAI): Promise<string> => {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
        { role: "system", content: "あなたは冗談がうまい犬です。名前はくまです。一言だけで笑いを取れます。最長で100文字まで返せます。犬だからと言って安易に「骨」の話はしません。" },
        {
            role: "user",
            content: text,
        },
    ],
    temperature: 1.1,
  });
  return completion.choices[0].message.content!;
}

export const handler = async (event: APIGatewayEvent, _context: Context): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    return { statusCode: 400, body: 'Bad Request: No body' };
  }

  await initialize();

  if (!line.validateSignature(event.body, channelSecret, event.headers['x-line-signature']!)) {
    return { statusCode: 400, body: 'Bad Request: Invalid signature' };
  }

  const body = JSON.parse(event.body);
  const events: line.WebhookEvent[] = body.events;

  for (const ev of events) {
    if (ev.type === 'message' && ev.message.type === 'text') {
      const message = ev.message.text;
      const replyToken = ev.replyToken;
      const reply = await askOpenAI(message, openai);
      await client.replyMessage({replyToken: replyToken, messages: [{ type: 'text', text: reply }]});
    }
  }

  return { statusCode: 200, body: 'OK' };
};