// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.CONTROL_RUNTIME_EVIDENCE_URL || 'http://127.0.0.1:18795';
const screenshotPath = process.env.CONTROL_RUNTIME_EVIDENCE_SCREENSHOT || null;
const countText = (text, marker) => text.split(marker).length - 1;

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1536, height: 1100 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = []; const outside = [];
    page.on('pageerror', (error) => errors.push(error.stack || error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url());
    });
    const response = await page.goto(base, { waitUntil: 'domcontentloaded' });
    assert.equal(response.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true);

    const matrix = await page.evaluate(() => structuredClone(window.__CONTROL_RUNTIME_EVIDENCE_MATRIX__));
    assert(matrix.models >= 8);
    assert(matrix.fields >= 11);
    assert.equal(await page.locator('#control-runtime-evidence-body tr').count(), matrix.fields);
    assert(matrix.rows.some((row) => row.model === 'sensor.light-threshold-digital-v1'
      && row.field === 'outputActive' && !row.authored));

    await page.click('#beginner-examples');
    await page.click('.starter-card[data-example="avr-light-threshold"] .starter-action');
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit?.components
      .some((item) => item.id === 'light-threshold-1'));
    await page.click('#quick-build');
    await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 45_000 });
    await page.click('#quick-run');
    await page.waitForFunction(() => window.__SHARED_INSTRUMENT_VIEW__?.state === 'current-runtime'
      && /DARK|LIGHT/u.test(document.querySelector('#serial-output').textContent), null, { timeout: 20_000 });
    await page.click('#serial-tab');

    const darkBeforeThreshold = countText(await page.textContent('#serial-output'), 'DARK');
    await page.locator('[data-control="light-threshold-1.thresholdPercent"]').fill('30');
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.components
      .find((item) => item.id === 'light-threshold-1').controls.thresholdPercent === 30);
    const thresholdState = await page.evaluate(() => {
      const component = window.__M6_PROJECT__().candidateCircuit.components.find((item) => item.id === 'light-threshold-1');
      return { controls: structuredClone(component.controls), last: structuredClone(window.__M6_STATE__.runtime.eventLog.log.at(-1)) };
    });
    assert.equal(thresholdState.controls.outputActive, true, JSON.stringify(thresholdState));
    assert.equal(thresholdState.last.componentId, 'light-threshold-1', JSON.stringify(thresholdState));
    assert.equal(thresholdState.last.value, true, JSON.stringify(thresholdState));
    await page.waitForFunction((prior) => document.querySelector('#serial-output').textContent.split('DARK').length - 1 > prior,
      darkBeforeThreshold, { timeout: 20_000 });

    await page.locator('[data-control="light-threshold-1.thresholdPercent"]').fill('50');
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.components
      .find((item) => item.id === 'light-threshold-1').controls.outputActive === false);
    await page.locator('[data-control="light-threshold-1.lightLevelPercent"]').fill('60');
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.components
      .find((item) => item.id === 'light-threshold-1').controls.outputActive === true);
    await page.locator('[data-control="light-threshold-1.lightLevelPercent"]').fill('46');
    await page.waitForFunction(() => {
      const controls = window.__M6_PROJECT__().candidateCircuit.components
        .find((item) => item.id === 'light-threshold-1').controls;
      return controls.lightLevelPercent === 46 && controls.outputActive === true;
    });
    const lightBeforeHysteresis = countText(await page.textContent('#serial-output'), 'LIGHT');
    await page.locator('[data-control="light-threshold-1.hysteresisPercentagePoints"]').fill('0');
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.components
      .find((item) => item.id === 'light-threshold-1').controls.hysteresisPercentagePoints === 0);
    const hysteresisState = await page.evaluate(() => {
      const component = window.__M6_PROJECT__().candidateCircuit.components.find((item) => item.id === 'light-threshold-1');
      return { controls: structuredClone(component.controls), last: structuredClone(window.__M6_STATE__.runtime.eventLog.log.at(-1)) };
    });
    assert.equal(hysteresisState.controls.outputActive, false, JSON.stringify(hysteresisState));
    assert.equal(hysteresisState.last.componentId, 'light-threshold-1', JSON.stringify(hysteresisState));
    assert.equal(hysteresisState.last.value, false, JSON.stringify(hysteresisState));
    await page.waitForFunction((prior) => document.querySelector('#serial-output').textContent.split('LIGHT').length - 1 > prior,
      lightBeforeHysteresis, { timeout: 20_000 });

    assert.equal(outside.length, 0, JSON.stringify(outside));
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
    if (screenshotPath) {
      await page.locator('.control-runtime-evidence').evaluate((node) => { node.open = true; });
      await page.locator('#instrument-evidence').screenshot({ path: screenshotPath });
    }
    process.stdout.write(`${JSON.stringify({ status: 'pass', models: matrix.models, fields: matrix.fields,
      executedMissingFields: ['thresholdPercent', 'hysteresisPercentagePoints', 'outputActive'],
      outsideRequests: 0, browserErrors: 0 })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
