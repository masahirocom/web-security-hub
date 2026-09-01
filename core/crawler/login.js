'use strict';

/**
 * @typedef {Object} LoginConfig
 * @property {string} [loginUrl]
 * @property {string} username
 * @property {string} password
 * @property {string} [usernameSelector]
 * @property {string} [passwordSelector]
 * @property {string} [submitSelector]
 */

const USERNAME_CANDIDATES = [
  'input[autocomplete="username"]',
  'input[name*="user" i]',
  'input[name*="login" i]',
  'input[name*="mail" i]',
  'input[id*="user" i]',
  'input[id*="login" i]',
  'input[id*="mail" i]',
  'input[type="email"]',
  'input[type="text"]',
];

const PASSWORD_CANDIDATES = ['input[autocomplete="current-password"]', 'input[type="password"]'];

const SUBMIT_CANDIDATES = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("ログイン")',
  'button:has-text("Login")',
  'button:has-text("Sign in")',
  'input[value*="ログイン"]',
  'input[value*="Login" i]',
];

/**
 * Navigates to targetUrl, handling a login screen along the way if one is
 * encountered (heuristic candidate-selector based, no site-specific selectors
 * required unless config provides explicit ones).
 * @param {import('playwright').Page} page
 * @param {string} targetUrl
 * @param {LoginConfig|undefined} config
 * @param {(msg:string)=>void} log
 */
async function gotoWithLogin(page, targetUrl, config, log) {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  if (!config?.username) return;

  const handled = await loginIfPresent(page, config, log);
  if (!handled) return;

  if (!sameUrl(targetUrl, page.url())) {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }
}

async function loginIfPresent(page, config, log) {
  const hasExplicitSelectors = Boolean(config.usernameSelector || config.passwordSelector);
  if (!hasExplicitSelectors && !(await looksLikeLoginPage(page, config))) return false;

  let username = await resolveLocator(page, config.usernameSelector, USERNAME_CANDIDATES);
  let password = await resolveLocator(page, config.passwordSelector, PASSWORD_CANDIDATES);

  if (!username || !password) {
    const fallback = await resolveLocatorsFromForms(page);
    username = username ?? fallback.username;
    password = password ?? fallback.password;
  }

  if (!username && !password) {
    if (await looksLikeLoginPage(page, config)) {
      throw new Error(
        `Page looks like a login screen (${page.url()}) but no input fields could be located. Set usernameSelector/passwordSelector explicitly.`,
      );
    }
    return false;
  }

  log(`  Login screen detected: ${page.url()}`);

  if (username && !password) {
    await username.fill(config.username);
    log('  Filled login id');
    await submitLoginStep(page, username, config, log);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    username = await resolveLocator(page, config.usernameSelector, USERNAME_CANDIDATES);
    password = await resolveLocator(page, config.passwordSelector, PASSWORD_CANDIDATES);
  }

  if (!username && !password) return true;

  if (!password) {
    throw new Error('Could not locate the password field. Set passwordSelector explicitly.');
  }

  if (username) {
    await username.fill(config.username);
    log('  Filled login id');
  }
  await password.fill(config.password);
  log('  Filled password');

  await submitLoginStep(page, password, config, log);
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  const passwordStillVisible = await resolveLocator(page, config.passwordSelector, PASSWORD_CANDIDATES);
  if (passwordStillVisible) {
    throw new Error(`Password field still visible after login attempt (possible auth failure). Current URL: ${page.url()}`);
  }

  log(`  Login complete: ${page.url()}`);
  return true;
}

async function submitLoginStep(page, fallbackField, config, log) {
  const submit = await resolveLocator(page, config.submitSelector, SUBMIT_CANDIDATES);
  if (submit) {
    await submit.click();
    log('  Clicked login button');
    return;
  }
  await fallbackField.press('Enter');
  log('  Submitted login via Enter');
}

async function resolveLocator(page, explicitSelector, candidates) {
  const selectors = explicitSelector ? expandExplicitSelector(explicitSelector) : candidates;
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const candidate = locator.nth(i);
      if (await isVisible(candidate)) return candidate;
    }
  }
  return undefined;
}

function expandExplicitSelector(selector) {
  const trimmed = selector.trim();
  if (!trimmed) return [];
  if (/[#.[\]: >+~,'"*=()]/.test(trimmed)) return [trimmed];
  return [trimmed, `#${trimmed}`, `[name="${cssAttrEscape(trimmed)}"]`, `input[name="${cssAttrEscape(trimmed)}"]`, `input[id="${cssAttrEscape(trimmed)}"]`];
}

function cssAttrEscape(value) {
  return value.replace(/["\\]/g, '\\$&');
}

async function resolveLocatorsFromForms(page) {
  const forms = page.locator('form');
  const formCount = await forms.count().catch(() => 0);
  for (let i = 0; i < formCount; i++) {
    const form = forms.nth(i);
    const password = await firstVisibleWithin(form, ['input[type="password"]', 'input[autocomplete="current-password"]']);
    if (!password) continue;

    const username = await firstVisibleWithin(form, [
      'input[autocomplete="username"]',
      'input[type="email"]',
      'input[name*="mail" i]',
      'input[id*="mail" i]',
      'input[name*="user" i]',
      'input[id*="user" i]',
      'input[type="text"]',
      'input:not([type])',
    ]);
    return { username, password };
  }
  return {};
}

async function firstVisibleWithin(root, selectors) {
  for (const selector of selectors) {
    const locator = root.locator(selector);
    const count = await locator.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const candidate = locator.nth(i);
      if (await isVisible(candidate)) return candidate;
    }
  }
  return undefined;
}

async function looksLikeLoginPage(page, config) {
  const currentUrl = page.url().toLowerCase();
  if (config.loginUrl && sameUrl(config.loginUrl, page.url())) return true;
  if (/(login|signin|sign-in|auth)/.test(currentUrl)) return true;
  const passwordCount = await page.locator('input[type="password"]').count().catch(() => 0);
  return passwordCount > 0;
}

async function isVisible(locator) {
  const count = await locator.count();
  if (!count) return false;
  return locator.isVisible().catch(() => false);
}

function sameUrl(left, right) {
  try {
    const a = new URL(left);
    const b = new URL(right);
    a.hash = '';
    b.hash = '';
    return a.toString() === b.toString();
  } catch {
    return left === right;
  }
}

module.exports = { gotoWithLogin };
