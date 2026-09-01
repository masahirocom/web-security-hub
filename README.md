# Web Security Hub — English

[日本語の README](README.ja.md)

Web Security Hub is a locally run web-security assessment and form-regression testing tool aligned with OWASP risk categories. It does not include Claude CLI or Claude Code integration. Test-case values are generated using deterministic, rule-based logic.

## Documentation

- [User manual](docs/USER_MANUAL.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Functional specification](docs/SPECIFICATION.md)
- [Operations and security procedure](docs/OPERATIONS.md)
- [Localization guide](docs/LOCALIZATION.md)

## Start the application

```sh
npm install
npx playwright install chromium
npm start
```

Open `http://localhost:4173`.

## Capabilities

- **Hybrid DAST** — Playwright uses a real browser to crawl SPAs, authenticated pages, and JSON scenarios, and collects same-origin traffic. When ZAP is enabled, the traffic is replayed through the ZAP proxy so its existing Passive and Active Scan Rules can be used. Confirmation that you are authorized to test the target is required.
- **Static analysis (SAST)** — Scans a selected local source tree for dynamic code execution, command-execution APIs, SQL string concatenation, possible secrets, and disabled TLS verification. `node_modules`, `.git`, and build outputs are excluded.
- **Form and regression test-case generation** — Discovers forms from the same crawl and authenticated scenarios, then produces pairwise combinations of valid, boundary, and invalid values based on HTML constraints. It exports Playwright specs, YAML, and HTML reports.

Every finding includes severity, an OWASP category, evidence, and remediation guidance. Automated findings support human review; they do not prove a vulnerability or guarantee security.

To passively assess an authorized target from the CLI:

```sh
npm run dynamic-scan -- https://staging.example.com/
```

## ZAP integration

ZAP remains the mature scan engine rather than being reimplemented here. This application handles authenticated exploration and scenario replay with Playwright; ZAP evaluates the collected traffic with its established rules.

Start local ZAP (its API is exposed only on localhost):

```sh
docker compose -f docker-compose.zap.yml up -d
```

In the interface, select **Scan with ZAP rules**, verify connectivity, then run the assessment. Run active scans only on a staging environment for which you have explicit authorization. Stop ZAP when finished:

```sh
docker compose -f docker-compose.zap.yml down
```

`scenarioJson` accepts login data and `goto`, `click`, `fill`, `check`, `select`, and `wait` steps. This data is not persisted or included in scan results.

## Combining test cases and vulnerability assessments

The **Test Case Generation** tab uses the same start URL, authentication, and scenario as the dynamic-assessment tab. First model a business flow as a scenario and generate normal, boundary, and invalid form tests. Then crawl the same flow with Playwright and ZAP. This brings functionality that cannot be reached through ordinary navigation into both regression tests and security assessment.

## Safe operation

Limit all targets to systems you own or environments for which you have explicit authorization. Passive assessment does not submit forms or attempt intrusion. Test-case execution and ZAP Active Scan do send requests to the target. The product does not include authentication-bypass or denial-of-service testing. Before testing production, validate impact with a small crawl scope and page limit in staging.
