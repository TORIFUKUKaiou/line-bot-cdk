# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

- `npm run build` — Compile TypeScript (`tsc`).
- `npm run test` — Run all Jest tests.
- `npx jest test/memory.test.ts` — Run a single test file.
- `npm run watch` — Run TypeScript compiler in watch mode.
- `npx cdk synth` — Synthesize the CloudFormation template.
- `npx cdk deploy` — Deploy the stack.
- `npx cdk bootstrap` — Bootstrap the AWS account/region (required once before first deploy).

## Architecture

This is an AWS CDK project that deploys a LINE bot named "Kuma" using a **Receiver + Worker** Lambda architecture.

- `bin/line-bot-cdk.ts` instantiates the CDK `App` and `LineBotCdkStack`.
- `lib/line-bot-cdk-stack.ts` is a thin Stack wrapper.
- `lib/line-bot-cdk.ts` (the `LineBotCdk` Construct) defines the actual AWS resources.

### Receiver/Worker Split

- **Receiver Lambda** (`lib/line-bot-receiver.ts`):
  - Exposed via a **Lambda Function URL** (no API Gateway).
  - Validates the LINE webhook signature using the channel secret from SSM Parameter Store.
  - Invokes the Worker Lambda **asynchronously** (`InvocationType: Event`).
  - Returns `200 OK` to LINE immediately.
  - Timeout: 5 seconds.

- **Worker Lambda** (`lib/line-bot-worker.ts`):
  - Processes the actual LINE message events.
  - Calls the さくらのAI API (`https://api.ai.sakura.ad.jp/v1`) for text replies using `llm-jp-3.1-8x13b-instruct4`.
  - Calls the **Gemini Image Generation API** (`gemini-3.1-flash-lite-image`) for image requests.
  - Reads from and writes to **DynamoDB** for short conversation memory.
  - Uploads generated images to **S3** (7-day lifecycle rule).
  - Timeout: 180 seconds.

### Conversation Memory (DynamoDB)

- Single table: `ConversationMemory`.
- Partition key: `pk` (string).
- Records:
  - `USER#<lineUserId>` for per-user context.
  - `CTX#GROUP#<groupId>` or `CTX#ROOM#<roomId>` for group/room shared context.
- Attributes: `profile_summary`, `recent_summary`, `open_loops`, `updated_at`.
- Size limits are strictly enforced in `lib/memory.ts` and `lib/types.ts`:
  - `profile_summary`: 120 chars
  - `recent_summary`: 160 chars
  - `open_loops`: max 3 items, 30 chars each
- The AI summarizes each turn into this compact schema instead of storing full history.

### Secrets Management

- All secrets (LINE channel secret/access token, さくらのAI API key, Gemini API key) are stored in **SSM Parameter Store** as `SecureString`.
- Lambda retrieves them at runtime via `ssm:GetParameter`.
- The Receiver only accesses `CHANNEL_SECRET`; the Worker accesses `CHANNEL_ACCESS_TOKEN`, `SAKURA_API_KEY`, and `GEMINI_API_KEY`.
- Client instances (SSM, LINE SDK, OpenAI) are cached in the Lambda execution context to reduce repeated SSM calls.

### Error Monitoring

- CloudWatch Alarm on Worker Lambda errors.
- CloudWatch Metric Filter on `"[OPENAI_ERROR]"` logs from the Worker.
- Both route to an **SNS topic** with email subscription (`EMAIL_ADDRESS`).

## Environment Variables

The following must be set in the shell before running `cdk synth` or `cdk deploy`:

- `CHANNEL_SECRET_PARAM_NAME`
- `CHANNEL_ACCESS_TOKEN_PARAM_NAME`
- `SAKURA_API_KEY_PARAM_NAME`
- `GEMINI_API_KEY_PARAM_NAME`
- `EMAIL_ADDRESS`

## Testing

Tests use **Jest** with `ts-jest`. Tests are located in `test/`.

- `test/line-bot-cdk.test.ts` verifies the CDK stack synthesizes with the expected resources (2 Lambdas, 1 DynamoDB table, etc.).
- `test/memory.test.ts` verifies size clamping logic for conversation memory.
- `test/prompts.test.ts` verifies prompt construction for reply and summary inputs.

Tests that instantiate the CDK stack require the deploy-time environment variables to be present (the test file sets dummy values internally).

## CI/CD

GitHub Actions workflows are in `.github/workflows/`:

- `test.yml`: Runs `npm test` on every push and pull request.
- `deploy.yml`: Runs `cdk synth` and `cdk deploy` on pushes to `main`. It skips deploys for Dependabot commits. It uses AWS OIDC (`secrets.AWS_OIDC_ROLE_ARN`) and repository variables for environment configuration.

## Notes

- Lambda runtime is **Node.js 24** (`Runtime.NODEJS_24_X`).
- The project uses `aws-cdk-lib/aws-lambda-nodejs.NodejsFunction`, which bundles handler code with **esbuild** automatically.
- The deploy workflow assumes `cdk bootstrap` has already been run in the target AWS environment.
