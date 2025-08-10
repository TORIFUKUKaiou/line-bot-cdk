import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { LineBotCdkStack } from '../lib/line-bot-cdk-stack';
import * as fs from 'fs';
import * as path from 'path';

// Test that the stack defines at least one Lambda function
// This ensures the LineBot construct is synthesized correctly

test('Stack has a Lambda function', () => {
  const app = new cdk.App();
  // Provide dummy environment variables so the stack can be instantiated
  process.env.CHANNEL_SECRET_PARAM_NAME = 'dummySecretParam';
  process.env.CHANNEL_ACCESS_TOKEN_PARAM_NAME = 'dummyAccessTokenParam';
  process.env.OPENAI_API_KEY_PARAM_NAME = 'dummyOpenAIApiKeyParam';
  process.env.EMAIL_ADDRESS = 'test@example.com';
  const stack = new LineBotCdkStack(app, 'TestStack');
  const template = Template.fromStack(stack);
  const functions = template.findResources('AWS::Lambda::Function');
  expect(Object.keys(functions).length).toBeGreaterThan(0);
});

test('Lambda function uses correct OpenAI model', () => {
  // Read the Lambda function source code
  const functionPath = path.join(__dirname, '../lib/line-bot-cdk.function.ts');
  const functionCode = fs.readFileSync(functionPath, 'utf8');
  
  // Verify that the MODEL_NAME is set to gpt-5-mini
  expect(functionCode).toContain('const MODEL_NAME = "gpt-5-mini";');
});
