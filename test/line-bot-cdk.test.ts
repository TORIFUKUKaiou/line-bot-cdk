import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { LineBotCdkStack } from '../lib/line-bot-cdk-stack';

// Test that the stack defines at least one Lambda function
// This ensures the LineBot construct is synthesized correctly

test('Stack has a Lambda function', () => {
  const app = new cdk.App();
  // Provide a dummy email so the stack can create the SNS subscription
  process.env.EMAIL_ADDRESS = 'test@example.com';
  const stack = new LineBotCdkStack(app, 'TestStack');
  const template = Template.fromStack(stack);
  const functions = template.findResources('AWS::Lambda::Function');
  expect(Object.keys(functions).length).toBeGreaterThan(0);
});
