'use strict';
const { scanDynamic } = require('../security/dynamicScanner');
const targetUrl = process.argv[2];
if (!targetUrl) { console.error('Usage: npm run dynamic-scan -- https://authorized-target.example'); process.exit(1); }
scanDynamic({ targetUrl, allowActiveScan: false, onProgress: console.log })
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => { console.error(error.message); process.exit(1); });
