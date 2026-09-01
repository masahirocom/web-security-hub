# 多言語対応ガイド

## 対応言語

- `ja`: 日本語（初期表示）
- `en`: English (US)
- `fr`: Français

ヘッダーの言語セレクターで切り替えます。選択値はブラウザーの `localStorage` に `web-security-hub.locale` として保存され、次回起動時にも適用されます。

## 言語ファイル

言語ファイルは `public/i18n/<locale>.json` です。キーは画面や機能に依存しない意味単位で命名します。

```json
{
  "nav.dynamic": "Dynamic Scan",
  "status.error": "Error: {message}"
}
```

`{message}` のようなプレースホルダーは `t('status.error', { message })` で置換します。

## 新しい言語を追加する手順

1. `public/i18n/en.json` をコピーし、たとえば `de.json` を作成する。
2. すべての既存キーを翻訳する。
3. `public/js/i18n.js` の `SUPPORTED` にロケールを追加する。
4. `public/index.html` の `#languageSelect` に選択肢を追加する。
5. Playwright でセレクター切替と主要タブ・ボタンを確認する。

## 実装ルール

- 表示文言を新規追加するときは、JavaScript や HTML に固定文言を書かず、言語ファイルへキーを追加する。
- 動的なエラー・進捗表示は `t()` を使用する。
- API のフィールド名、セレクター、URL、JSON シナリオのキーは翻訳しない。
- 機密情報を翻訳文やプレースホルダーに含めない。
