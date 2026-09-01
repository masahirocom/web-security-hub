'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { REPORT_ROOT } = require('../../core/security/staticReport');

const router = express.Router();

router.get('/security/static-scans/:runId/:file', (req, res) => {
  const { runId, file } = req.params;
  if (!/^sast-[0-9]{14}(?:-[0-9]+)?$/.test(runId) || !/^(report\.(html|md|sarif)|sast-result\.json)$/.test(file)) return res.status(400).json({ error: 'invalid report path' });
  const target = path.join(REPORT_ROOT, runId, file);
  if (!fs.existsSync(target)) return res.status(404).json({ error: 'report not found' });
  res.sendFile(target);
});

module.exports = router;
