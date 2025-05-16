import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Runtime, FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda'
import { Duration, CfnOutput } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class LineBotCdk extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // S3バケットを作成
    const imagesBucket = new s3.Bucket(this, 'ImagesBucket', {
      publicReadAccess: true,  // パブリック読み取りアクセスを許可
      enforceSSL: true,  // HTTPSアクセスを強制
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false
      }),
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
      timeout: Duration.seconds(60),
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

    // S3バケットへの書き込み権限を付与
    const s3WritePolicy = new iam.PolicyStatement({
      actions: [
        's3:PutObject',
        's3:PutObjectAcl', // パブリックアクセス可能にするために必要
      ],
      effect: iam.Effect.ALLOW,
      resources: [
        `${imagesBucket.bucketArn}/*` // オブジェクトレベルの権限のみ必要
      ],
    });

    // Lambda関数にSSMへのアクセス権限を付与
    const lambdaRole = lineBotFunction.role as iam.Role;
    lambdaRole.addToPolicy(ssmRunCmdPolicy);
    lambdaRole.addToPolicy(s3WritePolicy); // S3アクセス権限を追加

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
  }
}