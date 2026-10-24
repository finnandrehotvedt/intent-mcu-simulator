// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { createReadStream } = require('node:fs');
const { createServer } = require('node:http');
const { stat } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES
  || '/root/.npm/_npx/fd3bca3c548369c0/node_modules', 'playwright'));

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8' };

(async () => {
  let origin;
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, origin).pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (relative.includes('..')) { response.writeHead(400); response.end(); return; }
    const file = path.join(process.cwd(), 'dist', relative);
    try {
      if (!(await stat(file)).isFile()) throw new Error('not-file');
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store' });
      createReadStream(file).pipe(response);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const view of [{ name: 'desktop', width: 1440, height: 900 },
      { name: 'mobile', width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport: view });
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
      const page = await context.newPage();
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => [...document.querySelectorAll('#workbench-popup-controls button')]
        .find((button) => button.textContent === 'API access').click());
      const dialog = page.locator('#browser-session-api-dialog');
      await assert.doesNotReject(() => dialog.waitFor({ state: 'visible' }));
      await dialog.locator('[data-copy-instructions]').click();
      const metrics = await page.evaluate(async () => {
        const dialogNode = document.querySelector('#browser-session-api-dialog');
        const body = dialogNode.querySelector('.api-pairing-body');
        const checkbox = dialogNode.querySelector('[data-edit-scope]');
        const prompt = dialogNode.querySelector('[data-codex-instructions]').value;
        return {
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
          dialogOverflow: dialogNode.scrollWidth - dialogNode.clientWidth,
          bodyOverflow: body.scrollWidth - body.clientWidth,
          checkbox: { width: checkbox.getBoundingClientRect().width,
            height: checkbox.getBoundingClientRect().height },
          prompt, clipboard: await navigator.clipboard.readText(),
          links: [...dialogNode.querySelectorAll('.api-resource-links a')].map((node) => node.href),
          secret: dialogNode.querySelector('[data-secret]').value,
          copyStatus: dialogNode.querySelector('[data-copy-status]').textContent,
        };
      });
      assert.ok(metrics.pageOverflow <= 0, `${view.name} page overflow ${metrics.pageOverflow}`);
      assert.ok(metrics.dialogOverflow <= 0, `${view.name} dialog overflow ${metrics.dialogOverflow}`);
      assert.ok(metrics.bodyOverflow <= 0, `${view.name} body overflow ${metrics.bodyOverflow}`);
      assert.ok(metrics.checkbox.width <= 20 && metrics.checkbox.height <= 20);
      assert.equal(metrics.clipboard, metrics.prompt);
      assert.equal(metrics.secret, '');
      assert.match(metrics.copyStatus, /No pairing secret was included/);
      assert.deepEqual(metrics.links, [
        'https://lab.teachthecompany.com/api/session/v1/protocol.txt',
        'https://lab.teachthecompany.com/api/session/v1/client.mjs',
      ]);
      const screenshot = process.env[`API_CODEX_${view.name.toUpperCase()}_SCREENSHOT`];
      if (screenshot) await page.screenshot({ path: screenshot, fullPage: false });
      results.push({ view: view.name, ...metrics, prompt: undefined, clipboard: undefined });
      await context.close();
    }
    for (const resource of ['/api/session/v1/protocol.txt', '/api/session/v1/client.mjs',
      '/api/session/v1/codex-instructions.txt']) {
      const response = await fetch(`${origin}${resource}`);
      assert.equal(response.status, 200); assert.ok((await response.text()).length > 500);
    }
    process.stdout.write(`${JSON.stringify({ status: 'pass', results })}\n`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
