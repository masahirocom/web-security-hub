'use strict';
import { $ } from './dom.js';
import { api } from './api.js';
import { state } from './state.js';
import { t } from './i18n.js';

/** サイト管理 tab: the site picker in the header, and the site config form. */

function ensureSavedScenarioEditor() {
  if ($('scenarioStepsJson')) return;
  const fieldset = document.createElement('fieldset');
  fieldset.innerHTML = '<legend id="scenarioSaveLegend">保存するシナリオ（任意）</legend><div class="field"><label id="scenarioStepsLabel" for="scenarioStepsJson">シナリオ JSON</label><textarea id="scenarioStepsJson" rows="8" spellcheck="false" placeholder=\'{"steps":[{"action":"click","selector":"a[href="/settings"]"}]}\'></textarea></div><p class="hint" id="scenarioStepsHint">ログイン情報は入力しないでください。認証情報は既存の .env 設定を使用します。</p>';
  $('saveSiteBtn').before(fieldset);
}

ensureSavedScenarioEditor();

let recorderPoll;

function ensureScenarioRecorder() {
  if ($('startScenarioRecording')) return;
  const fieldset = document.createElement('fieldset');
  fieldset.innerHTML = '<legend id="scenarioRecorderLegend">Playwright 操作記録（任意）</legend><p class="hint" id="scenarioRecorderHelp">可視ブラウザーで行った操作を保存用シナリオに取り込みます。パスワードは記録しません。</p><label><input id="recordingAuthorized" type="checkbox"> <span id="recordingAuthorizedLabel">対象を操作・診断する明示的な許可を得ています</span></label><label><input id="recordingIncludeValues" type="checkbox"> <span id="recordingIncludeValuesLabel">パスワード以外の入力値を記録する</span></label><div class="actions"><button id="startScenarioRecording" type="button">記録用ブラウザーを開く</button><button id="stopScenarioRecording" type="button" disabled>記録を停止してシナリオへ反映</button></div><pre id="scenarioRecordingStatus" class="block"></pre>';
  $('saveSiteBtn').before(fieldset);
}

function renderRecorderStatus(data) {
  const status = $('scenarioRecordingStatus');
  if (!data?.active) {
    status.textContent = data?.message || '';
    $('startScenarioRecording').disabled = false;
    $('stopScenarioRecording').disabled = true;
    return;
  }
  status.textContent = t('status.recording', { steps: data.stepCount ?? data.steps?.length ?? 0, urls: data.visitedUrls?.length ?? 0 });
  $('startScenarioRecording').disabled = true;
  $('stopScenarioRecording').disabled = false;
}

async function refreshRecorderStatus() {
  try { renderRecorderStatus(await api('/scenario-recorder/status')); } catch { /* server may be restarting */ }
}

ensureScenarioRecorder();

$('startScenarioRecording').addEventListener('click', async () => {
  try {
    if (!state.siteId) throw new Error(t('error.recorderSite'));
    if (!$('recordingAuthorized').checked) throw new Error(t('error.recorderAuthorization'));
    renderRecorderStatus({ active: true, stepCount: 0, visitedUrls: [] });
    const result = await api('/scenario-recorder/start', {
      method: 'POST',
      body: JSON.stringify({ siteId: state.siteId, authorized: true, includeInputValues: $('recordingIncludeValues').checked }),
    });
    renderRecorderStatus(result);
    clearInterval(recorderPoll);
    recorderPoll = setInterval(refreshRecorderStatus, 1000);
  } catch (error) {
    renderRecorderStatus({ active: false, message: t('status.error', { message: error.message }) });
  }
});

$('stopScenarioRecording').addEventListener('click', async () => {
  try {
    const result = await api('/scenario-recorder/stop', { method: 'POST', body: '{}' });
    clearInterval(recorderPoll);
    $('scenarioStepsJson').value = JSON.stringify({ steps: result.steps || [] }, null, 2);
    renderRecorderStatus({ active: false, message: t('status.recorded', { steps: result.steps?.length || 0 }) });
  } catch (error) {
    renderRecorderStatus({ active: false, message: t('status.error', { message: error.message }) });
  }
});

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
  $('scenarioStepsJson').value = JSON.stringify(config.scenario || { steps: [] }, null, 2);
  $('targetUrl').value = config.baseUrl || '';
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
  for (const id of ['siteId', 'displayName', 'baseUrl', 'loginUrl', 'usernameSelector', 'passwordSelector', 'submitSelector', 'loginUser', 'loginPass', 'basicUser', 'basicPass', 'scenarioStepsJson']) {
    $(id).value = '';
  }
  $('siteId').disabled = false;
  $('maxDepth').value = 3;
  $('maxPages').value = 30;
  $('maxCases').value = 25;
  $('basicAuthEnabled').checked = false;
  $('scenarioStepsJson').value = '{\n  "steps": []\n}';
});

$('saveSiteBtn').addEventListener('click', async () => {
  const status = $('saveSiteStatus');
  status.textContent = t('status.running');
  try {
    const id = $('siteId').value.trim();
    if (!id) throw new Error('サイトIDを入力してください');
    const scenarioText = $('scenarioStepsJson').value.trim();
    let scenario;
    if (scenarioText) {
      try { scenario = JSON.parse(scenarioText); } catch { throw new Error(t('error.scenarioJson')); }
      if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) throw new Error(t('error.scenarioJson'));
    }
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
      scenario,
    };

    const credentials = {};
    if ($('loginUser').value) credentials.LOGIN_USER = $('loginUser').value;
    if ($('loginPass').value) credentials.LOGIN_PASS = $('loginPass').value;
    if ($('basicUser').value) credentials.BASIC_USER = $('basicUser').value;
    if ($('basicPass').value) credentials.BASIC_PASS = $('basicPass').value;

    await api(`/sites/${id}`, { method: 'PUT', body: JSON.stringify({ ...config, credentials }) });
    status.textContent = t('status.saved');
    $('loginUser').value = '';
    $('loginPass').value = '';
    $('basicUser').value = '';
    $('basicPass').value = '';
    await refreshSiteList(id);
  } catch (e) {
    status.textContent = t('status.error', { message: e.message });
  }
});
