import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Runtime, FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda'
import { Duration, CfnOutput } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';

export class LineBotCdk extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // 必須環境変数のチェック
    const requiredEnvVars = [
      'CHANNEL_SECRET_PARAM_NAME',
      'CHANNEL_ACCESS_TOKEN_PARAM_NAME', 
      'OPENAI_API_KEY_PARAM_NAME',
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

    // Lambda関数を作成
    const lineBotFunction = new NodejsFunction(this, 'function', {
      runtime: Runtime.NODEJS_22_X,
      environment: {
        CHANNEL_SECRET_PARAM_NAME: process.env.CHANNEL_SECRET_PARAM_NAME || '',
        CHANNEL_ACCESS_TOKEN_PARAM_NAME: process.env.CHANNEL_ACCESS_TOKEN_PARAM_NAME || '',
        OPENAI_API_KEY_PARAM_NAME: process.env.OPENAI_API_KEY_PARAM_NAME || '',
        IMAGES_BUCKET_NAME: imagesBucket.bucketName, // バケット名を環境変数に追加
      },
      logRetention: logs.RetentionDays.ONE_DAY,
      timeout: Duration.seconds(180), // 60秒から180秒に延長
      memorySize: 256, // メモリを256MBに設定
    });

    // SSMへのアクセス権限を付与
    const ssmRunCmdPolicy = new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      effect: iam.Effect.ALLOW,
      resources: [
        `arn:aws:ssm:*:*:parameter${process.env.CHANNEL_SECRET_PARAM_NAME}`,
        `arn:aws:ssm:*:*:parameter${process.env.CHANNEL_ACCESS_TOKEN_PARAM_NAME}`,
        `arn:aws:ssm:*:*:parameter${process.env.OPENAI_API_KEY_PARAM_NAME}`,
      ],
    });

    // S3バケットへの権限を付与
    const s3Policy = new iam.PolicyStatement({
      actions: [
        's3:PutObject',
        's3:GetObject',  // 署名付きURL生成のため必要
      ],
      effect: iam.Effect.ALLOW,
      resources: [
        `${imagesBucket.bucketArn}/*`
      ],
    });

    // Lambda関数にSSMへのアクセス権限を付与
    const lambdaRole = lineBotFunction.role as iam.Role;
    lambdaRole.addToPolicy(ssmRunCmdPolicy);
    lambdaRole.addToPolicy(s3Policy);

    // Lambda関数URLを有効化
    const functionUrl = lineBotFunction.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE, // 認証なしでアクセス可能
    });

    // Lambda関数URLを出力
    new CfnOutput(this, 'FunctionUrl', {
      value: functionUrl.url,
    });
    
    // S3バケットURLを出力
    new CfnOutput(this, 'ImagesBucketUrl', {
      value: `https://${imagesBucket.bucketDomainName}`,
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
      metric: lineBotFunction.metricErrors(), // Lambda関数のエラーメトリクス
      threshold: 1, // エラーが1回以上発生した場合にアラームを発動
      evaluationPeriods: 1, // 1つの評価期間でアラームを発動
      alarmDescription: 'Alarm for Lambda function errors',
    });

    lambdaErrorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(errorNotificationTopic));

    // OpenAI APIエラー用メトリクスフィルター（コスト0）
    const openaiErrorMetricFilter = new logs.MetricFilter(this, 'OpenAIErrorMetricFilter', {
      logGroup: lineBotFunction.logGroup,
      metricNamespace: 'LineBot/OpenAI',
      metricName: 'OpenAIErrors',
      filterPattern: logs.FilterPattern.literal('"[OPENAI_ERROR]"'),
      metricValue: '1',
      defaultValue: 0
    });

    // OpenAI APIエラーアラーム（メトリクスフィルター使用）
    const openaiErrorAlarm = new cloudwatch.Alarm(this, 'OpenAIErrorAlarm', {
      metric: openaiErrorMetricFilter.metric({
        statistic: 'Sum',
        period: Duration.minutes(5)
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Alarm for OpenAI API errors (Chat & Image)',
    });

    openaiErrorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(errorNotificationTopic));

    // SNSトピックARNを出力
    new CfnOutput(this, 'ErrorNotificationTopicArn', {
      value: errorNotificationTopic.topicArn,
    });
  }
}