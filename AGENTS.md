# AGENTS.md

このリポジトリで作業する際のエージェント向けルールです。

## 作業環境・ブランチ運用

- **Worktree の使用**: 作業時は `agent-worktrees/<トピック名>` に `git worktree` を作成し、ブランチを切って作業すること（例: `git worktree add agent-worktrees/upgrade-node-26 -b chore/upgrade-node-26`）。
- **DevContainer の使用**: `npm ci`、`npm run build`、`npm test`、`npx cdk synth` などのコマンド実行は、必ず対象 worktree で DevContainer を立ち上げ（`devcontainer up --workspace-folder <worktree-path>`）、そのコンテナ内（`devcontainer exec --workspace-folder <worktree-path> ...`）で行うこと。

## 設計経緯・ドキュメント管理

- **ローカルリポジトリへの記録**: 実装計画書（`implementation_plan.md`）やウォークスルー（`walkthrough.md`）などの成果物は、過去の設計経緯を残すためすべてローカルリポジトリの `docs/plans/<トピック名>/` 配下に保存し、Git 管理に含めること（例: `docs/plans/upgrade-node-26/implementation_plan.md`、`docs/plans/upgrade-node-26/walkthrough.md`）。

## コミット・PR のルール

- **Worktree 内でのコミット**: `agent-worktrees/` 内の作業ブランチでは、AI エージェントの裁量で適切な単位・タイミングでコミットしてよい（`git add -A` / `git add .` は使わず、対象ファイルを個別に指定してステージングすること）。
- **PR 作成前の承認**: リモートへの push や Pull Request を作成する前には、必ず変更内容（`git status` / `git diff` 等）を提示してユーザの承認を得ること。
