'use strict';
const crypto = require('crypto');

/** Selector/URL normalization and lightweight error-text extraction shared by
 * form processing and case execution — no Playwright/page dependency. */

/** `#foo[bar]` isn't valid CSS as an id-selector shorthand — rewrite to an attribute selector. */
function normalizeSelectorForRuntime(selector) {
  if (!selector || !selector.startsWith('#')) return selector;
  const id = selector.slice(1);
  if (!/[[\]]/.test(id)) return selector;
  const escaped = id.replace(/["\\]/g, '\\$&');
  return `[id="${escaped}"]`;
}

function normalizePathForCompare(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

/** Rough heuristic extraction of error-looking text from the response HTML. */
function extractErrors(html) {
  const out = [];
  const re = /class="[^"]*(error|invalid|alert|danger|warning)[^"]*"[^>]*>([^<]{1,200})</gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = m[2].trim();
    if (text) out.push(text);
  }
  return Array.from(new Set(out)).slice(0, 20);
}

function extractErrorTextHints(text) {
  if (!text) return [];
  const patterns = [
    { tag: 'error', re: /エラー|error/i },
    { tag: 'invalid', re: /不正|誤り|invalid/i },
    { tag: 'required-input', re: /入力してください|please enter/i },
    { tag: 'required-select', re: /選択してください|please select/i },
    { tag: 'required-missing', re: /未入力|入力されていません|is required/i },
  ];
  const out = [];
  for (const p of patterns) if (p.re.test(text)) out.push(`error-text:${p.tag}`);
  return out;
}

function sha1(s) {
  return crypto.createHash('sha1').update(s).digest('hex');
}

module.exports = {
  normalizeSelectorForRuntime,
  normalizePathForCompare,
  extractErrors,
  extractErrorTextHints,
  sha1,
};
