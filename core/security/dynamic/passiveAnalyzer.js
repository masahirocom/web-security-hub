'use strict';
const { finding } = require('../owasp');

const SECURITY_HEADERS = {
  'content-security-policy': ['CSP 未設定', 'high', 'A05', 'Content-Security-Policy ヘッダーがありません。', '用途に合わせた厳格な Content-Security-Policy を設定してください。'],
  'strict-transport-security': ['HSTS 未設定', 'medium', 'A02', 'Strict-Transport-Security ヘッダーがありません。', 'HTTPS 運用時は HSTS を設定してください。'],
  'x-content-type-options': ['MIME sniffing 防止未設定', 'low', 'A05', 'X-Content-Type-Options ヘッダーがありません。', 'X-Content-Type-Options: nosniff を返してください。'],
  'x-frame-options': ['クリックジャッキング対策未設定', 'medium', 'A05', 'X-Frame-Options ヘッダーがありません。', 'frame-ancestors CSP または X-Frame-Options を設定してください。'],
  'referrer-policy': ['Referrer-Policy 未設定', 'low', 'A05', 'Referrer-Policy ヘッダーがありません。', 'Referrer-Policy を明示してください。'],
  'permissions-policy': ['Permissions-Policy 未設定', 'low', 'A05', 'Permissions-Policy ヘッダーがありません。', '不要なブラウザー機能を Permissions-Policy で無効化してください。'],
};

function analyzeResponse({ url, headers }) {
  const findings = [];
  for (const [name, [title, severity, owasp, evidence, remediation]] of Object.entries(SECURITY_HEADERS)) if (!headers[name]) findings.push(finding({ id: `DAST-HEADER-${name.toUpperCase()}`, title, severity, owasp, location: url, evidence, remediation }));
  if (new URL(url).protocol === 'http:') findings.push(finding({ id: 'DAST-HTTP', title: 'HTTPS を使用していません', severity: 'high', owasp: 'A02', location: url, evidence: 'HTTP で応答しました。', remediation: 'HTTPS へ移行し、HTTP は HTTPS にリダイレクトしてください。' }));
  if (headers['set-cookie'] && !/;\s*secure/i.test(headers['set-cookie'])) findings.push(finding({ id: 'DAST-COOKIE-SECURE', title: 'Secure 属性のない Cookie', severity: 'medium', owasp: 'A02', location: url, evidence: 'Set-Cookie に Secure 属性が見当たりません。', remediation: '認証・セッション Cookie に Secure、HttpOnly、SameSite を設定してください。' }));
  return findings;
}

async function analyzeDocument(page, url) {
  const findings = [];
  const issues = await page.evaluate(() => ({ mixed: [...document.querySelectorAll('script[src],link[href],img[src],iframe[src]')].map((e) => e.src || e.href).filter((v) => /^http:\/\//i.test(v)), passwordForms: [...document.forms].filter((f) => f.querySelector('input[type=password]')).map((f) => ({ action: f.action || location.href, method: (f.method || 'get').toLowerCase(), csrf: Boolean(f.querySelector('input[type=hidden][name*=csrf i],input[type=hidden][name*=token i]')) })), inlineHandlers: document.querySelectorAll('[onclick],[onload],[onerror]').length }));
  if (issues.mixed.length) findings.push(finding({ id: 'DAST-MIXED-CONTENT', title: 'Mixed Content', severity: 'medium', owasp: 'A02', location: url, evidence: `${issues.mixed.length} 件の HTTP リソースを検出しました。`, remediation: 'すべてのサブリソースを HTTPS にしてください。' }));
  for (const form of issues.passwordForms) {
    if (form.method === 'get') findings.push(finding({ id: 'DAST-PASSWORD-GET', title: 'パスワードフォームが GET を使用', severity: 'high', owasp: 'A07', location: form.action, evidence: 'password input を含む form の method が GET です。', remediation: '認証情報を URL に載せず POST を使用してください。' }));
    if (!form.csrf) findings.push(finding({ id: 'DAST-CSRF-INDICATOR', title: '認証フォームの CSRF 対策を確認してください', severity: 'low', owasp: 'A01', location: form.action, evidence: '一般的な CSRF/token hidden input を検出できませんでした。', remediation: 'サーバー側の CSRF トークン検証を確認してください（これは要手動確認です）。' }));
  }
  if (issues.inlineHandlers) findings.push(finding({ id: 'DAST-INLINE-SCRIPT', title: 'インラインイベントハンドラー', severity: 'info', owasp: 'A03', location: url, evidence: `${issues.inlineHandlers} 個のインラインイベント属性を検出しました。`, remediation: 'CSP 導入時は外部スクリプトへ移行し、入力を安全に扱ってください。' }));
  return findings;
}

async function analyzeSafeActiveNotice(page, url) { const count = await page.locator('form').count(); return count ? [finding({ id: 'DAST-ACTIVE-NOTICE', title: '安全モードのアクティブ検査', severity: 'info', owasp: 'A03', location: url, evidence: `${count} 個のフォームを発見。安全のため送信・認証回避・負荷試験は実行していません。`, remediation: '本番以外の許可済み環境で、必要に応じて専用の侵入テストを実施してください。' })] : []; }
module.exports = { analyzeResponse, analyzeDocument, analyzeSafeActiveNotice };
