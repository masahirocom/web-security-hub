'use strict';
function openSse(res) { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); return { send(event, data) { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }, close() { res.end(); } }; }
module.exports = { openSse };
