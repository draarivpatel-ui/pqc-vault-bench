'use strict';

/*
 * Repository compliance suite for PQC Vault Bench.
 * Locks the strict submission rules: no em or en dashes in any text file,
 * no model attribution statement anywhere, no private contact details, and
 * the docs stay consistent with the real test counts and API surface.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const TEXT_EXT = new Set(['.md', '.html', '.js', '.mjs', '.json', '.txt', '.css', '.srt']);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', '__pycache__', 'dist', 'build']);

function textFiles() {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (TEXT_EXT.has(path.extname(entry.name).toLowerCase())) out.push(p);
    }
  }(root));
  return out;
}

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

test('COMPLIANCE 01: no em dashes or en dashes in any text file', () => {
  const re = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');
  for (const f of textFiles()) {
    assert.equal(re.test(fs.readFileSync(f, 'utf8')), false,
      'dash found in ' + path.relative(root, f));
  }
});

test('COMPLIANCE 02: no model attribution, model name or vendor assistant string', () => {
  const d = (...c) => String.fromCharCode(...c);
  const names = [
    d(99, 104, 97, 116, 103, 112, 116),
    d(99, 108, 97, 117, 100, 101),
    d(97, 110, 116, 104, 114, 111, 112, 105, 99),
    d(111, 112, 101, 110, 97, 105),
    d(103, 101, 109, 105, 110, 105),
    d(108, 108, 97, 109, 97),
    d(109, 105, 115, 116, 114, 97, 108),
    d(99, 111, 112, 105, 108, 111, 116),
    d(108, 97, 114, 103, 101, 32, 108, 97, 110, 103, 117, 97, 103, 101, 32, 109, 111, 100, 101, 108),
    d(103, 101, 110, 101, 114, 97, 116, 101, 100, 32, 98, 121, 32, 97, 110, 32, 97, 105),
    d(97, 105, 32, 97, 115, 115, 105, 115, 116, 97, 110, 116),
    d(97, 105, 32, 100, 105, 115, 99, 108, 111, 115, 117, 114, 101)
  ];
  const banned = new RegExp('\\b(' + names.join('|') + ')\\b', 'i');
  for (const f of textFiles()) {
    const t = fs.readFileSync(f, 'utf8');
    assert.equal(banned.test(t), false, 'disclosure or model name in ' + path.relative(root, f));
  }
});

test('COMPLIANCE 03: no private email or street address strings', () => {
  const mail = /[a-z0-9._%+-]+@(?:gmail|outlook|yahoo|icloud|hotmail)\.[a-z]+/i;
  const street = /\b\d{3,6}\s+(?:[A-Z][a-z]+\s+){1,3}(?:Manor|Lane|Drive|Street|Avenue|Road|Court|Way)\b/;
  for (const f of textFiles()) {
    const text = fs.readFileSync(f, 'utf8');
    assert.equal(mail.test(text), false, path.relative(root, f));
    assert.equal(street.test(text), false, path.relative(root, f));
  }
});

test('COMPLIANCE 04: no emoji or pictographs in any text file', () => {
  for (const f of textFiles()) {
    assert.equal(/\p{Extended_Pictographic}/u.test(fs.readFileSync(f, 'utf8')), false,
      path.relative(root, f));
  }
});

test('COMPLIANCE 05: required documents exist', () => {
  for (const f of ['README.md', 'DEVPOST_UPGRADE.md', 'LICENSE', 'package.json',
    'src/pqc.js', 'src/analysis.js', 'index.html', 'app.js']) {
    assert.ok(fs.existsSync(path.join(root, f)), f + ' must exist');
  }
});

test('COMPLIANCE 06: package.json declares both test suites with zero dependencies', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(pkg.dependencies || {}, {});
  assert.match(pkg.scripts.test, /analysis\.test\.js/);
  assert.match(pkg.scripts.test, /compliance\.test\.js/);
});

test('COMPLIANCE 07: the browser page loads both library modules before the app', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('src/pqc.js') < html.indexOf('src/analysis.js'));
  assert.ok(html.indexOf('src/analysis.js') < html.indexOf('app.js'));
});

test('COMPLIANCE 08: README and DEVPOST_UPGRADE report the same verified test total', () => {
  const readme = read('README.md'), devpost = read('DEVPOST_UPGRADE.md');
  const m = readme.match(/(\d+) passing (?:unit )?tests/);
  assert.ok(m, 'README states a passing test count');
  const n = Number(m[1]);
  assert.match(devpost, new RegExp('\\b' + n + '\\b'), 'DEVPOST_UPGRADE repeats the same total');
});

test('COMPLIANCE 09: README states the educational scope boundary honestly', () => {
  const readme = read('README.md');
  assert.match(readme, /not FIPS 203 validated/i);
  assert.match(readme, /not constant time/i);
  assert.match(readme, /Do not use it to protect real funds/i);
});

test('COMPLIANCE 10: the page makes no network requests', () => {
  const html = read('index.html').replace(/<script[\s\S]*?<\/script>/g, '');
  assert.equal(/https?:\/\//.test(html), false);
});
