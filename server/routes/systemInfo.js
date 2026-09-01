'use strict';
const express = require('express');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const pkg = require('../../package.json');

const router = express.Router();

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 3000 }).trim();
  } catch {
    return undefined;
  }
}

function playwrightVersion() {
  try {
    return require('playwright/package.json').version;
  } catch {
    return undefined;
  }
}

router.get('/system-info', (req, res) => {
  res.json({
    app: {
      name: pkg.name,
      version: pkg.version,
      root: path.join(__dirname, '..', '..'),
    },
    node: {
      version: process.version,
      execPath: process.execPath,
    },
    npm: {
      version: safeExec('npm -v'),
    },
    playwright: {
      version: playwrightVersion(),
    },
    os: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      type: os.type(),
      cpus: os.cpus().length,
      totalMemGB: Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10,
      freeMemGB: Math.round((os.freemem() / 1024 / 1024 / 1024) * 10) / 10,
      hostname: os.hostname(),
    },
    server: {
      pid: process.pid,
      port: process.env.PORT || 4173,
      uptimeSec: Math.round(process.uptime()),
    },
  });
});

module.exports = router;
