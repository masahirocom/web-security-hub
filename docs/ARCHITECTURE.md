# Web Security Hub Architecture

[日本語版](ja/ARCHITECTURE.md)

## 1. Overview

```text
Browser UI (Vanilla JS)
  ├─ Site management / test-case generation / replay
  ├─ Playwright DAST / ZAP integration / static analysis
  └─ Express REST + SSE
          │
          ▼
Core Engine
  ├─ crawler: Playwright form and link discovery
  ├─ values + combinator: rule-based values and pairwise generation
  ├─ codegen + replay: Playwright spec generation and comparison runs
  ├─ scenario recorder: visible browser interaction capture
  ├─ security: DAST, SAST, and the ZAP API client
  └─ store + report: session artifacts and reports
          │
          ├─ sites/<siteId>/.golden-master/session-*/
          └─ Optional: OWASP ZAP daemon (localhost:8090)
```

## 2. Separation of responsibilities (SRP)

| Layer | Main files | Responsibility |
|---|---|---|
| UI | `public/index.html`, `public/js/*` | Configuration input, SSE display, and links to results |
| HTTP API | `server/routes/*` | HTTP parameter conversion, SSE endpoints, and HTTP responses only |
| Application services | `server/services/*` | Test-generation and replay use cases and their artifacts |
| SSE adapter | `server/lib/sse.js` | Shared SSE headers, event delivery, and connection teardown |
| Test generation | `core/runner`, `core/crawler`, `core/values` | Crawling, form extraction, and case/spec generation |
| DAST facade | `core/security/dynamicScanner.js` | Execution ordering and result aggregation only |
| DAST browser | `core/security/dynamic/browserCrawler.js` | Same-origin discovery and reached-page records |
| DAST scenario | `core/security/dynamic/scenarioRunner.js` | Browser actions for login and explicit scenarios |
| Scenario recorder | `core/scenario/playwrightRecorder.js` | One headed local browser session and safe step normalization |
| DAST analyzer | `core/security/dynamic/passiveAnalyzer.js` | HTTP-header, DOM, and non-destructive active-notice checks |
| DAST collector | `core/security/dynamic/requestCollector.js` | Deduplication and collection of browser traffic |
| ZAP integration | `core/security/zapClient.js` | ZAP JSON API, alert retrieval, and case correlation |
| SAST | `core/security/staticScanner.js` | Rule checks of local text sources |
| Persistence | `core/store`, `core/report` | Session JSON, YAML, HTML, and Markdown |

### Separation rules

- Routes do not directly manipulate `core/` details or artifact formats.
- Use cases do not receive Express `req` or `res` objects.
- Scanners return findings; they do not render UI, handle HTTP, or persist data.
- UI code separates DOM work by tab and reuses common API and result-rendering helpers.

## 3. Test-case generation flow

1. Build execution settings from `site.config.json` and `.env`.
2. Crawl from the start URL with Playwright, constrained to the same origin.
3. Extract form controls, constraints, and stable selectors.
4. Build rule-based candidate values and assemble pairwise cases.
5. Save cases, forms, and the URL catalog to the session.
6. Produce `generated.spec.ts`, YAML, and HTML/Markdown reports.

Claude Code semantic inference is out of scope for test-case generation. Values are generated deterministically from HTML attributes, field types, and labels. The optional Claude Code adapter is isolated from scanning and test generation, and reviews only an explicitly authorized SAST result package.

## 4. DAST and ZAP integration flow

```text
generated.spec.ts
  └─ Configure a Playwright proxy when WEB_SECURITY_PROXY_URL is present
      └─ Add X-Web-Security-Case-Id for each case
          └─ ZAP records traffic and runs passive checks
              ├─ Optionally starts an Active Scan
              └─ Matches alerts and history headers by URL
                  └─ zap-alerts.json (alert + testCaseIds)
```

ZAP alerts contain CWE/WASC data, so they are not mechanically mapped to one OWASP Top 10 category. `UNMAPPED` means human review is required.

## 5. Security boundaries

- The API is intended for local use.
- Site IDs and session IDs are regex-validated to prevent file access outside sessions.
- Secrets are limited to the site `.env` or an in-memory execution scenario and are not written to result JSON.
- The recorder uses server-side login credentials and never returns or stores them; passwords are excluded from captured steps.
- The ZAP Docker API is published only on `127.0.0.1:8090`.
- Active scans require authorization confirmation in both UI and API.

## 6. Known limitations

- Crawling alone cannot fully cover SPAs, SSO, multi-step wizards, or permission-specific screens; use scenarios as well.
- Alert-to-case matching relies on URL and ZAP history containing `X-Web-Security-Case-Id`; redirects can prevent a unique match.
- SAST is a lightweight rule-based scan, not a replacement for data-flow analysis or dependency CVE scanning.
