# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template

---

# ChatGPT LINE Bot CDK

This project is a LINE bot built using [CDK](https://docs.aws.amazon.com/ja_jp/cdk/v2/guide/home.html) TypeScript. The Lambda function is written in TypeScript and integrates with OpenAI's [Chat](https://platform.openai.com/docs/api-reference/chat) API.

## Requirements

- [AWS Command Line Interface](https://docs.aws.amazon.com/ja_jp/cli/)
  - [Policies for bootstrapping](https://github.com/aws/aws-cdk/wiki/Security-And-Safety-Dev-Guide#policies-for-bootstrapping)
- Node.js >= 22
- [Install Node.js and programming language prerequisites](https://docs.aws.amazon.com/cdk/v2/guide/prerequisites.html#prerequisites-node)
- [AWS CDK CLI](https://docs.aws.amazon.com/ja_jp/cdk/v2/guide/getting_started.html#getting_started_install)

## Deployment Steps

### 1. Store Parameters in AWS Systems Manager Parameter Store

Store the required secrets securely in AWS Systems Manager Parameter Store:

```bash
# Store LINE Channel Secret
aws ssm put-parameter \
    --name "/line-bot/kuma/channelSecret" \
    --value "your-channelSecret" \
    --type "SecureString" \
    --overwrite

# Store LINE Channel Access Token
aws ssm put-parameter \
    --name "/line-bot/kuma/channelAccessToken" \
    --value "your-channelAccessToken" \
    --type "SecureString" \
    --overwrite

# Store OpenAI API Key
aws ssm put-parameter \
    --name "/line-bot/kuma/OpenAIAPIKEY" \
    --value "your-OPENAI_API_KEY" \
    --type "SecureString" \
    --overwrite
```

2. Set Environment Variables

```
export CHANNEL_SECRET_PARAM_NAME="/line-bot/kuma/channelSecret"
export CHANNEL_ACCESS_TOKEN_PARAM_NAME="/line-bot/kuma/channelAccessToken"
export OPENAI_API_KEY_PARAM_NAME="/line-bot/kuma/OpenAIAPIKEY"
```

3. Deploy the Stack

```bash
npm install       # Install dependencies
cdk bootstrap     # Bootstrap CDK environment (first time only)
npm run build     # Build TypeScript code
cdk synth         # Synthesize CloudFormation template
cdk deploy        # Deploy the stack to AWS
```

Happy building! 🚀  
Thank you for using this project! ⭐
