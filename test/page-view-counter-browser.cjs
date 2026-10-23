// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const root = path.resolve(__dirname, '../dist');
let reads = 0; let increments = 0; let pageViewHandler = null;
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://local').pathname;
  if (pathname === '/api/page-views') {
    if (request.method === 'GET') reads += 1; else if (request.method === 'POST') increments += 1;
    await pageViewHandler(request, response); return;
  }
  const file = path.join(root, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!file.startsWith(root) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' });
  response.end(fs.readFileSync(file));
});

(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'intent-page-view-browser-'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { AggregatePageViewCounter, createPageViewHandler } = await import('../src/page-view-counter.mjs');
  pageViewHandler = createPageViewHandler(new AggregatePageViewCounter({
    file: path.join(temporary, 'aggregate.json'), now: () => new Date('2026-10-23T12:00:00.000Z'),
  }), { publicOrigin: base });
  const browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const workers = []; const builds = []; page.on('worker', (worker) => workers.push(worker.url()));
  page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/build') builds.push(request.method()); });
  try {
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#page-view-count')?.textContent.includes('total since'));
    const view = await page.locator('#page-view-count').evaluate((node) => ({ text: node.textContent, title: node.title }));
    assert.match(view.text, /Page views today: 1 · total since 23 Oct 2026: 1/u);
    assert.match(view.title, /not unique visitors/u); assert.equal(reads, 1); assert.equal(increments, 1);
    assert.deepEqual(workers, []); assert.deepEqual(builds, []);
    const unavailable = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await unavailable.route('**/api/page-views', async (route) => route.request().method() === 'POST'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"status":"unavailable"}' })
      : route.continue());
    await unavailable.goto(`${base}/`, { waitUntil: 'networkidle' });
    await unavailable.waitForFunction(() => document.querySelector('#page-view-count')?.textContent === 'Page views unavailable');
    await unavailable.close();
    if (process.env.PAGE_VIEW_SCREENSHOT) await page.screenshot({ path: process.env.PAGE_VIEW_SCREENSHOT, fullPage: true });
    process.stdout.write(`${JSON.stringify({ status: 'pass', reads, increments, workers: 0, builds: 0, view })}\n`);
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); fs.rmSync(temporary, { recursive: true, force: true }); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
