// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X64_URL || 'http://127.0.0.1:18854';
const profiles = [
  { id: 'board.atmega328p-16mhz-v1', marker: 'X64 AVR <literal> æøå', replace: null },
  { id: 'board.rp2040-pico-v1', marker: 'X64 PICO', replace: 'PICO PUBLIC' },
  { id: 'board.esp32-c3-devmodule-v1', marker: 'X64_C3', replace: 'C3_PUBLIC' },
  { id: 'board.stm32f429zi-nucleo144-v1', marker: 'X64 STM32', replace: 'STM32 PUBLIC' },
];

async function activate(locator) {
  await locator.focus();
  await locator.press('Enter');
}

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
    await page.evaluate(() => {
      window.__x64PointerEvents = 0;
      for (const name of ['pointerdown', 'mousedown', 'touchstart']) {
        document.addEventListener(name, () => { window.__x64PointerEvents += 1; }, { capture: true });
      }
    });

    const accepted = [];
    for (const profile of profiles) {
      await page.selectOption('#board-select', profile.id);
      const fixture = await page.evaluate(async ({ selected, marker, replace }) => {
        const current = window.__COMMON_PROJECT_FILES__.current(selected);
        const envelope = JSON.parse(current);
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(current));
        const baseProjectSha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        const project = envelope.project;
        if (typeof project.source === 'string') project.source = project.source.replace(replace, marker);
        else project.source.files[0].content += `\n// ${marker}`;
        const positions = project.circuit?.layout?.positions ?? project.layout?.positions ?? {};
        const componentId = Object.keys(positions).find((id) => !/board|pico|esp32|stm32|controller/iu.test(id))
          ?? Object.keys(positions)[0];
        if (componentId) positions[componentId].x = Math.min(0.9, positions[componentId].x + 0.01);
        return {
          before: current,
          componentId,
          patch: JSON.stringify({
            schema: 'intent-mcu-project-patch@1', profile: selected, baseProjectSha256,
            description: `Review literal source and typed component owner for ${selected}.`,
            proposedProject: envelope,
          }, null, 2),
        };
      }, { selected: profile.id, marker: profile.marker, replace: profile.replace });

      await page.locator('#project-patch-input').fill(fixture.patch);
      await activate(page.locator('#project-patch-review'));
      await page.waitForFunction(() => !document.querySelector('#authored-change-review').hidden
        || document.querySelector('#project-patch-status').textContent.includes('rejected'));
      const directReview = await page.evaluate(({ patch, selected }) => window.__PROJECT_PATCH__.review(patch, selected),
        { patch: fixture.patch, selected: profile.id });
      assert.equal(await page.locator('#authored-change-review').isHidden(), false,
        `${profile.id}: ${await page.locator('#project-patch-status').textContent()} ${JSON.stringify(directReview)}`);
      assert.equal(await page.evaluate((selected) => window.__COMMON_PROJECT_FILES__.current(selected), profile.id), fixture.before);
      const state = await page.evaluate(() => window.__AUTHORED_CHANGE_REVIEW__.state());
      assert.equal(state.profile, profile.id);
      assert.equal(state.authority.apply, false);
      assert.equal(state.authority.build, false);
      assert.equal(state.authority.run, false);
      assert.equal(state.authority.verdict, false);
      assert.equal(state.sourceDiffs.length, 1);
      assert(state.summaryRows.some((row) => row.kind === 'source'));
      if (fixture.componentId) assert(state.summaryRows.some((row) => row.ownerId === fixture.componentId));
      assert((await page.locator('#authored-change-review-rows').textContent()).includes('source'));

      await activate(page.locator('#authored-change-review-show-source'));
      assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'SUMMARY');
      const rendered = await page.locator('.authored-source-diff pre').first().textContent();
      assert(rendered.includes(profile.marker), `${profile.id}: literal marker missing`);
      if (profile.id === 'board.atmega328p-16mhz-v1') {
        assert(rendered.includes('<literal>'), `${profile.id}: angle brackets were not literal text`);
      }
      assert.equal(await page.locator('.authored-source-diff pre script').count(), 0);
      if (profile.id === 'board.atmega328p-16mhz-v1' && process.env.X64_SCREENSHOT) {
        await page.locator('#authored-change-review').screenshot({ path: process.env.X64_SCREENSHOT });
      }

      await activate(page.locator('#authored-change-review-back'));
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'authored-change-review-title');
      await page.locator('#project-patch-input').press('End');
      await page.locator('#project-patch-input').type(' ');
      assert.equal(await page.locator('#authored-change-review').isHidden(), true);
      assert.equal(await page.locator('#project-patch-apply').isDisabled(), true);
      assert.equal(await page.evaluate(() => window.__AUTHORED_CHANGE_REVIEW__.state()), null);
      assert.equal(await page.evaluate((selected) => window.__COMMON_PROJECT_FILES__.current(selected), profile.id), fixture.before);
      accepted.push(profile.id);
    }

    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    assert.equal(await page.evaluate(() => window.__x64PointerEvents), 0);
    assert.equal(overflow, 0);
    assert.equal(outside.length, 0, JSON.stringify(outside));
    assert.equal(errors.length, 0, JSON.stringify(errors));
    process.stdout.write(`${JSON.stringify({ status: 'pass', profiles: accepted,
      keyboardOnly: true, pointerEvents: 0, exactLiteralSource: true, typedSummary: true,
      focusMovement: true, invalidation: true, preApplyMutation: false,
      horizontalOverflow: overflow, outsideRequests: 0, browserErrors: 0 })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
