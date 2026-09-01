#!/usr/bin/env node
'use strict';

/**
 * Usage:
 *   node core/cli/yamlTools.js export <session-dir>      # writes test-cases.yaml
 *   node core/cli/yamlTools.js regenerate <session-dir>  # writes generated.spec.ts from test-cases.yaml
 */
const path = require('path');
const { writeTestCasesYaml, regenerateFromYaml } = require('../codegen/testCaseYaml');

function main() {
  const [cmd, dirArg] = process.argv.slice(2);
  if (!cmd || !dirArg || !['export', 'regenerate'].includes(cmd)) {
    console.error('Usage: node core/cli/yamlTools.js <export|regenerate> <session-dir>');
    process.exit(1);
  }
  const sessionDir = path.resolve(process.cwd(), dirArg);
  if (cmd === 'export') {
    const out = writeTestCasesYaml(sessionDir);
    console.log(`[yamlTools] test-cases.yaml written: ${out}`);
  } else {
    const out = regenerateFromYaml(sessionDir);
    console.log(`[yamlTools] generated.spec.ts written: ${out}`);
  }
}

main();
