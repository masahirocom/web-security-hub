# Web Security Hub 設計書

[English version](../ARCHITECTURE.md)

## 1. 構成概要

```text
Browser UI (Vanilla JS)
  ├─ サイト管理 / テストケース生成 / 再実行
  ├─ Playwright DAST / ZAP 統合 / 静的解析
  └─ Express REST + SSE
          │
          ▼
Core Engine
  ├─ crawler: Playwright によるフォーム・リンク探索
  ├─ values + combinator: ルールベース値・ペアワイズ生成
  ├─ codegen + replay: Playwright spec と比較実行
  ├─ security: DAST、SAST、ZAP API クライアント
  └─ store + report: セッション成果物とレポート
          │
          ├─ sites/<siteId>/.golden-master/session-*/
          └─ 任意: OWASP ZAP daemon (localhost:8090)
```

## 2. 責務分離（SRP）

| 層 | 主なファイル | 責務 |
|---|---|---|
| UI | `public/index.html`, `public/js/*` | 設定入力、SSE表示、結果への導線 |
| HTTP API | `server/routes/*` | HTTP パラメータの変換、SSE 接続、HTTP 応答だけを担当 |
| Application service | `server/services/*` | テスト生成・再実行というユースケースの実行と成果物作成 |
| SSE adapter | `server/lib/sse.js` | SSE ヘッダー、イベント送信、接続終了の共通処理 |
| テスト生成 | `core/runner`, `core/crawler`, `core/values` | 巡回、フォーム抽出、ケース・spec生成 |
| DAST facade | `core/security/dynamicScanner.js` | 実行順序・結果集約だけを担当 |
| DAST browser | `core/security/dynamic/browserCrawler.js` | 同一オリジン探索とページ到達記録 |
| DAST scenario | `core/security/dynamic/scenarioRunner.js` | ログイン・明示シナリオのブラウザー操作 |
| DAST analyzer | `core/security/dynamic/passiveAnalyzer.js` | HTTP ヘッダー、DOM、非破壊アクティブ通知の検査 |
| DAST collector | `core/security/dynamic/requestCollector.js` | ブラウザー通信の重複排除・収集 |
| ZAP 統合 | `core/security/zapClient.js` | ZAP JSON API、Alert取得・ケース紐付け |
| SAST | `core/security/staticScanner.js` | ローカルテキストソースのルール検査 |
| 永続化 | `core/store`, `core/report` | セッション JSON、YAML、HTML、Markdown |

### 分離ルール

- Route は `core/` の詳細やファイル形式を直接操作しない。
- ユースケースは Express の `req` / `res` を受け取らない。
- スキャナーは画面表示・HTTP 送受信・保存を行わず、検査結果を返す。
- UI は DOM 操作をタブ機能ごとに分け、共通の API 呼び出しと結果描画を再利用する。

## 3. テストケース生成フロー

1. `site.config.json` と `.env` から実行設定を構築する。
2. Playwright で起点 URL を同一オリジン範囲で巡回する。
3. フォーム要素、制約、安定セレクタを抽出する。
4. ルールベースの候補値を作り、ペアワイズでケースを組み立てる。
5. ケース、フォーム、URL カタログをセッションへ保存する。
6. `generated.spec.ts`、YAML、HTML／Markdown レポートを出力する。

テストケース生成に Claude Code による意味推論は使用しません。値生成は HTML 属性・フィールド型・ラベル等の決定的ルールで行います。任意の Claude Code アダプターはスキャン・テスト生成から分離され、明示許可された SAST 結果パッケージだけをレビューします。

## 4. DAST / ZAP 統合フロー

```text
generated.spec.ts
  └─ WEB_SECURITY_PROXY_URL がある場合は Playwright proxy を設定
      └─ ケースごとに X-Web-Security-Case-Id を付加
          └─ ZAP が通信を履歴化・パッシブ検査
              ├─ 任意で Active Scan を開始
              └─ Alert と履歴ヘッダーを URL 単位で照合
                  └─ zap-alerts.json (Alert + testCaseIds)
```

ZAP Alert は CWE/WASC を返すため、単一の OWASP Top 10 カテゴリへ機械的には割り当てません。`UNMAPPED` は人による確認が必要であることを表します。

## 5. セキュリティ境界

- API はローカル実行を前提とする。
- サイト ID とセッション ID は正規表現で検証し、セッション外のファイル公開を防ぐ。
- 秘密情報はサイト `.env` または実行時シナリオに限定し、結果 JSON に書き出さない。
- ZAP Docker の API は `127.0.0.1:8090` のみに公開する。
- アクティブ検査は UI と API の両方で許可確認を要求する。

## 6. 既知の制約

- 自動巡回だけで SPA、SSO、多段ウィザード、権限別画面を完全に網羅することはできない。シナリオを併用する。
- ZAP Alert とケースの対応は URL と `X-Web-Security-Case-Id` を含む履歴に基づく。サーバー側のリダイレクト等では一意に結び付かない場合がある。
- SAST は軽量なルールベース検査であり、データフロー解析や依存関係 CVE 検査の代替ではない。
