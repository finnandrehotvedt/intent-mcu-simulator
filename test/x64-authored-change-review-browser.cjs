// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X64_URL || 'http://127.0.0.1:18854';
const profiles = [
  { id: 'board.atmega328p-16mhz-v1', family: 'architecture.avr-v1', marker: 'X64 AVR <literal> æøå', replace: null },
  { id: 'board.rp2040-pico-v1', family: 'architecture.rp2040-v1', marker: 'X64 PICO', replace: 'PICO PUBLIC' },
  { id: 'board.esp32-c3-devmodule-v1', family: 'architecture.esp32-v1', marker: 'X64_C3', replace: 'C3_PUBLIC' },
  { id: 'board.stm32f429zi-nucleo144-v1', family: 'architecture.stm32-v1', marker: 'X64 STM32', replace: 'STM32 PUBLIC' },
];

async function activate(locator) {
  await locator.focus();
  await locator.press('Enter');
}

async function selectByKeyboard(page, selector, value) {
  const locator = page.locator(selector);
  const index = await locator.locator('option').evaluateAll((options, selected) =>
    options.findIndex((option) => option.value === selected), value);
  assert(index >= 0, `${selector}: missing ${value}`);
  await locator.focus();
  await page.keyboard.press('Home');
  for (let position = 0; position < index; position += 1) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(({ target, selected }) => document.querySelector(target).value === selected,
    { target: selector, selected: value });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    await context.addInitScript(() => {
      window.__x64PointerEvents = 0;
      for (const name of ['pointerdown', 'mousedown', 'touchstart']) {
        document.addEventListener(name, () => { window.__x64PointerEvents += 1; }, { capture: true });
      }
    });
    const page = await context.newPage();
    const outside = []; const errors = []; const mutationRequests = []; const jobRequests = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== new URL(base).origin) outside.push(request.url());
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutationRequests.push(`${request.method()} ${url.pathname}`);
      if (/^\/api\//u.test(url.pathname)) jobRequests.push(`${request.method()} ${url.pathname}`);
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true);

    // Load a real validated AVR project through the visible keyboard-only example chooser.
    await activate(page.locator('#project-demo'));
    await page.waitForFunction(() => document.querySelector('#example-picker-dialog').open === true);
    await page.keyboard.type('Blink LED');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__M6_STATE__.graph?.nets?.length === 3);

    const accepted = [];
    for (const profile of profiles) {
      await selectByKeyboard(page, '#family-select', profile.family);
      await page.waitForFunction((selected) => document.querySelector('#board-select').value === selected, profile.id);
      const fixture = await page.evaluate(async ({ selected, marker, replace }) => {
        const current = window.__COMMON_PROJECT_FILES__.current(selected);
        const envelope = JSON.parse(current);
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(current));
        const baseProjectSha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        const project = envelope.project;
        if (typeof project.source === 'string') project.source = project.source.replace(replace, marker);
        else project.source.files[0].content += `\n// ${marker}`;
        const resistor = project.circuit?.components?.find((item) => item.type === 'resistor.fixed-v1');
        if (selected === 'board.atmega328p-16mhz-v1') {
          if (!resistor || resistor.properties.ohms !== 220) throw new Error('X64_AVR_220_RESISTOR_REQUIRED');
          resistor.properties.ohms = 330;
        }
        const positions = project.circuit?.layout?.positions ?? project.layout?.positions ?? {};
        const componentId = Object.keys(positions).find((id) => !/board|pico|esp32|stm32|controller/iu.test(id))
          ?? Object.keys(positions)[0];
        if (componentId) positions[componentId].x = Math.min(0.9, positions[componentId].x + 0.01);
        return {
          before: current,
          resistorId: resistor?.id ?? null,
          componentId,
          patch: JSON.stringify({
            schema: 'intent-mcu-project-patch@1', profile: selected, baseProjectSha256,
            description: `Review literal source and typed component owner for ${selected}.`,
            proposedProject: envelope,
          }, null, 2),
        };
      }, { selected: profile.id, marker: profile.marker, replace: profile.replace });

      const beforeReview = await page.evaluate(() => ({
        canonical: window.__COMMON_PROJECT_FILES__.current('board.atmega328p-16mhz-v1'),
        revision: window.__M6_STATE__.revision,
        buildState: window.__M6_STATE__.buildState,
        artifactIdentity: window.__M6_STATE__.artifactIdentity,
        runtime: window.__M6_STATE__.runtime,
        selection: window.__M6_STATE__.selection,
        selectedComponentId: window.__M6_STATE__.selectedComponentId,
        selectedNetId: window.__M6_STATE__.selectedNetId,
        workerCreations: window.__M6_STATE__.runtimeWorkerCreations,
      }));

      await page.locator('#project-patch-input').fill(fixture.patch);
      await activate(page.locator('#project-patch-review'));
      await page.waitForFunction(() => !document.querySelector('#authored-change-review').hidden
        || document.querySelector('#project-patch-status').textContent.includes('rejected'));
      const directReview = await page.evaluate(({ patch, selected }) => window.__PROJECT_PATCH__.review(patch, selected),
        { patch: fixture.patch, selected: profile.id });
      assert.equal(await page.locator('#authored-change-review').isHidden(), false,
        `${profile.id}: ${await page.locator('#project-patch-status').textContent()} ${JSON.stringify(directReview)}`);
      assert.equal(await page.evaluate((selected) => window.__COMMON_PROJECT_FILES__.current(selected), profile.id), fixture.before);
      if (profile.id === 'board.atmega328p-16mhz-v1') {
        assert.deepEqual(await page.evaluate(() => ({
          canonical: window.__COMMON_PROJECT_FILES__.current('board.atmega328p-16mhz-v1'),
          revision: window.__M6_STATE__.revision,
          buildState: window.__M6_STATE__.buildState,
          artifactIdentity: window.__M6_STATE__.artifactIdentity,
          runtime: window.__M6_STATE__.runtime,
          selection: window.__M6_STATE__.selection,
          selectedComponentId: window.__M6_STATE__.selectedComponentId,
          selectedNetId: window.__M6_STATE__.selectedNetId,
          workerCreations: window.__M6_STATE__.runtimeWorkerCreations,
        })), beforeReview, 'AVR review changed canonical, dirty state, history, selection or runtime authority');
      }
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
      if (profile.id === 'board.atmega328p-16mhz-v1') {
        const resistorRow = state.summaryRows.find((row) => row.ownerId === fixture.resistorId);
        assert(resistorRow, 'AVR typed resistor owner missing');
        assert.match(resistorRow.summary, /properties\.ohms from 220 Ω to 330 Ω/u);
        assert.match(await page.locator('#authored-change-review-rows').textContent(), /220 Ω to 330 Ω/u);
      }

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
      if (profile.id === 'board.atmega328p-16mhz-v1') {
        await activate(page.locator('#project-patch-apply'));
        await page.waitForFunction(() => document.querySelector('#project-patch-status').textContent.includes('fresh Build'));
        const applied = await page.evaluate(({ selected, resistorId, marker }) => {
          const canonical = window.__COMMON_PROJECT_FILES__.current(selected);
          const envelope = JSON.parse(canonical);
          const resistor = envelope.project.circuit.components.find((item) => item.id === resistorId);
          return { canonical, ohms: resistor.properties.ohms,
            source: envelope.project.source.files[0].content,
            buildState: window.__M6_STATE__.buildState,
            artifactIdentity: window.__M6_STATE__.artifactIdentity,
            runtime: window.__M6_STATE__.runtime,
            workerCreations: window.__M6_STATE__.runtimeWorkerCreations };
        }, { selected: profile.id, resistorId: fixture.resistorId, marker: profile.marker });
        assert.equal(applied.ohms, 330);
        assert(applied.source.includes(profile.marker));
        assert.equal(applied.buildState, 'dirty');
        assert.equal(applied.artifactIdentity, null);
        assert.equal(applied.runtime, null);
        assert.equal(applied.workerCreations, 0);
        assert.equal(await page.locator('#run').isDisabled(), true);

        const downloadEvent = page.waitForEvent('download');
        await activate(page.locator('#project-save'));
        const download = await downloadEvent;
        const savedPath = await download.path();
        const saved = fs.readFileSync(savedPath);
        assert.equal(JSON.parse(saved.toString('utf8')).schema, 'intent-mcu-project-envelope@8');

        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForFunction(() => window.__M11_READY__ === true);
        assert.equal(await page.evaluate((selected) => window.__COMMON_PROJECT_FILES__.current(selected), profile.id), applied.canonical);
        assert.equal(await page.locator('#run').isDisabled(), true);
        assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), 0);

        await page.setInputFiles('#project-open-input', { name: 'x64-valid.intent-mcu.json',
          mimeType: 'application/json', buffer: saved });
        await page.waitForTimeout(50);
        if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
          await activate(page.locator('#unsaved-discard'));
        }
        await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('fresh Build'));
        assert.equal(await page.evaluate((selected) => window.__COMMON_PROJECT_FILES__.current(selected), profile.id), applied.canonical);
        assert.equal(await page.locator('#run').isDisabled(), true);
        assert.equal(await page.locator('#undo').isDisabled(), true);

        const invalid = JSON.parse(saved.toString('utf8'));
        invalid.project.runtime = { verdict: 'passed' };
        const beforeInvalid = await page.evaluate((selected) => window.__COMMON_PROJECT_FILES__.current(selected), profile.id);
        await page.setInputFiles('#project-open-input', { name: 'x64-invalid.intent-mcu.json',
          mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
        await page.waitForTimeout(80);
        assert.equal(await page.evaluate((selected) => window.__COMMON_PROJECT_FILES__.current(selected), profile.id), beforeInvalid);
        assert.equal(await page.locator('#run').isDisabled(), true);
      } else {
        await page.locator('#project-patch-input').press('End');
        await page.locator('#project-patch-input').type(' ');
        assert.equal(await page.locator('#authored-change-review').isHidden(), true);
        assert.equal(await page.locator('#project-patch-apply').isDisabled(), true);
        assert.equal(await page.evaluate(() => window.__AUTHORED_CHANGE_REVIEW__.state()), null);
        assert.equal(await page.evaluate((selected) => window.__COMMON_PROJECT_FILES__.current(selected), profile.id), fixture.before);
      }
      accepted.push(profile.id);
    }

    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    assert.equal(await page.evaluate(() => window.__x64PointerEvents), 0);
    assert.equal(overflow, 0);
    assert.equal(outside.length, 0, JSON.stringify(outside));
    assert.equal(mutationRequests.length, 0, JSON.stringify(mutationRequests));
    assert.equal(jobRequests.length, 0, JSON.stringify(jobRequests));
    assert.equal((await context.cookies()).length, 0);
    assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), 0);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    process.stdout.write(`${JSON.stringify({ status: 'pass', profiles: accepted,
      keyboardOnly: true, pointerEvents: 0, exactLiteralSource: true, typedSummary: true,
      avrCataloguedResistor: '220 Ω to 330 Ω', focusMovement: true, invalidation: true,
      preApplyMutation: false, x05Apply: true, freshBuildRequired: true,
      saveOpenReload: true, invalidOpenAtomic: true, jobRequests: 0,
      mutationRequests: 0, workerCreations: 0, cookies: 0,
      horizontalOverflow: overflow, outsideRequests: 0, browserErrors: 0 })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
