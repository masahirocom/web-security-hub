'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { gotoWithLogin } = require('./login');
const { collectNavigation, scanForms } = require('./formScanner');

/**
 * @typedef {Object} CrawlConfig
 * @property {number} maxDepth
 * @property {number} maxPages
 * @property {boolean} sameOriginOnly
 * @property {import('./login').LoginConfig} [login]
 * @property {string} [screenshotDir]
 */

/**
 * Follows same-site links from a seed URL to discover pages with forms.
 * @param {import('playwright').Page} page
 * @param {string} seedUrl
 * @param {CrawlConfig} cfg
 * @param {(msg:string)=>void} log
 */
async function crawlForForms(page, seedUrl, cfg, log) {
  const seedOrigin = safeOrigin(seedUrl);
  const visited = new Set();
  const queue = [{ url: seedUrl, depth: 0 }];
  const forms = [];
  const formKeys = new Set();
  const pageSnapshots = [];
  const queued = new Set([normalizeUrl(seedUrl)]);

  while (queue.length && visited.size < cfg.maxPages) {
    const { url, depth } = queue.shift();
    const norm = normalizeUrl(url);
    if (visited.has(norm)) continue;
    visited.add(norm);

    try {
      await gotoWithLogin(page, url, cfg.login, log);
    } catch (e) {
      log(`  [skip] ${url} (${e.message?.split('\n')[0] ?? e})`);
      continue;
    }
    const pageTitle = await page.title().catch(() => '');
    log(`  [state] landed url=${page.url()} title=${pageTitle || '(no-title)'}`);

    const pageForms = await scanFormsSafe(page);
    for (const f of pageForms) {
      const key = formIdentity(f);
      if (!formKeys.has(key)) {
        formKeys.add(key);
        forms.push(f);
      }
    }

    const nav = await collectNavigationSafe(page);
    if (cfg.screenshotDir) {
      const shotName = `crawl-${String(visited.size).padStart(3, '0')}-d${depth}-${slugifyUrl(page.url())}.png`;
      const shotPath = path.join(cfg.screenshotDir, shotName);
      fs.mkdirSync(cfg.screenshotDir, { recursive: true });
      await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
    }
    pageSnapshots.push(await capturePageSnapshot(page));
    log(
      `  [${visited.size}/${cfg.maxPages}] depth${depth} ${url} -> form:${pageForms.length} link:${nav.links.length} clickable:${nav.clickableCount}`,
    );

    if (depth < cfg.maxDepth) {
      const gatePage = pageForms.some(isAgreementGateForm);
      const links = gatePage ? nav.links.filter((link) => !isLikelyPolicyLink(link)) : nav.links;
      if (gatePage) {
        log(`  [state] agreement-gate detected: policy links filtered ${nav.links.length} -> ${links.length}`);
      }
      for (const link of links) enqueue(link, depth + 1);

      const clickResult = await resolveClickDestinations(page, url, nav.clickSelectors, cfg.login, log);
      for (const f of clickResult.forms) {
        const key = formIdentity(f);
        if (!formKeys.has(key)) {
          formKeys.add(key);
          forms.push(f);
        }
      }
      for (const link of clickResult.urls) enqueue(link, depth + 1);
    }

    function enqueue(nextUrl, nextDepth) {
      const n = normalizeUrl(nextUrl);
      if (!n) return;
      if (visited.has(n) || queued.has(n)) return;
      if (cfg.sameOriginOnly && safeOrigin(n) !== seedOrigin) return;
      if (!isCrawlable(n)) return;
      queue.push({ url: n, depth: nextDepth });
      queued.add(n);
    }
  }

  return { forms, visited: Array.from(visited), pageSnapshots };
}

async function scanFormsSafe(page) {
  for (let i = 0; i < 2; i++) {
    try {
      return await scanForms(page);
    } catch (e) {
      const msg = String(e?.message || e || '');
      const transient = /Execution context was destroyed|Target closed|Most likely the page has been closed/i.test(msg);
      if (!transient || i === 1) return [];
      await page.waitForLoadState('domcontentloaded', { timeout: 4000 }).catch(() => {});
    }
  }
  return [];
}

async function collectNavigationSafe(page) {
  for (let i = 0; i < 2; i++) {
    try {
      return await collectNavigation(page);
    } catch (e) {
      const msg = String(e?.message || e || '');
      const transient = /Execution context was destroyed|Target closed|Most likely the page has been closed/i.test(msg);
      if (!transient || i === 1) return { links: [], clickableCount: 0, clickSelectors: [] };
      await page.waitForLoadState('domcontentloaded', { timeout: 4000 }).catch(() => {});
    }
  }
  return { links: [], clickableCount: 0, clickSelectors: [] };
}

function isAgreementGateForm(form) {
  const hasAgreementCheck = form.fields.some((f) => {
    if (f.type !== 'checkbox') return false;
    const text = `${f.name ?? ''} ${f.id ?? ''} ${f.label ?? ''}`.toLowerCase();
    return /(agree|consent|同意|規約)/i.test(text);
  });
  if (!hasAgreementCheck) return false;
  const submit = (form.submitSelector ?? '').toLowerCase();
  return !!submit;
}

function isLikelyPolicyLink(url) {
  return /code=(rules|privacy|express)|\/terms\b|\/privacy\b|\/rule\b/i.test(url);
}

function formIdentity(form) {
  const fieldShape = form.fields
    .map((f) => `${f.selector}:${f.type}:${f.name ?? ''}`)
    .sort()
    .join('|');
  return `${normalizeUrl(form.url)}::${form.formSelector}::${form.submitSelector ?? ''}::${fieldShape}`;
}

function slugifyUrl(url) {
  try {
    const u = new URL(url);
    const raw = `${u.pathname}${u.search}`;
    const s = raw.replace(/^\/+/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'root';
  } catch {
    return 'page';
  }
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

function safeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

async function resolveClickDestinations(page, sourceUrl, selectors, login, log) {
  const out = new Set();
  const forms = [];
  const formKeys = new Set();
  const targets = selectors.slice(0, 4);
  if (page.isClosed()) return { urls: [], forms: [] };

  for (const selector of targets) {
    let p;
    try {
      p = await page.context().newPage();
      await gotoWithLogin(p, sourceUrl, login, () => {});
      const before = normalizeUrl(p.url());
      log(`  [click-probe] open source=${sourceUrl} current=${before} selector=${selector}`);

      try {
        const checkboxes = p.locator('input[type="checkbox"]');
        const count = await checkboxes.count();
        let checkedNow = 0;
        for (let i = 0; i < count; i++) {
          const cb = checkboxes.nth(i);
          const isChecked = await cb.isChecked().catch(() => false);
          if (!isChecked) {
            await cb.check({ force: true }).catch(() => {});
            checkedNow++;
          }
        }
        if (count > 0) log(`  [click-probe] auto-check checkboxes total=${count} checkedNow=${checkedNow}`);
      } catch {
        log('  [click-probe] auto-check failed (ignored)');
      }

      const target = p.locator(selector).first();
      if (!(await target.count().catch(() => 0))) continue;
      await target.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
      for (let w = 0; w < 10; w++) {
        if (await target.isEnabled().catch(() => true)) break;
        await p.waitForTimeout(200).catch(() => {});
      }

      const hasInputForm = (fs) =>
        fs.some((f) => f.fields.some((x) => !['checkbox', 'hidden', 'submit', 'button', 'radio', 'image'].includes(x.type)));

      let discoveredForms = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        const navPromise = p.waitForNavigation({ timeout: 6000 }).catch(() => {});
        const clicked = await target.click({ timeout: 3000 }).then(() => true).catch(() => false);
        if (!clicked) await target.click({ force: true, timeout: 3000 }).catch(() => {});
        await navPromise;
        await p.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        await p
          .locator('input[type="text"], input[type="tel"], input[type="email"], select, textarea')
          .first()
          .waitFor({ state: 'visible', timeout: 4000 })
          .catch(() => {});
        discoveredForms = await scanForms(p).catch(() => []);
        if (hasInputForm(discoveredForms)) break;
        await p.locator('input[type="checkbox"]').first().check({ force: true }).catch(() => {});
        await p.waitForTimeout(600).catch(() => {});
      }
      const after = normalizeUrl(p.url());
      log(`  [click-probe] clicked selector=${selector} before=${before} after=${after} inputForm=${hasInputForm(discoveredForms)}`);
      if (after && after !== before) out.add(after);
      if (discoveredForms.length) log(`  [click-probe] discovered forms=${discoveredForms.length} after click`);
      for (const f of discoveredForms) {
        const key = formIdentity(f);
        if (formKeys.has(key)) continue;
        formKeys.add(key);
        forms.push(f);
      }
    } catch {
      log(`  [click-probe] failed selector=${selector} (ignored)`);
      continue;
    } finally {
      if (p && !p.isClosed()) await p.close().catch(() => {});
    }
  }

  return { urls: Array.from(out), forms };
}

async function capturePageSnapshot(page) {
  const raw = await page.evaluate(() => {
    const title = document.title || '';
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const markers = Array.from(document.querySelectorAll('h1, h2, h3, label, button, th, dt'))
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length >= 2)
      .slice(0, 12);
    return { title, bodyText, markers };
  });

  const digestSource = `${raw.title}\n${raw.bodyText}`;
  return {
    url: page.url(),
    title: raw.title,
    markers: Array.from(new Set(raw.markers)),
    textHash: crypto.createHash('sha1').update(digestSource).digest('hex'),
  };
}

function isCrawlable(url) {
  if (/^(mailto:|tel:|javascript:)/i.test(url)) return false;
  if (/\.(pdf|zip|jpg|jpeg|png|gif|svg|css|js|ico|woff2?|ttf|mp4|xlsx?|docx?)(\?|$)/i.test(url)) return false;
  return true;
}

module.exports = { crawlForForms };
