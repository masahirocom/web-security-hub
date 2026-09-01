'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const { sessionDirFor } = require('../lib/sessionPaths');
const { writeTestCasesYaml, regenerateFromYaml } = require('../../core/codegen/testCaseYaml');

const router = express.Router();

function readYamlDoc(dir) {
  const yamlPath = path.join(dir, 'test-cases.yaml');
  if (!fs.existsSync(yamlPath)) writeTestCasesYaml(dir);
  return { yamlPath, doc: YAML.parse(fs.readFileSync(yamlPath, 'utf8')) || {} };
}

// Writes test-cases.yaml from the session's current forms.json + test-cases.json.
router.post('/sites/:id/sessions/:sessionId/yaml/export', (req, res) => {
  const { id: siteId, sessionId } = req.params;
  try {
    const dir = sessionDirFor(siteId, sessionId);
    writeTestCasesYaml(dir);
    res.json({ yamlUrl: `/api/sites/${siteId}/sessions/${sessionId}/test-cases.yaml` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Regenerates generated.spec.ts from the (possibly hand-edited) test-cases.yaml.
router.post('/sites/:id/sessions/:sessionId/yaml/regenerate', (req, res) => {
  const { id: siteId, sessionId } = req.params;
  try {
    const dir = sessionDirFor(siteId, sessionId);
    regenerateFromYaml(dir);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Table-editor data source: the case list from test-cases.yaml (auto-exported
// from test-cases.json on first read if the YAML doesn't exist yet).
router.get('/sites/:id/sessions/:sessionId/test-cases', (req, res) => {
  const { id: siteId, sessionId } = req.params;
  try {
    const dir = sessionDirFor(siteId, sessionId);
    const { doc } = readYamlDoc(dir);
    res.json({ testCaseGroups: doc.testCaseGroups ?? [] });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Table-editor save: overwrites testCaseGroups in test-cases.yaml (forms
// untouched), then immediately regenerates generated.spec.ts so the edit is
// reflected right away.
router.put('/sites/:id/sessions/:sessionId/test-cases', (req, res) => {
  const { id: siteId, sessionId } = req.params;
  try {
    const dir = sessionDirFor(siteId, sessionId);
    const { yamlPath, doc } = readYamlDoc(dir);
    const { testCaseGroups } = req.body || {};
    if (!Array.isArray(testCaseGroups)) throw new Error('testCaseGroups must be an array');
    doc.testCaseGroups = testCaseGroups;
    fs.writeFileSync(yamlPath, YAML.stringify(doc), 'utf8');
    regenerateFromYaml(dir);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
