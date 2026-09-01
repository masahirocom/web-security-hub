'use strict';
const { chromium } = require('playwright');
const { ZapClient, zapAlertsToFindings } = require('./zapClient');
const { crawl } = require('./dynamic/browserCrawler');
const { runScenario } = require('./dynamic/scenarioRunner');
const { createRequestCollector } = require('./dynamic/requestCollector');
const { analyzeResponse, analyzeDocument, analyzeSafeActiveNotice } = require('./dynamic/passiveAnalyzer');

/** Application facade: orchestrates browser discovery, analyses, and optional ZAP scan. */
async function scanDynamic({ targetUrl, maxPages = 20, maxDepth = 2, allowActiveScan = false, scenario, zap, onProgress = () => {} }) {
  const target = new URL(targetUrl); if (!['http:', 'https:'].includes(target.protocol)) throw new Error('http(s) URL を指定してください');
  const zapClient = zap?.enabled ? new ZapClient(zap) : undefined; let zapInfo;
  if (zapClient) { const version = await zapClient.version(); zapInfo = { baseUrl: zapClient.baseUrl, version: version.version, activeScan: false }; onProgress(`ZAP 接続: ${version.version}`); }
  const browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ ignoreHTTPSErrors: false, ...(zap?.enabled && zap.proxyUrl ? { proxy: { server: zap.proxyUrl } } : {}) }); const collector = createRequestCollector(target.origin);
  let discovery;
  try { discovery = await crawl({ context, targetUrl, maxPages, maxDepth, collector, scenario: { ...scenario, run: runScenario }, onProgress, analyzePage: async ({ page, url, headers }) => [ ...analyzeResponse({ url, headers }), ...await analyzeDocument(page, url), ...(allowActiveScan ? await analyzeSafeActiveNotice(page, url) : []) ] }); } finally { await context.close(); await browser.close(); }
  const zapResult = zapClient ? await collectZapFindings({ zapClient, targetUrl, allowActiveScan, maxWaitMs: zap?.maxWaitMs, onProgress, zapInfo }) : { findings: [], zapInfo };
  const findings = [...discovery.findings, ...zapResult.findings];
  return { mode: zapClient && allowActiveScan ? 'zap-active' : allowActiveScan ? 'safe-active' : 'passive', targetUrl, scannedAt: new Date().toISOString(), pages: discovery.pages, requests: collector.requests, zap: zapResult.zapInfo, findings, summary: summarize(findings) };
}
async function collectZapFindings({ zapClient, targetUrl, allowActiveScan, maxWaitMs, onProgress, zapInfo }) { if (allowActiveScan) { const scanId = await zapClient.startActiveScan(targetUrl); const scan = await zapClient.waitForScan(scanId, { timeoutMs: clamp(maxWaitMs, 60_000, 30 * 60_000, 20 * 60_000), onProgress }); return { findings: zapAlertsToFindings(await zapClient.alerts(targetUrl)), zapInfo: { ...zapInfo, activeScan: true, scanId, ...scan } }; } return { findings: zapAlertsToFindings(await zapClient.alerts(targetUrl)), zapInfo }; }
function clamp(value, min, max, fallback) { const n = Number(value); return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback; }
function summarize(findings) { const out = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }; for (const item of findings) out[item.severity] = (out[item.severity] || 0) + 1; return out; }
module.exports = { scanDynamic };
