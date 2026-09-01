'use strict';
import { api } from '../api.js'; import { $ } from '../dom.js'; import { renderFindings } from './renderFindings.js';
import { t } from '../i18n.js';
let lastStaticScan;
export function getLastStaticScan() { return lastStaticScan; }
export function wireStaticScan() { $('runStatic').addEventListener('click', async () => { const status = $('staticStatus'); const result = $('staticResult'); status.textContent = t('status.analyzing'); result.innerHTML = ''; try { const data = await api('/security/static-scan', { sourceDir: $('sourceDir').value.trim() }); lastStaticScan = data; status.textContent = `${t('status.complete')}: ${data.filesScanned} files`; result.innerHTML = renderFindings(data, data.scannedAt); } catch (error) { lastStaticScan = undefined; status.textContent = t('status.error', { message: error.message }); } }); }
