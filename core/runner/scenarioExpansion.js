'use strict';

/**
 * Generic, config-driven test-case "scenario expansion".
 *
 * This replaces the old approach of hardcoding a per-site regex + selector +
 * multi-step-family-form branch directly in the runner. Instead, a site's
 * site.config.json can declare a `scenarioExpansion` array (see
 * webapp/schema/site-config.schema.json) of the shape:
 *
 *   { urlPattern, triggerSelector, templates: [{ name, overrides }] }
 *
 * For each entry whose urlPattern matches the scanned form's URL AND whose
 * triggerSelector exists among the form's fields, we synthesize one extra
 * test case per template: the current normal-value baseline case with the
 * template's selector->value overrides applied on top.
 *
 * To extend this for a specific site's needs beyond simple selector/value
 * overrides (e.g. a multi-step wizard that needs custom navigation logic),
 * add a new, more specific hook function here and call it from
 * runFormGeneration in formRunner.js — keep any such logic behind an
 * explicit site.config.json flag rather than sniffing the URL/DOM, so the
 * runner stays generic by default.
 *
 * @param {import('../crawler/formScanner').ScannedForm} form
 * @param {Map<string, any[]>} fieldValues
 * @param {any[]} cases
 * @param {number} maxCases
 * @param {Array<{urlPattern:string, triggerSelector:string, templates:Array<{name:string, overrides:Record<string,string>}>}>} [scenarioExpansionConfig]
 * @returns {any[]}
 */
function expandScenarios(form, fieldValues, cases, maxCases, scenarioExpansionConfig) {
  const configs = scenarioExpansionConfig ?? [];
  if (!configs.length) return cases;

  const applicable = configs.filter((cfg) => {
    let re;
    try {
      re = new RegExp(cfg.urlPattern, 'i');
    } catch {
      return false;
    }
    if (!re.test(form.url)) return false;
    return form.fields.some((f) => f.selector === cfg.triggerSelector);
  });
  if (!applicable.length) return cases;

  const normalBase =
    cases.find((tc) => {
      const kinds = Object.values(tc.assignments).map((v) => v.kind);
      return kinds.length > 0 && kinds.every((k) => k === 'normal');
    }) ?? cases[0];
  if (!normalBase) return cases;

  const forced = [];
  let seq = 0;
  for (const cfg of applicable) {
    for (const tpl of cfg.templates) {
      seq++;
      const assignments = { ...normalBase.assignments };
      for (const [selector, value] of Object.entries(tpl.overrides || {})) {
        assignments[selector] = {
          fieldSelector: selector,
          kind: 'normal',
          value: String(value),
          rationale: `scenarioExpansion: ${tpl.name}`,
        };
      }
      forced.push({ id: `case-scenario-${String(seq).padStart(3, '0')}`, name: tpl.name, assignments });
    }
  }

  const merged = dedupeByAssignmentSignature([...forced, ...cases]);
  return merged.slice(0, maxCases);
}

function dedupeByAssignmentSignature(cases) {
  const out = [];
  const seen = new Set();
  for (const tc of cases) {
    const sig = Object.entries(tc.assignments)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v.kind}:${v.value}`)
      .join('|');
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(tc);
  }
  return out;
}

module.exports = { expandScenarios };
