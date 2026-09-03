'use strict';

const express = require('express');
const { PlaywrightScenarioRecorder } = require('../../core/scenario/playwrightRecorder');

const router = express.Router();
const recorder = new PlaywrightScenarioRecorder();

router.get('/scenario-recorder/status', (req, res) => res.json(recorder.status()));

router.post('/scenario-recorder/start', async (req, res) => {
  try {
    const { siteId, authorized, includeInputValues } = req.body || {};
    if (!authorized) throw new Error('explicit authorization is required before recording');
    if (typeof siteId !== 'string' || !siteId.trim()) throw new Error('siteId is required');
    res.json(await recorder.start({ siteId: siteId.trim(), includeInputValues }));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/scenario-recorder/stop', async (req, res) => {
  try {
    res.json(await recorder.stop());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
