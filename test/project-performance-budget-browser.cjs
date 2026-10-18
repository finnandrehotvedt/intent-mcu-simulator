// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.PERFORMANCE_BUDGET_URL || 'http://127.0.0.1:18786';
const screenshotPath = process.env.PERFORMANCE_BUDGET_SCREENSHOT || null;

function summary(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    samples: sorted.map((value) => Number(value.toFixed(3))),
    minimum: Number(sorted[0].toFixed(3)),
    median: Number(sorted[Math.floor(sorted.length / 2)].toFixed(3)),
    p95: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(3)),
    maximum: Number(sorted.at(-1).toFixed(3)),
  };
}

async function browserMeasure(page, action) {
  return page.evaluate(async (source) => {
    const started = performance.now();
    const value = await (0, eval)(source);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { value, milliseconds: performance.now() - started };
  }, `(${action.toString()})()`);
}

async function cdpMetrics(client) {
  await client.send('HeapProfiler.collectGarbage');
  const result = await client.send('Performance.getMetrics');
  return Object.fromEntries(result.metrics.map((item) => [item.name, item.value]));
}

async function openMaximumFixture(page, fixture) {
  await page.evaluate(() => { window.__PERFORMANCE_OPEN_STARTED__ = performance.now(); });
  await page.setInputFiles('#project-open-input', {
    name: 'maximum-supported-graph.intent-mcu.json',
    mimeType: 'application/json',
    buffer: Buffer.from(fixture.text),
  });
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
    await page.evaluate(() => document.querySelector('#unsaved-discard').click());
  }
  await page.waitForFunction(() => {
    const project = window.__M6_PROJECT__?.();
    const graph = project?.candidateCircuit ?? project?.circuit;
    return graph?.components?.length === 64 && graph?.nets?.length === 128;
  }, null, { timeout: 5_000 }).catch(async (error) => {
    const state = await page.evaluate(() => ({
      components: (window.__M6_PROJECT__?.()?.candidateCircuit ?? window.__M6_PROJECT__?.()?.circuit)?.components?.length,
      nets: (window.__M6_PROJECT__?.()?.candidateCircuit ?? window.__M6_PROJECT__?.()?.circuit)?.nets?.length,
      message: document.querySelector('#project-message')?.textContent,
      dialogOpen: document.querySelector('#unsaved-change-dialog')?.open,
      fileState: window.__COMMON_PROJECT_FILE_STATE__ ?? null,
    }));
    throw new Error(`${error.message}\n${JSON.stringify(state)}`);
  });
  return page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return performance.now() - window.__PERFORMANCE_OPEN_STARTED__;
  });
}

(async () => {
  const [{ PROJECT_PERFORMANCE_BUDGET: contract }, { createMaximumSupportedGraphFixture }] = await Promise.all([
    import('./project-performance-budget-contract.mjs'),
    import('./maximum-supported-graph-fixture.mjs'),
  ]);
  const fixture = createMaximumSupportedGraphFixture();
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-precise-memory-info'],
  });
  try {
    const context = await browser.newContext({ viewport: contract.environment.viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(180_000);
    const client = await context.newCDPSession(page);
    await client.send('Performance.enable');
    const errors = []; const outside = [];
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url());
    });

    const coldStarted = performance.now();
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const coldReady = performance.now() - coldStarted;

    const learner = await browserMeasure(page, () => {
      document.querySelector('#example-select').value = 'button';
      document.querySelector('#project-demo').click();
      return true;
    });
    assert.equal(await page.evaluate(() => window.__M6_PROJECT__().circuit.components.length), 2);
    const learnerDom = await page.evaluate(() => ({
      nodes: document.querySelectorAll('*').length,
      components: document.querySelectorAll('#component-layer .circuit-component').length,
      wireSegments: document.querySelectorAll('#circuit-wires .circuit-wire').length,
      pinAnchors: document.querySelectorAll('#component-layer .pin-anchor').length,
      projectBytes: new TextEncoder().encode(JSON.stringify(window.__M6_PROJECT__())).length,
    }));
    const learnerMemory = await cdpMetrics(client);

    // Start the synthetic maximum from a clean baseline so the browser's
    // unsaved-change safety gate does not become part of the render timing.
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);

    const importDurations = []; const selectDurations = []; const moveDurations = [];
    const undoDurations = []; const routeDurations = [];
    for (let round = 0; round < contract.environment.rounds; round += 1) {
      importDurations.push(await openMaximumFixture(page, fixture));

      const selected = await browserMeasure(page, () => {
        document.querySelector('#component-layer [data-component-id="lcd-1"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
      });
      selectDurations.push(selected.milliseconds);

      const moved = await browserMeasure(page, () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        return true;
      });
      moveDurations.push(moved.milliseconds);

      const undone = await browserMeasure(page, () => {
        document.querySelector('#undo').click();
        return true;
      });
      undoDurations.push(undone.milliseconds);

      const route = await page.evaluate(async () => {
        const hit = document.querySelector('#circuit-wires .wire-segment-hit');
        hit.focus();
        const started = performance.now();
        document.querySelector('#add-bend').click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return performance.now() - started;
      });
      routeDurations.push(route);
      await page.click('#undo');
    }

    const maximumDom = await page.evaluate(() => ({
      nodes: document.querySelectorAll('*').length,
      components: document.querySelectorAll('#component-layer .circuit-component').length,
      wireSegments: document.querySelectorAll('#circuit-wires .circuit-wire').length,
      wireHitTargets: document.querySelectorAll('#circuit-wires .wire-segment-hit').length,
      pinAnchors: document.querySelectorAll('#component-layer .pin-anchor').length,
      projectBytes: new TextEncoder().encode(JSON.stringify(window.__M6_PROJECT__())).length,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    const maximumMemory = await cdpMetrics(client);
    const heapDeltaBytes = Math.max(0, maximumMemory.JSHeapUsedSize - learnerMemory.JSHeapUsedSize);
    if (screenshotPath) await page.locator('#workbench-workspace').screenshot({ path: screenshotPath, animations: 'disabled' });

    const measurements = {
      coldReady: Number(coldReady.toFixed(3)),
      supportedLearnerRender: Number(learner.milliseconds.toFixed(3)),
      maximumImportRender: summary(importDurations),
      select: summary(selectDurations),
      move: summary(moveDurations),
      undo: summary(undoDurations),
      routeEdit: summary(routeDurations),
    };
    const budgets = contract.regressionBudgetMilliseconds;
    assert(measurements.coldReady <= budgets.coldReady, JSON.stringify(measurements));
    assert(measurements.supportedLearnerRender <= budgets.supportedLearnerRender, JSON.stringify(measurements));
    for (const key of ['maximumImportRender', 'select', 'move', 'undo', 'routeEdit']) {
      assert(measurements[key].p95 <= budgets[key], `${key}: ${JSON.stringify(measurements[key])}`);
    }
    assert(heapDeltaBytes <= contract.maximumHeapDeltaBytes, `heap delta ${heapDeltaBytes}`);
    assert.equal(maximumDom.components, contract.maximumCandidateFixture.components);
    assert.equal(maximumDom.horizontalOverflow <= 1, true);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.equal(outside.length, 0, JSON.stringify(outside));

    const output = {
      schema: contract.schema,
      status: 'pass',
      environment: {
        recordedAt: new Date().toISOString(),
        host: {
          cpuModel: os.cpus()[0]?.model ?? 'unknown', logicalCpuCount: os.cpus().length,
          totalMemoryBytes: os.totalmem(), platform: os.platform(), release: os.release(), arch: os.arch(),
          node: process.version,
        },
        browser: { name: 'Chromium', version: browser.version(), playwright: require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright/package.json')).version, headless: true },
        viewport: contract.environment.viewport,
      },
      hardLimits: contract.hardLimits,
      practicalV2Maximum: contract.practicalV2Maximum,
      maximumFixture: { ...fixture.counts, validationCode: fixture.validationCode, runnable: fixture.runnable.ok, projectBytes: Buffer.byteLength(fixture.text) },
      measurements,
      budgets,
      memory: {
        source: 'Chromium DevTools Protocol Performance.getMetrics after HeapProfiler.collectGarbage; approximate process-local browser metric',
        learnerJSHeapUsedBytes: learnerMemory.JSHeapUsedSize,
        maximumJSHeapUsedBytes: maximumMemory.JSHeapUsedSize,
        deltaBytes: heapDeltaBytes,
        budgetBytes: contract.maximumHeapDeltaBytes,
      },
      dom: { learner: learnerDom, maximum: maximumDom },
      qualification: contract.qualification,
      outsideRequests: 0,
      browserErrors: 0,
    };
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
