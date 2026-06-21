import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { LineBotCdkStack } from '../lib/line-bot-cdk-stack';

// Test that the stack defines the Lambda functions and DynamoDB table
// This ensures the LineBot construct is synthesized correctly with Receiver/Worker architecture

test('Stack has Receiver/Worker Lambda functions and conversation memory table', () => {
  const app = new cdk.App();
  // Provide dummy environment variables so the stack can be instantiated
  process.env.CHANNEL_SECRET_PARAM_NAME = 'dummySecretParam';
  process.env.CHANNEL_ACCESS_TOKEN_PARAM_NAME = 'dummyAccessTokenParam';
  process.env.OPENAI_API_KEY_PARAM_NAME = 'dummyOpenAIApiKeyParam';
  process.env.GEMINI_API_KEY_PARAM_NAME = 'dummyGeminiApiKeyParam';
  process.env.EMAIL_ADDRESS = 'test@example.com';
  const stack = new LineBotCdkStack(app, 'TestStack');
  const template = Template.fromStack(stack);
  const functions = template.findResources('AWS::Lambda::Function');
  const tables = template.findResources('AWS::DynamoDB::Table');
  expect(Object.keys(functions).length).toBe(2); // Receiver と Worker の2つ
  expect(Object.keys(tables).length).toBe(1);

  template.hasResourceProperties('AWS::DynamoDB::Table', {
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      {
        AttributeName: 'pk',
        AttributeType: 'S',
      },
    ],
    KeySchema: [
      {
        AttributeName: 'pk',
        KeyType: 'HASH',
      },
    ],
  });

  // Receiver Lambda の検証
  template.hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'index.handler',
    Timeout: 5,
    Environment: {
      Variables: Match.objectLike({
        CHANNEL_SECRET_PARAM_NAME: 'dummySecretParam',
        WORKER_FUNCTION_NAME: Match.anyValue(),
      }),
    },
  });

  // Worker Lambda の検証
  template.hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'index.handler',
    Timeout: 180,
    Environment: {
      Variables: Match.objectLike({
        CHANNEL_ACCESS_TOKEN_PARAM_NAME: 'dummyAccessTokenParam',
        OPENAI_API_KEY_PARAM_NAME: 'dummyOpenAIApiKeyParam',
        GEMINI_API_KEY_PARAM_NAME: 'dummyGeminiApiKeyParam',
        CONVERSATION_MEMORY_TABLE_NAME: Match.anyValue(),
      }),
    },
  });
});
