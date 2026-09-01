# Operations and Security Procedure

[日本語版](ja/OPERATIONS.md)

## Pre-run checklist

- [ ] Obtain owner authorization for the target URL, IP range, execution window, and load limit.
- [ ] Select a staging environment containing only test data, rather than production.
- [ ] Use least-privilege test accounts with no personal-data or payment authority.
- [ ] Exclude irreversible actions such as deletion, account closure, cancellation, and order confirmation from scenarios and crawl scope.
- [ ] Review the ZAP Active Scan policy and rate limits.

## Recommended execution order

1. Set a low page count and crawl depth in Site Management.
2. Generate test cases and review the form and URL catalogs.
3. Record a baseline using only normal cases.
4. Replay with invalid and boundary cases.
5. Replay through the ZAP proxy and review passive alerts.
6. Run ZAP Active Scan only against authorized staging.
7. Verify alerts, case IDs, traffic, and visual differences before opening a finding.

## Troubleshooting

| Symptom | Action |
|---|---|
| `EADDRINUSE: 4173` | Stop the existing process or use the already-running `http://localhost:4173`. |
| ZAP connection fails | Run `docker compose -f docker-compose.zap.yml up -d`; check port 8090 and Docker. |
| ZAP integration fails for an old session | Save it from the case editor to regenerate the spec. |
| Pages are missed | Add scenarios that explicitly reach post-login pages, modals, tabs, and role-specific paths. |
| False positive | Manually validate `zap-alerts.json`, the request, response, and case ID. |

## Retention and deletion

Session artifacts can contain URLs, form definitions, screenshots, input values, and test results. Restrict access according to your organization's retention policy and delete unneeded `.golden-master/session-*` directories. Do not share or commit scenario JSON that contains secrets.
