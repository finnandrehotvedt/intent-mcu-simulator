// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const base = process.env.X55_URL || 'http://host.docker.internal:18895';
const output = process.env.X55_ALL_PROFILE_OUTPUT || '/tmp/x55-all-profile-evidence';
const profiles = [
  { id: 'pico', option: 'board.rp2040-pico-v1', global: '__RP2040_PUBLIC_WORKBENCH__',
    root: '#pico-public-workbench', layer: '#pico-editor-components', properties: '#pico-part-properties',
    save: '#pico-save', open: '#pico-open-input', circuitPath: 'circuit' },
  { id: 'c3', option: 'board.esp32-c3-devmodule-v1', global: '__ESP32C3_PUBLIC_WORKBENCH__',
    root: '#c3-public-workbench', layer: '#c3-editor-components', properties: '#c3-part-properties',
    save: '#c3-save', open: '#c3-open-input', circuitPath: 'project.circuit' },
  { id: 'stm32', option: 'board.stm32f429zi-nucleo144-v1', global: '__STM32_PUBLIC_WORKBENCH__',
    root: '#stm32-public-workbench', layer: '#stm32-editor-components', properties: '#stm32-part-properties',
    save: '#stm32-save', open: '#stm32-open-input', circuitPath: 'project.circuit' },
];

async function snapshot(page, profile) {
  return page.evaluate((item) => {
    const state = window[item.global].state();
    const circuit = item.circuitPath === 'circuit' ? state.circuit : state.project.circuit;
    return {
      source: item.circuitPath === 'circuit' ? state.source : state.project.source,
      components: circuit.components, nets: circuit.nets, positions: circuit.layout.positions,
      wireStyles: circuit.layout.wireStyles, wireRoutes: circuit.layout.wireRoutes,
      appearance: circuit.layout.componentAppearance, artifact: state.artifact,
      runtime: state.runtime, runnable: state.runnable, phase: state.phase,
      modelLibrary: state.modelLibrary, workers: window.__X55_WORKERS__,
    };
  }, profile);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true,
    serviceWorkers: 'block' });
  await context.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__X55_WORKERS__ = 0;
    window.Worker = class extends NativeWorker {
      constructor(...args) { window.__X55_WORKERS__ += 1; super(...args); }
    };
  });
  const page = await context.newPage();
  const producerRequests = [];
  page.on('request', (request) => {
    if (/\/(?:api|compile|run|scenario)(?:\/|$)/u.test(new URL(request.url()).pathname)) {
      producerRequests.push({ method: request.method(), url: request.url() });
    }
  });
  try {
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true);
    const report = [];
    for (const profile of profiles) {
      await page.selectOption('#board-select', profile.option);
      await page.waitForFunction(({ global, root }) => window[global]?.state().active === true
        && !document.querySelector(root).hidden, profile);
      const card = page.locator(`${profile.layer} [data-component-id="resistor-1"]`);
      await card.click();
      await page.click('#toggle-inspector');
      await page.waitForSelector('#workbench-inspector-dialog[open]');
      const select = page.locator(`${profile.properties} [data-bounded-appearance="resistor-1"]`);
      const apply = page.locator(`${profile.properties} [data-bounded-appearance-apply="resistor-1"]`);
      await select.waitFor({ state: 'visible' });
      const before = await snapshot(page, profile);
      assert.equal(before.workers, 0, `${profile.id}: worker existed before visual edit`);
      await select.selectOption('cool-blue');
      assert.equal(await apply.isEnabled(), true, `${profile.id}: visual Apply unavailable`);
      await apply.click();
      await page.waitForFunction(({ global }) => window[global].state().circuitEditor.draft.layout
        .componentAppearance.components['resistor-1']?.preset === 'cool-blue', profile);
      const after = await snapshot(page, profile);
      for (const key of ['source', 'components', 'nets', 'positions', 'wireStyles', 'wireRoutes',
        'artifact', 'runtime', 'runnable', 'phase', 'modelLibrary']) {
        assert.deepEqual(after[key], before[key], `${profile.id}: ${key} changed`);
      }
      assert.deepEqual(after.appearance.components['resistor-1'], { preset: 'cool-blue' });
      assert.equal(after.workers, 0, `${profile.id}: visual edit created a worker`);
      assert.equal(await card.locator('.resistor-body.appearance-cool-blue').count(), 1,
        `${profile.id}: canvas did not render selected body`);

      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#workbench-inspector-dialog').open);
      await page.click('#project-files-open');
      await page.waitForSelector('#workbench-project-dialog[open]');
      const [download] = await Promise.all([page.waitForEvent('download'), page.click(profile.save)]);
      const savedPath = await download.path();
      assert(savedPath && fs.statSync(savedPath).size > 0, `${profile.id}: Save did not produce a file`);
      await page.keyboard.press('Escape');
      await card.click();
      await page.click('#toggle-inspector');
      await page.waitForSelector('#workbench-inspector-dialog[open]');
      await select.selectOption('standard-beige'); await apply.click();
      await page.keyboard.press('Escape');
      await page.click('#project-files-open');
      await page.waitForSelector('#workbench-project-dialog[open]');
      await page.setInputFiles(profile.open, savedPath);
      if (await page.locator('#unsaved-change-dialog').isVisible()) await page.click('#unsaved-discard');
      await page.waitForFunction(({ global }) => window[global].state().circuitEditor.draft.layout
        .componentAppearance.components['resistor-1']?.preset === 'cool-blue', profile);
      assert.equal(await card.locator('.resistor-body.appearance-cool-blue').count(), 1,
        `${profile.id}: Save/Open lost the body preset`);
      if (await page.locator('#workbench-project-dialog').getAttribute('open') !== null) await page.keyboard.press('Escape');
      await page.locator('#top-workbench-shell').screenshot({ path: path.join(output, `${profile.id}-cool-blue.png`) });
      report.push({ profile: profile.option, preset: 'cool-blue', electricalInvariant: 'equal',
        runtimeInvariant: 'equal', saveOpen: 'pass', workerCreations: 0 });
    }
    assert.deepEqual(producerRequests, []);
    fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify({ result: 'pass', profiles: report,
      firmwareBuilds: 0, runtimeRuns: 0, scenarios: 0, producerRequests }, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ result: 'pass', profiles: report.length,
      firmwareBuilds: 0, runtimeRuns: 0, scenarios: 0 })}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
