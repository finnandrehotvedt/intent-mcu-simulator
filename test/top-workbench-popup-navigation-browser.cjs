// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.TOP_LAYOUT_URL || 'http://host.docker.internal:18867';
const settleFocus = (page) => page.evaluate(() => new Promise((resolve) =>
  queueMicrotask(() => requestAnimationFrame(() => queueMicrotask(resolve)))));

async function openSearch(page, query, kind) {
  await page.click('#brief-tests-open');
  const navigation = page.locator('#project-navigation');
  if (!await navigation.evaluate((node) => node.open)) await navigation.locator('summary').click();
  await page.fill('#project-navigation-query', query);
  const result = page.locator(`#project-navigation-results button[data-navigation-kind="${kind}"]`).first();
  await result.waitFor();
  const id = await result.getAttribute('data-navigation-id');
  await result.click();
  await settleFocus(page);
  return id;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const producer = [];
    page.on('request', (request) => {
      if (/\/api\//u.test(new URL(request.url()).pathname) || !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
        producer.push({ method: request.method(), url: request.url() });
      }
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);

    const fileId = await openSearch(page, 'main.ino', 'file');
    assert.equal(fileId, 'main.ino');
    assert.equal(await page.locator('#workbench-firmware-dialog').getAttribute('open'), '');
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#source-file')), true);
    assert.equal(await page.inputValue('#source-file'), 'main.ino');
    await page.keyboard.press('Escape');

    await page.selectOption('#board-select', 'board.rp2040-pico-v1');
    await page.waitForFunction(() => document.querySelector('#active-canvas-mount > .pico-circuit-pane')?.getClientRects().length > 0);
    const source = await page.inputValue('#pico-source');
    const lines = source.split('\n');
    const line = lines.findIndex((value) => value.trim().length >= 6) + 1;
    assert(line > 0);
    const query = lines[line - 1].trim().slice(0, 24);
    const sourceId = await openSearch(page, query, 'source');
    assert.equal(sourceId, `main.c:${line}`);
    const expectedStart = lines.slice(0, line - 1).reduce((count, value) => count + value.length + 1, 0);
    assert.deepEqual(await page.evaluate(() => ({
      active: document.activeElement?.id,
      start: document.querySelector('#pico-source').selectionStart,
      end: document.querySelector('#pico-source').selectionEnd,
    })), { active: 'pico-source', start: expectedStart, end: expectedStart + lines[line - 1].length });
    await page.keyboard.press('Escape');

    const pinId = await openSearch(page, 'GP0', 'pin');
    assert.equal(await page.locator('#workbench-brief-dialog').getAttribute('open'), null);
    assert.deepEqual(await page.evaluate(() => {
      const active = document.activeElement;
      return { endpoint: active?.dataset.endpoint ?? active?.dataset.editorEndpoint ?? null,
        visible: Boolean(active?.matches('#active-canvas-mount #pico-editor-components .pin-anchor')
          && active.getClientRects().length > 0) };
    }), { endpoint: pinId, visible: true });

    assert.equal(producer.length, 0);
    assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), 0);
    assert.equal(context.serviceWorkers().length, 0);
    process.stdout.write(`${JSON.stringify({ fileFocus: true, sourceLineFocus: true, exactPinFocus: true,
      producerRequests: 0, workers: 0, serviceWorkers: 0 })}\n`);
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
