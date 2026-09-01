'use strict';
const fs = require('fs');

/** Turning a raw crawl (+ optional hand-authored manual-forms.json) into the
 * deduped, classified set of forms `formRunner` will actually process. */

/** If cfg.manualFormsPath is set, it fully replaces the crawler-detected forms — see manualFormsPath in README. */
function loadManualForms(manualFormsPath, crawledForms, log) {
  if (!manualFormsPath) return crawledForms;
  if (!fs.existsSync(manualFormsPath)) {
    log(`WARNING: manualFormsPath is configured but the file does not exist: ${manualFormsPath}`);
    return crawledForms;
  }
  const manualForms = JSON.parse(fs.readFileSync(manualFormsPath, 'utf8'));
  log(`Manual forms loaded: ${manualForms.length} (${manualFormsPath}) — overriding crawler-detected forms (${crawledForms.length})`);
  return manualForms;
}

function dedupeForms(forms) {
  const out = [];
  const seen = new Set();
  for (const f of forms) {
    const fieldShape = f.fields
      .map((field) => `${field.selector}:${field.type}:${field.name ?? ''}`)
      .sort()
      .join('|');
    const key = `${f.url}::${f.formSelector}::${f.submitSelector ?? ''}::${fieldShape}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

function isAgreementOnlyForm(form) {
  if (form.fields.length !== 1) return false;
  const f = form.fields[0];
  if (f.type !== 'checkbox') return false;
  const text = [f.name, f.id, f.label, f.placeholder].filter(Boolean).join(' ').toLowerCase();
  return /(agree|consent|同意|規約)/i.test(text);
}

/** Filters forms out of the "run pairwise + execute" pipeline: auth/login forms (a different concern than this
 * tool's field-value testing) and bare agreement checkboxes (nothing meaningful to pairwise-test). */
function classifyForm(form) {
  const p = form.url.toLowerCase();
  const hasPasswordField = form.fields.some((field) => field.type === 'password');
  const hasCredentialField = form.fields.some((field) => {
    const text = [field.name, field.id, field.label, field.placeholder, field.semantic].filter(Boolean).join(' ').toLowerCase();
    return /login|sign in|signin|password|passcode|email|mail|user|account|auth/.test(text);
  });
  const shortForm = form.fields.length <= 4;

  if (/(login|signin|sign-in|auth|resetpassword|forgot|password|entry)/.test(p)) {
    return { auth: true, agreementOnly: false };
  }
  return { auth: shortForm && hasPasswordField && hasCredentialField, agreementOnly: isAgreementOnlyForm(form) };
}

function shouldPrimeLogin(cfg) {
  const seed = (cfg.url || '').toLowerCase();
  const loginUrl = (cfg.login?.loginUrl || '').toLowerCase();
  if (loginUrl && seed === loginUrl) return true;
  return /(login|signin|sign-in|auth)/.test(seed);
}

function normalizeCatalogUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

function summarizeCatalogForms(forms) {
  return forms.map((f) => ({
    formSelector: f.formSelector,
    submitSelector: f.submitSelector,
    fieldCount: f.fields.length,
    requiredCount: f.fields.filter((field) => !!field.constraints?.required).length,
  }));
}

function buildUrlCatalog(seedUrl, visited, pageSnapshots, forms) {
  const byUrl = new Map();
  for (const f of forms) {
    const key = normalizeCatalogUrl(f.url);
    const list = byUrl.get(key) ?? [];
    list.push(f);
    byUrl.set(key, list);
  }

  const pagesByUrl = new Map();
  for (const snap of pageSnapshots) {
    const key = normalizeCatalogUrl(snap.url);
    pagesByUrl.set(key, {
      url: snap.url,
      title: snap.title,
      markers: snap.markers,
      textHash: snap.textHash,
      forms: summarizeCatalogForms(byUrl.get(key) ?? []),
    });
  }

  for (const u of visited) {
    const key = normalizeCatalogUrl(u);
    if (!pagesByUrl.has(key)) {
      pagesByUrl.set(key, { url: u, title: '', markers: [], textHash: '', forms: summarizeCatalogForms(byUrl.get(key) ?? []) });
    }
  }

  const pages = Array.from(pagesByUrl.values()).sort((a, b) => a.url.localeCompare(b.url));
  const normalizedVisited = Array.from(new Set(visited.map(normalizeCatalogUrl))).sort();

  return { seedUrl, generatedAt: new Date().toISOString(), visited: normalizedVisited, pages };
}

function uniquePageCaseCount(snapshots, fallbackVisited) {
  const urls = snapshots.length ? snapshots.map((s) => s.url) : fallbackVisited;
  return new Set(
    urls.map((u) => {
      try {
        const parsed = new URL(u);
        return parsed.pathname + parsed.search;
      } catch {
        return u;
      }
    }),
  ).size;
}

module.exports = {
  loadManualForms,
  dedupeForms,
  classifyForm,
  shouldPrimeLogin,
  buildUrlCatalog,
  uniquePageCaseCount,
};
