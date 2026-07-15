import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Runtime, FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda'
import { Duration, CfnOutput } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as path from 'path';

export class LineBotCdk extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // 必須環境変数のチェック
    const requiredEnvVars = [
      'CHANNEL_SECRET_PARAM_NAME',
      'CHANNEL_ACCESS_TOKEN_PARAM_NAME', 
      'SAKURA_AI_TOKEN_PARAM_NAME',
      'GEMINI_API_KEY_PARAM_NAME',
      'EMAIL_ADDRESS'
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Required environment variable ${envVar} is not set`);
      }
    }

    // S3バケットを作成
    const imagesBucket = new s3.Bucket(this, 'ImagesBucket', {
      publicReadAccess: false,  // パブリックアクセスを無効化
      enforceSSL: true,  // HTTPSアクセスを強制
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
      lifecycleRules: [
        {
          id: '7日経過後に削除',
          enabled: true,
          expiration: Duration.days(7),
        }
      ]
    });

    // Lambda関数用のロググループを作成
    const receiverLogGroup = new logs.LogGroup(this, 'ReceiverFunctionLogGroup', {
      retention: logs.RetentionDays.ONE_DAY,
    });

    const workerLogGroup = new logs.LogGroup(this, 'WorkerFunctionLogGroup', {
      retention: logs.RetentionDays.ONE_DAY,
    });

    const conversationMemoryTable = new dynamodb.Table(this, 'ConversationMemoryTable', {
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Worker Lambda関数を作成
    const workerFunction = new NodejsFunction(this, 'WorkerFunction', {
      runtime: Runtime.NODEJS_24_X,
      entry: path.join(__dirname, 'line-bot-worker.ts'),
      environment: {
        CHANNEL_ACCESS_TOKEN_PARAM_NAME: process.env.CHANNEL_ACCESS_TOKEN_PARAM_NAME || '',
        SAKURA_AI_TOKEN_PARAM_NAME: process.env.SAKURA_AI_TOKEN_PARAM_NAME || '',
        GEMINI_API_KEY_PARAM_NAME: process.env.GEMINI_API_KEY_PARAM_NAME || '',
        IMAGES_BUCKET_NAME: imagesBucket.bucketName,
        CONVERSATION_MEMORY_TABLE_NAME: conversationMemoryTable.tableName,
      },
      logGroup: workerLogGroup,
      timeout: Duration.seconds(180),
      memorySize: 256,
    });

    // Receiver Lambda関数を作成
    const receiverFunction = new NodejsFunction(this, 'ReceiverFunction', {
      runtime: Runtime.NODEJS_24_X,
      entry: path.join(__dirname, 'line-bot-receiver.ts'),
      environment: {
        CHANNEL_SECRET_PARAM_NAME: process.env.CHANNEL_SECRET_PARAM_NAME || '',
        WORKER_FUNCTION_NAME: workerFunction.functionName,
      },
      logGroup: receiverLogGroup,
      timeout: Duration.seconds(5),
      memorySize: 256,
    });

    // Receiver -> Worker の非同期呼び出し権限を付与
    workerFunction.grantInvoke(receiverFunction);

    // SSMへのアクセス権限を付与 (Receiver用: CHANNEL_SECRET のみ)
    const receiverSsmPolicy = new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      effect: iam.Effect.ALLOW,
      resources: [
        `arn:aws:ssm:*:*:parameter${process.env.CHANNEL_SECRET_PARAM_NAME}`,
      ],
    });
    const receiverRole = receiverFunction.role as iam.Role;
    receiverRole.addToPolicy(receiverSsmPolicy);

    // SSMへのアクセス権限を付与 (Worker用)
    const workerSsmPolicy = new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      effect: iam.Effect.ALLOW,
      resources: [
        `arn:aws:ssm:*:*:parameter${process.env.CHANNEL_ACCESS_TOKEN_PARAM_NAME}`,
        `arn:aws:ssm:*:*:parameter${process.env.SAKURA_AI_TOKEN_PARAM_NAME}`,
        `arn:aws:ssm:*:*:parameter${process.env.GEMINI_API_KEY_PARAM_NAME}`,
      ],
    });

    // S3バケットへの権限を付与 (Workerのみ)
    const s3Policy = new iam.PolicyStatement({
      actions: [
        's3:PutObject',
        's3:GetObject',
      ],
      effect: iam.Effect.ALLOW,
      resources: [
        `${imagesBucket.bucketArn}/*`
      ],
    });

    // Workerに権限を付与
    const workerRole = workerFunction.role as iam.Role;
    workerRole.addToPolicy(workerSsmPolicy);
    workerRole.addToPolicy(s3Policy);
    conversationMemoryTable.grantReadWriteData(workerFunction);

    // Lambda関数URLを有効化 (Receiverのみ)
    const functionUrl = receiverFunction.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
    });

    // Lambda関数URLを出力
    new CfnOutput(this, 'FunctionUrl', {
      value: functionUrl.url,
    });
    
    // S3バケットURLを出力
    new CfnOutput(this, 'ImagesBucketUrl', {
      value: `https://${imagesBucket.bucketDomainName}`,
    });

    new CfnOutput(this, 'ConversationMemoryTableName', {
      value: conversationMemoryTable.tableName,
    });

    // SNSトピックの作成
    const errorNotificationTopic = new sns.Topic(this, 'ErrorNotificationTopic', {
      displayName: 'Lambda Error Notifications',
    });

    // SNSトピックにメールサブスクリプションを追加
    errorNotificationTopic.addSubscription(
      new subscriptions.EmailSubscription(process.env.EMAIL_ADDRESS || '')
    );

    // CloudWatchアラームの作成
    const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      metric: workerFunction.metricErrors(), // Lambda関数のエラーメトリクス
      threshold: 1, // エラーが1回以上発生した場合にアラームを発動
      evaluationPeriods: 1, // 1つの評価期間でアラームを発動
      alarmDescription: 'Alarm for Lambda function errors',
    });

    lambdaErrorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(errorNotificationTopic));

    // AI APIエラー用メトリクスフィルター（既存のメトリクス名・IDを維持）
    const aiErrorMetricFilter = new logs.MetricFilter(this, 'OpenAIErrorMetricFilter', {
      logGroup: workerFunction.logGroup,
      metricNamespace: 'LineBot/OpenAI',
      metricName: 'OpenAIErrors',
      filterPattern: logs.FilterPattern.literal('"[AI_ERROR]"'),
      metricValue: '1',
      defaultValue: 0
    });

    // AI APIエラーアラーム（既存のアラームIDを維持）
    const aiErrorAlarm = new cloudwatch.Alarm(this, 'OpenAIErrorAlarm', {
      metric: aiErrorMetricFilter.metric({
        statistic: 'Sum',
        period: Duration.minutes(5)
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Alarm for AI API errors (Sakura AI & Gemini)',
    });

    aiErrorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(errorNotificationTopic));

    // SNSトピックARNを出力
    new CfnOutput(this, 'ErrorNotificationTopicArn', {
      value: errorNotificationTopic.topicArn,
    });
  }
}
