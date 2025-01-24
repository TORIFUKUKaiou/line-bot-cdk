import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Runtime, FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda'
import { Duration, CfnOutput } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';

export class LineBotCdk extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Lambda関数を作成
    const lineBotFunction = new NodejsFunction(this, 'function', {
      runtime: Runtime.NODEJS_22_X,
      environment: {
        CHANNEL_SECRET_PARAM_NAME: process.env.CHANNEL_SECRET_PARAM_NAME || '',
        CHANNEL_ACCESS_TOKEN_PARAM_NAME: process.env.CHANNEL_ACCESS_TOKEN_PARAM_NAME || '',
      },
      logRetention: logs.RetentionDays.ONE_DAY,
      timeout: Duration.seconds(30),
    });

    // SSMへのアクセス権限を付与
    const ssmRunCmdPolicy = new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      effect: iam.Effect.ALLOW,
      resources: [
        `arn:aws:ssm:*:*:parameter${process.env.CHANNEL_SECRET_PARAM_NAME}`,
        `arn:aws:ssm:*:*:parameter${process.env.CHANNEL_ACCESS_TOKEN_PARAM_NAME}`,
      ],
    });

    // Lambda関数にSSMへのアクセス権限を付与
    const lambdaRole = lineBotFunction.role as iam.Role;
    lambdaRole.addToPolicy(ssmRunCmdPolicy);

    // Lambda関数URLを有効化
    const functionUrl = lineBotFunction.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE, // 認証なしでアクセス可能
    });

    // Lambda関数URLを出力
    new CfnOutput(this, 'FunctionUrl', {
      value: functionUrl.url,
    });
  }
}