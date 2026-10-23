// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const repository = path.resolve(__dirname, '..');
const dist = path.join(repository, 'dist');
const output = process.env.RUNTIME_CONTROLS_UI_OUTPUT || '';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function server() {
  return http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(dist, relative);
    if (!file.startsWith(`${dist}${path.sep}`) || !fs.existsSync(file)) {
      response.writeHead(404); response.end('not found'); return;
    }
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(response);
  });
}

async function layout(page) {
  return page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
    return {
      dock: rect('#serial-dock'),
      dialog: rect('#workbench-instruments-dialog'),
      main: rect('main'),
      pause: { ...rect('#quick-pause'), disabled: document.querySelector('#quick-pause').disabled,
        label: document.querySelector('#quick-pause').textContent },
      reset: { ...rect('#quick-reset'), disabled: document.querySelector('#quick-reset').disabled,
        label: document.querySelector('#quick-reset').textContent },
      tabExpanded: document.querySelector('#serial-tab').getAttribute('aria-expanded'),
      dockHidden: document.querySelector('#serial-dock').hidden,
      bodyDockClass: document.body.classList.contains('serial-dock-open'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

(async () => {
  if (output) fs.mkdirSync(output, { recursive: true });
  const app = server();
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const report = { workers: 0, apiRequests: [], viewports: [] };
  try {
    for (const viewport of [{ width: 1920, height: 911 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      const page = await context.newPage();
      await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        window.__SERIAL_UI_WORKERS__ = 0;
        window.Worker = class CountedWorker extends NativeWorker {
          constructor(...args) { window.__SERIAL_UI_WORKERS__ += 1; super(...args); }
        };
      });
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/')) {
          report.apiRequests.push(`${request.method()} ${request.url()}`);
        }
      });
      await page.goto(`http://127.0.0.1:${app.address().port}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__M11_READY__ === true);
      assert.equal(await page.locator('#regression-matrix').getAttribute('open'), null);
      assert.equal(await page.locator('#regression-matrix-results').isVisible(), false);
      if (output) await page.screenshot({ path: path.join(output,
        `${viewport.width}x${viewport.height}-advanced-testing-collapsed.png`), fullPage: false });
      await page.locator('#regression-matrix > summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#regression-matrix').getAttribute('open'), '');
      assert.equal(await page.locator('#regression-matrix-results').isVisible(), true);
      assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), 0);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#regression-matrix').getAttribute('open'), null);
      for (const [profile, pauseLabel, resetLabel] of [
        ['board.rp2040-pico-v1', 'Pause', 'Reset'],
        ['board.esp32-c3-devmodule-v1', 'Pause unavailable', 'Reset replay is part of Run'],
        ['board.stm32f429zi-nucleo144-v1', 'Pause unavailable', 'Reset in fresh Renode'],
        ['board.atmega328p-16mhz-v1', 'Pause', 'Reset'],
      ]) {
        await page.selectOption('#board-select', profile);
        await page.waitForFunction((expected) => document.querySelector('#board-select').value === expected,
          profile);
        const state = await page.evaluate(() => ({
          pause: { text: document.querySelector('#quick-pause').textContent,
            disabled: document.querySelector('#quick-pause').disabled,
            clipped: document.querySelector('#quick-pause').scrollWidth
              > document.querySelector('#quick-pause').clientWidth },
          reset: { text: document.querySelector('#quick-reset').textContent,
            disabled: document.querySelector('#quick-reset').disabled,
            clipped: document.querySelector('#quick-reset').scrollWidth
              > document.querySelector('#quick-reset').clientWidth },
        }));
        assert.equal(state.pause.text, pauseLabel);
        assert.equal(state.reset.text, resetLabel);
        assert.equal(state.pause.disabled, true);
        assert.equal(state.reset.disabled, true);
        assert.equal(state.pause.clipped, false, JSON.stringify({ profile, state }));
        assert.equal(state.reset.clipped, false, JSON.stringify({ profile, state }));
      }
      assert.equal(await page.locator('#quick-pause').isDisabled(), true);
      assert.equal(await page.locator('#quick-reset').isDisabled(), true);
      assert.equal(await page.locator('#quick-pause').textContent(), 'Pause');
      assert.equal(await page.locator('#quick-reset').textContent(), 'Reset');
      const controls = await page.evaluate(() => ({
        pause: document.querySelector('#quick-pause').getBoundingClientRect().toJSON(),
        reset: document.querySelector('#quick-reset').getBoundingClientRect().toJSON(),
      }));
      assert(controls.pause.width >= 64 && controls.reset.width >= 64, JSON.stringify(controls));
      assert(controls.pause.top >= 0 && controls.reset.right <= viewport.width, JSON.stringify(controls));

      for (const opener of ['#project-files-open', '#firmware-open', '#instruments-open']) {
        await page.click(opener);
        await page.waitForFunction((selector) => document.querySelector(selector).getAttribute('aria-expanded') === 'true',
          opener);
        await page.keyboard.press('Escape');
        await page.waitForFunction((selector) => document.querySelector(selector).getAttribute('aria-expanded') === 'false',
          opener);
      }

      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      await page.click('#serial-tab');
      await page.waitForSelector('#workbench-instruments-dialog[open] #serial-dock:not([hidden])');
      const open = await layout(page);
      assert.equal(open.tabExpanded, 'true');
      assert.equal(open.dockHidden, false);
      assert.equal(open.bodyDockClass, false);
      assert(open.dock.width >= Math.min(600, viewport.width - 80), JSON.stringify(open));
      assert(open.dock.height > 300, JSON.stringify(open));
      assert(open.dock.top >= 0 && open.dock.bottom <= viewport.height, JSON.stringify(open));
      assert(open.dock.left >= open.dialog.left && open.dock.right <= open.dialog.right + 1,
        JSON.stringify(open));
      assert(open.overflow <= 1, JSON.stringify(open));
      if (output) await page.screenshot({ path: path.join(output,
        `${viewport.width}x${viewport.height}-serial-open.png`), fullPage: false });

      await page.click('#serial-close');
      await page.waitForFunction(() => !document.querySelector('#workbench-instruments-dialog').open);
      assert.equal(await page.locator('#serial-tab').getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('#serial-dock').getAttribute('hidden'), '');
      assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#serial-tab')), true);
      const parking = await page.evaluate(() => {
        const node = document.querySelector('#workbench-surface-parking');
        return { hidden: node.hidden, rects: node.getClientRects().length,
          visibleChildren: [...node.children].filter((child) => child.getClientRects().length > 0).length };
      });
      assert.deepEqual(parking, { hidden: true, rects: 0, visibleChildren: 0 });

      await page.click('#serial-tab');
      await page.waitForSelector('#workbench-instruments-dialog[open] #serial-dock:not([hidden])');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#workbench-instruments-dialog').open);
      assert.equal(await page.locator('#serial-tab').getAttribute('aria-expanded'), 'false');
      assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#serial-tab')), true);
      report.workers += await page.evaluate(() => window.__SERIAL_UI_WORKERS__);
      report.viewports.push({ viewport, controls, open });
      await context.close();
    }
    assert.equal(report.workers, 0);
    assert.deepEqual(report.apiRequests, []);
    process.stdout.write(`${JSON.stringify({ status: 'pass', workers: report.workers,
      apiRequests: report.apiRequests.length, viewports: report.viewports.map(({ viewport, controls, open }) =>
        ({ viewport, dock: open.dock, pause: controls.pause, reset: controls.reset })) })}\n`);
  } finally {
    await browser.close();
    await new Promise((resolve) => app.close(resolve));
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
