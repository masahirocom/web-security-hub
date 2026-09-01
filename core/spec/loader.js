'use strict';
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

/**
 * Loads *.yaml/*.yml/*.json Rule Spec files from a directory tree.
 * @param {string} dir
 * @returns {{ specs: any[], loadedFiles: Array<{file:string, ruleCount:number}>, warnings: string[] }}
 */
function loadRuleSpecs(dir) {
  const warnings = [];
  const specs = [];
  const loadedFiles = [];
  if (!fs.existsSync(dir)) {
    return { specs, loadedFiles, warnings: [`Rule Spec directory does not exist: ${dir}`] };
  }
  const files = walk(dir).filter((f) => /\.(ya?ml|json)$/i.test(f));
  for (const file of files) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const data = /\.json$/i.test(file) ? JSON.parse(raw) : YAML.parse(raw);
      const spec = validateSpec(data, file, warnings);
      if (spec) {
        specs.push(spec);
        loadedFiles.push({ file, ruleCount: spec.rules.length });
      }
    } catch (e) {
      warnings.push(`Failed to load ${path.basename(file)}: ${e.message}`);
    }
  }
  return { specs, loadedFiles, warnings };
}

function validateSpec(data, file, warnings) {
  if (!data || typeof data !== 'object') {
    warnings.push(`Invalid content ${path.basename(file)}`);
    return null;
  }
  const rules = Array.isArray(data.rules) ? data.rules : [];
  if (!rules.length) warnings.push(`rules is empty ${path.basename(file)}`);
  for (const r of rules) {
    if (!r.ruleId) warnings.push(`${path.basename(file)}: a rule is missing ruleId`);
    if (!r.status) r.status = 'Draft';
    if (!r.priority) r.priority = 'Medium';
  }
  return { version: data.version ?? '0.1', screen: data.screen, rules };
}

/** Filters to only Approved rules, for gating golden-master expectation assertions. */
function approvedRules(specs) {
  return specs.flatMap((s) => s.rules).filter((r) => r.status === 'Approved');
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

module.exports = { loadRuleSpecs, approvedRules };
