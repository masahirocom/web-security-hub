'use strict';
const { finding } = require('./owasp');

/** Minimal, dependency-free client for a ZAP daemon's JSON API. */
class ZapClient {
  constructor({ baseUrl = 'http://127.0.0.1:8090', apiKey = '' } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  async version() { return this.get('/JSON/core/view/version/'); }
  async startActiveScan(targetUrl) {
    const data = await this.get('/JSON/ascan/action/scan/', { url: targetUrl, recurse: 'true', inScopeOnly: 'true' });
    return data.scan;
  }
  async status(scanId) { const data = await this.get('/JSON/ascan/view/status/', { scanId }); return Number(data.status || 0); }
  async alerts(targetUrl) { const data = await this.get('/JSON/core/view/alerts/', { baseurl: targetUrl, start: '0', count: '9999' }); return data.alerts || []; }
  async messages(targetUrl) { const data = await this.get('/JSON/core/view/messages/', { baseurl: targetUrl, start: '0', count: '9999' }); return data.messages || []; }
  async waitForScan(scanId, { timeoutMs = 20 * 60_000, onProgress = () => {} } = {}) {
    const until = Date.now() + timeoutMs;
    let progress = 0;
    while (Date.now() < until) {
      progress = await this.status(scanId);
      onProgress(`ZAP active scan: ${progress}%`);
      if (progress >= 100) return { completed: true, progress };
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return { completed: false, progress };
  }
  async get(path, params = {}) {
    const url = new URL(path, `${this.baseUrl}/`);
    for (const [key, value] of Object.entries({ ...params, ...(this.apiKey ? { apikey: this.apiKey } : {}) })) url.searchParams.set(key, value);
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.code) throw new Error(data.detail || data.message || `ZAP API error: ${response.status}`);
    return data;
  }
}

function zapAlertsToFindings(alerts) {
  return alerts.map((a) => finding({
    id: `ZAP-${a.pluginId || 'ALERT'}`,
    title: a.alert || 'ZAP Alert',
    severity: severity(a.riskcode || a.risk),
    // ZAP reports CWE/WASC, not a guaranteed single Top 10 category. Do not invent one.
    owasp: 'UNMAPPED',
    location: a.url || '',
    evidence: [a.description, a.evidence, a.other].filter(Boolean).join(' ').slice(0, 2000),
    remediation: a.solution || 'ZAP の Alert 詳細と検出根拠を確認してください。',
    source: 'ZAP',
    confidence: a.confidence || '',
    cweId: a.cweid || '',
    wascId: a.wascid || '',
    reference: a.reference || '',
  }));
}
function severity(risk) { const n = Number(risk); return n >= 3 ? 'high' : n === 2 ? 'medium' : n === 1 ? 'low' : 'info'; }
function mapCasesToAlerts(alerts, messages) {
  const casesByUrl = new Map();
  for (const message of messages) {
    const id = String(message.requestHeader || '').match(/^X-Web-Security-Case-Id:\s*(.+)$/im)?.[1]?.trim();
    const url = message.requestHeader?.match(/^[A-Z]+\s+(\S+)/m)?.[1];
    if (!id || !url) continue;
    const key = normalizeAlertUrl(url); if (!casesByUrl.has(key)) casesByUrl.set(key, new Set()); casesByUrl.get(key).add(id);
  }
  return zapAlertsToFindings(alerts).map((alert) => ({ ...alert, testCaseIds: Array.from(casesByUrl.get(normalizeAlertUrl(alert.location)) || []) }));
}
function normalizeAlertUrl(value) { try { const u = new URL(value); u.hash = ''; return u.toString(); } catch { return value; } }
module.exports = { ZapClient, zapAlertsToFindings, mapCasesToAlerts };
