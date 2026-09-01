'use strict';

const express = require('express');
const { getClaudeCodeStatus, reviewWithClaudeCode } = require('../../core/ai/claudeCodeAdapter');

const router = express.Router();

router.get('/ai/claude-code/status', async (req, res) => {
  res.json(await getClaudeCodeStatus());
});

router.post('/ai/claude-code/review', async (req, res) => {
  const { authorizationConfirmed, scan, locale } = req.body || {};
  if (!authorizationConfirmed) return res.status(400).json({ error: 'Confirm that you authorize sending the displayed SAST findings to local Claude Code.' });
  try {
    res.json(await reviewWithClaudeCode({ scan, locale }));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
