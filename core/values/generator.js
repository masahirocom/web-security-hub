'use strict';

// Locale heuristics (postal code / katakana furigana / phone-number splitting)
// are intentionally kept here — they are generic Japanese-locale conventions,
// not anything specific to a particular site.
const NORMAL_PROFILE = {
  zip: '1500002',
  pref: '東京都',
  city: '渋谷区',
  addr: '渋谷2-24-12',
  email: 'test@example.com',
  telArea: '03',
  telMid: '1234',
  telLast: '5678',
};

/**
 * Generates normal/boundary/abnormal candidate values for one field, based
 * on its HTML constraints plus any optional semantic hint.
 * @param {import('../crawler/formScanner').FormField} field
 * @param {{semantic?:string,exampleNormalValue?:string}} [semantic]
 * @returns {Array<{fieldSelector:string,kind:'normal'|'boundary'|'abnormal',value:string,rationale:string}>}
 */
function generateValues(field, semantic) {
  const out = [];
  const sel = field.selector;
  const c = field.constraints || {};
  const push = (kind, value, rationale) => out.push({ fieldSelector: sel, kind, value, rationale });
  const context = buildFieldContext(field, semantic);

  if (field.options && field.options.length && (field.tag === 'select' || field.type === 'radio')) {
    const filtered = field.options.filter((v) => isMeaningfulOption(v));
    const options = filtered.length ? filtered : field.options;
    const matched = semantic?.exampleNormalValue;
    const normal = matched && field.options.includes(matched) ? matched : pickNormalOptionByContext(options, context);
    push('normal', normal, matched && normal === matched ? 'valid option backed by real data' : 'contextually valid option');
    if (options.length > 1) push('boundary', options[options.length - 1], 'last valid option');
    push('abnormal', '__not_in_options__', 'value not present among options');
    return dedupe(out);
  }
  if (field.type === 'checkbox') {
    push('normal', 'on', 'checked');
    push('boundary', 'off', 'unchecked');
    return dedupe(out);
  }

  if (field.type === 'number' || field.type === 'range') {
    const min = c.min ?? 0;
    const max = c.max ?? min + 100;
    push('normal', String(Math.floor((min + max) / 2)), 'midpoint of range');
    push('boundary', String(min), 'minimum (min)');
    push('boundary', String(max), 'maximum (max)');
    if (c.min !== undefined) push('abnormal', String(min - 1), 'min-1 (out of range)');
    if (c.max !== undefined) push('abnormal', String(max + 1), 'max+1 (out of range)');
    push('abnormal', 'abc', 'string in a numeric field (type mismatch)');
    if (c.required) push('abnormal', '', 'empty required field');
    return dedupe(out);
  }

  if (field.type === 'date') {
    push('normal', semantic?.exampleNormalValue || '2020-01-15', 'plausible date');
    push('boundary', '0001-01-01', 'near lower bound');
    push('boundary', '9999-12-31', 'near upper bound');
    push('abnormal', '2020-13-40', 'nonexistent date');
    push('abnormal', 'not-a-date', 'not a date string');
    if (c.required) push('abnormal', '', 'empty required field');
    return dedupe(out);
  }

  if (field.type === 'email' || /mail/.test((semantic?.semantic || '').toLowerCase())) {
    const matchedEmail = semantic?.exampleNormalValue;
    if (matchedEmail && /^[^@\s]+@[^@\s]+$/.test(matchedEmail)) {
      push('normal', matchedEmail, 'valid email backed by real data');
    } else {
      push('normal', NORMAL_PROFILE.email, 'plausible email');
    }
    push('abnormal', 'test@', 'incomplete email');
    push('abnormal', 'plainstring', 'missing @');
    if (c.required) push('abnormal', '', 'empty required field');
    return dedupe(out);
  }

  const maxLen = c.maxLength ?? 50;
  const minLen = c.minLength ?? 0;
  const baseCandidate = semantic?.exampleNormalValue || inferContextualTextValue(context, Math.max(1, Math.min(8, maxLen)));
  const base = sanitizeNormalTextValue(baseCandidate, context, c, maxLen);
  const boundaryChar = pickBoundaryChar(context);

  push('normal', clamp(base, maxLen), 'contextually valid value');
  if (c.maxLength !== undefined) {
    push('boundary', boundaryChar.repeat(maxLen), `exactly maxLength ${maxLen}`);
    push('abnormal', boundaryChar.repeat(maxLen + 1), `maxLength+1 (${maxLen + 1} chars, over limit)`);
  }
  if (minLen > 0) {
    push('boundary', boundaryChar.repeat(minLen), `exactly minLength ${minLen}`);
    if (minLen > 1) push('abnormal', boundaryChar.repeat(minLen - 1), 'minLength-1 (too short)');
  }
  if (c.pattern) push('abnormal', '!!!___invalid___!!!', `violates pattern(${c.pattern})`);
  if (c.required) push('abnormal', '', 'empty required field');
  push('abnormal', "'\" OR 1=1 --", 'injection-style payload');
  push('abnormal', '<script>x</script>', 'XSS-style payload');

  return dedupe(out);
}

function clamp(s, maxLen) {
  if (maxLen === undefined) return s;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function sampleByLength(n) {
  return 'sample value'.repeat(Math.ceil(n / 12)).slice(0, n) || 'sample';
}

function buildFieldContext(field, semantic) {
  return [semantic?.semantic, semantic?.exampleNormalValue, field.label, field.name, field.id, field.placeholder, field.selector]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function pickNormalOptionByContext(options, context) {
  const c = (context || '').toLowerCase();
  const pick = (candidates) => {
    for (const candidate of candidates) {
      const found = options.find((o) => String(o).trim() === candidate);
      if (found) return found;
    }
    return undefined;
  };

  if (/(genn|era|元号|和暦)/.test(c)) return pick(['4', '3']) ?? options[0];
  if (/(pref|prefecture|都道府県|住所.*都|住所.*道|住所.*府|住所.*県)/.test(c)) return pick(['東京都', '東京']) ?? options[0];
  if (/(year|年)/.test(c)) return pick(['10', '12', '15', '20']) ?? options[Math.floor(options.length / 3)] ?? options[0];
  if (/(mont|month|月)/.test(c)) return pick(['06', '07', '08', '09']) ?? options[Math.floor(options.length / 2)] ?? options[0];
  if (/(days|day|日)/.test(c)) return pick(['15', '14', '16']) ?? options[Math.floor(options.length / 2)] ?? options[0];
  return options[0];
}

function inferContextualTextValue(context, n) {
  if (/(mail|email|メール)/i.test(context)) return NORMAL_PROFILE.email;
  if (/(zip|郵便)/i.test(context)) return NORMAL_PROFILE.zip;
  if (/(fur|フリ|カナ)/i.test(context)) return 'ヤマダ';
  if (/(rom|ローマ)/i.test(context)) return 'YAMADA';
  if (/(tel|phone|電話)/i.test(context)) return `${NORMAL_PROFILE.telArea}${NORMAL_PROFILE.telMid}${NORMAL_PROFILE.telLast}`;
  if (/(姓|名|氏名|name|nam)/i.test(context)) return '山田';
  if (/(city|市区町村)/i.test(context)) return NORMAL_PROFILE.city;
  if (/(addr|住所)/i.test(context)) return NORMAL_PROFILE.addr;
  return sampleByLength(n);
}

function sanitizeNormalTextValue(value, context, constraints, maxLen) {
  const raw = String(value ?? '').trim();
  const c = context.toLowerCase();

  if (/(fur|フリ|カナ)/i.test(c)) return clamp(toKatakana(raw) || 'ヤマダ', maxLen);

  if (/(zip|郵便)/i.test(c)) return NORMAL_PROFILE.zip;

  if (/(tel|phone|電話)/i.test(c)) {
    if (/(tel1|tel4|電話番号1.*先頭|市外局番)/i.test(c)) return clamp(NORMAL_PROFILE.telArea, maxLen);
    if (/(tel2|tel5|電話番号1.*中央|局番)/i.test(c)) return clamp(NORMAL_PROFILE.telMid, maxLen);
    if (/(tel3|tel6|電話番号1.*末尾|番号)/i.test(c)) return clamp(NORMAL_PROFILE.telLast, maxLen);
    const digits = raw.replace(/\D+/g, '');
    const fallback = '0311112222';
    const src = digits || fallback;
    if (maxLen > 0) return src.slice(0, maxLen).padEnd(Math.min(maxLen, 3), '0');
    return src;
  }

  if (/(pref|都道府県)/i.test(c)) return clamp(NORMAL_PROFILE.pref, maxLen);
  if (/(city|市区町村)/i.test(c)) return clamp(NORMAL_PROFILE.city, maxLen);
  if (/(addr|住所)/i.test(c)) return clamp(NORMAL_PROFILE.addr, maxLen);

  if (constraints?.pattern && /[0-9]\\d|\\d|\[0-9\]/.test(constraints.pattern)) {
    const digits = raw.replace(/\D+/g, '');
    if (digits) return maxLen ? digits.slice(0, maxLen) : digits;
  }

  return clamp(raw || sampleByLength(Math.max(1, Math.min(8, maxLen))), maxLen);
}

function toKatakana(s) {
  return String(s ?? '').replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

function pickBoundaryChar(context) {
  if (/(fur|フリ|カナ)/i.test(context)) return 'ア';
  if (/(rom|ローマ)/i.test(context)) return 'A';
  if (/(姓|名|氏名|name|nam)/i.test(context)) return '山';
  return 'a';
}

function isMeaningfulOption(v) {
  const t = String(v ?? '').trim();
  if (!t) return false;
  if (/^(0|--|-|未選択|選択してください|select)$/i.test(t)) return false;
  return true;
}

/** Merges auto-generated values with Rule-Spec-derived values, spec last (wins on dedupe key collision order). */
function mergeValues(base, extra) {
  return dedupe([...base, ...extra]);
}

function dedupe(values) {
  const seen = new Set();
  return values.filter((v) => {
    const key = v.kind + '::' + v.value;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { generateValues, mergeValues };
