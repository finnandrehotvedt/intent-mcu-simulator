// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.X19_UI_URL || 'http://127.0.0.1:18780';
const evidence = JSON.parse(fs.readFileSync(process.env.X19_EVIDENCE_PATH, 'utf8'));

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    const browserResults = await page.evaluate(async (value) => {
      const run = async (entry) => window.__AGENT_DOMAIN_ENGINE__.execute(JSON.stringify({
        schema: 'intent-mcu-domain-request@1', action: 'evaluate-thermostat-observation',
        projectText: entry.projectText, scenarioId: value.scenarioId, snapshot: entry.snapshot,
      }), 'board.atmega328p-16mhz-v1');
      return {
        correct: await run(value.correct),
        misleading: await run(value.misleading),
        missing: await run({ projectText: value.misleading.projectText, snapshot: value.missing.snapshot }),
      };
    }, evidence);
    assert.deepEqual(browserResults.correct.observation, evidence.correct.observation);
    assert.deepEqual(browserResults.misleading.observation, evidence.misleading.observation);
    assert.deepEqual(browserResults.missing.observation, evidence.missing.observation);
    assert.equal(browserResults.misleading.observation.checks.corroboratingSerial, true);
    assert.equal(browserResults.misleading.observation.checks.primaryExecutedPin, false);
    assert.equal(browserResults.misleading.observation.status, 'failed');
    assert.equal(browserResults.missing.observation.status, 'indeterminate');
    assert.deepEqual(errors, []);
    process.stdout.write(`${JSON.stringify({ status: 'pass', browserHeadlessSemanticAgreement: true,
      correct: browserResults.correct.observation.status,
      misleadingSerialClaim: browserResults.misleading.observation.status,
      observedD13: browserResults.misleading.observation.observed.d13,
      serialMatched: browserResults.misleading.observation.checks.corroboratingSerial,
      missingPin: browserResults.missing.observation.status, browserErrors: errors.length })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
