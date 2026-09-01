'use strict';
import { $ } from './dom.js';

/** ⚙ settings modal, "サーバーを再起動" / "サーバーを停止" buttons. */

async function waitForServerBack(timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch('/api/system-info');
      if (res.ok) return true;
    } catch {
      /* still down — keep polling */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

$('restartServerBtn').addEventListener('click', async () => {
  if (!confirm('サーバーを再起動します。実行中の処理は中断されます。よろしいですか？')) return;
  const status = $('serverControlStatus');
  $('restartServerBtn').disabled = true;
  $('stopServerBtn').disabled = true;
  status.textContent = '再起動中...';
  try {
    await fetch('/api/control/restart', { method: 'POST' });
  } catch {
    /* the connection itself is expected to drop as the server restarts */
  }
  const backUp = await waitForServerBack(20000);
  if (backUp) {
    status.textContent = '再起動しました。ページを再読み込みします...';
    setTimeout(() => location.reload(), 500);
  } else {
    status.textContent = 'サーバーが戻ってきません。start.command / start.bat から手動で起動してください。';
    $('restartServerBtn').disabled = false;
    $('stopServerBtn').disabled = false;
  }
});

$('stopServerBtn').addEventListener('click', async () => {
  if (!confirm('サーバーを停止します。再開するには start.command（macOS）/ start.bat（Windows）を実行してください。よろしいですか？')) return;
  const status = $('serverControlStatus');
  $('restartServerBtn').disabled = true;
  $('stopServerBtn').disabled = true;
  status.textContent = '停止中...';
  try {
    await fetch('/api/control/stop', { method: 'POST' });
  } catch {
    /* the connection itself is expected to drop as the server stops */
  }
  status.textContent = 'サーバーを停止しました。再開するには start.command / start.bat を実行してください。';
});
