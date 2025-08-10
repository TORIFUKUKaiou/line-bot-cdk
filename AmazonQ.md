# Amazon Q ドキュメント

## 概要

このプロジェクトでは、Amazon Q を使用して開発効率を向上させています。Amazon Q は AWS が提供する AI アシスタントで、コード生成、デバッグ、ドキュメント作成などの開発タスクをサポートします。

## 主な機能

### コード生成
- TypeScript/JavaScript のコード自動生成
- AWS CDK スタックの構築支援
- Lambda 関数の実装サポート

### コードレビュー
- セキュリティ脆弱性の検出
- コード品質の改善提案
- ベストプラクティスの適用

### ドキュメント作成
- README ファイルの生成
- API ドキュメントの作成
- 技術仕様書の作成支援

## 使用方法

### 基本的な使い方
1. IDE で Amazon Q プラグインを有効化
2. `@file` でファイルを指定してコンテキストに含める
3. `@folder` でフォルダ全体をコンテキストに含める
4. `@workspace` でワークスペース全体を参照

### よく使用するコマンド
- `/dev` - 開発タスクの支援
- `/test` - テストコードの生成
- `/docs` - ドキュメント作成
- `/review` - コードレビュー

## このプロジェクトでの活用例

### LINE Bot 開発
- CDK スタックの構築
- Lambda 関数の実装
- OpenAI API との連携コード生成

### デプロイメント支援
- AWS リソースの設定
- 環境変数の管理
- セキュリティ設定の最適化

## 注意事項

- 機密情報（API キー、トークンなど）は直接コードに含めない
- AWS Systems Manager Parameter Store を使用して安全に管理
- 生成されたコードは必ずレビューしてから使用する

## 参考リンク

- [Amazon Q Developer](https://aws.amazon.com/q/developer/)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [LINE Messaging API](https://developers.line.biz/ja/docs/messaging-api/)