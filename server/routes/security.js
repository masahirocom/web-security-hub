'use strict';
const express = require('express');
const { scanDynamic } = require('../../core/security/dynamicScanner');
const { scanStatic } = require('../../core/security/staticScanner');
const { ZapClient } = require('../../core/security/zapClient');
const { buildSiteScenario } = require('../../core/scenario/siteScenario');
const router = express.Router();
router.post('/security/dynamic-scan', async (req, res) => {
  const { targetUrl, maxPages, maxDepth, allowActiveScan, authorizationConfirmed, scenario, zap, siteId, useSiteScenario } = req.body || {};
  if (!authorizationConfirmed) return res.status(400).json({ error: '対象システムの診断許可を確認してください' });
  try {
    const saved = useSiteScenario ? buildSiteScenario(siteId) : undefined;
    res.json(await scanDynamic({ targetUrl: targetUrl || saved?.targetUrl, maxPages, maxDepth, allowActiveScan, scenario: saved?.scenario || scenario, zap }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/security/zap-status', async (req, res) => {
  try { const zap = new ZapClient(req.body?.zap); res.json({ ok: true, baseUrl: zap.baseUrl, ...(await zap.version()) }); } catch (e) { res.status(503).json({ error: `ZAP に接続できません: ${e.message}` }); }
});
router.post('/security/static-scan', (req, res) => {
  try { res.json(scanStatic({ sourceDir: req.body?.sourceDir })); } catch (e) { res.status(400).json({ error: e.message }); }
});
module.exports = router;
