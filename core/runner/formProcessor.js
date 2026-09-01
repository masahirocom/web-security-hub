'use strict';
const { generateValues, mergeValues } = require('../values/generator');
const { buildTestCases, applyCombinationConstraints } = require('../values/combinator');
const { bindSpecsToForm } = require('../spec/apply');
const { expandScenarios } = require('./scenarioExpansion');
const { executeCase, testCaseHasAbnormalAssignment } = require('./caseExecutor');

/** One form's pipeline: Rule Spec binding -> AI semantic inference -> value generation ->
 * pairwise case building -> scenario expansion -> (optionally) execution against a live browser. */
async function processForm(form, specs, llm, cfg, session, store, log) {
  const binding = specs.length ? bindSpecsToForm(form, specs) : undefined;
  if (binding && binding.appliedRules.length) {
    log(`  Rule Spec applied: ${binding.appliedRules.length} rules / ${binding.expectations.length} expectations`);
    for (const f of form.fields) {
      const ov = binding.constraintOverrides.get(f.selector);
      if (ov) f.constraints = { ...f.constraints, ...ov, source: 'spec' };
    }
  }

  let semantics = [];
  try {
    log(`  Running AI semantic inference: ${llm.name}`);
    semantics = await llm.inferFieldSemantics(form.fields, '');
    log(`  AI semantic inference done: ${semantics.length} fields`);
    for (const s of semantics) {
      const f = form.fields.find((x) => x.selector === s.selector);
      if (f) f.semantic = s.semantic;
    }
  } catch (e) {
    log(`  WARNING: LLM inference failed (continuing with fallback): ${e.message}`);
  }

  const fieldValues = new Map();
  for (const f of form.fields) {
    const sem = semantics.find((s) => s.selector === f.selector);
    let vals = generateValues(f, sem);
    const extra = binding?.extraValues.get(f.selector);
    if (extra && extra.length) vals = mergeValues(vals, extra);
    if (cfg.normalOnlyPairwise) {
      const normalOnly = vals.filter((v) => v.kind === 'normal');
      vals = normalOnly.length ? normalOnly : vals.slice(0, 1);
    }
    fieldValues.set(f.selector, vals);
  }

  let cases = buildTestCases(fieldValues, cfg.maxCasesPerForm);
  if (!cfg.normalOnlyPairwise && binding && binding.combinations.length) {
    const r = applyCombinationConstraints(cases, binding.combinations, fieldValues, cfg.maxCasesPerForm);
    cases = r.cases;
    log(`  Combination constraints: dropped ${r.dropped} / added ${r.added}`);
  } else if (cfg.normalOnlyPairwise && binding?.combinations.length) {
    log('  Combination constraints: skipped (normalOnlyPairwise=true)');
  }

  cases = expandScenarios(form, fieldValues, cases, cfg.maxCasesPerForm, cfg.scenarioExpansion);
  cases = pruneOptionalAssignmentsForNormal(form, cases);
  log(`  ${cases.length} test cases`);
  await store.saveTestCases(form.url, cases);

  if (cfg.dryRun) {
    log('  dryRun=true, skipping execution (values only)');
    return { item: { form, cases, expectations: binding?.expectations ?? [] }, execution: { executed: 0, ok: 0, ng: 0, summaries: [] } };
  }

  return { item: { form, cases, expectations: binding?.expectations ?? [] }, execution: await runCases(form, cases, cfg, session, store, log) };
}

async function runCases(form, cases, cfg, session, store, log) {
  let executed = 0;
  let ok = 0;
  let ng = 0;
  const summaries = [];
  let i = 0;
  for (const tc of cases) {
    i++;
    const result = await executeCase(session, cfg, form, tc, log);
    executed++;
    if (result.ok) ok++;
    else ng++;
    summaries.push({
      formUrl: form.url,
      caseId: tc.id,
      caseName: tc.name,
      ok: result.ok,
      resultUrl: result.resultUrl,
      screenshotPath: result.screenshotPath,
      error: result.error,
      errorMessages: result.errorMessages,
      assignmentHints: Object.entries(tc.assignments)
        .slice(0, 20)
        .map(([selector, v]) => `${selector}=${v.value} (${v.kind})`),
    });
    await store.saveRunResult(form.url, result);
    log(`    [${i}/${cases.length}] ${tc.name} -> ${result.ok ? 'OK' : 'NG'} ${result.error ?? ''}`);
    if ((cfg.fastFail ?? true) && !result.ok && !testCaseHasAbnormalAssignment(tc)) {
      log('    fastFail: NG on a normal/boundary case, stopping remaining cases for this form');
      break;
    }
  }
  return { executed, ok, ng, summaries };
}

function pruneOptionalAssignmentsForNormal(form, cases) {
  const requiredSelectors = new Set(form.fields.filter((f) => !!f.constraints?.required).map((f) => f.selector));
  if (!requiredSelectors.size) return cases;

  return cases.map((tc) => {
    const kinds = Object.values(tc.assignments).map((v) => v.kind);
    const isNormalOnly = kinds.length > 0 && kinds.every((k) => k === 'normal');
    if (!isNormalOnly) return tc;

    const filtered = Object.fromEntries(Object.entries(tc.assignments).filter(([selector]) => requiredSelectors.has(selector)));
    return Object.keys(filtered).length ? { ...tc, assignments: filtered } : tc;
  });
}

module.exports = { processForm };
