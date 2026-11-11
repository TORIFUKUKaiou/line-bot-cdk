# Gemini 画像生成モデル点検スキル（`gemini-image-model-check`）追加計画

## Goal Description

現在使用している Gemini 画像生成モデル（`CREATE_IMAGE_MODEL`）の確認と、Gemini API で公開されている候補モデルとの最新・最安・最速の比較（特に 1K 画像 1 枚あたりの料金比較）の手順を、このプロジェクト専用のスキルとして残します。

- **配置場所**: リポジトリルートの `.agents/skills/gemini-image-model-check/SKILL.md`
  - Antigravity (`agy`) の Workspace Customizations 仕様により、リポジトリルートの `.agents/skills/<name>/SKILL.md` に配置することで、このプロジェクトを開いた際に `agy` から自動で認識・利用可能になります（グローバル環境は汚しません）。
- **`AGENTS.md` ルールへの準拠**:
  - 作業は `agent-worktrees/gemini-image-model-check-skill`（ブランチ: `feat/add-gemini-image-model-check-skill`）の worktree 上で行います。
  - 設計経緯を残すため、実装計画書とウォークスルーをリポジトリ内の `docs/plans/gemini-image-model-check-skill/` 配下に保存して Git 管理に含めます。
  - Worktree ブランチ上でファイルを個別指定してコミットし、push・PR 作成前に `git status` / `git diff origin/main...` を提示して承認を得ます。

---

## Proposed Changes

### 1. プロジェクトスキル（`.agents/skills/`）の追加

#### [NEW] `.agents/skills/gemini-image-model-check/SKILL.md`
- 現在の `lib/prompts.ts`（`CREATE_IMAGE_MODEL`, `IMAGE_SIZE`）および `lib/line-bot-worker.ts`（`generateImages`）の確認手順
- `ai.google.dev` 公式ドキュメントを用いた Gemini 画像生成モデルの料金・仕様比較表の作成手順
- 最新・最安・最速であれば変更不要として報告して終える判断基準、および更新が必要な場合の worktree + DevContainer 検証手順

### 2. 設計経緯ドキュメントの保存

#### [NEW] `docs/plans/gemini-image-model-check-skill/implementation_plan.md`
- 本実装計画書

#### [NEW] `docs/plans/gemini-image-model-check-skill/walkthrough.md`
- 実装結果および確認内容のウォークスルー

---

## Verification Plan

1. `.agents/skills/gemini-image-model-check/SKILL.md` の YAML フロントマター（`name`, `description`）が Antigravity のスキル仕様に適合していることを確認
2. `docs/plans/gemini-image-model-check-skill/` 配下に計画書とウォークスルーが配置されていることを確認
3. Worktree 内でファイルを個別指定してコミットし、`git status` と `git diff origin/main...feat/add-gemini-image-model-check-skill` を確認
