import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Runtime, FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda'
import { Duration, CfnOutput } from 'aws-cdk-lib';
  
export class LineBotCdk extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // ロググループを作成(保持期間を1日に設定)
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      retention: logs.RetentionDays.ONE_DAY,
    });

    // Lambda関数を作成
    const lineBotFunction = new NodejsFunction(this, 'function', {
      runtime: Runtime.NODEJS_22_X,
      logGroup: logGroup,
      timeout: Duration.seconds(30),
    });

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