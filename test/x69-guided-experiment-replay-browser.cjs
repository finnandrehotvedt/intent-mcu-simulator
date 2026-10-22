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

const base = process.env.X69_URL || 'http://127.0.0.1:18859';
const correctPath = process.env.X69_CORRECT_PACKAGE
  || path.join(__dirname, 'fixtures/x69-correct.intent-mcu-experiment.json');
const knownBadPath = process.env.X69_KNOWN_BAD_PACKAGE
  || path.join(__dirname, 'fixtures/x69-known-bad.intent-mcu-experiment.json');
const screenshotDir = process.env.X69_SCREENSHOT_DIR || null;
const sha256 = (source) => crypto.createHash('sha256').update(source).digest('hex');

async function snapshot(page) {
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

async function recipientJourney(browser, filePath, viewport, expected) {
  const context = await browser.newContext({ viewport });
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
  await page.waitForFunction(() => window.__M11_READY__ === true && window.__X69_GUIDED_REPLAY__);
  const before = await snapshot(page);
  await page.setInputFiles('#guided-replay-input', filePath);
  await page.waitForFunction(() => window.__X69_GUIDED_REPLAY__.state()?.replay?.steps?.length === 4);
  const state = await page.evaluate(() => window.__X69_GUIDED_REPLAY__.state());
  assert.equal(state.replay.packageSha256, expected.sha256);
  assert.equal(state.replay.recordedAggregate.academicStatus, expected.aggregate);
  assert.equal(state.dialogOpen, true);
  assert.match(await page.locator('#guided-replay-identities').textContent(), /Capture timeUnavailable — not recorded/u);
  assert.match(await page.locator('#guided-replay-identities').textContent(), /Virtual milliseconds/u);

  for (let index = 0; index < 4; index += 1) {
    await page.selectOption('#guided-replay-select', String(index));
    assert.equal((await page.evaluate(() => window.__X69_GUIDED_REPLAY__.state().index)), index);
  }
  await page.selectOption('#guided-replay-select', '1');
  assert.match(await page.locator('#guided-replay-scenario-id').textContent(), /THERM-SCENARIO-EQUALITY-ENABLED/u);
  assert.match(await page.locator('#guided-replay-inputs').textContent(), /31 °C at 0 virtual ms/u);
  assert.match(await page.locator('#guided-replay-observation').textContent(), expected.observation);
  assert.match(await page.locator('#guided-replay-explanation').textContent(), expected.explanation);
  await page.locator('#guided-replay-previous').focus();
  await page.keyboard.press('Enter');
  assert.equal((await page.evaluate(() => window.__X69_GUIDED_REPLAY__.state().index)), 0);
  assert.match(await page.locator('#guided-replay-position').textContent(), /Beginning/u);
  for (let index = 1; index < 4; index += 1) await page.locator('#guided-replay-next').click();
  assert.match(await page.locator('#guided-replay-position').textContent(), /End/u);
  assert.equal(await page.locator('#guided-replay-next').isDisabled(), true);

  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.locator('#guided-replay-dialog').screenshot({
      path: path.join(screenshotDir, `${expected.name}.png`), animations: 'disabled',
    });
  }
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#guided-replay-dialog').open);
  const after = await snapshot(page);
  assert.deepEqual(after, before);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth
    - document.documentElement.clientWidth);
  assert(overflow <= 1, `horizontal overflow ${overflow}`);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(outside.length, 0, JSON.stringify(outside));
  assert.equal(mutations.length, 0, JSON.stringify(mutations));
  assert.equal((await context.cookies()).length, 0);
  await context.close();
  return { overflow, requests: outside.length, mutations: mutations.length };
}

let browser;
(async () => {
  const correct = fs.readFileSync(correctPath, 'utf8');
  const knownBad = fs.readFileSync(knownBadPath, 'utf8');
  browser = await chromium.launch({ headless: true });
  const first = await recipientJourney(browser, correctPath, { width: 1366, height: 768 }, {
    name: 'x69-correct', sha256: sha256(correct), aggregate: 'passed',
    observation: /ExpectedD13 LOW.*ObservedD13 LOW/su,
    explanation: /Recorded D13 LOW matched expected LOW/u,
  });
  const second = await recipientJourney(browser, knownBadPath, { width: 1440, height: 900 }, {
    name: 'x69-known-bad', sha256: sha256(knownBad), aggregate: 'failed',
    observation: /ExpectedD13 LOW.*ObservedD13 HIGH/su,
    explanation: /EXPECTED_PIN_LEVEL_MISMATCH/u,
  });
  process.stdout.write(`${JSON.stringify({ status: 'pass', contexts: 2,
    correctSha256: sha256(correct), knownBadSha256: sha256(knownBad),
    scenariosTraversed: 8, producerCalls: 0, externalRequests: first.requests + second.requests,
    mutationRequests: first.mutations + second.mutations,
    maxHorizontalOverflow: Math.max(first.overflow, second.overflow), screenshots: screenshotDir })}\n`);
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); });
