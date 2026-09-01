'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { gotoWithLogin } = require('../crawler/login');
const { normalizeSelectorForRuntime, normalizePathForCompare, extractErrors, extractErrorTextHints, sha1 } = require('./runtimeSelectors');

/** Drives a live browser page through exactly one test case: preSteps -> fill -> submit
 * -> screenshot -> error detection. This is the only file in core/runner/ that touches
 * a Playwright `page` directly for case execution (formProcessor.js only calls executeCase). */

function testCaseHasAbnormalAssignment(tc) {
  return Object.values(tc.assignments).some((v) => v.kind === 'abnormal');
}

/** Executes one test case: fill, submit, capture screenshot/DOM, detect errors. */
async function executeCase(session, cfg, form, tc, log) {
  const page = await session.newPage();
  try {
    const expectsError = Object.values(tc.assignments).some((v) => v.kind === 'abnormal');
    log(`      case-start: ${tc.id} open=${form.url}`);
    await gotoWithLogin(page, form.url, cfg.login, () => {});
    await runPreSteps(page, form.preSteps, log);
    await ensureCaseReady(page, form, tc, log);
    const beforeSubmitUrl = page.url();
    const applied = await applyAssignments(page, tc);
    log(`      case-fill: ${tc.id} applied=${applied}/${Object.keys(tc.assignments).length}`);

    if (form.submitSelector) {
      log(`      case-submit: ${tc.id} selector=${normalizeSelectorForRuntime(form.submitSelector)}`);
      await Promise.all([
        page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {}),
        page.click(normalizeSelectorForRuntime(form.submitSelector)).catch(() => {}),
      ]);
    }
    log(`      case-after-submit: ${tc.id} at=${page.url()}`);

    const shotDir = path.join(cfg.outputDir, 'screenshots');
    fs.mkdirSync(shotDir, { recursive: true });
    const shotBase = buildRunShotName(form, tc.id);
    const shot = path.join(shotDir, `${shotBase}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});

    const html = await page.content();
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const extractedErrors = extractErrors(html);
    const textHintErrors = extractErrorTextHints(bodyText);
    const missingRequired = await detectMissingRequiredFields(page, form);
    const transitionErrors = expectsError
      ? []
      : await detectTransitionAnomalies(page, form, beforeSubmitUrl);
    const applyErrors = Object.keys(tc.assignments).length > 0 && applied === 0 ? ['no input value was applied'] : [];
    const allErrors = Array.from(new Set([...extractedErrors, ...textHintErrors, ...missingRequired, ...transitionErrors, ...applyErrors])).slice(0, 20);

    const isAbnormal = testCaseHasAbnormalAssignment(tc);
    const ok = isAbnormal ? true : allErrors.length === 0;

    return {
      testCaseId: tc.id,
      resultUrl: page.url(),
      domHash: sha1(html),
      errorMessages: allErrors,
      screenshotPath: shot,
      ok,
      error: ok ? undefined : allErrors.join('; '),
    };
  } catch (e) {
    return {
      testCaseId: tc.id,
      resultUrl: page.url(),
      domHash: '',
      errorMessages: [],
      ok: false,
      error: e?.message ?? String(e),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function applyAssignments(page, tc) {
  let applied = 0;
  const processedRadioGroups = new Set();
  for (const [selector, gv] of Object.entries(tc.assignments)) {
    if (selector.startsWith('__gm_')) continue;
    try {
      const runtimeSelector = normalizeSelectorForRuntime(selector);
      const el = page.locator(runtimeSelector).first();
      if (!(await el.count().catch(() => 0))) continue;
      const tag = await el.evaluate((n) => n.tagName.toLowerCase()).catch(() => 'input');
      if (tag === 'select') {
        if (gv.value === '__not_in_options__') continue;
        const selected = await el.selectOption(gv.value).catch(() => []);
        if (selected.length > 0) applied++;
      } else {
        const type = await el.getAttribute('type').catch(() => null);
        if (type === 'checkbox' || type === 'radio') {
          if (type === 'checkbox') {
            if (gv.value === 'off') {
              await el.uncheck({ force: true }).catch(() => {});
              if (!(await el.isChecked().catch(() => false))) applied++;
            } else {
              await el.check({ force: true }).catch(() => {});
              if (await el.isChecked().catch(() => false)) applied++;
            }
            continue;
          }

          const radioGroup = await el.getAttribute('name').catch(() => null);
          const radioKey = `radio:${radioGroup || runtimeSelector}`;
          if (processedRadioGroups.has(radioKey)) continue;
          processedRadioGroups.add(radioKey);

          if (!gv.value || gv.value === 'off' || gv.value === '__not_in_options__') continue;
          if (gv.value === 'on') {
            await el.check({ force: true }).catch(() => {});
            if (await el.isChecked().catch(() => false)) {
              applied++;
              continue;
            }
          }

          const selectedByValue = await el
            .evaluate((node, targetValue) => {
              const input = node;
              const root = input.form ?? document;
              if (input.name) {
                const escapedName = globalThis.CSS?.escape ? CSS.escape(input.name) : input.name.replace(/["\\]/g, '\\$&');
                const radios = Array.from(root.querySelectorAll(`input[type="radio"][name="${escapedName}"]`));
                const target = radios.find((r) => r.value === targetValue);
                if (target) {
                  target.click();
                  return !!target.checked;
                }
              }
              if (input.value === targetValue) {
                input.click();
                return !!input.checked;
              }
              return false;
            }, gv.value)
            .catch(() => false);
          if (selectedByValue) {
            applied++;
            continue;
          }
          await el.check({ force: true }).catch(() => {});
          if (await el.isChecked().catch(() => false)) applied++;
        } else {
          const filled = await el.fill(gv.value).then(() => true).catch(() => false);
          if (filled) applied++;
        }
      }
    } catch {
      // an unfillable field is still worth recording as evidence, so swallow and continue
    }
  }
  return applied;
}

/**
 * Runs a form's declarative `preSteps` (radio-select / check / click) before any
 * field is filled, so wizard-style UIs that hide their real fields behind an
 * initial choice (e.g. a custom-styled radio button) can be brought into a
 * fillable state. Hand-authored in a manual forms.json — see manualFormsPath.
 * @param {Array<{action:'radio'|'check'|'uncheck'|'click'|'setFile', selector:string, value?:string, path?:string}>} [preSteps]
 */
async function runPreSteps(page, preSteps, log) {
  if (!Array.isArray(preSteps) || !preSteps.length) return;
  for (const step of preSteps) {
    const runtimeSelector = normalizeSelectorForRuntime(step.selector);
    try {
      // Each step may depend on DOM the previous step just revealed (e.g. a wizard
      // section that renders after a radio is selected) — a live site's render timing
      // varies run to run, so wait for the element to exist rather than a fixed delay.
      await page.locator(runtimeSelector).first().waitFor({ state: 'attached', timeout: 8000 });

      if (step.action === 'radio') {
        await selectRadioByValue(page, runtimeSelector, step.value);
      } else if (step.action === 'check') {
        await page.locator(runtimeSelector).first().check({ force: true, timeout: 5000 });
      } else if (step.action === 'uncheck') {
        await page.locator(runtimeSelector).first().uncheck({ force: true, timeout: 5000 });
      } else if (step.action === 'click') {
        await page.locator(runtimeSelector).first().click({ force: true, timeout: 5000 });
      } else if (step.action === 'setFile') {
        const loc = page.locator(runtimeSelector).first();
        await loc.setInputFiles(step.path, { timeout: 8000 });
        const fileCount = await loc.evaluate((el) => el.files?.length ?? 0).catch(() => -1);
        if (fileCount !== 1) {
          log?.(`      pre-step warning: setFile ${step.selector} — expected 1 file attached, found ${fileCount}`);
        }
      }
      await page.waitForTimeout(200).catch(() => {});
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
    } catch (e) {
      log?.(`      pre-step failed: ${step.action} ${step.selector} (${e.message ?? e})`);
    }
  }
}

/** Selects one radio in a group by value, matching by `name` when present (custom-styled/hidden radios included). */
async function selectRadioByValue(page, selector, value) {
  const loc = page.locator(selector).first();
  if (!(await loc.count().catch(() => 0))) return;
  await loc
    .evaluate((node, targetValue) => {
      const input = node;
      const root = input.form ?? document;
      if (input.name) {
        const escapedName = globalThis.CSS?.escape ? CSS.escape(input.name) : input.name.replace(/["\\]/g, '\\$&');
        const radios = Array.from(root.querySelectorAll(`input[type="radio"][name="${escapedName}"]`));
        const target = radios.find((r) => r.value === targetValue);
        if (target) {
          target.click();
          return;
        }
      }
      if (input.value === targetValue) input.click();
    }, value)
    .catch(() => {});
}

async function detectMissingRequiredFields(page, form) {
  const missing = [];
  const checkedRadioGroups = new Set();
  for (const field of form.fields) {
    if (!field.constraints?.required) continue;
    const runtimeSelector = normalizeSelectorForRuntime(field.selector);
    try {
      const el = page.locator(runtimeSelector).first();
      if (!(await el.count().catch(() => 0))) continue;
      if (field.type === 'checkbox') {
        if (!(await el.isChecked().catch(() => false))) missing.push(`required-missing:${field.selector}`);
      } else if (field.type === 'radio') {
        const name = field.name || field.selector;
        if (checkedRadioGroups.has(name)) continue;
        checkedRadioGroups.add(name);
        const anyChecked = await page
          .locator(`input[type="radio"][name="${(name || '').replace(/["\\]/g, '\\$&')}"]`)
          .evaluateAll((nodes) => nodes.some((n) => n.checked))
          .catch(() => false);
        if (!anyChecked) missing.push(`required-missing:${name}`);
      } else {
        const value = await el.inputValue().catch(() => '');
        if (!value) missing.push(`required-missing:${field.selector}`);
      }
    } catch {
      // best-effort check
    }
  }
  return missing;
}

async function detectTransitionAnomalies(page, form, beforeSubmitUrl) {
  if (!form.submitSelector) return [];
  const after = page.url();
  if (normalizePathForCompare(after) !== normalizePathForCompare(beforeSubmitUrl)) return [];
  // Submission did not navigate anywhere at all — likely blocked client-side.
  return ['no-transition-after-submit'];
}

function buildRunShotName(form, caseId) {
  const pathPart = normalizePathForCompare(form.url).replace(/^\/+/, '').replace(/[^a-zA-Z0-9_-]+/g, '-') || 'root';
  const formPart = (form.formSelector || 'form').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 48) || 'form';
  const fieldShape = form.fields
    .map((f) => `${f.selector}:${f.type}`)
    .sort((a, b) => a.localeCompare(b))
    .join('|');
  const shapeHash = crypto.createHash('sha1').update(fieldShape).digest('hex').slice(0, 8);
  return `${pathPart}-${formPart}-${shapeHash}-${caseId}`;
}

/** Advances past generic consent/interstitial gates until the case's target fields become reachable. */
async function ensureCaseReady(page, form, tc, log) {
  const selectors = Object.keys(tc.assignments).map(normalizeSelectorForRuntime);
  if (!selectors.length) return;
  const seenStates = new Set();

  for (let step = 0; step < 6; step++) {
    if (await hasReachableTarget(page, selectors)) {
      if (step > 0) log?.(`      ready-ok: ${tc.id} step=${step} at=${page.url()}`);
      return;
    }

    const stateKey = await page
      .evaluate(() => `${location.pathname}${location.search}|input:${!!document.querySelector('input[type="text"], select, textarea')}`)
      .catch(() => `${normalizePathForCompare(page.url())}|unknown`);

    if (seenStates.has(stateKey)) {
      log?.(`      ready-stop: ${tc.id} same-state-loop`);
      break;
    }
    seenStates.add(stateKey);

    const before = page.url();
    await advancePreconditionStep(page, form.submitSelector);
    const after = page.url();
    log?.(`      ready-advance: ${tc.id} from=${before} to=${after}`);

    const changed = normalizePathForCompare(before) !== normalizePathForCompare(after);
    if (!changed && !(await hasReachableTarget(page, selectors))) {
      log?.(`      ready-stop: ${tc.id} unchanged-and-unreachable`);
      break;
    }
  }
}

async function hasReachableTarget(page, selectors) {
  const samples = selectors.slice(0, 20);
  for (const s of samples) {
    const loc = page.locator(s).first();
    const visible = await loc.isVisible().catch(async () => (await loc.count().catch(() => 0)) > 0);
    if (visible) return true;
  }
  return false;
}

/** Generic consent-gate advancer: checks any agree/consent-labeled checkbox, then clicks a next-like button. */
async function advancePreconditionStep(page, submitSelector) {
  const checks = page.locator('input[type="checkbox"]');
  const n = await checks.count().catch(() => 0);
  for (let i = 0; i < Math.min(n, 8); i++) {
    const cb = checks.nth(i);
    const text = await cb
      .evaluate((node) => {
        const id = node.id || '';
        const root = node.ownerDocument || document;
        const label = id ? root.querySelector(`label[for="${id.replace(/(["\\])/g, '\\$1')}"]`) : null;
        return `${node.name || ''} ${id} ${label?.textContent || ''}`.trim();
      })
      .catch(() => '');
    if (!/(agree|consent|同意|規約)/i.test(text)) continue;
    if (!(await cb.isChecked().catch(() => false))) await cb.check({ force: true }).catch(() => {});
  }

  const clickCandidates = [
    submitSelector,
    'button:has-text("次へ")',
    'button:has-text("進む")',
    'button:has-text("同意")',
    'button:has-text("Next")',
    'button:has-text("Continue")',
    'input[type="submit"]',
    'button[type="submit"]',
  ].filter(Boolean);

  for (const sel of clickCandidates) {
    const target = page.locator(sel).first();
    if (!(await target.count().catch(() => 0))) continue;
    if (!(await target.isVisible().catch(() => false))) continue;
    if (!(await target.isEnabled().catch(() => true))) continue;
    await target.click({ force: true, timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(200).catch(() => {});
    await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    break;
  }
}

module.exports = { executeCase, testCaseHasAbnormalAssignment, buildRunShotName };
