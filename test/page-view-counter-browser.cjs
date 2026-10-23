// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const root = path.resolve(__dirname, '../dist');
let reads = 0; let increments = 0;
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://local').pathname;
  if (pathname === '/api/page-views') {
    if (request.method === 'GET') reads += 1; else if (request.method === 'POST') increments += 1;
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ status: 'available', schema: 'intent-mcu-aggregate-page-views@1',
      dayUtc: '2026-10-23', displayDay: '23 Oct 2026', timeZone: 'Europe/Oslo', today: 7,
      total: 42, startedAt: '2026-10-23T08:00:00.000Z', uniqueVisitors: false })); return;
  }
  const file = path.join(root, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!file.startsWith(root) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' });
  response.end(fs.readFileSync(file));
});

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const workers = []; const builds = []; page.on('worker', (worker) => workers.push(worker.url()));
  page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/build') builds.push(request.method()); });
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#page-view-count')?.textContent.includes('42'));
    const view = await page.locator('#page-view-count').evaluate((node) => ({ text: node.textContent, title: node.title }));
    assert.match(view.text, /Page views today: 7 · total since 23 Oct 2026: 42/u);
    assert.match(view.title, /not unique visitors/u); assert.equal(reads, 1); assert.equal(increments, 1);
    assert.deepEqual(workers, []); assert.deepEqual(builds, []);
    if (process.env.PAGE_VIEW_SCREENSHOT) await page.screenshot({ path: process.env.PAGE_VIEW_SCREENSHOT, fullPage: true });
    process.stdout.write(`${JSON.stringify({ status: 'pass', reads, increments, workers: 0, builds: 0, view })}\n`);
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
