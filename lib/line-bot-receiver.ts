import { Context, APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda';
import * as line from '@line/bot-sdk';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const ssmClient = new SSMClient({ region: process.env.AWS_REGION });
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });
let cachedChannelSecret: string | undefined;

async function getChannelSecret(): Promise<string> {
  if (cachedChannelSecret) {
    return cachedChannelSecret;
  }
  const response = await ssmClient.send(
    new GetParameterCommand({
      Name: process.env.CHANNEL_SECRET_PARAM_NAME!,
      WithDecryption: true,
    })
  );
  if (!response.Parameter?.Value) {
    throw new Error(`Parameter ${process.env.CHANNEL_SECRET_PARAM_NAME} not found`);
  }
  cachedChannelSecret = response.Parameter.Value;
  return cachedChannelSecret;
}

function getRequestBody(event: APIGatewayEvent): string {
  if (!event.body) {
    throw new Error('Bad Request: No body');
  }
  return event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
}

function getLineSignature(headers: APIGatewayEvent['headers']): string | undefined {
  return headers['x-line-signature'] ?? headers['X-Line-Signature'];
}

export const handler = async (
  event: APIGatewayEvent,
  _context: Context
): Promise<APIGatewayProxyResult> => {
  try {
    const bodyText = getRequestBody(event);
    const channelSecret = await getChannelSecret();
    const signature = getLineSignature(event.headers);

    if (!signature || !line.validateSignature(bodyText, channelSecret, signature)) {
      return {
        statusCode: 401,
        body: 'Unauthorized',
      };
    }

    // Worker Lambda を非同期（Event）で呼び出す
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: process.env.WORKER_FUNCTION_NAME!,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ body: bodyText })),
      })
    );

    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error('Error handling LINE webhook in receiver', { error });
    const details = error instanceof Error ? error : new Error(String(error));
    return {
      statusCode: details.message.startsWith('Bad Request') ? 400 : 500,
      body: details.message,
    };
  }
};
