'use strict';
const fs = require('fs');
const path = require('path');
const { siteDir, readSiteConfig } = require('../../core/siteConfig');

/** Shared by every route that reads/writes a site's `.golden-master/<session>/` output directory. */

function sessionsDir(siteId) {
  const cfg = readSiteConfig(siteId);
  return path.resolve(siteDir(siteId), cfg.outputDir || '.golden-master');
}

/** Resolves and validates one session's directory, requiring generated.spec.ts to exist there. */
function sessionDirFor(siteId, sessionId) {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) throw new Error(`invalid session id: ${sessionId}`);
  const dir = path.join(sessionsDir(siteId), sessionId);
  if (!fs.existsSync(path.join(dir, 'generated.spec.ts'))) {
    throw new Error(`no generated.spec.ts in session: ${sessionId}`);
  }
  return dir;
}

module.exports = { sessionsDir, sessionDirFor };
