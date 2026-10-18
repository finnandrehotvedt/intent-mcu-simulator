// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.X21_UI_URL || 'http://127.0.0.1:18781';
const evidence = JSON.parse(fs.readFileSync(process.env.X21_EVIDENCE_PATH, 'utf8'));

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
      const evaluateSet = async (entry) => Promise.all(entry.scenarios.map(async (scenario) => {
        const result = await window.__AGENT_DOMAIN_ENGINE__.execute(JSON.stringify({
          schema: 'intent-mcu-domain-request@1', action: 'evaluate-thermostat-observation',
          projectText: entry.projectText, scenarioId: scenario.id, snapshot: scenario.snapshot,
        }), 'board.atmega328p-16mhz-v1');
        return result.observation;
      }));
      return { correct: await evaluateSet(value.correct), knownBad: await evaluateSet(value.knownBad) };
    }, evidence);
    assert.deepEqual(browserResults.correct, evidence.correct.scenarios.map((item) => item.observation));
    assert.deepEqual(browserResults.knownBad, evidence.knownBad.scenarios.map((item) => item.observation));
    assert.equal(browserResults.correct.length, 4);
    assert.equal(browserResults.correct.every((item) => item.status === 'passed'), true);
    assert.equal(browserResults.knownBad.find(
      (item) => item.scenarioId === 'THERM-SCENARIO-EQUALITY-ENABLED',
    ).status, 'failed');
    assert.deepEqual(errors, []);
    process.stdout.write(`${JSON.stringify({ status: 'pass', browserHeadlessSemanticAgreement: true,
      scenarios: browserResults.correct.map((item) => ({ id: item.scenarioId,
        status: item.status, d13: item.observed.d13 })), knownBadEquality: 'failed',
      browserErrors: errors.length })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
