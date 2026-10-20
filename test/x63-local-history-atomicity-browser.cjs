// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.X63_URL || 'http://127.0.0.1:18857';

async function rows(page) {
  return page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list());
}

async function exactState(page) {
  return page.evaluate(async () => ({
    ids: (await window.__LOCAL_VERSION_HISTORY__.list()).map((record) => record.id),
    settings: window.__LOCAL_VERSION_HISTORY__.settings(),
  }));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = []; const mutations = []; const jobs = []; const outside = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) outside.push(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
    if (/^\/api\//u.test(url.pathname)) jobs.push(`${request.method()} ${url.pathname}`);
  });
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true && window.__LOCAL_VERSION_HISTORY__);
    const workersBefore = await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations);
    await page.locator('#local-history > summary').click();
    await page.click('#local-history-enable');
    await page.waitForFunction(() => window.__LOCAL_VERSION_HISTORY__.enabled());
    await page.selectOption('#local-history-retention', '10');
    await page.waitForFunction(() => window.__LOCAL_VERSION_HISTORY__.settings().retentionCount === 10);

    for (let index = 0; index < 10; index += 1) {
      await page.fill('#project-name', `Atomic version ${index}`);
      await page.locator('#project-name').press('Tab');
      await page.click('#local-history-save');
      await page.waitForFunction((count) => window.__LOCAL_VERSION_HISTORY__.list()
        .then((records) => records.length === count), index + 1);
    }
    const fullState = await exactState(page);
    assert.equal(fullState.ids.length, 10);

    await page.fill('#project-name', 'Atomic replacement must roll back');
    await page.locator('#project-name').press('Tab');
    await page.click('#local-history-save');
    await page.waitForSelector('#local-history-confirm[open]');
    await page.evaluate(() => {
      window.__x63AtomicOriginalAdd = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function failConfirmedReplacementAdd() {
        throw new DOMException('synthetic full replacement add failure', 'QuotaExceededError');
      };
    });
    await page.click('#local-history-confirm-accept');
    await page.waitForFunction(() => /QuotaExceededError/u.test(
      document.querySelector('#local-history-confirm-status').textContent));
    await page.evaluate(() => { IDBObjectStore.prototype.add = window.__x63AtomicOriginalAdd; });
    assert.deepEqual(await exactState(page), fullState,
      'confirmed replacement add failure committed the queued oldest deletion');
    await page.click('#local-history-confirm-cancel');

    await page.selectOption('#local-history-retention', '3');
    await page.waitForSelector('#local-history-confirm[open]');
    await page.evaluate(() => {
      window.__x63AtomicOriginalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function failRetentionSettingsPut() {
        if (this.name === 'settings') {
          throw new DOMException('synthetic retention settings failure', 'QuotaExceededError');
        }
        return window.__x63AtomicOriginalPut.apply(this, arguments);
      };
    });
    await page.click('#local-history-confirm-accept');
    await page.waitForFunction(() => /QuotaExceededError/u.test(
      document.querySelector('#local-history-confirm-status').textContent));
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.__x63AtomicOriginalPut; });
    assert.deepEqual(await exactState(page), fullState,
      'retention settings failure committed queued record deletions or changed settings');
    await page.click('#local-history-confirm-cancel');

    assert.equal((await rows(page)).length, 10);
    assert.deepEqual(errors, [], `unhandled browser errors: ${JSON.stringify(errors)}`);
    assert.deepEqual(outside, []);
    assert.deepEqual(mutations, []);
    assert.deepEqual(jobs, []);
    assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), workersBefore);
    process.stdout.write(`${JSON.stringify({ status: 'pass', browser: 'chromium',
      fullReplacementRollback: true, retentionRollback: true, exactRows: 10,
      unhandledErrors: 0, serverWrites: 0, producerCalls: 0 })}\n`);
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
