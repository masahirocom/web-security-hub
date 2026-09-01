'use strict';

import { api } from '../api.js';
import { $ } from '../dom.js';
import { getLocale, t } from '../i18n.js';
import { getLastStaticScan } from './staticScan.js';

function ensureReviewPanel() {
  if ($('claudeReviewPanel')) return;
  const fieldset = document.createElement('fieldset');
  fieldset.id = 'claudeReviewPanel';
  fieldset.innerHTML = '<legend id="claudeReviewLegend">Claude Code による AI レビュー（任意）</legend><p class="hint" id="claudeReviewHelp">現在表示中の SAST 結果だけをローカルの Claude Code に送信します。ソース本文・認証情報・API キーは送信しません。</p><p class="hint" id="claudeReviewStatus"></p><label><input id="claudeReviewAuthorized" type="checkbox" style="width:auto"> <span id="claudeReviewAuthorizedLabel">表示中の SAST 結果を Claude Code に送ることを許可します</span></label><br><button id="runClaudeReview" type="button" class="secondary">AI レビューを開始</button><span id="claudeReviewRunStatus" class="hint"></span><pre id="claudeReviewResult" class="block" hidden></pre>';
  $('panel-static').append(fieldset);
}

async function refreshStatus() {
  const status = $('claudeReviewStatus');
  const button = $('runClaudeReview');
  try {
    const data = await api('/ai/claude-code/status');
    status.textContent = data.available
      ? `${t('status.claudeAvailable')}: ${data.version}${data.apiKeyDetected ? ` — ${t('status.claudeApiKeyWarning')}` : ''}`
      : `${t('status.claudeUnavailable')}: ${data.message}`;
    button.disabled = !data.available;
  } catch (error) {
    status.textContent = t('status.error', { message: error.message });
    button.disabled = true;
  }
}

export function wireClaudeCodeReview() {
  ensureReviewPanel();
  refreshStatus();
  $('runClaudeReview').addEventListener('click', async () => {
    const status = $('claudeReviewRunStatus');
    const output = $('claudeReviewResult');
    const scan = getLastStaticScan();
    output.hidden = true;
    output.textContent = '';
    try {
      if (!scan) throw new Error(t('error.noStaticScan'));
      if (!$('claudeReviewAuthorized').checked) throw new Error(t('error.aiAuthorization'));
      status.textContent = t('status.claudeReviewing');
      const data = await api('/ai/claude-code/review', { method: 'POST', body: JSON.stringify({ authorizationConfirmed: true, scan, locale: getLocale() }) });
      status.textContent = t('status.complete');
      output.textContent = data.review;
      output.hidden = false;
    } catch (error) {
      status.textContent = t('status.error', { message: error.message });
    }
  });
  window.addEventListener('i18nchange', refreshStatus);
}
