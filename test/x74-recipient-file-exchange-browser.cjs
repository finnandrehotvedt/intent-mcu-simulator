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

const base = process.env.X74_URL || 'http://127.0.0.1:18969';
const correctPath = process.env.X74_CORRECT_PACKAGE
  || path.join(__dirname, 'fixtures/x69-correct.intent-mcu-experiment.json');
const knownBadPath = process.env.X74_KNOWN_BAD_PACKAGE
  || path.join(__dirname, 'fixtures/x69-known-bad.intent-mcu-experiment.json');
const screenshotDir = process.env.X74_SCREENSHOT_DIR || null;
const sha256 = (source) => crypto.createHash('sha256').update(source).digest('hex');

async function downloadBytes(page, selector) {
  const downloadPromise = page.waitForEvent('download');
  await page.click(selector);
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return { bytes: Buffer.concat(chunks), name: download.suggestedFilename() };
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

let browser;
(async () => {
  const correct = fs.readFileSync(correctPath);
  const knownBad = fs.readFileSync(knownBadPath);
  browser = await chromium.launch({ headless: true });
  const senderContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const recipientContext = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  const sender = await senderContext.newPage();
  const recipient = await recipientContext.newPage();
  const errors = []; const outside = []; const mutations = [];
  for (const page of [sender, recipient]) {
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
  }
  const senderInitial = await invariant(sender);
  const recipientInitial = await invariant(recipient);

  // Sender explicitly opens retained evidence and downloads an exact handover copy.
  await sender.setInputFiles('#guided-replay-input', correctPath);
  await sender.waitForFunction(() => window.__X74_RECIPIENT_EXCHANGE__.state().parentPackageSha256);
  const handover = await downloadBytes(sender, '#recipient-handover-download');
  assert.equal(handover.name, 'Thermostat-boundary-test.intent-mcu-handover.json');
  assert.equal(sha256(handover.bytes), sha256(correct));

  // A separate recipient context explicitly opens the actual downloaded bytes and stays review-only.
  await recipient.setInputFiles('#guided-replay-input', {
    name: handover.name, mimeType: 'application/json', buffer: handover.bytes,
  });
  await recipient.waitForFunction(() => window.__X74_RECIPIENT_EXCHANGE__.state().parentPackageSha256);
  await recipient.click('#recipient-review-only');
  assert.match(await recipient.locator('#recipient-choice-status').textContent(), /Review-only selected explicitly/u);
  assert.deepEqual(await invariant(recipient), recipientInitial);

  // Recipient downloads a bounded response; sender explicitly opens those exact bytes.
  await recipient.selectOption('#recipient-response-disposition', 'changes-requested');
  await recipient.fill('#recipient-response-note', 'Please explain the equality boundary before the next review.');
  const response = await downloadBytes(recipient, '#recipient-response-download');
  assert.equal(response.name, 'Thermostat-boundary-test.intent-mcu-response.json');
  const responseValue = JSON.parse(response.bytes.toString('utf8'));
  assert.equal(responseValue.schema, 'intent-mcu-recipient-response@1');
  assert.equal(responseValue.parent.packageSha256, sha256(correct));
  assert.deepEqual(responseValue.authority,
    { apply: false, build: false, run: false, runtime: false, verdict: false });
  await sender.setInputFiles('#recipient-response-input', {
    name: response.name, mimeType: 'application/json', buffer: response.bytes,
  });
  await sender.waitForFunction(() => window.__X74_RECIPIENT_EXCHANGE__.state().acceptedResponse);
  const relationship = await sender.evaluate(() => window.__X74_RECIPIENT_EXCHANGE__.state());
  assert.equal(relationship.acceptedResponse.parentPackageSha256, sha256(correct));
  assert.equal(relationship.acceptedResponse.relationship, 'exact-parent');
  assert.match(await sender.locator('#recipient-response-relationship').textContent(), /Exact parent package/u);

  // Duplicate, wrong-parent and stale-parent routes reject without active project mutation.
  await sender.setInputFiles('#recipient-response-input', {
    name: response.name, mimeType: 'application/json', buffer: response.bytes,
  });
  await sender.waitForFunction(() => document.querySelector('#recipient-response-status')
    .textContent.includes('RECIPIENT_RESPONSE_DUPLICATE'));
  assert.deepEqual(await invariant(sender), senderInitial);
  await sender.setInputFiles('#guided-replay-input', knownBadPath);
  await sender.waitForFunction((digest) => window.__X74_RECIPIENT_EXCHANGE__.state().parentPackageSha256 === digest,
    sha256(knownBad));
  await sender.setInputFiles('#recipient-response-input', {
    name: response.name, mimeType: 'application/json', buffer: response.bytes,
  });
  await sender.waitForFunction(() => document.querySelector('#recipient-response-status')
    .textContent.includes('RECIPIENT_RESPONSE_WRONG_PARENT'));
  const staleCode = await sender.evaluate(async ({ text, expected }) => (await window.__X74_RECIPIENT_EXCHANGE__
    .openResponseText(text, 'stale-response.json', expected)).code,
  { text: response.bytes.toString('utf8'), expected: sha256(correct) });
  assert.equal(staleCode, 'RECIPIENT_RESPONSE_STALE_PARENT');
  assert.deepEqual(await invariant(sender), senderInitial);

  // Existing guarded Open is offered separately; cancelling preserves the recipient's unsaved work.
  await recipient.evaluate(() => {
    const input = document.querySelector('#project-name');
    input.value = `${input.value} local draft`;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const dirtyRecipient = await invariant(recipient);
  await recipient.click('#recipient-project-open');
  await recipient.waitForFunction(() => document.querySelector('#unsaved-change-dialog').open);
  await recipient.click('#unsaved-keep');
  await recipient.waitForFunction(() => !document.querySelector('#unsaved-change-dialog').open);
  assert.deepEqual(await invariant(recipient), dirtyRecipient);

  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await recipient.evaluate(() => document.querySelector('#guided-replay-dialog').showModal());
    await recipient.locator('.recipient-exchange').screenshot({
      path: path.join(screenshotDir, 'x74-recipient.png'), animations: 'disabled',
    });
    await sender.locator('.recipient-exchange').screenshot({
      path: path.join(screenshotDir, 'x74-sender-wrong-parent.png'), animations: 'disabled',
    });
  }

  for (const page of [sender, recipient]) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth
      - document.documentElement.clientWidth);
    assert(overflow <= 1, `horizontal overflow ${overflow}`);
  }
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(outside.length, 0, JSON.stringify(outside));
  assert.equal(mutations.length, 0, JSON.stringify(mutations));
  assert.equal((await senderContext.cookies()).length, 0);
  assert.equal((await recipientContext.cookies()).length, 0);
  process.stdout.write(`${JSON.stringify({ status: 'pass', contexts: 2,
    handoverSha256: sha256(handover.bytes), responseSha256: sha256(response.bytes),
    parentSha256: sha256(correct), actualDownloadBytes: true, reviewOnlyPreserved: true,
    unsavedCancelPreserved: true, duplicateRejected: true, wrongParentRejected: true,
    staleParentRejected: true, automaticApply: false, serverStored: false,
    producerCalls: 0, externalRequests: 0, mutationRequests: 0, screenshots: screenshotDir })}\n`);
  await senderContext.close(); await recipientContext.close();
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); });

