// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium } = require(path.join(moduleRoot, 'playwright'));

const base = process.env.CONTROL_PERSISTENCE_URL || 'http://127.0.0.1:18784';
const outputDirectory = process.env.CONTROL_PERSISTENCE_OUTPUT || '/tmp/control-persistence-browser';
const screenshotPath = process.env.CONTROL_PERSISTENCE_SCREENSHOT || null;
const requirementFilter = new Set((process.env.CONTROL_PERSISTENCE_REQUIREMENTS || '')
  .split(',').map((value) => value.trim()).filter(Boolean));

const cases = [
  {
    starter: 'button', component: 'button-1', key: 'pressed', value: true,
    mutate: async (page) => page.click('[data-control="button-1.pressed"]'),
    display: async (page) => assert.equal(await page.getAttribute('[data-control="button-1.pressed"]', 'aria-pressed'), 'true'),
    serial: 'PRESSED', invalid: 'yes',
  },
  {
    starter: 'adc', component: 'pot-1', key: 'position', value: 0.8,
    mutate: async (page) => page.locator('[data-control="pot-1.position"]').fill('80'),
    display: async (page) => assert.equal(await page.inputValue('[data-control="pot-1.position"]'), '80'),
    serial: '819', invalid: 2, artworkSelector: '[data-artwork-key="potentiometer-rotary"] .pot-index', requirementId: 'CMP-002',
  },
  {
    starter: 'avr-toggle-input', component: 'toggle-switch-1', key: 'closed', value: true,
    mutate: async (page) => page.click('[data-control="toggle-switch-1.closed"]'),
    display: async (page) => assert.equal(await page.textContent('[data-control="toggle-switch-1.closed"]'), 'Closed'),
    serial: 'TOGGLE CLOSED', invalid: 'yes', artworkSelector: '[data-artwork-key="switch-toggle-spst"] [data-toggle-lever]', requirementId: 'CMP-022',
  },
  {
    starter: 'avr-spdt-selector', component: 'selector-1', key: 'selectedThrow', value: 'B',
    mutate: async (page) => page.click('[data-control="selector-1.selectedThrow"]'),
    display: async (page) => assert.equal(await page.textContent('[data-control="selector-1.selectedThrow"]'), 'Throw B'),
    serial: 'THROW B HIGH', invalid: 'C',
  },
  {
    starter: 'avr-light-analogue', component: 'light-sensor-1', key: 'lightLevel', value: 0.8,
    mutate: async (page) => page.locator('[data-control="light-sensor-1.lightLevel"]').fill('80'),
    display: async (page) => assert.equal(await page.inputValue('[data-control="light-sensor-1.lightLevel"]'), '80'),
    serial: '819', invalid: 2,
  },
  {
    starter: 'temperature-lcd-threshold', component: 'temperature-sensor-1', key: 'temperatureC', value: 100,
    mutate: async (page) => page.locator('[data-control="temperature-sensor-1.temperatureC"]').fill('100'),
    display: async (page) => assert.equal(await page.inputValue('[data-control="temperature-sensor-1.temperatureC"]'), '100'),
    serial: 'TEMP_C=100 STATE=HOT', invalid: 151,
  },
  {
    starter: 'avr-light-threshold', component: 'light-threshold-1', key: 'lightLevelPercent', value: 50,
    mutate: async (page) => page.locator('[data-control="light-threshold-1.lightLevelPercent"]').fill('50'),
    display: async (page) => {
      assert.equal(await page.inputValue('[data-control="light-threshold-1.lightLevelPercent"]'), '50');
      assert.equal(await page.getAttribute('[data-artwork-key="sensor-light-threshold-digital"]', 'data-output-level'), 'LOW');
    },
    serial: 'DARK', invalid: 101, invalidKey: 'lightLevelPercent',
  },
  {
    starter: 'avr-rotary-encoder', component: 'encoder-1', key: 'detent', value: 1,
    mutate: async (page) => page.click('[data-control="encoder-1.cw"]'),
    display: async (page) => assert.match(await page.textContent('.encoder-runtime-control'), /detent 1/u),
    serial: null, invalid: 1000, artworkSelector: '[data-renderer="input-rotary-encoder-quadrature"] [data-encoder-marker]', requirementId: 'CMP-132',
  },
];
const selectedCases = requirementFilter.size
  ? cases.filter(({ requirementId }) => requirementFilter.has(requirementId))
  : cases;

function candidateCircuit(project) {
  return project.candidateCircuit ?? project.circuit;
}

function component(project, id) {
  return candidateCircuit(project).components.find((item) => item.id === id);
}

async function loadStarter(page, entry) {
  if (!(await page.locator('#example-picker-dialog').evaluate((node) => node.open))) {
    if (!(await page.locator('#beginner-examples').isVisible())) {
      await page.click('#workbench-view-simple');
      await page.waitForFunction(() => document.querySelector('#workbench-view-simple').getAttribute('aria-pressed') === 'true');
    }
    await page.click('#beginner-examples');
    await page.waitForSelector('#example-picker-dialog[open]');
  }
  await page.click(`.starter-card[data-example="${entry.starter}"] .starter-action`);
  await page.waitForFunction((id) => document.querySelector('#example-select').value === id
    || document.querySelector('#unsaved-change-dialog').open, entry.starter);
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
    await page.click('#unsaved-discard');
  }
  await page.waitForFunction(([id, componentId]) => document.querySelector('#example-select').value === id
    && (window.__M6_PROJECT__().candidateCircuit ?? window.__M6_PROJECT__().circuit)
      .components.some((item) => item.id === componentId), [entry.starter, entry.component]);
}

async function downloadProject(page, id) {
  await page.click('#project-files-open');
  await page.waitForSelector('#workbench-project-dialog[open]');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#project-save'),
  ]);
  await page.click('#workbench-project-dialog .workbench-popup-close');
  const target = path.join(outputDirectory, `${id}.intent-mcu.json`);
  await download.saveAs(target);
  return { path: target, envelope: JSON.parse(fs.readFileSync(target, 'utf8')) };
}

async function openPayload(page, payload) {
  if (!(await page.locator('#workbench-project-dialog').evaluate((node) => node.open))) {
    await page.click('#project-files-open');
    await page.waitForSelector('#workbench-project-dialog[open]');
  }
  await page.setInputFiles('#project-open-input', payload);
  await page.waitForTimeout(100);
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
    await page.click('#unsaved-discard');
  }
  if (await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) {
    await page.click('#workbench-project-dialog .workbench-popup-close');
  }
}

async function buildRun(page) {
  await page.click('#quick-build');
  await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 45_000 });
  await page.waitForFunction(() => !document.querySelector('#quick-run').disabled, null, { timeout: 10_000 });
  await page.click('#quick-run');
  await page.waitForFunction(() => document.querySelector('#worker-state').textContent.includes('Running'), null, { timeout: 15_000 });
}

async function openInstruments(page) {
  if (!(await page.locator('#workbench-instruments-dialog').evaluate((node) => node.open))) {
    await page.click('#instruments-open');
    await page.waitForSelector('#workbench-instruments-dialog[open]');
  }
}

let browser;
(async () => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1536, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = []; const outside = []; const builds = []; const failedResponses = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) outside.push(request.url());
    if (request.method() === 'POST' && url.pathname === '/api/build') builds.push(request.postDataBuffer()?.length ?? 0);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });
  await page.route('**/api/page-views', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"status":"disabled"}',
  }));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);

  const results = [];
  for (const [index, entry] of selectedCases.entries()) {
    await loadStarter(page, entry);
    await page.click('#workbench-view-advanced');
    if (!(await page.locator('.canvas-view-tools').evaluate((node) => node.open))) {
      await page.click('.canvas-view-tools > summary');
    }
    await page.click('#canvas-interact-mode');
    await page.waitForFunction(() => document.querySelector('#circuit-canvas').dataset.mode === 'interact');
    if (entry.artworkSelector) assert.equal(await page.locator(
      `[data-component-id="${entry.component}"] ${entry.artworkSelector}`,
    ).count(), 1, `${entry.requirementId}: recognizable artwork identity missing`);
    await openInstruments(page);
    await entry.mutate(page);
    await page.waitForFunction(({ componentId, key, value }) => {
      const project = window.__M6_PROJECT__();
      const item = (project.candidateCircuit ?? project.circuit).components.find((part) => part.id === componentId);
      return item?.controls?.[key] === value;
    }, { componentId: entry.component, key: entry.key, value: entry.value });
    await page.click('#workbench-instruments-dialog .workbench-popup-close');

    const downloaded = await downloadProject(page, entry.starter);
    assert.equal(component(downloaded.envelope.project, entry.component).controls[entry.key], entry.value);
    await openPayload(page, downloaded.path);
    await page.waitForFunction(({ componentId, key, value }) => {
      const project = window.__M6_PROJECT__();
      const item = (project.candidateCircuit ?? project.circuit).components.find((part) => part.id === componentId);
      return item?.controls?.[key] === value
        && document.querySelector('#project-message').textContent.includes('fresh Build is required');
    }, { componentId: entry.component, key: entry.key, value: entry.value });
    assert.deepEqual(await page.evaluate(() => window.__M6_PROJECT__()), downloaded.envelope.project);
    assert.equal(await page.locator('#run').isDisabled(), true, `${entry.starter}: Run enabled after Open`);
    assert.equal(await page.locator('#undo').isDisabled(), true, `${entry.starter}: history restored`);
    assert.doesNotMatch(await page.textContent('#worker-state'), /Running/u, `${entry.starter}: runtime replayed`);
    await openInstruments(page);
    await entry.display(page);
    await page.click('#workbench-instruments-dialog .workbench-popup-close');

    const beforeReject = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    const invalid = structuredClone(downloaded.envelope);
    component(invalid.project, entry.component).controls[entry.invalidKey ?? entry.key] = entry.invalid;
    await openPayload(page, {
      name: `${entry.starter}-invalid.intent-mcu.json`, mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(invalid)),
    });
    await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('Open rejected'));
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), beforeReject,
      `${entry.starter}: invalid Open changed project`);
    assert.equal(await page.locator('#run').isDisabled(), true, `${entry.starter}: invalid Open granted Run`);

    if (!requirementFilter.size && index === 6) await page.waitForTimeout(61_000);
    await buildRun(page);
    if (entry.starter === 'avr-rotary-encoder') {
      assert.equal(await page.evaluate(() => window.__M6_STATE__.runtime.eventLog.log.length), 0,
        'reopened encoder replayed prior phase events');
      await openInstruments(page);
      await page.click('[data-control="encoder-1.cw"]');
      await page.waitForFunction(() => window.__M6_STATE__.runtime.eventLog.log.length === 4);
      await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('01\n00\n10\n11'));
      await page.click('#workbench-instruments-dialog .workbench-popup-close');
    } else {
      await page.waitForFunction((expected) => document.querySelector('#serial-output').textContent.includes(expected), entry.serial, { timeout: 20_000 });
    }
    results.push({ starter: entry.starter, requirementId: entry.requirementId ?? null,
      recognizableArtwork: Boolean(entry.artworkSelector), value: entry.value,
      freshBuildRun: true, invalidAtomic: true });
  }

  const narrow = await page.evaluate(() => [
    'board.rp2040-pico-v1', 'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1',
  ].map((profile) => {
    const envelope = JSON.parse(window.__COMMON_PROJECT_FILES__.current(profile));
    return {
      profile,
      controls: envelope.project.circuit.components.flatMap((item) => Object.keys(item.controls)),
    };
  }));
  assert.equal(narrow.length, 3);
  assert(narrow.every((profile) => profile.controls.length === 0), JSON.stringify(narrow));
  assert.equal(builds.length, selectedCases.length);
  assert(builds.every((bytes) => bytes > 0));
  assert.equal(outside.length, 0, JSON.stringify(outside));
  assert.equal(failedResponses.length, 0, JSON.stringify(failedResponses));
  assert.equal(errors.length, 0, JSON.stringify({ errors, failedResponses }));
  assert((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(JSON.stringify({ ok: true, files: selectedCases.length, atomicNegatives: selectedCases.length,
    freshBuildRuns: selectedCases.length,
    controlsEmptyNarrowProfiles: narrow.length, outsideRequests: 0, results }));
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); });
