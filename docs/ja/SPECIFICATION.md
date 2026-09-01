# Web Security Hub 機能仕様書

[English version](../SPECIFICATION.md)

## 1. 機能一覧

| ID | 機能 | 入力 | 出力 |
|---|---|---|---|
| F-01 | サイト管理 | サイト設定、認証情報 | `site.config.json`、`.env` |
| F-02 | テスト生成 | サイト ID | フォーム、ケース、spec、レポート |
| F-03 | ケース編集 | セッション、YAML編集値 | 更新 YAML、再生成 spec |
| F-04 | 回帰再実行 | セッション、比較先 URL | Playwright結果、比較レポート |
| F-05 | DAST | URL、範囲、シナリオ、許可確認 | DAST findings |
| F-06 | ZAP 統合 | ZAP API/Proxy、Active Scan許可 | `zap-alerts.json` |
| F-07 | SAST | ローカルソースディレクトリ | SAST findings |

## 2. API 仕様

| Method | Path | 説明 |
|---|---|---|
| GET / PUT | `/api/sites`, `/api/sites/:id` | サイト一覧・設定更新 |
| GET | `/api/sites/:id/pipeline/run` | テスト生成 SSE |
| GET | `/api/sites/:id/sessions/:sessionId/replay` | 再実行 SSE |
| GET / PUT | `/api/sites/:id/sessions/:sessionId/test-cases` | YAML ケース編集 |
| POST | `/api/security/dynamic-scan` | Playwright DAST |
| POST | `/api/security/zap-status` | ZAP 到達性確認 |
| POST | `/api/security/static-scan` | SAST |

### DAST リクエスト

`POST /api/security/dynamic-scan` は `targetUrl` と `authorizationConfirmed: true` を必須とします。任意の `scenario`、`zap`、`allowActiveScan`、巡回上限を指定できます。

### 再実行時の ZAP パラメータ

`zap=1` は Playwright のプロキシを有効化します。`activeZap=1` は ZAP Active Scan を要求し、同時に `authorized=1` が必要です。

## 3. 非機能要件

- Node.js 22 以上で動作する。
- UI はローカルの Express サーバーで提供する。
- 長時間の生成・再実行は SSE で進捗を返す。
- 巡回上限は最大 100 ページ、深さは最大 10 とする。
- ソース解析は最大 3,000 ファイル、1ファイル 1 MiB を上限とする。

## 4. 受入基準

- サイトを保存し、パイプラインがフォーム・ケース・Playwright spec を出力できる。
- YAML を編集して spec を再生成できる。
- 同じセッションをベースライン記録・比較実行できる。
- DAST は許可確認なしに開始できない。
- ZAP 統合実行は `zap-alerts.json` を保存し、該当するケース ID を含められる。
- 静的解析は対象ディレクトリ外へ書き込まない。
