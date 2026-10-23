// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
// Built shared-shell, zero-producer UI regression. Qualified native positive is
// added only after the reviewed retained package replaces the unavailable input.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const http = require('node:http'); const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const root = path.resolve(__dirname, '..', 'dist');
const context = { profile: 'board.atmega328p-16mhz-v1', ...Object.fromEntries(
  ['sourceSha256', 'graphSha256', 'scheduleSha256', 'modelSha256', 'runtimeSha256', 'toolchainSha256']
    .map((name, index) => [name, String(index + 1).repeat(64)])) };
const evidence = { schema: 'intent-mcu-x81-source-evidence@1', evidenceId: 'synthetic-unqualified-ui',
  context, runs: [], builds: [], historicalGaps: [], authority: { apply: false, build: false, run: false, verdict: false } };
const productionCsp = "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self'; object-src 'none'; script-src 'self' 'sha256-Ol4fhdsQWg9x10Ho2zA++OfTuRE50DQvqSmJ894ef4Y='; script-src-attr 'none'; style-src 'self'; worker-src 'self'; upgrade-insecure-requests";
(async () => {
  const server = http.createServer((request, response) => {
    const name = new URL(request.url, 'http://127.0.0.1').pathname;
    const file = path.resolve(root, name === '/' ? 'index.html' : name.replace(/^\//u, ''));
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Security-Policy', productionCsp);
    response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const cspViolations = [];
    page.on('console', (message) => { if (/content security policy|violates.*style-src/iu.test(message.text())) cspViolations.push(message.text()); });
    let producers = 0;
    page.on('request', (request) => { if (request.method() === 'POST' && /\/(?:api|compile)(?:\/|$)/u.test(new URL(request.url()).pathname)) producers += 1; });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    assert.equal(await page.locator('#x81-assessment-context').getAttribute('style'), null);
    assert.deepEqual(await page.locator('#x81-assessment-context').evaluate((element) => {
      const style = getComputedStyle(element); return { whiteSpace: style.whiteSpace, overflowWrap: style.overflowWrap };
    }), { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' });
    const before = producers; const workersBefore = page.workers().length;
    await page.click('#x81-assessment-open');
    assert.equal(await page.isDisabled('#x81-assessment-retained'), false);
    assert.match(await page.textContent('#x81-assessment-retained'), /reviewed AVR first-512-instruction report/u);
    await page.click('#x81-assessment-retained');
    await page.waitForFunction(() => document.getElementById('x81-assessment-status').textContent.startsWith('Local assessment accepted'));
    assert.match(await page.textContent('#x81-observed-status'), /^verified: same-observed-behavior/u);
    assert.match(await page.textContent('#x81-rebuild-status'), /^not-checked:/u);
    const pendingDownload = page.waitForEvent('download'); await page.click('#x81-assessment-save');
    const downloaded = fs.readFileSync(await (await pendingDownload).path());
    const envelope = JSON.parse(downloaded);
    assert.equal(envelope.schema, 'intent-mcu-x81-local-assessment-envelope@1');
    assert.deepEqual(envelope.derivedResult.authority, { apply: false, build: false, run: false, verdict: false });
    await page.click('#x81-assessment-clear'); await page.reload();
    await page.waitForFunction(() => window.__M11_READY__ === true); await page.click('#x81-assessment-open');
    await page.setInputFiles('#x81-assessment-file', { name: 'assessment.json', mimeType: 'application/json', buffer: downloaded });
    await page.waitForTimeout(1000);
    if (!(await page.textContent('#x81-assessment-status')).startsWith('Local assessment accepted')) {
      throw new Error(`reopen status: ${await page.textContent('#x81-assessment-status')}`);
    }
    await page.waitForFunction(() => document.getElementById('x81-assessment-status').textContent.startsWith('Local assessment accepted'));
    const accepted = await page.textContent('#x81-observed-status');
    envelope.derivedResult.observedBehavior.status = 'different';
    await page.setInputFiles('#x81-assessment-file', { name: 'tampered.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(envelope)) });
    await page.waitForFunction(() => document.getElementById('x81-assessment-status').textContent.startsWith('Rejected'));
    assert.equal(await page.textContent('#x81-observed-status'), accepted);
    await page.setInputFiles('#x81-assessment-file', { name: 'duplicate.json', mimeType: 'application/json', buffer: Buffer.from('{"schema":"x","schema":"y"}') });
    await page.waitForFunction(() => document.getElementById('x81-assessment-status').textContent.startsWith('Rejected'));
    assert.equal(await page.textContent('#x81-observed-status'), accepted);
    await page.evaluate(() => {
      const original = File.prototype.text;
      File.prototype.text = function () {
        if (this.name !== 'held.json') return original.call(this);
        return new Promise((resolve) => { window.__x81ReleaseFile = () => original.call(this).then(resolve); });
      };
    });
    await page.setInputFiles('#x81-assessment-file', { name: 'held.json', mimeType: 'application/json', buffer: downloaded });
    await page.waitForFunction(() => typeof window.__x81ReleaseFile === 'function');
    await page.evaluate(() => { document.getElementById('x81-assessment-clear').click(); window.__x81ReleaseFile(); });
    assert.equal(await page.textContent('#x81-observed-status'), 'Not assessed');
    assert.equal(await page.isDisabled('#x81-assessment-save'), true);
    assert.deepEqual(cspViolations, []);
    assert.equal(producers, before); assert.equal(page.workers().length, workersBefore);
    process.stdout.write('{"status":"pass","scope":"shared-shell-reviewed-retained-roundtrip","native":false}\n');
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
