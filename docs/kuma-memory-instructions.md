# Codex Instruction: Add Low-Cost Conversation Memory to Kuma LINE Bot

You are a coding agent running in Codex CLI.

## Goal

Extend the existing LINE bot so that it can reflect previous conversation context in replies without breaking the current character, architecture, or cost profile.

This is not a greenfield build.
This repository already contains a working AWS CDK project for a LINE bot named "くま".

The implementation must preserve:

- Kuma's existing persona
- the current Lambda Function URL based webhook design
- the existing image generation capability
- minimal infrastructure
- minimal runtime cost
- minimal complexity
- maintainability

This bot is used only by family members and receives about 10 messages per day.

Do not add unnecessary components.

## Current Project Context

The current project already has:

- LINE Messaging API webhook handling in AWS Lambda
- Lambda Function URL as the public webhook endpoint
- AWS CDK in TypeScript
- OpenAI text response generation
- OpenAI image generation
- S3 for storing generated images and returning pre-signed URLs
- SSM Parameter Store for secret retrieval at runtime
- CloudWatch Logs, metric filters, alarms, and SNS email notifications

Do not replace these with a larger architecture.

In particular:

- Keep Lambda Function URL
- Do not add API Gateway
- Do not remove S3, because image generation is already part of Kuma's identity
- Keep SSM Parameter Store based secret management

## Non-Negotiable Character Rules

Kuma is not a generic assistant.

Kuma must remain:

- a dog named "くま"
- good at jokes
- good at drawing
- known as "くま画伯"
- warm, playful, and concise in Japanese

Preserve the existing world view:

- Kuma naturally speaks as the same character as today
- Kuma can make short funny remarks
- Kuma can talk naturally about drawing and art
- Kuma should not overuse cheap "dog" jokes such as repeating bone references
- Kuma should not become overly formal, robotic, or explanatory
- Replies should stay short and natural

Conversation memory exists to help Kuma continue the relationship naturally.
It must not flatten Kuma's personality.

## System Architecture

Build on the existing architecture:

LINE Messaging API
↓
Lambda Function URL
↓
AWS Lambda (Node.js / TypeScript)
├─ DynamoDB (short conversation memory)
├─ OpenAI API (reply generation and summary update)
└─ OpenAI Images API -> S3 -> pre-signed URL (existing image flow)

Supporting services already in use:

- SSM Parameter Store for secrets
- CloudWatch Logs / alarms
- SNS for error notifications

## Important Constraints

- Add only one new persistent component: DynamoDB for memory
- No vector database
- No RAG
- No OpenSearch
- No SQS
- No Step Functions
- No Redis
- No second Lambda unless truly necessary
- No external frameworks
- No long transcript storage
- No message-by-message archival
- No full conversation history in prompts

Store only a short conversation summary per user.

Cost control is critical.
The memory design must stay small and cheap.

## Cost Priorities

Prefer the cheapest design that still works reliably.

Guidelines:

- Use one DynamoDB table with on-demand billing
- No GSI unless absolutely necessary
- No DynamoDB streams
- No TTL-based event workflows
- Keep each item very small
- Keep prompts short
- Reuse the existing small text model for summarization unless there is a strong reason not to
- Do not add extra OpenAI calls beyond what is necessary

If the current image-request detection logic can be simplified without harming behavior, prefer a simple deterministic check over an additional model call.
The new memory feature should not trigger a large cost increase.

## DynamoDB Design

Table name:

`ConversationMemory`

Partition key:

`pk` (string)

Example value:

`USER#<lineUserId>`

Attributes:

- `profile_summary` (string)
- `recent_summary` (string)
- `open_loops` (string[])
- `updated_at` (string)

Definitions:

`profile_summary`
Stable facts about the user that are helpful across conversations.
Examples: preferences, family context, recurring interests, favorite topics.

`recent_summary`
Short summary of the recent conversation context.
Keep it compact.

`open_loops`
Unresolved topics that may continue later.
Keep this list short, ideally 0 to 3 items.

`updated_at`
ISO8601 timestamp.

Memory size limits are mandatory for cost control.

Apply these targets:

- `profile_summary`: target 120 Japanese characters max
- `recent_summary`: target 160 Japanese characters max
- `open_loops`: at most 3 items, each preferably under 30 Japanese characters

If needed, truncate or compress aggressively.
Do not allow memory to grow over time.

Do not store:

- raw full transcripts
- every user message
- every assistant response
- embeddings
- large prompt caches

## Message Flow

1. Receive LINE webhook through the existing Lambda Function URL.

2. Validate the LINE signature.

3. Parse the webhook body and extract text messages.

4. Ignore non-text messages.

5. Extract `lineUserId`.

6. Read memory from DynamoDB using `USER#<lineUserId>`.

7. If memory does not exist, use empty memory:

```json
{
  "profile_summary": "",
  "recent_summary": "",
  "open_loops": []
}
```

8. If DynamoDB read fails, log the error and continue with empty memory.

9. Generate the assistant response using OpenAI with:

- the existing Kuma persona
- profile summary
- recent summary
- open loops
- current user message

10. Keep the existing image behavior.

If the message is an image-generation request:

- preserve Kuma's drawing persona
- keep using the existing image generation path
- keep storing generated images in S3
- do not remove the pre-signed URL response flow

11. Send the reply to LINE first.

12. After a successful reply attempt, update memory using a short OpenAI summarization step.

Provide to the summarization step:

- previous memory
- user message
- assistant reply, or a short description of the image response

13. The summary step must return JSON only:

```json
{
  "profile_summary": "...",
  "recent_summary": "...",
  "open_loops": ["...", "..."]
}
```

14. Enforce memory size limits in code before saving.

This is required even if the model was already instructed about the limits.
Trim, compress, and cap the fields before writing to DynamoDB so memory cannot gradually expand over time.

15. Save the updated memory back to DynamoDB.

16. If memory update fails, log it and continue.
The user reply must not fail because memory saving failed.

17. If `lineUserId` is unavailable, reply normally without memory rather than failing the request.

## Prompt Requirements

### Reply Generation Prompt

The reply prompt must:

- preserve Kuma's current persona and tone
- produce friendly Japanese replies
- stay short
- use memory naturally
- not invent facts that are not in memory or the current message
- continue previous topics naturally when relevant
- avoid exposing raw memory fields to the user
- avoid sounding like a system prompt
- remain compatible with both normal chat and Kuma's drawing identity

The prompt should reflect that Kuma:

- is witty
- is a dog
- is a painter
- is "くま画伯"
- can make small jokes naturally
- should not become generic

### Summary Prompt

The summary prompt must:

- return JSON only
- include `profile_summary`
- include `recent_summary`
- include `open_loops`
- avoid speculation
- keep text short
- retain only useful long-lived user facts
- overwrite stale recent context with a compact fresh summary
- drop resolved open loops
- keep `profile_summary` within about 120 Japanese characters
- keep `recent_summary` within about 160 Japanese characters
- keep `open_loops` to at most 3 short items, each preferably under 30 Japanese characters
- compress aggressively when needed instead of appending endlessly

The summary output should be conservative.
Do not guess new facts about the user.
Do not allow memory fields to drift upward in length over time.

## Code Structure

Preserve the current project layout unless a small refactor clearly reduces complexity.

Current important files:

- `lib/line-bot-cdk.ts`
- `lib/line-bot-cdk.function.ts`
- `lib/line-bot-cdk-stack.ts`

Preferred approach:

- keep `lib/line-bot-cdk.function.ts` as the Lambda entrypoint
- add small helper modules under `lib/` only if they simplify the code
- keep the CDK stack minimal

Reasonable helper files if needed:

- `lib/memory.ts`
- `lib/prompts.ts`
- `lib/types.ts`

Do not perform a large folder migration just to match a greenfield layout.

## Environment Variables

Do not switch this project to raw secret environment variables.
The current design retrieves secrets from SSM Parameter Store by name, and that should remain.

Keep the current environment variables:

- `CHANNEL_SECRET_PARAM_NAME`
- `CHANNEL_ACCESS_TOKEN_PARAM_NAME`
- `OPENAI_API_KEY_PARAM_NAME`
- `IMAGES_BUCKET_NAME`

Add only the minimum new non-secret variable needed for memory:

- `CONVERSATION_MEMORY_TABLE_NAME`

If model names are configurable, keep the configuration minimal.
Do not introduce unnecessary environment variables.

## Error Handling

Invalid LINE signature:

- return HTTP 401

OpenAI reply failure:

- return a short Japanese fallback reply
- keep the fallback simple
- do not expose internal errors

DynamoDB read failure:

- log error
- use empty memory

DynamoDB write failure:

- log error
- continue without failing the user reply

Summary generation failure:

- log error
- skip memory update

Malformed summary JSON:

- log error
- skip memory update

## Infrastructure

Provide a minimal AWS CDK update.

Keep existing resources:

- Lambda
- Lambda Function URL
- S3 bucket for generated images
- CloudWatch log group
- metric filter and alarms
- SNS topic / email notification

Add only:

- one DynamoDB table for conversation memory
- minimum IAM permissions for DynamoDB read/write access from Lambda
- the table name as a Lambda environment variable

DynamoDB settings should stay minimal:

- partition key only
- on-demand billing
- no GSI
- no streams
- no extra indexes

## Documentation Updates

Update project documentation to reflect the new memory feature.

README should include:

- updated architecture diagram using Lambda Function URL, not API Gateway
- required environment variables
- SSM Parameter Store usage
- deployment steps
- LINE webhook setup using the Lambda Function URL
- DynamoDB schema
- memory design explanation
- how Kuma's persona is preserved while using short memory
- image generation path
- future improvements

## Acceptance Criteria

The work is complete when:

1. A LINE text message triggers a bot response through the existing Lambda Function URL.
2. Kuma can reflect recent conversation context in a natural way.
3. Kuma's established persona is still clearly intact.
4. Image generation still works.
5. DynamoDB stores one short memory item per LINE user.
6. The system does not store full transcripts.
7. CDK deploy still works.
8. Infrastructure remains minimal.
9. Runtime cost stays low.

## Important

Prefer simple solutions over complex ones.

The goal is not to build a sophisticated memory platform.
The goal is to extend the existing low-cost family bot so that Kuma can remember just enough to feel continuous, while staying the same funny, art-loving dog as before.
