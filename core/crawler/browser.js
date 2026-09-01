'use strict';
const { chromium } = require('playwright');

/**
 * @typedef {Object} BrowserOptions
 * @property {boolean} headful
 * @property {string} [recordVideoDir]
 * @property {{username:string,password:string}} [httpCredentials]
 * @property {(line:string)=>void} [onDialog]
 * @property {'accept'|'dismiss'} [dialogAction]
 */

/** Thin lifecycle wrapper around a single Playwright(Chromium) browser/context. */
class BrowserSession {
  /** @param {BrowserOptions} opts */
  constructor(opts) {
    this.opts = opts;
    this.browser = undefined;
    this.context = undefined;
  }

  async start() {
    this.browser = await chromium.launch({ headless: !this.opts.headful });
    this.context = await this.browser.newContext({
      ...(this.opts.recordVideoDir ? { recordVideo: { dir: this.opts.recordVideoDir } } : {}),
      ...(this.opts.httpCredentials ? { httpCredentials: this.opts.httpCredentials } : {}),
    });
    const page = await this.context.newPage();
    this.attachPageGuards(page);
    return page;
  }

  /** Opens a new tab sharing the same context (used to run test cases independently). */
  async newPage() {
    if (!this.context) throw new Error('BrowserSession has not been started');
    const page = await this.context.newPage();
    this.attachPageGuards(page);
    return page;
  }

  attachPageGuards(page) {
    page.on('dialog', async (dialog) => {
      this.opts.onDialog?.(
        `dialog: type=${dialog.type()} message=${JSON.stringify(dialog.message())} default=${this.opts.dialogAction ?? 'accept'} url=${page.url()}`,
      );
      try {
        if ((this.opts.dialogAction ?? 'accept') === 'dismiss') await dialog.dismiss();
        else await dialog.accept();
      } catch {
        // ignore races between dialog open/close and our handling
      }
    });
  }

  async stop() {
    await this.context?.close();
    await this.browser?.close();
  }
}

module.exports = { BrowserSession };
