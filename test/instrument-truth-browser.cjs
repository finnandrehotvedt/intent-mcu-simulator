// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const path = require('path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.INSTRUMENT_STAGING_URL || 'http://127.0.0.1:18783';
const screenshot = process.env.INSTRUMENT_SCREENSHOT;
function assert(value, message) { if (!value) throw new Error(message); }

async function openButton(page) {
  await page.click('#project-new');
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
  await page.selectOption('#example-select', 'button');
  await page.click('#project-demo');
  await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.some((part) => part.id === 'button-1'));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    const errors = []; const outside = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    await page.addInitScript(() => {
      window.__instrumentLongTasks = [];
      new PerformanceObserver((list) => {
        window.__instrumentLongTasks.push(...list.getEntries().map(({ duration, startTime }) => ({ duration, startTime })));
      }).observe({ entryTypes: ['longtask'] });
    });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    assert(await page.locator('#instrument-evidence').getAttribute('data-state') === 'no-recorded-runtime', 'initial evidence was not explicitly absent');

    await openButton(page);
    const openedProject = await page.evaluate(() => window.__M6_PROJECT__());
    const source = (await page.inputValue('#source')).replace('delay(120)', 'delay(10)');
    await page.fill('#source', source);
    await page.click('#build');
    await page.waitForFunction(() => ['succeeded', 'failed', 'cancelled', 'timeout'].includes(window.__M6_STATE__.buildState), null, { timeout: 30_000 });
    assert(await page.evaluate(() => window.__M6_STATE__.buildState) === 'succeeded', 'real AVR compilation failed');
    await page.waitForFunction(() => window.__M6_STATE__.runtime?.kind === 'ready', null, { timeout: 10_000 });
    await page.click('#serial-tab');
    await page.fill('#serial-input', 'Z');
    await page.click('#serial-send');
    await page.click('#canvas-interact-mode');
    await page.selectOption('#speed', '1');
    await page.selectOption('#logic-window', '500');
    await page.evaluate(() => { window.__instrumentLongTasks = []; window.__instrumentFillStarted = performance.now(); });
    await page.click('#run');
    const button = page.locator('.component-control-hit');
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const interactionStarted = Date.now();
    await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
    await page.waitForFunction(() => window.__M6_STATE__.runtime?.eventLog?.log?.some((event) => event.type === 'control'));
    const interactionLatencyMs = Date.now() - interactionStarted;
    await page.waitForFunction(() => {
      const runtime = window.__M6_STATE__.runtime;
      return runtime?.instruments?.serial?.records?.length >= 8
        && runtime?.instruments?.logic?.transitions?.length >= 2
        && runtime?.eventLog?.log?.some((event) => event.type === 'control')
        && runtime?.eventLog?.log?.some((event) => event.type === 'uart-rx');
    }, null, { timeout: 120_000 }).catch(async (error) => {
      const state = await page.evaluate(() => ({
        build: window.__M6_STATE__.buildState,
        runtime: window.__M6_STATE__.runtime ? {
          kind: window.__M6_STATE__.runtime.kind, message: window.__M6_STATE__.runtime.message,
          cycle: window.__M6_STATE__.runtime.cycle,
          serial: window.__M6_STATE__.runtime.instruments?.serial?.records?.length,
          logic: window.__M6_STATE__.runtime.instruments?.logic?.transitions?.length,
          events: window.__M6_STATE__.runtime.eventLog?.log?.map((event) => event.type),
        } : null,
        workerText: document.querySelector('#worker-state')?.textContent,
      }));
      throw new Error(`${error.message}; state=${JSON.stringify(state)}`);
    });
    await page.click('#pause');
    await page.waitForFunction(() => window.__M6_STATE__.runtime?.paused === true);
    await page.click('#serial-event-mode');
    await page.waitForTimeout(100);

    const evidence = await page.evaluate(() => {
      const runtime = window.__M6_STATE__.runtime;
      const presented = window.__INSTRUMENT_EVIDENCE__;
      const longTasks = window.__instrumentLongTasks.filter((entry) => entry.duration >= 250);
      return {
        presented, cycle: runtime.cycle,
        artifact: window.__M6_STATE__.artifactIdentity,
        serialRecords: runtime.instruments.serial.records.length,
        serialRendered: document.querySelector('#serial-output').textContent.split('\n').filter(Boolean).length,
        waveformPaths: document.querySelectorAll('#logic-waveform .wave-path').length,
        waveformWindow: document.querySelector('#logic-window').value,
        inputTypes: [...new Set(runtime.eventLog.log.map((event) => event.type))],
        fillWallMilliseconds: performance.now() - window.__instrumentFillStarted,
        state: document.querySelector('#instrument-evidence').dataset.state,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        longTasks,
        saturation: window.__M6_INSTRUMENT_RENDER_BENCHMARK__(),
      };
    });
    evidence.interactionLatencyMs = interactionLatencyMs;
    assert(evidence.state === 'recorded-runtime', 'UI did not enter recorded-runtime state');
    assert(evidence.presented.cycle === evidence.cycle, 'evidence cycle differs from worker snapshot');
    assert(evidence.presented.artifactIdentity === evidence.artifact, 'evidence artifact differs from compiled artifact');
    assert(evidence.serialRecords >= 8 && evidence.serialRendered === evidence.serialRecords, 'actual firmware producer history was not rendered in order');
    assert(evidence.waveformWindow === '500' && evidence.waveformPaths >= 1, `actual waveform/cursors were not rendered: ${JSON.stringify({ waveformWindow: evidence.waveformWindow, waveformPaths: evidence.waveformPaths })}`);
    assert(evidence.saturation.serial.records === 4096 && evidence.saturation.serial.milliseconds <= 250, `4,096-record render budget failed: ${JSON.stringify(evidence.saturation.serial)}`);
    assert(evidence.saturation.logic.edges === 500 && evidence.saturation.logic.cursors === 2 && evidence.saturation.logic.milliseconds <= 250, `500-edge render budget failed: ${JSON.stringify(evidence.saturation.logic)}`);
    assert(evidence.inputTypes.includes('control') && evidence.inputTypes.includes('uart-rx'), 'actual control/UART input records are missing');
    assert(evidence.longTasks.length === 0, `instrument rendering exceeded 250 ms: ${JSON.stringify(evidence.longTasks)}`);
    assert(evidence.overflow <= 1, `horizontal overflow: ${evidence.overflow}`);
    assert(errors.length === 0, `browser errors: ${JSON.stringify(errors)}`);
    assert(outside.length === 0, `third-party requests: ${JSON.stringify(outside)}`);
    await page.locator('#runtime-drawer').scrollIntoViewIfNeeded();
    if (screenshot) await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });

    const beforeClear = await page.evaluate(() => ({ cycle: window.__M6_STATE__.runtime.cycle, artifact: window.__M6_STATE__.artifactIdentity }));
    const clearStarted = Date.now();
    await page.click('#serial-clear');
    await page.waitForFunction(() => window.__M6_STATE__.runtime?.instruments?.serial?.records?.length === 0);
    const clearLatencyMs = Date.now() - clearStarted;
    await page.waitForTimeout(300);
    const afterClear = await page.evaluate(() => ({
      cycle: window.__M6_STATE__.runtime.cycle, artifact: window.__M6_STATE__.artifactIdentity,
      records: window.__M6_STATE__.runtime.instruments.serial.records.length,
    }));
    assert(afterClear.records === 0 && afterClear.cycle >= beforeClear.cycle && afterClear.artifact === beforeClear.artifact, 'Clear reset runtime identity/time or old records reappeared');
    evidence.clearLatencyMs = clearLatencyMs;

    await page.fill('#source', `${await page.inputValue('#source')}\n`);
    await page.waitForFunction(() => window.__INSTRUMENT_EVIDENCE__.state === 'no-recorded-runtime' && window.__M6_STATE__.runtime === null);
    const reopened = await page.evaluate((project) => window.__M6_IMPORT__(JSON.stringify(project), 'replace'), openedProject);
    assert(reopened.ok, `data-only Open equivalent failed: ${JSON.stringify(reopened)}`);
    assert(await page.evaluate(() => window.__INSTRUMENT_EVIDENCE__.state) === 'no-recorded-runtime', 'Open restored stale runtime evidence');
    await page.selectOption('#family-select', 'architecture.rp2040-v1');
    await page.waitForTimeout(100);
    assert(await page.evaluate(() => window.__INSTRUMENT_EVIDENCE__.state) === 'no-recorded-runtime', 'profile change restored stale AVR evidence');
    process.stdout.write(`${JSON.stringify({ status: 'pass', ...evidence })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
