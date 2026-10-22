// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.X69_X74_RACE_URL || 'http://127.0.0.1:18970';
const correctPath = path.join(__dirname, 'fixtures/x69-correct.intent-mcu-experiment.json');
const knownBadPath = path.join(__dirname, 'fixtures/x69-known-bad.intent-mcu-experiment.json');
const screenshotDir = process.env.X69_X74_RACE_SCREENSHOT_DIR || null;
const sha256 = (source) => crypto.createHash('sha256').update(source).digest('hex');

function responseFor(parentSource, note) {
  const value = JSON.parse(parentSource);
  return `${JSON.stringify({
    schema: 'intent-mcu-recipient-response@1',
    parent: {
      packageSha256: sha256(parentSource),
      profile: value.profile,
      experimentId: value.experimentId,
      projectSha256: value.bindings.projectSha256,
      reportSha256: value.bindings.reportSha256,
      manifestSha256: value.bindings.manifestSha256,
    },
    review: { disposition: 'reviewed', note },
    authority: { apply: false, build: false, run: false, runtime: false, verdict: false },
    limitations: [
      'Local data-only review artifact. It cannot apply changes, execute code, restore a runtime or establish a verdict.',
      'The parent digest binds exact package bytes but does not establish sender identity or the truth of either file.',
    ],
  }, null, 2)}\n`;
}

async function invariant(page) {
  return page.evaluate(async () => ({
    project: window.__COMMON_PROJECT_FILES__.current(),
    native: window.__NATIVE_PROJECT_FILES__.status(),
    history: await window.__LOCAL_VERSION_HISTORY__.list(),
    workers: window.__M6_STATE__.runtimeWorkerCreations,
    budget: window.__X92_EXPERIMENT_BUDGET__.snapshot(),
    buildState: window.__M6_STATE__.buildState,
    runtime: window.__M6_STATE__.runtime,
  }));
}

async function installDeferredReads(page) {
  await page.evaluate(() => {
    const original = File.prototype.text;
    const releases = new Map();
    File.prototype.text = function deferredText() {
      if (!this.name.startsWith('slow-')) return original.call(this);
      return new Promise((resolve, reject) => {
        releases.set(this.name, () => original.call(this).then(resolve, reject));
      });
    };
    window.__RACE_READ_RELEASE__ = (name) => {
      const release = releases.get(name);
      if (!release) return false;
      releases.delete(name); release(); return true;
    };
  });
}

async function installDeferredHash(page) {
  await page.evaluate(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    let armed = false; let held = false; let release = null;
    crypto.subtle.digest = function deferredDigest(...args) {
      if (!armed || held) return original(...args);
      armed = false; held = true;
      return new Promise((resolve, reject) => {
        release = () => { held = false; release = null; original(...args).then(resolve, reject); };
      });
    };
    window.__RACE_HASH_ARM__ = () => { armed = true; };
    window.__RACE_HASH_HELD__ = () => held;
    window.__RACE_HASH_RELEASE__ = () => { if (!release) return false; release(); return true; };
  });
}

async function waitRelease(page, name) {
  await page.waitForFunction((key) => window.__RACE_READ_RELEASE__(key), name);
}

let browser;
(async () => {
  const correct = fs.readFileSync(correctPath, 'utf8');
  const knownBad = fs.readFileSync(knownBadPath, 'utf8');
  const correctDigest = sha256(correct);
  const badDigest = sha256(knownBad);
  const responseA = responseFor(correct, 'Slower response A must never replace the newer response.');
  const responseB = responseFor(correct, 'Newer response B remains the accepted relationship.');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = []; const outside = []; const mutations = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) outside.push(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true
    && window.__X69_GUIDED_REPLAY__ && window.__X74_RECIPIENT_EXCHANGE__);
  const before = await invariant(page);
  await installDeferredReads(page);
  await installDeferredHash(page);

  // Baseline parent, then A-slow/B-fast: the late read must not replace B.
  await page.setInputFiles('#guided-replay-input', correctPath);
  await page.waitForFunction((digest) => window.__X74_RECIPIENT_EXCHANGE__.state()
    .parentPackageSha256 === digest, correctDigest);
  await page.setInputFiles('#guided-replay-input', {
    name: 'slow-parent-a.json', mimeType: 'application/json', buffer: Buffer.from(knownBad),
  });
  await page.setInputFiles('#guided-replay-input', {
    name: 'fast-parent-b.json', mimeType: 'application/json', buffer: Buffer.from(correct),
  });
  await page.waitForFunction((digest) => window.__X74_RECIPIENT_EXCHANGE__.state()
    .parentPackageSha256 === digest, correctDigest);
  await waitRelease(page, 'slow-parent-a.json');
  await page.waitForTimeout(50);
  assert.equal((await page.evaluate(() => window.__X74_RECIPIENT_EXCHANGE__.state()
    .parentPackageSha256)), correctDigest);

  // Escape while parsing/hash work is pending also invalidates the operation.
  await page.evaluate(() => window.__RACE_HASH_ARM__());
  const pendingReplayParse = page.evaluate((source) => window.__X69_GUIDED_REPLAY__
    .openText(source, 'hash-delayed-parent.json'), knownBad);
  await page.waitForFunction(() => window.__RACE_HASH_HELD__());
  await page.locator('#guided-replay-close').focus();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__RACE_HASH_RELEASE__());
  assert.equal((await pendingReplayParse).code, 'GUIDED_REPLAY_STALE_OPEN');
  assert.equal((await page.evaluate(() => window.__X74_RECIPIENT_EXCHANGE__.state()
    .parentPackageSha256)), correctDigest);
  await page.evaluate((source) => window.__X69_GUIDED_REPLAY__.openText(source, 'reopened-parent.json'), correct);

  // A later invalid selection invalidates an earlier pending read without replacing accepted state.
  await page.setInputFiles('#guided-replay-input', {
    name: 'slow-before-invalid.json', mimeType: 'application/json', buffer: Buffer.from(knownBad),
  });
  await page.setInputFiles('#guided-replay-input', {
    name: 'oversized.json', mimeType: 'application/json', buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
  });
  await page.waitForFunction(() => document.querySelector('#guided-replay-status').textContent.includes('INPUT_LIMIT'));
  await waitRelease(page, 'slow-before-invalid.json');
  await page.waitForTimeout(50);
  assert.equal((await page.evaluate(() => window.__X74_RECIPIENT_EXCHANGE__.state()
    .parentPackageSha256)), correctDigest);
  assert.match(await page.locator('#guided-replay-status').textContent(), /INPUT_LIMIT/u);

  // Close during a pending read invalidates it and cannot reopen the dialog.
  await page.setInputFiles('#guided-replay-input', {
    name: 'slow-before-escape.json', mimeType: 'application/json', buffer: Buffer.from(knownBad),
  });
  await page.click('#guided-replay-close');
  await waitRelease(page, 'slow-before-escape.json');
  await page.waitForTimeout(50);
  assert.equal(await page.locator('#guided-replay-dialog').evaluate((node) => node.open), false);
  assert.equal((await page.evaluate(() => window.__X74_RECIPIENT_EXCHANGE__.state()
    .parentPackageSha256)), correctDigest);

  // Reopen parent. Reversed response reads are latest-wins and cannot corrupt prior state.
  await page.evaluate((source) => window.__X69_GUIDED_REPLAY__.openText(source, 'parent.json'), correct);
  await page.setInputFiles('#recipient-response-input', {
    name: 'slow-response-a.json', mimeType: 'application/json', buffer: Buffer.from(responseA),
  });
  await page.setInputFiles('#recipient-response-input', {
    name: 'fast-response-b.json', mimeType: 'application/json', buffer: Buffer.from(responseB),
  });
  await page.waitForFunction((digest) => window.__X74_RECIPIENT_EXCHANGE__.state()
    .acceptedResponse?.sha256 === digest, sha256(responseB));
  await waitRelease(page, 'slow-response-a.json');
  await page.waitForTimeout(50);
  assert.equal((await page.evaluate(() => window.__X74_RECIPIENT_EXCHANGE__.state()
    .acceptedResponse.sha256)), sha256(responseB));

  // An invalid newer response and Escape each invalidate older pending response reads.
  await page.setInputFiles('#recipient-response-input', {
    name: 'slow-response-before-invalid.json', mimeType: 'application/json', buffer: Buffer.from(responseA),
  });
  await page.setInputFiles('#recipient-response-input', {
    name: 'oversized-response.json', mimeType: 'application/json', buffer: Buffer.alloc(64 * 1024 + 1),
  });
  await page.waitForFunction(() => document.querySelector('#recipient-response-status')
    .textContent.includes('RECIPIENT_RESPONSE_LIMIT'));
  await waitRelease(page, 'slow-response-before-invalid.json');
  await page.waitForTimeout(50);
  assert.equal((await page.evaluate(() => window.__X74_RECIPIENT_EXCHANGE__.state()
    .acceptedResponse.sha256)), sha256(responseB));
  await page.setInputFiles('#recipient-response-input', {
    name: 'slow-response-before-close.json', mimeType: 'application/json', buffer: Buffer.from(responseA),
  });
  await page.click('#guided-replay-close');
  await waitRelease(page, 'slow-response-before-close.json');
  await page.waitForTimeout(50);
  assert.equal((await page.evaluate(() => window.__X74_RECIPIENT_EXCHANGE__.state()
    .acceptedResponse.sha256)), sha256(responseB));

  // Response A parsing against parent A cannot install after parent B is accepted.
  await page.evaluate((source) => window.__X69_GUIDED_REPLAY__.openText(source, 'parent-a.json'), correct);
  await page.evaluate(() => window.__RACE_HASH_ARM__());
  const pendingResponse = page.evaluate((source) => window.__X74_RECIPIENT_EXCHANGE__
    .openResponseText(source, 'response-a.json'), responseA);
  await page.waitForFunction(() => window.__RACE_HASH_HELD__());
  await page.evaluate((source) => window.__X69_GUIDED_REPLAY__.openText(source, 'parent-b.json'), knownBad);
  await page.evaluate(() => window.__RACE_HASH_RELEASE__());
  assert.equal((await pendingResponse).code, 'RECIPIENT_RESPONSE_STALE_OPEN');
  const state = await page.evaluate(() => window.__X74_RECIPIENT_EXCHANGE__.state());
  assert.equal(state.parentPackageSha256, badDigest);
  assert.equal(state.acceptedResponse, null);
  assert.deepEqual(await invariant(page), before);

  assert.match(await page.locator('#guided-replay-inputs').textContent(), /scheduled at/u);
  assert.match(await page.locator('#guided-replay-dialog').textContent(), /Authored input schedule/u);
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.locator('#guided-replay-dialog').screenshot({
      path: path.join(screenshotDir, 'x69-x74-race-safe-recipient.png'), animations: 'disabled',
    });
  }
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(outside.length, 0, JSON.stringify(outside));
  assert.equal(mutations.length, 0, JSON.stringify(mutations));
  assert.equal((await context.cookies()).length, 0);
  process.stdout.write(`${JSON.stringify({ status: 'pass', replayLatestWins: true,
    invalidSelectionInvalidates: true, closeInvalidates: true, responseLatestWins: true,
    parentChangeInvalidates: true, invariantPreserved: true, producerCalls: 0,
    externalRequests: 0, mutationRequests: 0, screenshotDir })}\n`);
  await context.close();
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); });
