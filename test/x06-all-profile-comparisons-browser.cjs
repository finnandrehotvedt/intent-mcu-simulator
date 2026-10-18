// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X06_ALL_URL || 'http://127.0.0.1:18766';
const profiles = ['board.atmega328p-16mhz-v1', 'board.rp2040-pico-v1',
  'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1'];

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const outside = []; const errors = [];
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base, { waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__M11_READY__ === true);
    const compared = [];
    for (const profile of profiles) {
      await page.selectOption('#board-select', profile);
      const fixture = await page.evaluate(async (selected) => {
        const current = window.__COMMON_PROJECT_FILES__.current(selected); const envelope = JSON.parse(current);
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(current));
        const baseProjectSha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        const project = envelope.project;
        if (typeof project.source === 'string') project.source = project.source.replace('PICO PUBLIC', 'PICO DESIGN B')
          .replace('C3_PUBLIC', 'C3_DESIGN_B').replace('STM32 PUBLIC', 'STM32 DESIGN B');
        else project.source.files[0].content += '\n// X06 design B\n';
        const description = `Compare current and proposed source for ${selected}.`;
        return { before: current, patch: JSON.stringify({ schema: 'intent-mcu-project-patch@1', profile: selected,
          baseProjectSha256, description, proposedProject: envelope }) };
      }, profile);
      const reviewed = await page.evaluate(({ patch, profile }) => window.__PROJECT_PATCH__.review(patch, profile),
        { patch: fixture.patch, profile });
      assert.equal(reviewed.ok, true, `${profile}: ${reviewed.code}`);
      const result = await page.evaluate(() => window.__DESIGN_COMPARISON__.compare());
      assert.equal(result.ok, true, `${profile}: ${result.code}`); assert.equal(result.alternatives.length, 2);
      assert.equal(result.requirements.sameForBoth, true); assert.equal(result.alternatives[0].model.profile, profile);
      assert.equal(result.recommendation, null); assert.equal(result.buildAuthority, false);
      assert.equal(await page.evaluate((selected) => window.__COMMON_PROJECT_FILES__.current(selected), profile), fixture.before);
      compared.push(profile);
    }
    assert.equal(outside.length, 0, JSON.stringify(outside)); assert.equal(errors.length, 0, JSON.stringify(errors));
    process.stdout.write(`${JSON.stringify({ status: 'pass', profiles: compared, alternativesPerProfile: 2,
      sameRequirements: true, recommendations: 0, outsideRequests: 0, browserErrors: 0 })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
