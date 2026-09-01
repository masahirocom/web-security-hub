'use strict';

const { scanStatic } = require('../../core/security/staticScanner');
const { persistStaticReport } = require('../../core/security/staticReport');

function runStaticScan(sourceDir) {
  const result = scanStatic({ sourceDir });
  return { ...result, report: persistStaticReport(result) };
}

module.exports = { runStaticScan };
