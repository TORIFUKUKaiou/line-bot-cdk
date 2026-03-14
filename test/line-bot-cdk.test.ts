import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { LineBotCdkStack } from '../lib/line-bot-cdk-stack';

// Test that the stack defines at least one Lambda function
// This ensures the LineBot construct is synthesized correctly

test('Stack has a Lambda function and conversation memory table', () => {
  const app = new cdk.App();
  // Provide dummy environment variables so the stack can be instantiated
  process.env.CHANNEL_SECRET_PARAM_NAME = 'dummySecretParam';
  process.env.CHANNEL_ACCESS_TOKEN_PARAM_NAME = 'dummyAccessTokenParam';
  process.env.OPENAI_API_KEY_PARAM_NAME = 'dummyOpenAIApiKeyParam';
  process.env.EMAIL_ADDRESS = 'test@example.com';
  const stack = new LineBotCdkStack(app, 'TestStack');
  const template = Template.fromStack(stack);
  const functions = template.findResources('AWS::Lambda::Function');
  const tables = template.findResources('AWS::DynamoDB::Table');
  expect(Object.keys(functions).length).toBeGreaterThan(0);
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

  template.hasResourceProperties('AWS::Lambda::Function', {
    Environment: {
      Variables: Match.objectLike({
        CONVERSATION_MEMORY_TABLE_NAME: Match.anyValue(),
      }),
    },
  });
});
