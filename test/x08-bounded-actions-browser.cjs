// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X08_URL || 'http://127.0.0.1:18766';
const screenshot = process.env.X08_SCREENSHOT || null;

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const outside = []; const errors = []; const mutations = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== new URL(base).origin) outside.push(request.url());
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true && Boolean(window.__AGENT_ACTIONS__));

    const result = await page.evaluate(async () => {
      let sequence = 0;
      const call = async (action, payload = {}) => {
        sequence += 1;
        const source = window.__AGENT_ACTIONS__.request(action, payload, {
          ttlMs: 30_000, requestId: `x08-browser-${String(sequence).padStart(2, '0')}-request`,
        });
        return window.__AGENT_ACTIONS__.execute(source);
      };
      const initial = window.__AGENT_ACTIONS__.context();
      const created = await call('project.create', { starterId: 'avr-thermostat-boundary-v1' });
      const proposed = await call('patch.propose', { description: 'Change the thermostat status message while preserving every requirement.' });
      const validated = await call('project.validate');
      const built = await call('firmware.build');
      const ran = await call('runtime.run');
      const read = await call('result.read');
      const exported = await call('project.export');
      return {
        initial, created, proposed, validated, built, ran, read, exported,
        state: window.__AGENT_ACTIONS__.state(),
        contracts: window.__AGENT_ACTIONS__.actions,
        externalEndpoint: window.__AGENT_ACTIONS__.externalEndpoint,
        currentProject: window.__COMMON_PROJECT_FILES__.current('board.atmega328p-16mhz-v1'),
      };
    });

    assert.equal(result.contracts.length, 7);
    assert.equal(new Set(result.contracts).size, 7);
    assert.equal(result.externalEndpoint, false);
    for (const key of ['created', 'proposed', 'validated', 'built', 'ran', 'read', 'exported']) {
      assert.equal(result[key].ok, true, `${key}: ${JSON.stringify(result[key])}`);
      assert.equal(result[key].executed, true, key);
    }
    assert.equal(result.created.authority.mutation, true);
    assert.equal(result.proposed.authority.build, false);
    assert.equal(result.validated.result.engine, 'intent-mcu-shared-domain-engine@1');
    assert.equal(result.built.authority.build, true);
    assert.equal(result.ran.authority.run, true);
    assert.equal(result.read.result.artifactIdentity, result.built.result.artifactIdentity);
    assert(result.read.result.cycle > 0);
    assert.equal(result.read.result.verdict, null);
    assert.equal(result.exported.authority.export, true);
    assert.equal(result.exported.result.projectText, result.currentProject);
    assert.equal(result.exported.result.browserWriteClaimed, false);
    assert.equal(result.state.action, 'project.export');
    assert.equal(await page.locator('.bounded-actions-list li').count(), 7);
    assert.equal(await page.locator('#bounded-actions-status').getAttribute('data-valid'), 'true');
    assert.deepEqual(mutations, ['POST /api/build']);
    assert.equal(outside.length, 0, JSON.stringify(outside));
    assert.equal(errors.length, 0, JSON.stringify(errors));
    if (screenshot) {
      await page.locator('.bounded-actions').scrollIntoViewIfNeeded();
      await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
    }
    process.stdout.write(`${JSON.stringify({ status: 'pass', contracts: result.contracts,
      actualCompilerRequests: 1, runtimeCycle: result.read.result.cycle,
      artifactIdentity: result.built.result.artifactIdentity,
      exportSha256: result.exported.result.projectSha256,
      outsideRequests: outside.length, browserErrors: errors.length })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
