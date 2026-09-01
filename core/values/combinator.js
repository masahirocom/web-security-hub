'use strict';

/**
 * Builds test cases from per-field candidate value lists using a greedy
 * pairwise (all-pairs) strategy: baseline row -> round-robin one-factor-at-
 * a-time -> greedy pairwise coverage.
 * @param {Map<string, Array>} fieldValues
 * @param {number} maxCases
 */
function buildTestCases(fieldValues, maxCases) {
  const selectors = Array.from(fieldValues.keys());
  if (selectors.length === 0) return [];

  // Representative "normal" value per field, used for the baseline row.
  // Rule-Spec-sourced normal values (rationale starting with "spec:") win,
  // since some fields (e.g. cross-field-dependent dates) can't be made valid
  // by the generator alone and need a human/spec-confirmed value to anchor on.
  const baseValue = new Map();
  for (const sel of selectors) {
    const vals = fieldValues.get(sel);
    const specNormal = vals.find((v) => v.kind === 'normal' && v.rationale?.startsWith('spec:'));
    baseValue.set(sel, specNormal ?? vals.find((v) => v.kind === 'normal') ?? vals[0]);
  }

  const cases = [];
  const seen = new Set();
  const tryAdd = (assignment) => {
    const key = selectors.map((s) => assignment[s]?.value ?? '').join('|');
    if (seen.has(key)) return;
    seen.add(key);
    cases.push(assignment);
  };

  // 1) all-normal baseline
  const baseline = {};
  for (const sel of selectors) baseline[sel] = baseValue.get(sel);
  tryAdd(baseline);

  // 2) one-factor-at-a-time, breadth-first across fields (round robin) so
  //    forms with many fields don't burn the whole maxCases budget on the
  //    first few fields before ever touching the later ones.
  const nonBaselineValues = new Map();
  for (const sel of selectors) {
    nonBaselineValues.set(sel, fieldValues.get(sel).filter((v) => v !== baseValue.get(sel)));
  }
  const maxRounds = Math.max(0, ...Array.from(nonBaselineValues.values()).map((vs) => vs.length));
  roundRobin: for (let round = 0; round < maxRounds; round++) {
    for (const sel of selectors) {
      const vals = nonBaselineValues.get(sel);
      if (round >= vals.length) continue;
      const a = { ...baseline, [sel]: vals[round] };
      tryAdd(a);
      if (cases.length >= maxCases) break roundRobin;
    }
  }
  if (cases.length >= maxCases) return toTestCases(cases.slice(0, maxCases));

  // 3) pairwise: greedily cover every pair of (field,value) combinations.
  //    Pairs are keyed by index (not selector/value strings) so selectors
  //    containing "=", "[", "]" etc. can't corrupt the key format.
  const valuesByIdx = selectors.map((s) => fieldValues.get(s));
  const uncovered = new Set(); // "i:vi|j:vj" (i<j)
  for (let i = 0; i < selectors.length; i++) {
    for (let j = i + 1; j < selectors.length; j++) {
      for (let a = 0; a < valuesByIdx[i].length; a++) {
        for (let b = 0; b < valuesByIdx[j].length; b++) {
          uncovered.add(idxPairKey(i, a, j, b));
        }
      }
    }
  }
  const valueIndexInCase = (c, idx) => valuesByIdx[idx].findIndex((v) => v === c[selectors[idx]]);
  for (const c of cases) removeCoveredPairs(c, selectors, valuesByIdx, uncovered, valueIndexInCase);

  while (uncovered.size > 0 && cases.length < maxCases) {
    const first = uncovered.values().next().value;
    const { i, a, j, b } = parseIdxPairKey(first);
    const assignment = { ...baseline };
    assignment[selectors[i]] = valuesByIdx[i][a];
    assignment[selectors[j]] = valuesByIdx[j][b];
    for (let k = 0; k < selectors.length; k++) {
      if (k === i || k === j) continue;
      assignment[selectors[k]] = pickGreedy(k, assignment, selectors, valuesByIdx, uncovered);
    }
    tryAdd(assignment);
    removeCoveredPairs(assignment, selectors, valuesByIdx, uncovered, valueIndexInCase);
  }

  return toTestCases(cases.slice(0, maxCases));
}

function idxPairKey(i, a, j, b) {
  return i < j ? `${i}:${a}|${j}:${b}` : `${j}:${b}|${i}:${a}`;
}

function parseIdxPairKey(k) {
  const [left, right] = k.split('|');
  const [i, a] = left.split(':').map(Number);
  const [j, b] = right.split(':').map(Number);
  return { i, a, j, b };
}

/**
 * Applies Rule-Spec-derived combination constraints to a generated case set.
 *  - forbidden: drop cases where 2+ of the listed inputs are simultaneously non-normal
 *  - required_pair: ensure at least one case has all listed inputs non-normal
 */
function applyCombinationConstraints(cases, combinations, fieldValues, maxCases) {
  if (!combinations.length) return { cases, dropped: 0, added: 0 };

  const isNonNormal = (tc, sel) => tc.assignments[sel] && tc.assignments[sel].kind !== 'normal';

  let result = [...cases];
  let dropped = 0;
  let added = 0;

  for (const comb of combinations.filter((c) => c.type === 'forbidden')) {
    const before = result.length;
    result = result.filter((tc) => comb.selectors.filter((s) => isNonNormal(tc, s)).length < 2);
    dropped += before - result.length;
  }

  for (const comb of combinations.filter((c) => c.type === 'required_pair')) {
    const covered = result.some((tc) => comb.selectors.every((s) => isNonNormal(tc, s)));
    if (covered || result.length >= maxCases) continue;

    const baseline = {};
    for (const [sel, vals] of fieldValues) {
      baseline[sel] = vals.find((v) => v.kind === 'normal') ?? vals[0];
    }
    for (const sel of comb.selectors) {
      const vals = fieldValues.get(sel);
      const nn = vals?.find((v) => v.kind !== 'normal');
      if (nn) baseline[sel] = nn;
    }
    result.push({ id: `case-req-${comb.ruleId}`, name: `required-combination(${comb.ruleId})`, assignments: baseline });
    added++;
  }

  return { cases: result.slice(0, maxCases), dropped, added };
}

function pickGreedy(k, partial, selectors, valuesByIdx, uncovered) {
  const candidates = valuesByIdx[k];
  let best = candidates[0];
  let bestScore = -1;
  for (let a = 0; a < candidates.length; a++) {
    let score = 0;
    for (let other = 0; other < selectors.length; other++) {
      if (other === k || !partial[selectors[other]]) continue;
      const ob = valuesByIdx[other].indexOf(partial[selectors[other]]);
      if (ob >= 0 && uncovered.has(idxPairKey(k, a, other, ob))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = candidates[a];
    }
  }
  return best;
}

function removeCoveredPairs(c, selectors, valuesByIdx, uncovered, valueIndexInCase) {
  for (let i = 0; i < selectors.length; i++) {
    for (let j = i + 1; j < selectors.length; j++) {
      if (c[selectors[i]] && c[selectors[j]]) {
        const a = valueIndexInCase(c, i);
        const b = valueIndexInCase(c, j);
        if (a >= 0 && b >= 0) uncovered.delete(idxPairKey(i, a, j, b));
      }
    }
  }
}

function toTestCases(cases) {
  return cases.map((assignments, i) => {
    const kinds = Object.values(assignments).map((v) => v.kind);
    const label = kinds.includes('abnormal') ? 'abnormal' : kinds.includes('boundary') ? 'boundary' : 'normal';
    return { id: `case-${String(i + 1).padStart(3, '0')}`, name: `${label} #${i + 1}`, assignments };
  });
}

module.exports = { buildTestCases, applyCombinationConstraints };
