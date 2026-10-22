// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X92_EXHAUSTION_URL || 'http://host.docker.internal:18898/dist/';
const output = process.env.X92_EXHAUSTION_OUTPUT || '/tmp/x92-fixed-default-exhaustion';

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true,
    serviceWorkers: 'block' });
  const page = await context.newPage();
  const producerRequests = []; const mutations = []; const errors = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/\/api\/(build|run|scenario|worker)/u.test(url.pathname)) producerRequests.push(`${request.method()} ${url.pathname}`);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
  });
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await page.route('**/dist/main.js', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const marker = 'var lastBoundedAction=null;';
    assert(source.includes(marker), 'test-only X92 injection marker changed');
    const injection = `
window.__X92_PRIVATE_TEST_HARNESS__ = Object.freeze({
  install: (replacementBudget, replacementExecutor) => {
    x92Budget = replacementBudget;
    x92BudgetExecutor = replacementExecutor;
    x92ImportedReview = null;
    renderX92Budget('Synthetic fixed-default evidence installed. No real producer is connected.', true);
  },
  identity: () => x92CurrentIdentity(),
  render: (result, message, valid = false) => {
    renderBoundedAction(result);
    renderX92Budget(message, valid);
  },
});
`;
    await route.fulfill({ response, body: source.replace(marker, `${injection}\n${marker}`),
      headers: { ...response.headers(), 'content-type': 'text/javascript; charset=utf-8' } });
  });

  try {
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
    try {
      await page.waitForFunction(() => window.__M11_READY__ === true && window.__X92_PRIVATE_TEST_HARNESS__,
        null, { timeout: 10_000 });
    } catch (caught) {
      throw new Error(`X92 page bootstrap failed: ${errors.join(' | ') || caught.message}`);
    }
    await page.click('#brief-tests-open');
    await page.waitForSelector('#workbench-brief-dialog[open]');
    await page.click('#x92-budget-start');
    await page.waitForFunction(() => window.__X92_EXPERIMENT_BUDGET__.active() === true);
    const trustedStart = await page.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.snapshot());

    const report = await page.evaluate(async () => {
      const module = await import('../src/x92-experiment-budget.mjs');
      const assert = Object.assign((condition, message = 'assertion failed') => {
        if (!condition) throw new Error(message);
      }, {
        equal: (actual, expected) => { if (actual !== expected) throw new Error(`${actual} !== ${expected}`); },
        deepEqual: (actual, expected) => {
          if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error(`${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
          }
        },
      });
      const defaults = structuredClone(module.X92_DEFAULT_LIMITS);
      const authorityFalse = (value) => Object.values(value).every((item) => item === false);
      let idSequence = 0;
      const allCalls = [];
      const cases = {};
      const identity = await window.__X92_PRIVATE_TEST_HARNESS__.identity();
      const request = (action, requestId, payload = {}) => ({
        schema: 'intent-mcu-bounded-action-request@1', action, requestId,
        profile: identity.profile, expectedGeneration: identity.projectGeneration,
        issuedAtMs: 1000, expiresAtMs: 31000, payload,
      });
      const runCase = async (name, actions, refused) => {
        let clock = 0; const calls = [];
        const budget = module.createX92ExperimentBudget({
          measurementSource: 'synthetic-test.monotonic-wall-clock',
          randomId: () => `00000000-0000-4000-8000-${String(++idSequence).padStart(12, '0')}`,
        });
        budget.start(identity, { humanInitiated: true });
        const downstream = {
          execute: async (source) => {
            const parsed = JSON.parse(source); calls.push(parsed.requestId); allCalls.push(`${name}:${parsed.requestId}`);
            clock += actions.find((item) => item.request.requestId === parsed.requestId).elapsed;
            return { ok: true, code: parsed.action === 'firmware.build'
              ? 'ACTION_BUILD_SUCCEEDED' : 'ACTION_RUN_EVIDENCE_READY', executed: true };
          },
          cancel: () => ({ ok: false, code: 'ACTION_NOT_ACTIVE' }),
        };
        const executor = module.createX92BudgetedExecutor({ budget, downstream,
          currentIdentity: async () => structuredClone(identity), now: () => clock,
          schedule: () => 1, unschedule: () => {}, parseRequest: (source) => JSON.parse(source),
          measurementSource: 'synthetic-test.monotonic-wall-clock',
          quiesceRuntime: async ({ request: value, dispatchToken, identity: binding, reason }) => ({
            schema: module.X92_RUNTIME_QUIESCENCE_ACK_SCHEMA, requestId: value.requestId,
            dispatchToken, profile: value.profile, identity: structuredClone(binding),
            producerState: 'paused', acknowledged: true,
            evidence: { reason, synthetic: true, clockMs: clock },
          }),
        });
        for (const action of actions) {
          const result = await executor.execute(JSON.stringify(action.request));
          if (!result.ok) throw new Error(`${name}:${action.request.requestId}:${result.code}`);
        }
        const before = calls.length;
        const unresolved = ['Inspect exhausted dimension', 'Revise the experiment plan', 'Start no hidden retry'];
        const result = await executor.execute(JSON.stringify(refused), { unresolvedProblems: unresolved });
        const after = calls.length;
        const replay = await executor.execute(JSON.stringify(refused), { unresolvedProblems: unresolved });
        const afterReplay = calls.length;
        assert.equal(result.code, 'budget_exhausted'); assert.equal(result.executed, false);
        assert.deepEqual(result.unresolvedProblems, unresolved); assert(authorityFalse(result.authority));
        assert.equal(after, before); assert.equal(afterReplay, before); assert.equal(replay.code, 'budget_exhausted');
        const terminalBefore = structuredClone(budget.snapshot());
        for (const row of terminalBefore.terminal) {
          const duplicate = budget.finalize({ sessionId: budget.sessionId(), reservationId: row.reservationId,
            requestId: row.requestId }, { kind: 'success', authenticated: true, measuredWallClockMs: 1,
            measurementSource: 'synthetic-test.monotonic-wall-clock' });
          assert.equal(duplicate.code, 'X92_TERMINAL_DUPLICATE');
        }
        assert.deepEqual(budget.snapshot().consumed, terminalBefore.consumed);
        cases[name] = { result, replay, calls: [...calls], review: budget.snapshot() };
        return { budget, executor };
      };

      const buildActions = [1, 2].map((number) => ({ elapsed: 100,
        request: request('firmware.build', `x92-synth-build-${number}`) }));
      await runCase('builds', buildActions, request('firmware.build', 'x92-synth-build-refused'));

      const scenarioActions = [1, 2].map((number) => ({ elapsed: 100,
        request: request('runtime.run', `x92-synth-scenario-${number}`,
          { experimentId: 'avr-thermostat-boundary-v1' }) }));
      await runCase('scenarios', scenarioActions, request('runtime.run', 'x92-synth-scenario-refused',
        { experimentId: 'avr-thermostat-boundary-v1' }));

      const runActions = [1, 2, 3, 4].map((number) => ({ elapsed: 100,
        request: request('runtime.run', `x92-synth-run-${number}`) }));
      await runCase('runs', runActions, request('runtime.run', 'x92-synth-run-refused'));

      const wallActions = [
        { elapsed: 30000, request: request('firmware.build', 'x92-synth-wall-build-1') },
        { elapsed: 30000, request: request('firmware.build', 'x92-synth-wall-build-2') },
        { elapsed: 30000, request: request('runtime.run', 'x92-synth-wall-run-1') },
        { elapsed: 30000, request: request('runtime.run', 'x92-synth-wall-run-2') },
      ];
      const wall = await runCase('wallClockMs', wallActions, request('runtime.run', 'x92-synth-wall-refused'));

      assert.deepEqual(cases.builds.result.exhaustedDimensions, ['builds']);
      assert.deepEqual(cases.scenarios.result.exhaustedDimensions, ['scenarios']);
      assert.deepEqual(cases.runs.result.exhaustedDimensions, ['runs']);
      assert.deepEqual(cases.wallClockMs.result.exhaustedDimensions, ['wallClockMs']);
      for (const item of Object.values(cases)) assert.deepEqual(item.review.limits, defaults);

      window.__X92_PRIVATE_TEST_HARNESS__.install(wall.budget, wall.executor);
      window.__X92_PRIVATE_TEST_HARNESS__.render(cases.wallClockMs.result,
        'Synthetic test evidence: wall-clock budget exhausted; no real Build, Run, scenario or worker was contacted.', false);
      return { defaults, identity, allCalls, cases: Object.fromEntries(Object.entries(cases).map(([key, item]) =>
        [key, { exhaustedDimensions: item.result.exhaustedDimensions, unresolvedProblems: item.result.unresolvedProblems,
          calls: item.calls, review: item.review }])) };
    });

    assert.deepEqual(report.defaults, { builds: 2, runs: 4, scenarios: 8, wallClockMs: 120000 });
    assert.equal(report.allCalls.length, 12);
    assert.equal(producerRequests.length, 0); assert.equal(mutations.length, 0);
    assert.match(await page.locator('#x92-budget-status').textContent(), /Synthetic test evidence/iu);
    assert.deepEqual(await page.locator('#x92-budget-unresolved li').allTextContents(),
      ['Inspect exhausted dimension', 'Revise the experiment plan', 'Start no hidden retry']);
    assert.deepEqual(await page.locator('[data-dimension="wallClockMs"] [data-kind]').allTextContents(),
      ['Finalized: 120000 ms', 'Reserved: 0 ms', 'Remaining: 0 ms', 'Limit: 120000 ms']);

    const desktop = path.join(output, 'x92-fixed-default-exhaustion-1440x1000.png');
    await page.locator('.x92-budget').screenshot({ path: desktop });
    assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
    await page.setViewportSize({ width: 768, height: 900 });
    await page.locator('.x92-budget').scrollIntoViewIfNeeded();
    assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
    const narrow = path.join(output, 'x92-fixed-default-exhaustion-768x900.png');
    await page.locator('.x92-budget').screenshot({ path: narrow });

    const reviewText = await page.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.reviewText());
    const reviewPath = path.join(output, 'x92-fixed-default-review.json'); fs.writeFileSync(reviewPath, reviewText);
    const beforeImport = await page.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.snapshot());
    await page.setInputFiles('#x92-budget-open-input', reviewPath);
    await page.waitForFunction(() => /Inert review opened/u.test(document.querySelector('#x92-budget-imported').textContent));
    assert.deepEqual(await page.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.snapshot()), beforeImport);

    await page.evaluate(() => {
      const source = document.querySelector('#source'); source.value += '\n';
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction((before) => window.__X92_EXPERIMENT_BUDGET__.snapshot().identity.sourceIdentity !== before,
      beforeImport.identity.sourceIdentity);
    const rebound = await page.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.snapshot());
    assert.deepEqual(rebound.consumed, beforeImport.consumed);
    assert.deepEqual(rebound.limits, beforeImport.limits);

    const oldSession = rebound.sessionId;
    if (!(await page.locator('#workbench-brief-dialog').getAttribute('open'))) {
      await page.click('#brief-tests-open');
      await page.waitForSelector('#workbench-brief-dialog[open]');
    }
    await page.click('#x92-budget-start');
    await page.waitForFunction((prior) => window.__X92_EXPERIMENT_BUDGET__.snapshot().sessionId !== prior, oldSession);
    const newSession = await page.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.snapshot());
    assert.deepEqual(newSession.limits, report.defaults);
    assert.deepEqual(newSession.consumed, { builds: 0, runs: 0, scenarios: 0, wallClockMs: 0 });
    assert.notEqual(newSession.sessionId, trustedStart.sessionId);
    assert.deepEqual(errors, []); assert.equal(producerRequests.length, 0); assert.equal(mutations.length, 0);

    const result = { result: 'pass', defaults: report.defaults, independentDimensions: {
      builds: report.cases.builds.exhaustedDimensions,
      scenarios: report.cases.scenarios.exhaustedDimensions,
      runs: report.cases.runs.exhaustedDimensions,
      wallClockMs: report.cases.wallClockMs.exhaustedDimensions,
    }, syntheticAdapterCalls: report.allCalls, realProducerRequests: producerRequests,
    mutatingRequests: mutations, importedAuthorityRestored: false, identityReplenished: false,
    newSessionFixedDefaults: true, screenshots: [desktop, narrow] };
    fs.writeFileSync(path.join(output, 'x92-fixed-default-exhaustion.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
