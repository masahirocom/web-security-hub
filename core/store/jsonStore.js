'use strict';
const fs = require('fs');
const path = require('path');

/**
 * Simple JSON-file-backed session store. One session = one output directory
 * containing forms.json / test-cases.json / runs.jsonl / url-catalog.json+md.
 */
class JsonStore {
  constructor(baseDir, sessionId) {
    this.location = path.join(baseDir, sessionId);
    this.forms = [];
    this.testCases = [];
    fs.mkdirSync(this.location, { recursive: true });
    this._write('forms.json', this.forms);
    this._write('test-cases.json', this.testCases);
    fs.writeFileSync(path.join(this.location, 'runs.jsonl'), '', 'utf8');
  }

  async saveForm(form) {
    this.forms.push(form);
    this._write('forms.json', this.forms);
  }

  async saveTestCases(url, cases) {
    this.testCases.push({ url, count: cases.length, cases });
    this._write('test-cases.json', this.testCases);
  }

  async saveRunResult(url, result) {
    const file = path.join(this.location, 'runs.jsonl');
    fs.appendFileSync(file, JSON.stringify({ url, ...result }) + '\n', 'utf8');
  }

  async saveUrlCatalog(catalog) {
    this._write('url-catalog.json', catalog);
    fs.writeFileSync(path.join(this.location, 'url-catalog.md'), renderUrlCatalogMarkdown(catalog), 'utf8');
  }

  _write(name, data) {
    fs.writeFileSync(path.join(this.location, name), JSON.stringify(data, null, 2), 'utf8');
  }
}

function renderUrlCatalogMarkdown(catalog) {
  const lines = [];
  lines.push('# URL Catalog');
  lines.push('');
  lines.push(`- generatedAt: ${catalog.generatedAt}`);
  lines.push(`- seedUrl: ${catalog.seedUrl}`);
  lines.push(`- visitedCount: ${catalog.visited.length}`);
  lines.push(`- pageCount: ${catalog.pages.length}`);
  lines.push('');
  lines.push('## Pages');
  lines.push('');

  catalog.pages.forEach((p, idx) => {
    lines.push(`### ${idx + 1}. ${p.url}`);
    lines.push(`- title: ${p.title || '(no title)'}`);
    lines.push(`- textHash: ${p.textHash || '(empty)'}`);
    lines.push(`- markers: ${(p.markers || []).slice(0, 8).join(' / ') || '(none)'}`);
    lines.push(`- forms: ${p.forms.length}`);
    if (p.forms.length) {
      p.forms.forEach((f, i) => {
        lines.push(`  - form#${i + 1}: selector=${f.formSelector} submit=${f.submitSelector ?? '(none)'} fields=${f.fieldCount} required=${f.requiredCount}`);
      });
    }
    lines.push('');
  });

  return lines.join('\n');
}

module.exports = { JsonStore };
