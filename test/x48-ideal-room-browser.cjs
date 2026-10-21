// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.X48_URL || 'http://host.docker.internal:18896';
const output = process.env.X48_OUTPUT || '/tmp/x48-ideal-room-browser';
const viewports = [{ width: 1366, height: 768 }, { width: 1440, height: 900 }];
const temperatures = [20_000, 21_250, 22_421, 23_519, 24_549, 25_514, 26_419, 27_267,
  28_062, 28_808, 29_507, 30_162, 29_527, 30_181, 29_545, 30_198, 29_561, 30_213,
  29_575, 30_226, 29_587, 30_237, 29_598, 30_248, 29_608, 30_257, 29_616, 30_265,
  29_624, 30_272, 29_630, 30_278, 29_636];

function syntheticResult() {
  return {
    status: 'indeterminate', reason: 'X48_SYNTHETIC_BROWSER_PRESENTATION',
    rows: Array.from({ length: 32 }, (_, index) => {
      const tick = index + 1;
      const nominalTargetCycle = tick * 2_560_000;
      const latenessCycles = tick % 6;
      const actualSampleCycle = nominalTargetCycle + latenessCycles;
      const level = temperatures[index] < 30_000;
      return {
        tick, inputMilliC: temperatures[index], nextMilliC: temperatures[index + 1],
        nominalTargetCycle, actualSampleCycle, latenessCycles,
        inputAppliedCycle: actualSampleCycle,
        observedD13: { mode: 'OUTPUT', level }, matched: true,
      };
    }),
  };
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = { schema: 'intent-mcu-x48-synthetic-browser-presentation@1',
    fixtureAuthority: 'synthetic-presentation-only-not-firmware-producer',
    producerRequests: [], mutatingRequests: [], thirdPartyRequests: [], errors: [], cases: [] };
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      await context.addInitScript(() => {
        window.__X48_BROWSER_ACTIVITY__ = { workers: 0, storageWrites: 0 };
        const NativeWorker = window.Worker;
        window.Worker = new Proxy(NativeWorker, { construct(Target, args) {
          window.__X48_BROWSER_ACTIVITY__.workers += 1;
          return Reflect.construct(Target, args);
        } });
        for (const name of ['setItem', 'removeItem', 'clear']) {
          const original = Storage.prototype[name];
          Storage.prototype[name] = function wrapped(...args) {
            window.__X48_BROWSER_ACTIVITY__.storageWrites += 1;
            return original.apply(this, args);
          };
        }
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => report.errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') report.errors.push(message.text()); });
      page.on('request', (request) => {
        const url = new URL(request.url());
        const item = { method: request.method(), path: url.pathname };
        if (/\/(?:api|compile|run|scenario)(?:\/|$)/u.test(url.pathname)) report.producerRequests.push(item);
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) report.mutatingRequests.push(item);
        if (url.origin !== new URL(base).origin) report.thirdPartyRequests.push(item);
      });
      assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' })).status(), 200);
      await page.waitForFunction(() => window.__M11_READY__ === true && window.__X48_RUNTIME_BRIDGE__);
      if (await page.locator('#walkthrough').getAttribute('open') !== null) {
        await page.locator('#walkthrough button').last().click();
      }
      const before = await page.evaluate(() => structuredClone(window.__X48_BROWSER_ACTIVITY__));
      await page.click('#instruments-open');
      const panel = page.locator('#workbench-instruments-dialog [data-x48-room-loop]');
      await panel.waitFor({ state: 'visible' });
      await page.evaluate((result) => document.dispatchEvent(new CustomEvent('x48-state', { detail: {
        kind: 'x48-indeterminate', result,
        message: 'Synthetic browser presentation fixture — no firmware producer was executed.',
      } })), syntheticResult());
      await page.waitForFunction(() => document.querySelectorAll(
        '#workbench-instruments-dialog [data-x48-rows] tr').length === 32);
      const after = await page.evaluate(() => structuredClone(window.__X48_BROWSER_ACTIVITY__));
      const state = await panel.evaluate((root) => ({
        panelState: root.dataset.state,
        rows: root.querySelectorAll('[data-x48-rows] tr').length,
        text: root.textContent,
        pageOverflow: document.documentElement.scrollWidth - innerWidth,
        dialogOverflow: root.closest('dialog').scrollWidth - root.closest('dialog').clientWidth,
        smallestText: Math.min(...[...root.querySelectorAll('strong,span,p,button,dt,dd,caption,th,td')]
          .map((node) => parseFloat(getComputedStyle(node).fontSize))),
      }));
      assert.equal(state.panelState, 'indeterminate');
      assert.equal(state.rows, 32);
      assert.match(state.text, /Synthetic browser presentation fixture — no firmware producer was executed\./u);
      assert.match(state.text, /first completed AVR instruction boundary/u);
      assert.match(state.text, /indeterminate · 32\/32 rows · X48_SYNTHETIC_BROWSER_PRESENTATION/u);
      assert(state.pageOverflow <= 1, JSON.stringify(state));
      assert(state.dialogOverflow <= 1, JSON.stringify(state));
      assert(state.smallestText >= 10.8, JSON.stringify(state));
      assert.deepEqual({ workers: after.workers - before.workers,
        storageWrites: after.storageWrites - before.storageWrites }, { workers: 0, storageWrites: 0 });
      await page.screenshot({ path: path.join(output,
        `x48-synthetic-presentation-${viewport.width}x${viewport.height}.png`), animations: 'disabled' });
      report.cases.push({ viewport, state, activityDelta: {
        workers: after.workers - before.workers, storageWrites: after.storageWrites - before.storageWrites,
      } });
      await context.close();
    }
    assert.deepEqual(report.producerRequests, []);
    assert.deepEqual(report.mutatingRequests, []);
    assert.deepEqual(report.thirdPartyRequests, []);
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(output, 'x48-synthetic-browser-report.json'),
      `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ ok: true, cases: report.cases.length, rows: 32 })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
