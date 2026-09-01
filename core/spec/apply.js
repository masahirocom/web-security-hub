'use strict';

/**
 * Binds Rule Spec rules applicable to a given scanned form, resolving their
 * business-name inputs to concrete field selectors, and returns
 * constraint overrides / extra candidate values / combination constraints /
 * golden-master expectations.
 * @param {import('../crawler/formScanner').ScannedForm} form
 * @param {any[]} specs
 * @param {boolean} [approvedOnly]
 */
function bindSpecsToForm(form, specs, approvedOnly = true) {
  const binding = {
    constraintOverrides: new Map(),
    extraValues: new Map(),
    combinations: [],
    expectations: [],
    appliedRules: [],
  };

  const rules = specs
    .flatMap((s) => s.rules.map((r) => ({ r, screenUrl: s.screen?.urlPattern })))
    .filter(({ r, screenUrl }) => matchesForm(form, r, screenUrl));

  for (const { r } of rules) {
    binding.appliedRules.push(r.ruleId);

    for (const c of r.constraints ?? []) {
      const sel = resolveInputSelector(form, c.input, r);
      if (!sel) continue;
      const cur = binding.constraintOverrides.get(sel) ?? { source: 'spec' };
      if (c.required !== undefined) cur.required = c.required;
      if (c.maxLength !== undefined) cur.maxLength = c.maxLength;
      if (c.minLength !== undefined) cur.minLength = c.minLength;
      if (c.min !== undefined) cur.min = c.min;
      if (c.max !== undefined) cur.max = c.max;
      if (c.pattern !== undefined) cur.pattern = c.pattern;
      binding.constraintOverrides.set(sel, cur);
    }

    const cands = [...(r.boundaryCandidates ?? []), ...(r.abnormalCandidates ?? [])];
    for (const cand of cands) {
      const sel = resolveInputSelector(form, cand.input, r);
      if (!sel) continue;
      const list = binding.extraValues.get(sel) ?? [];
      list.push({ fieldSelector: sel, kind: cand.kind, value: cand.value, rationale: `spec:${r.ruleId} ${cand.rationale ?? ''}`.trim() });
      binding.extraValues.set(sel, list);
    }

    for (const comb of r.combinationCandidates ?? []) {
      const selectors = comb.inputs.map((name) => resolveInputSelector(form, name, r)).filter((s) => !!s);
      if (selectors.length >= 2) {
        binding.combinations.push({ type: comb.type, selectors, when: comb.when, note: comb.note, ruleId: r.ruleId });
      }
    }

    if (!approvedOnly || r.status === 'Approved') {
      const ruleSelectors = r.inputs.map((i) => resolveInputSelector(form, i.name, r)).filter((s) => !!s);
      for (const exp of r.expected ?? []) {
        binding.expectations.push({
          ruleId: r.ruleId,
          selectors: ruleSelectors,
          kind: exp.kind,
          when: exp.when,
          description: exp.description,
          messageContains: exp.messageContains,
        });
      }
    }
  }

  return binding;
}

function matchesForm(form, rule, screenUrl) {
  const pat = rule.urlPattern ?? screenUrl;
  if (!pat) return true; // rules without a URL pattern loosely apply to every form
  return urlMatches(form.url, pat);
}

function urlMatches(url, pattern) {
  if (url.includes(pattern)) return true;
  const re = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  try {
    const p = new URL(url).pathname;
    return re.test(url) || re.test(p);
  } catch {
    return re.test(url);
  }
}

function resolveInputSelector(form, inputName, rule) {
  if (!inputName) return undefined;

  const ri = rule.inputs.find((i) => i.name === inputName);
  if (ri?.selector && form.fields.some((f) => f.selector === ri.selector)) return ri.selector;
  if (ri?.fieldName) {
    const byName = form.fields.find((f) => f.name === ri.fieldName);
    if (byName) return byName.selector;
  }

  const norm = (s) => (s ?? '').trim().toLowerCase();
  const target = norm(ri?.label ?? inputName);
  const hit =
    form.fields.find((f) => norm(f.name) === norm(inputName)) ??
    form.fields.find((f) => norm(f.label) === target) ??
    form.fields.find((f) => norm(f.semantic) === target) ??
    form.fields.find((f) => norm(f.placeholder) === target) ??
    form.fields.find((f) => norm(f.label).includes(target) && target.length > 0);
  return hit?.selector;
}

module.exports = { bindSpecsToForm };
