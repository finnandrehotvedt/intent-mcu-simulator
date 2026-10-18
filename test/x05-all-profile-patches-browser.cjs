// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X05_ALL_URL || 'http://127.0.0.1:18766';
const profiles = [
  'board.atmega328p-16mhz-v1',
  'board.rp2040-pico-v1',
  'board.esp32-c3-devmodule-v1',
  'board.stm32f429zi-nucleo144-v1',
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const outside = []; const errors = [];
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    const accepted = [];
    for (const profile of profiles) {
      await page.selectOption('#board-select', profile);
      const fixture = await page.evaluate(async (selected) => {
        const current = window.__COMMON_PROJECT_FILES__.current(selected);
        const envelope = JSON.parse(current);
        const bytes = new TextEncoder().encode(current);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const baseProjectSha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        const project = envelope.project;
        if (typeof project.source === 'string') {
          project.source = project.source.replace('PICO PUBLIC', 'PICO PATCH')
            .replace('C3_PUBLIC', 'C3_PATCH').replace('STM32 PUBLIC', 'STM32 PATCH');
        } else project.source.files[0].content += '\n// X05 reviewed patch\n';
        const positions = project.circuit?.layout?.positions ?? project.layout?.positions ?? {};
        const componentId = Object.keys(positions).find((id) => !/board|pico|esp32|stm32|controller/iu.test(id))
          ?? Object.keys(positions)[0] ?? 'no-component';
        if (positions[componentId]) positions[componentId].x = Math.min(0.9, positions[componentId].x + 0.01);
        const styles = project.circuit?.layout?.wireStyles ?? project.layout?.wireStyles ?? {};
        const wireId = Object.keys(styles)[0] ?? 'no-wire';
        if (styles[wireId]) styles[wireId] = '#35d07f';
        const description = `Review source, ${componentId}, and ${wireId} for ${selected}.`;
        return { before: current, patch: JSON.stringify({ schema: 'intent-mcu-project-patch@1', profile: selected,
          baseProjectSha256, description, proposedProject: envelope }) };
      }, profile);
      const reviewed = await page.evaluate(({ source, selected }) => window.__PROJECT_PATCH__.review(source, selected),
        { source: fixture.patch, selected: profile });
      assert.equal(reviewed.ok, true, `${profile}: ${reviewed.code}`);
      assert.equal(reviewed.changes[0].kind, 'source', profile);
      if (profile !== 'board.atmega328p-16mhz-v1') {
        assert.deepEqual(reviewed.changes.map((change) => change.kind), ['source', 'component', 'wire']);
      }
      assert.equal(await page.evaluate((selected) => window.__COMMON_PROJECT_FILES__.current(selected), profile), fixture.before);
      const applied = await page.evaluate(() => window.__PROJECT_PATCH__.apply());
      assert.equal(applied.code, 'PROJECT_PATCH_APPLIED', profile);
      assert.notEqual(await page.evaluate((selected) => window.__COMMON_PROJECT_FILES__.current(selected), profile), fixture.before);
      accepted.push(profile);
    }
    assert.equal(outside.length, 0, JSON.stringify(outside));
    assert.equal(errors.length, 0, JSON.stringify(errors));
    process.stdout.write(`${JSON.stringify({ status: 'pass', profiles: accepted,
      reviewKinds: ['source', 'component', 'wire'], outsideRequests: 0, browserErrors: 0 })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
