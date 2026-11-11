---
name: gemini-image-model-check
description: 「画像生成モデルが最新・最安・最速か確認して」「Geminiの画像生成モデルを見直して」「もっと安くて新しい画像生成モデルがあれば乗り換えて」などの依頼で、現在の CREATE_IMAGE_MODEL と Gemini API の公開モデル・料金を比較して報告し、必要な場合のみモデル更新を行う。
---

# Gemini 画像生成モデル点検・更新スキル

LINE bot「くま画伯」の画像生成機能で使っている Gemini モデルが、現行の公開モデルの中で「最新・最安・最速」かを点検し、料金比較を報告するスキルです。

## 判断基準（くま画伯の要件）

- 家庭内の少量トラフィック向けのため、**低コスト（1K 解像度 1枚あたりの料金が最安）** と **低レイテンシ（高速応答）** を最優先とする。
- 2K / 4K などの超高解像度や複雑なマルチターン編集よりも、`1K`（1024×1024 相当）での 1 枚絵生成のコストパフォーマンスを重視する。
- **すでに最新・最安・最速のモデルを使っている場合は、何も変更しない（PR も作らない）。**

## 手順

### 1. 現在の設定と履歴の確認
1. `lib/prompts.ts` の `CREATE_IMAGE_MODEL` と `IMAGE_SIZE` を確認する。
2. `lib/line-bot-worker.ts` の `generateImages` 関数で、エンドポイント（`:generateContent`）やリクエスト形式（`responseModalities: ['Image']`, `imageConfig.imageSize`）を確認する。
3. `git log -p -n 5 lib/prompts.ts` で直近のモデル変更履歴を確認する。

### 2. Gemini API 公開モデルと料金の調査
`ai.google.dev`（Gemini API 公式ドキュメントの Models / Pricing ページ等）を検索し、現在公開されているネイティブ画像生成モデル（Nano Banana シリーズ等）を調査する。

以下の項目を揃えた比較表を作成する：
- **モデルID**（例: `gemini-3.1-flash-lite-image`, `gemini-3.1-flash-image`, `gemini-3-pro-image` 等）
- **位置づけ・特徴**（Lite / Flash 標準 / Pro 上位、プレビューか GA か、廃止予定の有無）
- **テキスト入力料金**（1M tokens あたり）
- **画像出力トークン単価**（1M tokens あたり）
- **1K 画像 1 枚あたりの料金目安**（消費トークン数と `$` 換算）
- **備考**（対応解像度やレイテンシの特徴）

### 3. 報告とアクション
- **現在のモデルがすでに最新・最安・最速の場合**:
  - 現在のモデル名と上記の料金比較表をユーザーに報告し、「現行モデルが最安・最速のため変更不要」と伝えて完了する。
- **より新しく安価・高速なモデルが存在する場合**:
  - まず現在のモデルと新候補の料金・仕様比較を報告する。
  - コード変更・PR 作成まで進める場合は、リポジトリの `AGENTS.md` に従う：
    1. `agent-worktrees/<トピック名>` に worktree と作業ブランチを作成する。
    2. `lib/prompts.ts` の `CREATE_IMAGE_MODEL`（および関連テストや `README.md` に記載があれば該当箇所）を更新する。
    3. Worktree で DevContainer を立ち上げ（`devcontainer up`）、コンテナ内で `npm test` と `npx cdk synth` を実行して検証する（検証後は作成したコンテナ・イメージを削除する）。
    4. `docs/plans/<トピック名>/` に `implementation_plan.md` と `walkthrough.md` を記録し、ファイルを個別指定してステージング・コミットする。
    5. Push・PR 作成前に `git status` と `git diff origin/main...` を提示してユーザーの承認を得る。
