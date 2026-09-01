'use strict';
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const { generatePlaywrightCode } = require('./playwright');

/**
 * Lossless YAML mirror of a session's forms.json + test-cases.json, for a
 * human to hand-edit (tweak a value, drop/add a case) and then regenerate
 * generated.spec.ts from — a JSON-shaped structure is kept on purpose
 * (rather than inventing a friendlier schema) so nothing codegen needs
 * (selectors, field constraints/type, preSteps, assignment kind/rationale)
 * is lost in the round trip.
 *
 * @param {string} sessionDir
 * @returns {string} path to the written test-cases.yaml
 */
function writeTestCasesYaml(sessionDir) {
  const forms = readJson(path.join(sessionDir, 'forms.json'), []);
  const testCaseGroups = readJson(path.join(sessionDir, 'test-cases.json'), []);
  const doc = { forms, testCaseGroups };
  const out = path.join(sessionDir, 'test-cases.yaml');
  fs.writeFileSync(out, YAML.stringify(doc), 'utf8');
  return out;
}

/**
 * Reads test-cases.yaml (edited or not) and regenerates generated.spec.ts
 * from it, using the same codegen used at pipeline-generation time. Page
 * regression blocks are rebuilt from url-catalog.json; login config is
 * re-read fresh from the owning site's site.config.json (derived from the
 * session's path: sites/<siteId>/.golden-master/<session>/).
 *
 * @param {string} sessionDir
 * @returns {string} path to the written generated.spec.ts
 */
function regenerateFromYaml(sessionDir) {
  const yamlPath = path.join(sessionDir, 'test-cases.yaml');
  if (!fs.existsSync(yamlPath)) {
    throw new Error(`test-cases.yaml not found — run "YAMLを書き出す" first: ${yamlPath}`);
  }
  const doc = YAML.parse(fs.readFileSync(yamlPath, 'utf8')) || {};
  const forms = Array.isArray(doc.forms) ? doc.forms : [];
  const testCaseGroups = Array.isArray(doc.testCaseGroups) ? doc.testCaseGroups : [];

  const items = testCaseGroups
    .map((g) => {
      const form = forms.find((f) => f.url === g.url);
      if (!form) return undefined;
      return { form, cases: g.cases ?? [], expectations: [] };
    })
    .filter(Boolean);

  const catalog = readJson(path.join(sessionDir, 'url-catalog.json'), { visited: [], pages: [] });
  const runnerSettings = resolveRunnerSettings(sessionDir);

  const code = generatePlaywrightCode(items, {
    login: runnerSettings.login,
    scenarioSteps: runnerSettings.scenario?.steps,
    visitedUrls: catalog.visited ?? [],
    visitedPages: catalog.pages ?? [],
  });

  const out = path.join(sessionDir, 'generated.spec.ts');
  fs.writeFileSync(out, code, 'utf8');
  return out;
}

function resolveRunnerSettings(sessionDir) {
  try {
    // sessionDir = sites/<siteId>/.golden-master/<session>
    const siteId = path.basename(path.resolve(sessionDir, '..', '..'));
    const { buildRunnerConfig } = require('../siteConfig');
    const config = buildRunnerConfig(siteId).runnerConfig;
    return { login: config.login, scenario: config.scenario };
  } catch {
    return {};
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

module.exports = { writeTestCasesYaml, regenerateFromYaml };
