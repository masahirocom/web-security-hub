'use strict';
import { $ } from './dom.js';
import { api } from './api.js';
import { state } from './state.js';

/** サイト管理 tab: the site picker in the header, and the site config form. */

export async function refreshSiteList(selectId) {
  const { sites } = await api('/sites');
  const select = $('siteSelect');
  select.innerHTML = '';
  for (const s of sites) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.displayName || s.id} (${s.id})`;
    select.appendChild(opt);
  }
  if (sites.length) {
    select.value = selectId && sites.some((s) => s.id === selectId) ? selectId : sites[0].id;
    state.siteId = select.value;
    await loadSiteIntoForm(state.siteId);
  } else {
    state.siteId = null;
  }
}

async function loadSiteIntoForm(siteId) {
  if (!siteId) return;
  const { config } = await api(`/sites/${siteId}`);
  $('siteId').value = config.id || siteId;
  $('siteId').disabled = true;
  $('displayName').value = config.displayName || '';
  $('baseUrl').value = config.baseUrl || '';
  $('maxDepth').value = config.crawl?.maxDepth ?? 3;
  $('maxPages').value = config.crawl?.maxPages ?? 30;
  $('maxCases').value = config.crawl?.maxCasesPerForm ?? 25;
  $('loginUrl').value = config.login?.loginUrl || '';
  $('usernameSelector').value = config.login?.usernameSelector || '';
  $('passwordSelector').value = config.login?.passwordSelector || '';
  $('submitSelector').value = config.login?.submitSelector || '';
  $('basicAuthEnabled').checked = Boolean(config.basicAuth?.enabled);
  $('loginUser').value = '';
  $('loginPass').value = '';
  $('basicUser').value = '';
  $('basicPass').value = '';
}

$('siteSelect').addEventListener('change', async (e) => {
  state.siteId = e.target.value;
  await loadSiteIntoForm(state.siteId);
});

$('newSiteBtn').addEventListener('click', () => {
  state.siteId = null;
  for (const id of ['siteId', 'displayName', 'baseUrl', 'loginUrl', 'usernameSelector', 'passwordSelector', 'submitSelector', 'loginUser', 'loginPass', 'basicUser', 'basicPass']) {
    $(id).value = '';
  }
  $('siteId').disabled = false;
  $('maxDepth').value = 3;
  $('maxPages').value = 30;
  $('maxCases').value = 25;
  $('basicAuthEnabled').checked = false;
});

$('saveSiteBtn').addEventListener('click', async () => {
  const status = $('saveSiteStatus');
  status.textContent = '保存中...';
  try {
    const id = $('siteId').value.trim();
    if (!id) throw new Error('サイトIDを入力してください');
    const config = {
      displayName: $('displayName').value.trim(),
      baseUrl: $('baseUrl').value.trim(),
      ruleSpecDir: 'rule-spec',
      outputDir: '.golden-master',
      crawl: {
        maxDepth: Number($('maxDepth').value) || 3,
        maxPages: Number($('maxPages').value) || 30,
        maxCasesPerForm: Number($('maxCases').value) || 25,
      },
      login: $('loginUrl').value.trim()
        ? {
            loginUrl: $('loginUrl').value.trim(),
            usernameSelector: $('usernameSelector').value.trim() || undefined,
            passwordSelector: $('passwordSelector').value.trim() || undefined,
            submitSelector: $('submitSelector').value.trim() || undefined,
          }
        : undefined,
      basicAuth: { enabled: $('basicAuthEnabled').checked },
    };

    const credentials = {};
    if ($('loginUser').value) credentials.LOGIN_USER = $('loginUser').value;
    if ($('loginPass').value) credentials.LOGIN_PASS = $('loginPass').value;
    if ($('basicUser').value) credentials.BASIC_USER = $('basicUser').value;
    if ($('basicPass').value) credentials.BASIC_PASS = $('basicPass').value;

    await api(`/sites/${id}`, { method: 'PUT', body: JSON.stringify({ ...config, credentials }) });
    status.textContent = '保存しました';
    $('loginUser').value = '';
    $('loginPass').value = '';
    $('basicUser').value = '';
    $('basicPass').value = '';
    await refreshSiteList(id);
  } catch (e) {
    status.textContent = `エラー: ${e.message}`;
  }
});
