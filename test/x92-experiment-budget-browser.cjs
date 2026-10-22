// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X92_URL || 'http://host.docker.internal:18892/staging/';
const outputDir = process.env.X92_OUTPUT || '/tmp/x92-private-evidence';

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  const producerRequests = []; const mutatingRequests = [];
  page.on('request', (request) => {
    const item = { method: request.method(), url: request.url() };
    if (/\/api\/(build|run|scenario|worker)/u.test(new URL(request.url()).pathname)) producerRequests.push(item);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutatingRequests.push(item);
  });
  try {
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true && window.__X92_EXPERIMENT_BUDGET__);
    await page.click('#brief-tests-open');
    await page.waitForSelector('#workbench-brief-dialog[open]');
    assert.equal(await page.locator('.x92-budget').isVisible(), true);

    await page.evaluate(() => document.querySelector('#x92-budget-start').click());
    assert.equal(await page.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.active()), false,
      'programmatic click must not start a session');
    assert.match(await page.locator('#x92-budget-status').textContent(), /trusted human UI action/iu);

    await page.click('#x92-budget-start');
    await page.waitForFunction(() => window.__X92_EXPERIMENT_BUDGET__.active() === true);
    const started = await page.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.snapshot());
    assert.deepEqual(started.limits, { builds: 2, runs: 4, scenarios: 8, wallClockMs: 120000 });
    assert.deepEqual(started.consumed, { builds: 0, runs: 0, scenarios: 0, wallClockMs: 0 });
    assert.equal(started.authority.build, false); assert.equal(started.authority.run, false);
    const visibleAccounting = await page.evaluate(() => ({
      builds: Object.fromEntries([...document.querySelectorAll('[data-dimension="builds"] [data-kind]')]
        .map((node) => [node.dataset.kind, node.textContent])),
      wall: Object.fromEntries([...document.querySelectorAll('[data-dimension="wallClockMs"] [data-kind]')]
        .map((node) => [node.dataset.kind, node.textContent])),
      pending: document.querySelector('#x92-budget-accounting').dataset.pending,
      indeterminate: document.querySelector('#x92-budget-accounting').dataset.indeterminate,
      runtimeBoundary: document.querySelector('#x92-budget-accounting').dataset.runtimeBoundary,
    }));
    assert.deepEqual(visibleAccounting.builds, { consumed: 'Finalized: 0', reserved: 'Reserved: 0',
      remaining: 'Remaining: 2', limit: 'Limit: 2' });
    assert.deepEqual(visibleAccounting.wall, { consumed: 'Finalized: 0 ms', reserved: 'Reserved: 0 ms',
      remaining: 'Remaining: 120000 ms', limit: 'Limit: 120000 ms' });
    assert.deepEqual([visibleAccounting.pending, visibleAccounting.indeterminate,
      visibleAccounting.runtimeBoundary], ['0', '0', 'idle']);
    assert.deepEqual(await page.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.runtimeBoundary()), {
      status: 'idle', requestId: null, reason: null, code: 'X92_RUNTIME_QUIESCENT',
    });

    const downloadPromise = page.waitForEvent('download');
    await page.click('#x92-budget-download');
    const download = await downloadPromise; const downloadedPath = await download.path();
    const reviewText = fs.readFileSync(downloadedPath, 'utf8'); const review = JSON.parse(reviewText);
    assert.equal(review.schema, 'intent-mcu-experiment-budget-review@1');
    assert.equal(review.restores.activeSession, false); assert.equal(review.authority.retry, false);

    const beforeImport = await page.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.snapshot());
    const validPath = path.join(outputDir, 'x92-inert-review.json'); fs.writeFileSync(validPath, reviewText);
    await page.setInputFiles('#x92-budget-open-input', validPath);
    await page.waitForFunction(() => /Inert review opened/u.test(document.querySelector('#x92-budget-imported').textContent));
    assert.deepEqual(await page.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.snapshot()), beforeImport,
      'opening a review must not restore or mutate authority');

    const tampered = structuredClone(review); tampered.limits.builds = 99;
    const tamperedPath = path.join(outputDir, 'x92-tampered-review.json');
    fs.writeFileSync(tamperedPath, `${JSON.stringify(tampered)}\n`);
    await page.setInputFiles('#x92-budget-open-input', tamperedPath);
    await page.waitForFunction(() => /Review rejected/u.test(document.querySelector('#x92-budget-imported').textContent));
    assert.deepEqual(await page.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.snapshot()), beforeImport);

    const sourceBefore = started.identity.sourceIdentity;
    await page.evaluate(() => {
      const source = document.querySelector('#source'); source.value = `${source.value}\n`;
      source.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction((prior) => window.__X92_EXPERIMENT_BUDGET__.snapshot().identity.sourceIdentity !== prior, sourceBefore);
    const rebound = await page.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.snapshot());
    assert.deepEqual(rebound.consumed, started.consumed, 'identity rebind must not replenish consumption');
    assert.match(rebound.unresolvedProblems.at(-1), /Identity changed/iu);

    await page.selectOption('#board-select', 'board.rp2040-pico-v1');
    await page.waitForFunction(() => window.__X92_EXPERIMENT_BUDGET__.snapshot().identity.profile === 'board.rp2040-pico-v1');
    assert.deepEqual((await page.evaluate(() => window.__X92_EXPERIMENT_BUDGET__.snapshot())).consumed, started.consumed);

    if (!(await page.locator('#workbench-brief-dialog').getAttribute('open'))) {
      await page.click('#brief-tests-open'); await page.waitForSelector('#workbench-brief-dialog[open]');
    }
    await page.locator('.x92-budget').scrollIntoViewIfNeeded();
    const screenshot = path.join(outputDir, 'x92-private-budget-desktop.png');
    await page.locator('.x92-budget').screenshot({ path: screenshot });
    assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
    await page.focus('#x92-budget-start'); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'x92-budget-download');
    await page.setViewportSize({ width: 768, height: 900 });
    await page.locator('.x92-budget').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('.x92-budget').isVisible(), true);
    const narrowOverflow = await page.evaluate(() => ({
      delta: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      offenders: [...document.querySelectorAll('*')].filter((node) => node.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 8).map((node) => ({ id: node.id, className: String(node.className), right: node.getBoundingClientRect().right })),
    }));
    assert(narrowOverflow.delta <= 1, JSON.stringify(narrowOverflow));
    const narrowScreenshot = path.join(outputDir, 'x92-private-budget-narrow.png');
    await page.locator('.x92-budget').screenshot({ path: narrowScreenshot });
    assert.equal(producerRequests.length, 0); assert.equal(mutatingRequests.length, 0);
    fs.writeFileSync(path.join(outputDir, 'x92-browser.json'), `${JSON.stringify({
      result: 'pass', producerRequests, mutatingRequests, started: started.sessionId,
      importedAuthorityRestored: false, sourceRebound: true, profileRebound: true,
      accountingVisible: true, screenshots: [screenshot, narrowScreenshot],
    }, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ result: 'pass', producerActivity: [0, 0, 0, 0],
      screenshots: [screenshot, narrowScreenshot] })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
