# Web Security Hub Functional Specification

[日本語版](ja/SPECIFICATION.md)

## 1. Features

| ID | Feature | Input | Output |
|---|---|---|---|
| F-01 | Site management | Site configuration, credentials | `site.config.json`, `.env` |
| F-02 | Test generation | Site ID | Forms, cases, spec, reports |
| F-03 | Case editing | Session, edited YAML values | Updated YAML, regenerated spec |
| F-04 | Regression replay | Session, comparison URL | Playwright result, comparison report |
| F-05 | DAST | URL, scope, scenario, authorization confirmation | DAST findings |
| F-06 | ZAP integration | ZAP API/proxy, Active Scan authorization | `zap-alerts.json` |
| F-07 | SAST | Local source directory | SAST findings; JSON, HTML, Markdown, and SARIF reports |

## 2. API specification

| Method | Path | Description |
|---|---|---|
| GET / PUT | `/api/sites`, `/api/sites/:id` | List sites or update configuration |
| GET | `/api/sites/:id/pipeline/run` | Test-generation SSE stream |
| GET | `/api/sites/:id/sessions/:sessionId/replay` | Replay SSE stream |
| GET / PUT | `/api/sites/:id/sessions/:sessionId/test-cases` | Edit YAML cases |
| POST | `/api/security/dynamic-scan` | Playwright DAST |
| POST | `/api/security/zap-status` | Check ZAP reachability |
| POST | `/api/security/static-scan` | SAST |

### DAST request

`POST /api/security/dynamic-scan` requires `targetUrl` and `authorizationConfirmed: true`. It can also receive `scenario`, `zap`, `allowActiveScan`, and crawl limits.

### ZAP parameters for replay

`zap=1` enables the Playwright proxy. `activeZap=1` requests ZAP Active Scan and also requires `authorized=1`.

## 3. Non-functional requirements

- Requires Node.js 22 or later.
- The UI is served by a local Express server.
- Long-running generation and replay report progress with SSE.
- Crawl limits are at most 100 pages and depth 10.
- Source analysis is limited to 3,000 files and 1 MiB per file.

## 4. Acceptance criteria

- A saved site can produce forms, cases, and a Playwright spec through the pipeline.
- Edited YAML can regenerate the spec.
- The same session can record a baseline and run a comparison replay.
- DAST cannot start without authorization confirmation.
- A ZAP-integrated run saves `zap-alerts.json` and can include applicable case IDs.
- Static analysis saves JSON, HTML, Markdown, and SARIF reports only under `artifacts/static-scans/` and does not write into the target source directory.
