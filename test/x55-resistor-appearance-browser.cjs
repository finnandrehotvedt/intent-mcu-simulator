// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.X55_URL || 'http://host.docker.internal:18895';
const outputDir = process.env.X55_OUTPUT || '/tmp/x55-private-evidence';
const profiles = [
  'board.atmega328p-16mhz-v1',
  'board.rp2040-pico-v1',
  'board.esp32-c3-devmodule-v1',
  'board.stm32f429zi-nucleo144-v1',
];

async function selectResistorByKeyboard(page) {
  if (await page.locator('#workbench-inspector-dialog').getAttribute('open') !== null) {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#workbench-inspector-dialog').open);
  }
  const card = page.locator('#component-layer .circuit-component[data-component-id="resistor-1"]');
  await card.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__X55_APPEARANCE_STATE__?.componentId === 'resistor-1');
  if (!await page.locator('#appearance-editor').isVisible()) {
    await page.click('#toggle-inspector');
    await page.waitForSelector('#workbench-inspector-dialog[open]');
  }
  return card;
}

async function loadBlinkExample(page) {
  await page.click('#project-files-open');
  await page.click('#project-demo');
  await page.click('.starter-card[data-example="blink"]');
  if (await page.locator('#unsaved-change-dialog').isVisible()) await page.click('#unsaved-discard');
  await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.some(
    (component) => component.id === 'resistor-1',
  ));
}

async function anchors(page) {
  return page.evaluate(() => Object.fromEntries(['A', 'B'].map((pin) => {
    const box = document.querySelector(
      `.pin-anchor[data-endpoint="resistor-1.${pin}"]`,
    ).getBoundingClientRect();
    return [pin, { x: box.x + box.width / 2, y: box.y + box.height / 2 }];
  })));
}

async function applyPresetWithKeyboard(page, preset) {
  const select = page.locator('#appearance-preset');
  await select.focus();
  const current = await select.inputValue();
  if (current === preset) return;
  if (current !== preset) {
    await page.keyboard.press(preset === 'cool-blue' ? 'End' : 'Home');
    await page.waitForFunction((value) => document.querySelector('#appearance-preset').value === value,
      preset);
  }
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'appearance-apply');
  await page.keyboard.press('Enter');
  await page.waitForFunction((value) => window.__X55_APPEARANCE_STATE__?.currentPreset === value,
    preset);
}

async function profileProjects(page) {
  return page.evaluate((ids) => Object.fromEntries(ids.map((profile) => [
    profile, JSON.stringify(window.__COMMON_PROJECT_FILES__.current(profile)),
  ])), profiles);
}

async function closeProjectDialog(page) {
  if (await page.locator('#workbench-project-dialog').getAttribute('open') !== null) {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#workbench-project-dialog').open);
  }
}

async function assertRejectedFileIsAtomic(page, filePath, expectedCode, before) {
  await closeProjectDialog(page);
  await page.click('#project-files-open');
  await page.setInputFiles('#project-open-input', filePath);
  await page.waitForFunction((code) => document.querySelector('#project-message')
    ?.textContent.includes(`Open rejected (${code})`), expectedCode);
  assert.deepEqual(await profileProjects(page), before, `${expectedCode} changed a parked draft`);
  await closeProjectDialog(page);
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = {
    result: 'pass', firmwareBuilds: 0, runtimeRuns: 0, scenarios: 0,
    producerRequests: [], mutatingRequests: [], thirdPartyRequests: [],
    viewports: [], screenshots: [],
  };
  try {
    for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ viewport, acceptDownloads: true, serviceWorkers: 'block' });
      await context.addInitScript(() => {
        const NativeWorker = window.Worker;
        window.__X55_WORKERS__ = 0;
        window.Worker = class extends NativeWorker {
          constructor(...args) { window.__X55_WORKERS__ += 1; super(...args); }
        };
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        const record = { method: request.method(), url: request.url() };
        if (/\/(?:api|compile|run|scenario)(?:\/|$)/u.test(new URL(request.url()).pathname)) {
          report.producerRequests.push(record);
        }
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) report.mutatingRequests.push(record);
        if (new URL(request.url()).origin !== new URL(base).origin) report.thirdPartyRequests.push(record);
      });
      assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
      await page.waitForFunction(() => window.__M11_READY__ === true);
      await loadBlinkExample(page);
      const storageKeysBefore = await page.evaluate(() => Object.keys(localStorage).sort());
      const initialProject = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
      const card = await selectResistorByKeyboard(page);
      assert.equal(await page.locator('#appearance-editor').isVisible(), true);
      assert.match(await page.locator('#appearance-status').textContent(), /Invariant pass.*pins A\/B/iu);

      const previewBefore = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
      await page.locator('#appearance-preset').focus();
      await page.keyboard.press('End');
      await page.waitForFunction(() => window.__X55_APPEARANCE_STATE__?.previewPreset === 'cool-blue');
      assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), previewBefore,
        'preview mutated the canonical project');
      assert.equal(await card.locator('.resistor-body.appearance-standard-beige').count(), 1);
      assert.equal(await page.locator('#appearance-preview .resistor-body.appearance-cool-blue').count(), 1);
      assert.equal(await page.locator('#appearance-apply').isEnabled(), true);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__X55_APPEARANCE_STATE__?.currentPreset === 'cool-blue');
      assert.equal(await card.locator('.resistor-body.appearance-cool-blue').count(), 1);

      const invariantCases = [];
      for (let rotation = 0; rotation < 360; rotation += 90) {
        await selectResistorByKeyboard(page);
        if (rotation > 0) {
          await page.locator('#rotate-component').focus();
          await page.keyboard.press('Enter');
          await page.waitForFunction((expected) => window.__M6_PROJECT__().layout.positions['resistor-1'].rotation === expected,
            rotation);
        }
        if (await page.locator('#workbench-inspector-dialog').getAttribute('open') !== null) {
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => !document.querySelector('#workbench-inspector-dialog').open);
        }
        const movedCard = page.locator('#component-layer .circuit-component[data-component-id="resistor-1"]');
        await movedCard.focus();
        await page.keyboard.press(rotation % 180 === 0 ? 'ArrowRight' : 'ArrowDown');
        await selectResistorByKeyboard(page);
        const before = await anchors(page);
        const targetPreset = rotation % 180 === 0 ? 'standard-beige' : 'cool-blue';
        await applyPresetWithKeyboard(page, targetPreset);
        const after = await anchors(page);
        assert.deepEqual(after, before, `pin anchors moved at ${rotation} degrees`);
        const state = await page.evaluate(() => ({
          source: window.__M6_PROJECT__().source,
          circuit: window.__M6_PROJECT__().circuit,
          position: window.__M6_PROJECT__().layout.positions['resistor-1'],
          x55: window.__X55_APPEARANCE_STATE__,
        }));
        assert.equal(state.position.rotation, rotation);
        assert.equal(state.x55.invariant, 'equal');
        invariantCases.push({ rotation, before, after, preset: targetPreset });
      }

      await applyPresetWithKeyboard(page, 'cool-blue');
      const savedProject = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
      if (await page.locator('#workbench-inspector-dialog').getAttribute('open') !== null) {
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('#workbench-inspector-dialog').open);
      }
      await page.click('#project-files-open');
      const downloadPromise = page.waitForEvent('download');
      await page.click('#project-save');
      const download = await downloadPromise;
      const savedPath = await download.path();
      assert(fs.statSync(savedPath).size > 0);
      const savedEnvelope = fs.readFileSync(savedPath, 'utf8');
      const malformedPath = path.join(outputDir, `x55-malformed-${viewport.width}.json`);
      const duplicatePath = path.join(outputDir, `x55-duplicate-${viewport.width}.json`);
      fs.writeFileSync(malformedPath, '{');
      const duplicateEnvelope = savedEnvelope.replace(
        /"schema"\s*:\s*"intent-mcu-project-envelope@8"/u,
        '"schema":"intent-mcu-project-envelope@8","schema":"intent-mcu-project-envelope@8"',
      );
      assert.notEqual(duplicateEnvelope, savedEnvelope);
      fs.writeFileSync(duplicatePath, duplicateEnvelope);
      await page.keyboard.press('Escape');
      await selectResistorByKeyboard(page);
      await applyPresetWithKeyboard(page, 'standard-beige');
      assert.notEqual(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), savedProject);
      await page.keyboard.press('Escape');
      await page.click('#project-files-open');
      await page.setInputFiles('#project-open-input', savedPath);
      await page.waitForTimeout(100);
      if (await page.locator('#unsaved-change-dialog').isVisible()) await page.click('#unsaved-discard');
      await page.waitForFunction(() => window.__M6_PROJECT__().layout.componentAppearance
        ?.components['resistor-1']?.preset === 'cool-blue');
      assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), savedProject);

      await closeProjectDialog(page);
      const strictBefore = await profileProjects(page);
      await assertRejectedFileIsAtomic(page, malformedPath, 'MALFORMED_JSON', strictBefore);
      await assertRejectedFileIsAtomic(page, duplicatePath, 'DUPLICATE_KEY', strictBefore);

      await selectResistorByKeyboard(page);
      await applyPresetWithKeyboard(page, 'standard-beige');
      if (await page.locator('#workbench-inspector-dialog').getAttribute('open') !== null) {
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('#workbench-inspector-dialog').open);
      }
      const cancelBefore = await profileProjects(page);
      await page.click('#project-files-open');
      await page.setInputFiles('#project-open-input', savedPath);
      await page.waitForSelector('#unsaved-change-dialog[open]');
      await page.click('#unsaved-keep');
      assert.deepEqual(await profileProjects(page), cancelBefore,
        'Keep editing changed one of the four parked drafts');
      await closeProjectDialog(page);
      await page.click('#project-files-open');
      await page.setInputFiles('#project-open-input', savedPath);
      await page.waitForSelector('#unsaved-change-dialog[open]');
      await page.click('#unsaved-discard');
      await page.waitForFunction(() => window.__M6_PROJECT__().layout.componentAppearance
        ?.components['resistor-1']?.preset === 'cool-blue');
      assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), savedProject);
      const roundtripProfiles = await profileProjects(page);
      for (const profile of profiles.slice(1)) {
        assert.equal(roundtripProfiles[profile], cancelBefore[profile],
          `${profile} changed during AVR file roundtrip`);
      }

      const parked = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
      for (const profile of profiles) {
        await page.selectOption('#board-select', profile);
        await page.waitForFunction((value) => document.querySelector('#board-select').value === value, profile);
        if (profile !== profiles[0]) {
          assert.deepEqual(await page.evaluate(() => ({
            hidden: document.querySelector('#appearance-editor').hidden,
            state: window.__X55_APPEARANCE_STATE__,
          })), { hidden: true, state: null }, `${profile} exposed AVR appearance authority`);
        }
        assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), parked,
          `${profile} changed parked AVR draft`);
      }
      await page.selectOption('#board-select', profiles[0]);
      await page.waitForFunction(() => document.querySelector('#board-select').value
        === 'board.atmega328p-16mhz-v1');
      assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), parked);

      assert.equal(await page.evaluate(() => window.__X55_WORKERS__), 0);
      assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), 0);
      assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).sort()), storageKeysBefore);
      assert.deepEqual(await context.cookies(), []);
      assert.equal(errors.length, 0, errors.join(' | '));
      assert((await page.evaluate(() => document.documentElement.scrollWidth
        - document.documentElement.clientWidth)) <= 1);
      const screenshot = path.join(outputDir, `x55-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      report.screenshots.push(screenshot);
      report.viewports.push({ viewport, initialProjectBytes: Buffer.byteLength(initialProject),
        invariantCases, saveOpenExact: true, strictMalformedAtomic: true,
        strictDuplicateAtomic: true, cancelFourProfileAtomic: true,
        profileParkingExact: true, keyboard: true,
        workerCreations: 0, browserErrors: 0 });
      await context.close();
    }
    assert.deepEqual(report.producerRequests, []);
    assert.deepEqual(report.mutatingRequests, []);
    assert.deepEqual(report.thirdPartyRequests, []);
    fs.writeFileSync(path.join(outputDir, 'x55-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
