# Node.js 26 アップグレード & 設計記録のローカル管理 実装計画

## ステータス: 保留（AWS Lambda Node.js 26 GA & `aws-cdk-lib` 対応待ち）

> [!NOTE]
> **2026-11-12 時点の判断**
> - AWS Lambda の Node.js 26（`nodejs26.x`）は現在 **パブリックプレビュー（Public Preview）** 段階であり、`aws-cdk-lib` にも `Runtime.NODEJS_26_X` 定数がまだ追加されていません。
> - `new Runtime('nodejs26.x', RuntimeFamily.NODEJS, { supportsInlineCode: true })` で動かすこと自体は可能ですが、先行プレビュー段階で無理に上げる必要はないため、**現時点では計画書の作成のみとし、実際のアップグレード作業は AWS Lambda の正式 GA および `aws-cdk-lib` での `Runtime.NODEJS_26_X` 対応後に実施します。**

---

## 決定事項（合意済み方針）

1. **設計経緯（Plan / Walkthrough）のローカルリポジトリ管理**
   - 配置パス: `docs/plans/<トピック名>/`（1階層で統一）
   - 今回の対象パス: `docs/plans/upgrade-node-26/implementation_plan.md` および `docs/plans/upgrade-node-26/walkthrough.md`
2. **GitHub Actions の Node バージョン**
   - `.github/workflows/deploy.yml` と `.github/workflows/test.yml` の `node-version` も `26` へ引き上げる。
3. **作業用 Worktree とブランチ名**
   - Worktree パス: `agent-worktrees/upgrade-node-26`
   - ブランチ名: `chore/upgrade-node-26`

---

## Proposed Changes（`aws-cdk-lib` 対応後に実施する内容）

### 1. 作業環境（Worktree & DevContainer）
- `git worktree add agent-worktrees/upgrade-node-26 -b chore/upgrade-node-26` で worktree とブランチを作成します。
- Worktree 内で `devcontainer up --workspace-folder .` を実行し、以降の `npm`・ビルド・テスト等のコマンドはすべて `devcontainer exec --workspace-folder . <cmd>` 経由でコンテナ内で実行します。

#### [MODIFY] `.devcontainer/Dockerfile`
ベースイメージを Node 26 に更新します。
```diff
-FROM mcr.microsoft.com/devcontainers/typescript-node:24-bookworm
+FROM mcr.microsoft.com/devcontainers/typescript-node:26-bookworm
 
 RUN npm install -g npm@latest
```

---

### 2. AWS CDK Lambda ランタイム設定

#### [MODIFY] `lib/line-bot-cdk.ts`
`aws-cdk-lib` を `Runtime.NODEJS_26_X` が含まれるバージョンへ更新した上で、`WorkerFunction` と `ReceiverFunction` のランタイムを `Runtime.NODEJS_26_X` に変更します。

```diff
     // Worker Lambda関数を作成
     const workerFunction = new NodejsFunction(this, 'WorkerFunction', {
-      runtime: Runtime.NODEJS_24_X,
+      runtime: Runtime.NODEJS_26_X,
       entry: path.join(__dirname, 'line-bot-worker.ts'),
...
     // Receiver Lambda関数を作成
     const receiverFunction = new NodejsFunction(this, 'ReceiverFunction', {
-      runtime: Runtime.NODEJS_24_X,
+      runtime: Runtime.NODEJS_26_X,
       entry: path.join(__dirname, 'line-bot-receiver.ts'),
```

#### [MODIFY] `test/line-bot-cdk.test.ts`
生成される CloudFormation テンプレートの Lambda ランタイムが `nodejs26.x` になっていることを検証に追加します。

---

### 3. パッケージ・型定義・設定ファイル・CI

#### [MODIFY] `package.json` / `package-lock.json`
- `@types/node` を `^26.x` へ更新します。
- `aws-cdk` / `aws-cdk-lib` を `Runtime.NODEJS_26_X` 対応バージョンへ更新します。

```diff
   "devDependencies": {
     "@types/aws-lambda": "^8.10.164",
     "@types/jest": "^30.0.0",
-    "@types/node": "^24.9.2",
+    "@types/node": "^26.6.5",
```

#### [MODIFY] `tsconfig.json`
Node 26 + TypeScript 7 環境でビルド・型チェックを実行し、必要に応じて `target` / `lib` 等の設定を調整します。

#### [MODIFY] `.github/workflows/deploy.yml` / `.github/workflows/test.yml`
GitHub Actions の `actions/setup-node@v7` の `node-version` を `'26'` に更新します。

```diff
       - name: Set up Node.js
         uses: actions/setup-node@v7
         with:
-          node-version: '24'
+          node-version: '26'
           cache: 'npm'
```

---

### 4. 設計経緯（Implementation Plan / Walkthrough）のローカル保存

#### [NEW] `docs/plans/upgrade-node-26/implementation_plan.md`
#### [NEW] `docs/plans/upgrade-node-26/walkthrough.md`
計画書および作業完了後のウォークスルーをリポジトリ内の `docs/plans/upgrade-node-26/` に保存し、Git コミットに含めて履歴として残します。

---

## Verification Plan（実施時の検証手順）

### Automated Tests（DevContainer 内で実行）
1. DevContainer のビルドと起動確認:
   ```bash
   devcontainer up --workspace-folder agent-worktrees/upgrade-node-26
   devcontainer exec --workspace-folder agent-worktrees/upgrade-node-26 node -v
   ```
   （`v26.x.x` が出力されることを確認）
2. 依存関係の更新とビルド・テスト実行:
   ```bash
   devcontainer exec --workspace-folder agent-worktrees/upgrade-node-26 npm run build
   devcontainer exec --workspace-folder agent-worktrees/upgrade-node-26 npm test
   ```
3. CDK Synth の確認:
   ```bash
   devcontainer exec --workspace-folder agent-worktrees/upgrade-node-26 env \
     CHANNEL_SECRET_PARAM_NAME=dummy \
     CHANNEL_ACCESS_TOKEN_PARAM_NAME=dummy \
     SAKURA_AI_TOKEN_PARAM_NAME=dummy \
     GEMINI_API_KEY_PARAM_NAME=dummy \
     EMAIL_ADDRESS=test@example.com \
     npx cdk synth
   ```
