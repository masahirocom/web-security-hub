'use strict';
function createRequestCollector(origin) { const requests = []; const keys = new Set(); return { requests, attach(page) { page.on('request', (request) => { try { const url = new URL(request.url()); if (url.origin !== origin) return; const item = { method: request.method(), url: url.toString(), resourceType: request.resourceType() }; const key = `${item.method} ${item.url}`; if (!keys.has(key)) { keys.add(key); requests.push(item); } } catch {} }); } }; }
module.exports = { createRequestCollector };
