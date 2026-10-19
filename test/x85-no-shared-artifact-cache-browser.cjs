// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X85_UI_URL || 'http://127.0.0.1:18841';
const evidenceDir = process.env.X85_UI_EVIDENCE || null;
const staleOnly = process.env.X85_STALE_ONLY === '1';

let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  const outside = [];
  const mutations = [];
  const claims = [];
  const terminalByJob = new Map();
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) outside.push(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
  });
  page.on('response', async (response) => {
    try {
      const request = response.request();
      const url = new URL(response.url());
      if (request.method() === 'POST' && url.pathname === '/api/build' && response.status() === 202) {
        claims.push(await response.json());
      } else if (request.method() === 'GET' && /^\/api\/build\/[0-9a-f]{24}$/u.test(url.pathname)
          && response.status() === 200) {
        const body = await response.json();
        if (['succeeded', 'failed', 'cancelled', 'timeout'].includes(body.status)) terminalByJob.set(body.jobId, body);
      }
    } catch (error) { errors.push(error.stack || String(error)); }
  });

  const response = await page.goto(base, { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => window.__M11_READY__ === true);
  await page.click('#project-demo');
  await page.waitForFunction(() => document.querySelector('#example-picker-dialog').open === true);
  await page.click('.starter-card[data-example="avr-thermostat-boundary-v1"]');
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.active === true);

  async function build(number) {
    await page.click('#build');
    await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Building in isolated compiler…');
    await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 45_000 });
    await page.waitForFunction((expected) => window.__M6_STATE__.buildState === 'succeeded'
      && window.__M6_STATE__.cacheHit === false && document.querySelectorAll('#build-log').length === 1
      && expected <= 2, number);
    return page.evaluate(() => ({
      artifactIdentity: window.__M6_STATE__.artifactIdentity,
      inputIdentity: window.__M6_STATE__.inputIdentity,
      cacheHit: window.__M6_STATE__.cacheHit,
      log: document.querySelector('#build-log').textContent,
    }));
  }

  const first = await build(1);
  const second = staleOnly ? null : await build(2);
  await page.waitForFunction(() => window.__M6_STATE__.cacheHit === false);
  await page.waitForTimeout(100);
  assert.equal(claims.length, staleOnly ? 1 : 2);
  assert.equal(terminalByJob.size, staleOnly ? 1 : 2);
  assert.equal(first.cacheHit, false);
  if (!staleOnly) {
    assert.notEqual(claims[0].jobId, claims[1].jobId);
    assert.notEqual(claims[0].capability, claims[1].capability);
    assert.equal(second.cacheHit, false);
    assert.equal(first.inputIdentity, second.inputIdentity);
    assert.equal(first.artifactIdentity, second.artifactIdentity);
  }
  for (const claim of claims) {
    const terminal = terminalByJob.get(claim.jobId);
    assert.equal(terminal?.status, 'succeeded');
    assert.equal(terminal?.cacheHit, false);
    assert.equal(page.url().includes(claim.capability), false);
    assert.equal(`${first.log}\n${second?.log ?? ''}`.includes(claim.capability), false);
  }

  const source = await page.inputValue('#source');
  await page.fill('#source', `${source}\n// X85_STALE_ARTIFACT_CHECK\n`);
  await page.waitForFunction(() => window.__M6_STATE__.buildState === 'dirty'
    && window.__M6_STATE__.artifactIdentity === null && document.querySelector('#run').disabled);
  if (evidenceDir) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.locator('.editor-card').screenshot({ path: path.join(evidenceDir, 'x85-private-two-builds.png') });
  }

  await page.goto(`${base}/support.html#build-privacy-boundary`, { waitUntil: 'domcontentloaded' });
  const privacy = await page.locator('#build-privacy-boundary').textContent();
  assert.match(privacy, /not kept in a shared artifact cache/u);
  assert.match(privacy, /identical later Build compiles again/u);
  assert.match(privacy, /Pinned tool images and curated public examples remain reusable and separate/u);
  if (evidenceDir) {
    await page.locator('#build-privacy-boundary').screenshot({ path: path.join(evidenceDir, 'x85-private-copy.png') });
  }

  assert.deepEqual(errors, []);
  assert.deepEqual(outside, []);
  assert.deepEqual(mutations, staleOnly ? ['POST /api/build'] : ['POST /api/build', 'POST /api/build']);
  assert.equal((await context.cookies()).length, 0);
  console.log(JSON.stringify({ result: 'pass', browser: 'chromium', viewport: '1440x1000',
    mode: staleOnly ? 'stale-recovery' : 'two-identical-builds', builds: staleOnly ? 1 : 2,
    distinctJobs: staleOnly ? null : true, distinctCapabilities: staleOnly ? null : true,
    identicalInputIdentity: staleOnly ? null : true, identicalArtifactIdentity: staleOnly ? null : true,
    cacheHit: staleOnly ? [first.cacheHit] : [first.cacheHit, second.cacheHit],
    sourceEditRetiredArtifact: true, runRequests: 0, outsideRequests: 0, cookies: 0 }));
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); });
