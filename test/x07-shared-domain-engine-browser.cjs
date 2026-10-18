// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X07_URL || 'http://127.0.0.1:18766';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const outside = []; const errors = []; const mutations = [];
    page.on('request', (request) => {
      const url = new URL(request.url()); if (url.origin !== new URL(base).origin) outside.push(request.url());
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base, { waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__M11_READY__ === true);

    const pico = 'board.rp2040-pico-v1'; await page.selectOption('#board-select', pico);
    const before = await page.evaluate((profile) => window.__COMMON_PROJECT_FILES__.current(profile), pico);
    await page.click('#shared-domain-engine-inspect');
    await page.waitForFunction(() => window.__SHARED_DOMAIN_ENGINE__.state()?.ok === true);
    const paths = await page.evaluate(async ({ profile, projectText }) => {
      const ui = window.__SHARED_DOMAIN_ENGINE__.state();
      const request = JSON.stringify({ schema: 'intent-mcu-domain-request@1', action: 'validate-project', projectText });
      const agent = await window.__AGENT_DOMAIN_ENGINE__.execute(request, profile);
      return { ui, agent, authority: window.__AGENT_DOMAIN_ENGINE__.authority };
    }, { profile: pico, projectText: before });
    assert.equal(paths.ui.engine, 'intent-mcu-shared-domain-engine@1');
    assert.equal(paths.ui.projectSha256, paths.agent.projectSha256); assert.deepEqual(paths.ui.stages, paths.agent.stages);
    assert.deepEqual(paths.authority, { network: false, mutation: false, build: false, run: false, persistence: false });
    assert.equal(await page.evaluate((profile) => window.__COMMON_PROJECT_FILES__.current(profile), pico), before);
    assert.equal(await page.locator('.shared-domain-stage').count(), 3);

    await page.selectOption('#board-select', 'board.atmega328p-16mhz-v1');
    await page.click('.starter-card[data-example="avr-thermostat-boundary-v1"]');
    await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.active === true);
    await page.click('#build');
    await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 60_000 });
    await page.waitForFunction(() => !document.querySelector('#thermostat-run-tests').disabled);
    await page.click('#thermostat-run-tests');
    try {
      await page.waitForFunction(() => {
        const state = window.__M6_STATE__.thermostatExperiment;
        return state && !state.running && state.results.length === 4;
      }, null, { timeout: 60_000 });
    } catch (error) {
      const debug = await page.evaluate(() => {
        const lastTest = window.__SHARED_DOMAIN_ENGINE__.lastTest();
        return { state: window.__M6_STATE__.thermostatExperiment,
          lastTestCode: lastTest?.result?.code,
          lastObservation: lastTest?.result?.observation?.scenarioId,
          message: document.querySelector('#thermostat-experiment-message')?.textContent };
      });
      throw new Error(`${error.message}; X07_DEBUG=${JSON.stringify(debug)}; PAGE_ERRORS=${JSON.stringify(errors)}`);
    }
    const sharedTest = await page.evaluate(async () => {
      const actual = window.__M6_STATE__.thermostatExperiment;
      const ui = window.__SHARED_DOMAIN_ENGINE__.lastTest();
      const agent = await window.__AGENT_DOMAIN_ENGINE__.execute(ui.request, 'board.atmega328p-16mhz-v1');
      return { actual, ui: ui.result, agent };
    });
    assert.equal(sharedTest.actual.results.length, 4);
    assert(sharedTest.actual.results.every((result) => result.status === 'passed'));
    assert.equal(sharedTest.ui.caller, 'ui'); assert.equal(sharedTest.agent.caller, 'agent');
    assert.equal(sharedTest.ui.stages.tests, 'evaluateThermostatObservation');
    assert.deepEqual(sharedTest.ui.observation, sharedTest.agent.observation);
    assert.deepEqual(sharedTest.ui.observation, sharedTest.actual.results[3]);
    assert.equal(outside.length, 0, JSON.stringify(outside)); assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.deepEqual(mutations, ['POST /api/build']);
    process.stdout.write(`${JSON.stringify({ status: 'pass', sharedEngine: paths.ui.engine,
      picoUiAgentIdentityMatch: true, picoMutation: false, thermostatActualScenarios: 4,
      thermostatUiAgentResultMatch: true, compilerRequests: 1, outsideRequests: 0, browserErrors: 0 })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
