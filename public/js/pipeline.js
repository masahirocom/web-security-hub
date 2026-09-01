'use strict';
import { $ } from './dom.js';
import { state } from './state.js';

/** テストケース作成 tab: runs the crawl -> pairwise -> codegen pipeline (SSE-streamed). */

$('runPipelineBtn').addEventListener('click', () => {
  const status = $('pipelineStatus');
  const logEl = $('pipelineLog');
  const resultEl = $('pipelineResult');
  logEl.textContent = '';
  resultEl.innerHTML = '';
  if (!state.siteId) {
    status.textContent = 'サイトを選択してください';
    return;
  }
  status.textContent = '実行中...';
  $('runPipelineBtn').disabled = true;

  const es = new EventSource(`/api/sites/${state.siteId}/pipeline/run`);
  es.addEventListener('log', (ev) => {
    const { line } = JSON.parse(ev.data);
    logEl.textContent += line + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  });
  es.addEventListener('done', (ev) => {
    const data = JSON.parse(ev.data);
    status.textContent = '完了';
    $('runPipelineBtn').disabled = false;
    resultEl.innerHTML = `
      <p><span class="result-ok">OK</span> フォーム数=${data.formCount} ケース数=${data.caseCount} 実行=${data.executedCaseCount} OK=${data.okCaseCount} NG=${data.ngCaseCount}</p>
      <p><a href="${data.reportUrl}" target="_blank">レポートを開く</a> ・ <a href="${data.markdownUrl}" target="_blank">Markdownで開く</a></p>
    `;
    es.close();
  });
  es.addEventListener('error', (ev) => {
    let message = '接続エラー';
    try {
      message = JSON.parse(ev.data).message;
    } catch {
      /* ignore parse errors from a raw network-level EventSource error */
    }
    status.textContent = `エラー: ${message}`;
    $('runPipelineBtn').disabled = false;
    es.close();
  });
});
