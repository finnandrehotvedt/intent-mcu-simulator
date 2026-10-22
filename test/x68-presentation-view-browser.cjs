// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X68_URL || 'http://host.docker.internal:18898/dist/';
const output = process.env.X68_OUTPUT || '/tmp/x68-presentation-view';

const productState = () => ({
  project: window.__M6_PROJECT__(),
  source: document.querySelector('#source').value,
  profile: document.querySelector('#board-select').value,
  lifecycle: document.querySelector('#lifecycle-state').textContent,
  artifact: window.__M6_STATE__.artifactIdentity,
  runtime: structuredClone(window.__M6_STATE__.runtime),
  workers: window.__M6_STATE__.runtimeWorkerCreations,
  budget: window.__X92_EXPERIMENT_BUDGET__.snapshot(),
});

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const producers = []; const mutations = []; const outside = []; const errors = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/\/api\/(build|run|scenario|worker)/u.test(url.pathname)) producers.push(`${request.method()} ${url.pathname}`);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
    if (url.origin !== new URL(base).origin) outside.push(url.href);
  });
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true && window.__X68_PRESENTATION_VIEW__);
    await page.click('#project-files-open');
    await page.waitForSelector('#workbench-project-dialog[open]');
    await page.click('#project-demo');
    await page.waitForSelector('#example-picker-dialog[open]');
    await page.click('.starter-card[data-example="avr-thermostat-boundary-v1"]');
    await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.active === true);
    assert.equal(await page.locator('#presentation-open').isDisabled(), false);
    const before = await page.evaluate(productState);

    await page.click('#presentation-open');
    await page.waitForSelector('#presentation-view-dialog[open]');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'presentation-view-title');
    await page.check('#presentation-instruments input[value="pin-inspector"]');
    await page.check('#presentation-instruments input[value="logic-analyser"]');
    await page.click('#presentation-add-step');
    const editors = page.locator('.presentation-step-editor');
    assert.equal(await editors.count(), 3);
    await editors.nth(2).locator('input').nth(0).fill('Explain the model limit');
    await editors.nth(2).locator('input').nth(1).fill('<b>This is not markup</b>');
    await page.click('#presentation-start');
    assert.match(await page.locator('#presentation-status').textContent(), /PRESENTATION_STEP_TEXT/u);
    assert.equal(await page.locator('#presentation-stage').isHidden(), true);
    await editors.nth(2).locator('input').nth(1).fill('Explain that the ideal sensor is a bounded teaching model.');
    await page.click('#presentation-start');
    await page.waitForFunction(() => window.__X68_PRESENTATION_VIEW__.snapshot().active === true);
    assert.equal(await page.locator('#presentation-stage').isVisible(), true);
    assert.equal(await page.locator('.presentation-instrument-card').count(), 4);
    assert.equal(await page.locator('.presentation-instrument-card[data-instrument-id="recorded-evidence"]').getByText('No recorded evidence').count() > 0, true);
    assert.equal(await page.locator('.presentation-instrument-card[data-instrument-id="serial-output"]').getByText(/No recorded USART0 evidence/u).count() > 0, true);
    assert(Object.values(await page.evaluate(() => window.__X68_PRESENTATION_VIEW__.snapshot().authority)).every((value) => value === false));
    const observation = await page.evaluate(() => window.__X68_PRESENTATION_VIEW__.observation());
    assert.match(observation.capturedAt, /^\d{4}-\d{2}-\d{2}T/u);
    assert.equal(observation.virtualCycle, null); assert.equal(observation.ownerIdentity, 'No current runtime owner');
    assert.match(await page.locator('#presentation-snapshot-status').textContent(), /Frozen snapshot.*virtual cycle unavailable.*No current runtime owner/u);
    await page.evaluate(() => {
      document.querySelector('#instrument-evidence-state').textContent = 'Synthetic later runtime evidence';
      document.querySelector('#serial-output').textContent = 'SYNTHETIC LATER OUTPUT';
      document.querySelector('#pin-cycle').textContent = '999999';
      document.querySelector('#logic-count').textContent = '99 transitions';
    });

    const wide = path.join(output, 'x68-presentation-1366x768.png');
    await page.locator('#presentation-view-dialog').screenshot({ path: wide });
    assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
    await page.click('#presentation-next');
    assert.equal(await page.locator('#presentation-step-count').textContent(), '2 / 3');
    assert.equal(await page.locator('.presentation-instrument-card').getByText('Synthetic later runtime evidence').count(), 0);
    assert.equal(await page.locator('.presentation-instrument-card').getByText('SYNTHETIC LATER OUTPUT').count(), 0);
    assert.deepEqual(await page.evaluate(() => window.__X68_PRESENTATION_VIEW__.observation()), observation);
    await page.click('#presentation-next');
    assert.equal(await page.locator('#presentation-step-title').textContent(), 'Explain the model limit');
    assert.equal(await page.locator('#presentation-step-text').textContent(), 'Explain that the ideal sensor is a bounded teaching model.');
    await page.click('#presentation-previous');
    assert.equal(await page.locator('#presentation-step-count').textContent(), '2 / 3');
    await page.setViewportSize({ width: 1440, height: 900 });
    const tall = path.join(output, 'x68-presentation-1440x900.png');
    await page.locator('#presentation-view-dialog').screenshot({ path: tall });
    assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);

    const afterActions = await page.evaluate(productState);
    assert.deepEqual(afterActions, before);
    await page.click('#presentation-exit');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'presentation-start');
    await page.click('#presentation-close');
    await page.waitForFunction(() => !document.querySelector('#presentation-view-dialog').open);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'presentation-open');

    await page.click('#presentation-open');
    await page.click('#presentation-start');
    await page.selectOption('#board-select', 'board.rp2040-pico-v1');
    await page.waitForFunction(() => !document.querySelector('#presentation-view-dialog').open);
    assert.equal(await page.evaluate(() => window.__X68_PRESENTATION_VIEW__.snapshot().active), false);
    assert.equal(await page.locator('#presentation-open').isDisabled(), true);

    assert.deepEqual(producers, []); assert.deepEqual(mutations, []); assert.deepEqual(outside, []);
    assert.deepEqual(errors, []); assert.equal((await context.cookies()).length, 0);
    const result = { result: 'pass', profile: before.profile, steps: 3, instruments: 4,
      frozenObservationSnapshot: true, capturedAtLabel: true, syntheticLaterObservationExcluded: true,
      projectStateUnchangedDuringPresentation: true, lifecycleClose: true, producers: 0, mutations: 0,
      outsideRequests: 0, cookies: 0, screenshots: [wide, tall] };
    fs.writeFileSync(path.join(output, 'x68-presentation-view.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
