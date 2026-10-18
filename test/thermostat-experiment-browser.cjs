// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');
const strictAssert = require('node:assert/strict');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium, firefox, webkit } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.THERMOSTAT_UI_URL || 'http://127.0.0.1:18767';
const browserName = process.env.THERMOSTAT_UI_BROWSER || 'chromium';
const screenshotPath = process.env.THERMOSTAT_UI_SCREENSHOT || null;
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unsupported browser: ${browserName}`);

function assert(condition, message) { if (!condition) throw new Error(message); }
function distance(left, right) { return Math.hypot(left.x - right.x, left.y - right.y); }

async function assertAttachments(page, endpoints) {
  for (const endpoint of endpoints) {
    const measured = await page.evaluate((endpointName) => {
      const anchor = document.querySelector(`.pin-anchor[data-endpoint="${endpointName}"]`);
      const route = document.querySelector(`.circuit-wire[data-endpoint="${endpointName}"]`);
      const split = endpointName.lastIndexOf('.');
      const componentId = endpointName.slice(0, split); const pinId = endpointName.slice(split + 1);
      const terminal = document.querySelector(`[data-component-id="${componentId}"] [data-terminal-pin="${pinId}"]`);
      if (!anchor || !route || !terminal) return null;
      const point = route.getPointAtLength(0);
      const screen = new DOMPoint(point.x, point.y).matrixTransform(route.getScreenCTM());
      const centre = (box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
      return { route: { x: screen.x, y: screen.y }, anchor: centre(anchor.getBoundingClientRect()), terminal: centre(terminal.getBoundingClientRect()) };
    }, endpoint);
    assert(measured, `missing visible thermostat cable endpoint ${endpoint}`);
    assert(distance(measured.route, measured.anchor) <= 0.6, `${endpoint} cable misses its DOM pin`);
    assert(distance(measured.route, measured.terminal) <= 0.6, `${endpoint} cable misses its visible terminal`);
  }
}

async function build(page) {
  await page.click('#build');
  await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded', null, { timeout: 40_000 });
  await page.waitForFunction(() => !document.querySelector('#thermostat-run-tests').disabled, null, { timeout: 10_000 });
}

async function runScenarios(page) {
  await page.click('#thermostat-run-tests');
  await page.waitForFunction(() => {
    const experiment = window.__M6_STATE__.thermostatExperiment;
    return experiment && !experiment.running && experiment.results.length === 3;
  }, null, { timeout: 30_000 });
  return page.evaluate(() => structuredClone(window.__M6_STATE__.thermostatExperiment));
}

let browser;
(async () => {
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  await context.addInitScript(() => {
    window.__THERMOSTAT_FILE_TEXT__ = '';
    window.__THERMOSTAT_FILE_HANDLE__ = {
      name: 'thermostat-boundary.intent-mcu.json',
      async createWritable() {
        return { async write(blob) { window.__THERMOSTAT_FILE_TEXT__ = await blob.text(); }, async close() {} };
      },
      async getFile() { return new File([window.__THERMOSTAT_FILE_TEXT__], this.name, { type: 'application/json' }); },
    };
    window.showSaveFilePicker = async () => window.__THERMOSTAT_FILE_HANDLE__;
    window.showOpenFilePicker = async () => [window.__THERMOSTAT_FILE_HANDLE__];
  });
  const page = await context.newPage();
  const errors = []; const outside = []; const mutationRequests = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) outside.push(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      mutationRequests.push({ method: request.method(), path: url.pathname, bytes: request.postDataBuffer()?.length ?? 0 });
    }
  });

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  await page.click('.starter-card[data-example="avr-thermostat-boundary-v1"]');
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.active === true);
  const loaded = await page.evaluate(() => {
    const saved = window.__M6_PROJECT__();
    return {
      name: saved.project.metadata.name,
      components: saved.candidateCircuit.components.map((item) => [item.id, item.type]),
      nets: saved.candidateCircuit.nets.map((net) => ({ id: net.id, endpoints: net.endpoints.map((item) => `${item.component}.${item.pin}`) })),
      testDisabled: document.querySelector('#thermostat-run-tests').disabled,
    };
  });
  assert(loaded.name === 'Thermostat boundary test', 'thermostat starter identity changed');
  assert(loaded.components.length === 5 && loaded.nets.length === 6, `unexpected thermostat graph ${JSON.stringify(loaded)}`);
  assert(loaded.testDisabled, 'experiment ran without a fresh compiler artifact');
  const endpoints = loaded.nets.flatMap((net) => net.endpoints);
  assert(endpoints.includes('board-1.A1') && endpoints.includes('board-1.D2') && endpoints.includes('board-1.D13'), 'exact A1/D2/D13 topology missing');
  assert(endpoints.includes('heater-resistor-1.A') && endpoints.includes('heater-resistor-1.B'), 'current-limiting resistor is not in the D13 LED path');
  await assertAttachments(page, endpoints);

  await build(page);
  const correctBuild = await page.evaluate(() => ({
    inputIdentity: window.__M6_STATE__.inputIdentity,
    artifactIdentity: window.__M6_STATE__.artifactIdentity,
  }));
  const correct = await runScenarios(page);
  assert(correct.variant === 'correct' && correct.results.every((result) => result.status === 'passed'), `correct firmware did not pass 3/3: ${JSON.stringify(correct)}`);
  assert(correct.results.every((result) => result.virtualMilliseconds >= 160 && result.virtualMilliseconds <= 350), 'verdict escaped the virtual-time window');
  assert(correct.results.every((result) => result.checks.primaryExecutedPin && result.checks.corroboratingSerial && result.checks.inputsComplete), 'a pass lacked executed evidence');

  const [savedDownload] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
  const savedText = fs.readFileSync(await savedDownload.path(), 'utf8');
  await page.evaluate((text) => { window.__THERMOSTAT_FILE_TEXT__ = text; }, savedText);
  const saved = JSON.parse(savedText);
  assert(saved.schema === 'intent-mcu-project-envelope@3'
    && saved.profile === 'board.atmega328p-16mhz-v1'
    && saved.project.schema === 'intent-mcu-project-contact-persistence@1', 'save was not the canonical data-only common envelope');
  assert(saved.project.project.artifact.status === 'dirty'
    && saved.project.project.artifact.inputIdentitySha256 === null
    && saved.project.project.artifact.artifactIdentitySha256 === null,
  'save retained a runnable project artifact');
  assert(!/(firmwareHex|runtimeBinding|thermostatExperimentResults|"hex"\s*:|"elf"\s*:|"uf2"\s*:)/u.test(savedText), 'save retained executable bytes or runtime-result state');
  assert(saved.project.compiledFixture.id === 'button-pullup', 'legacy candidate compatibility reference unexpectedly changed');
  await page.click('#project-new');
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
  await page.click('#project-open');
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.active === true);
  assert(await page.evaluate(() => window.__M6_PROJECT__
    && JSON.stringify(window.__M6_PROJECT__()) === JSON.stringify(JSON.parse(window.__THERMOSTAT_FILE_TEXT__).project)), 'Open did not restore exact authored thermostat data');
  assert(await page.isDisabled('#thermostat-run-tests'), 'Open reused a stale executable instead of requiring Build');
  await assertAttachments(page, endpoints);

  await build(page);
  const reopened = await runScenarios(page);
  assert(reopened.results.every((result) => result.status === 'passed'), 'fresh Build after Open did not pass 3/3');

  await page.evaluate((legacy) => { window.__THERMOSTAT_FILE_TEXT__ = JSON.stringify(legacy); }, saved.project);
  await page.click('#project-open');
  await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('migrated in memory'));
  const legacyMigration = await page.evaluate(() => ({
    project: window.__M6_PROJECT__(), artifact: window.__M6_STATE__.artifactIdentity,
    results: window.__M6_STATE__.thermostatExperiment?.results ?? [],
    fileState: window.__COMMON_PROJECT_FILE_STATE__,
  }));
  strictAssert.deepEqual(legacyMigration.project, saved.project, 'legacy contact migration changed authored data or compiledFixture reference');
  strictAssert.equal(legacyMigration.artifact, null, 'legacy contact migration restored executable authority');
  strictAssert.deepEqual(legacyMigration.results, [], 'legacy contact migration restored experiment verdicts');
  strictAssert.equal(legacyMigration.fileState.report.legacy, true, 'legacy contact migration was not reported');

  await page.click('#thermostat-load-bad');
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.variant === 'known-bad-equality');
  assert(await page.isDisabled('#thermostat-run-tests'), 'known-bad source reused the prior artifact');
  await build(page);
  const knownBadBuild = await page.evaluate(() => ({
    inputIdentity: window.__M6_STATE__.inputIdentity,
    artifactIdentity: window.__M6_STATE__.artifactIdentity,
  }));
  assert(correctBuild.inputIdentity !== knownBadBuild.inputIdentity
    && correctBuild.artifactIdentity !== knownBadBuild.artifactIdentity,
  'fresh correct and known-bad source did not produce distinct source-bound build identities');
  const knownBad = await runScenarios(page);
  const equality = knownBad.results.find((result) => result.scenarioId === 'THERM-SCENARIO-EQUALITY-ENABLED');
  assert(knownBad.knownBadCaught, `known-bad boundary defect was not caught: ${JSON.stringify(knownBad)}`);
  assert(equality.status === 'failed' && equality.observed.d13 === true
    && !equality.checks.primaryExecutedPin && !equality.checks.corroboratingSerial,
  `known-bad equality evidence was not an executed D13/UART failure: ${JSON.stringify(equality)}`);
  assert(knownBad.results.filter((result) => result.status === 'passed').length === 2, 'known-bad control scenarios did not stay green');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    panelVisible: Boolean(document.querySelector('#thermostat-experiment')?.getClientRects().length),
    state: document.querySelector('#thermostat-experiment-state')?.textContent,
  }));
  assert(mobile.overflow <= 1 && mobile.panelVisible && mobile.state === 'Known-bad caught', `mobile experiment layout failed: ${JSON.stringify(mobile)}`);
  if (screenshotPath) {
    await page.setViewportSize({ width: 1440, height: 1100 });
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }

  await page.click('#thermostat-run-tests');
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.running === true);
  await page.evaluate(() => {
    const source = document.querySelector('#source');
    source.value += '\n// deliberate edit cancels the active experiment\n';
    source.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.running === false);
  const cancelled = await page.evaluate(() => structuredClone(window.__M6_STATE__.thermostatExperiment));
  assert(cancelled.results.length === 0 && !cancelled.freshBuildReady && cancelled.variant === 'modified',
    `source edit did not retire the active experiment: ${JSON.stringify(cancelled)}`);
  await page.selectOption('#board-select', 'board.rp2040-pico-v1');
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.active === false);
  await page.selectOption('#board-select', 'board.atmega328p-16mhz-v1');
  await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.active === true
    && window.__M6_STATE__.thermostatExperiment.freshBuildReady === false);

  assert(errors.length === 0, `browser errors: ${JSON.stringify(errors)}`);
  assert(outside.length === 0, `third-party browser requests: ${JSON.stringify(outside)}`);
  const compilerRequests = mutationRequests.filter((request) => request.method === 'POST' && request.path === '/api/build');
  assert(compilerRequests.length === 3 && mutationRequests.length === 3, `unexpected network mutations: ${JSON.stringify(mutationRequests)}`);
  assert((await context.cookies()).length === 0, 'thermostat experiment set a cookie');
  console.log(JSON.stringify({
    browser: browserName,
    result: 'pass',
    graph: { components: loaded.components.length, nets: loaded.nets.length, endpoints: endpoints.length },
    correct: correct.results.map((item) => ({ scenario: item.scenarioId, status: item.status, milliseconds: item.virtualMilliseconds, d13: item.observed.d13 })),
    saveOpenFreshBuild: true,
    reopenedPasses: reopened.results.length,
    knownBadCaught: knownBad.knownBadCaught,
    knownBadEquality: { status: equality.status, d13: equality.observed.d13 },
    sourceBoundArtifactsDistinct: correctBuild.inputIdentity !== knownBadBuild.inputIdentity
      && correctBuild.artifactIdentity !== knownBadBuild.artifactIdentity,
    activeRunCancelledBySourceEdit: true,
    profileChangeKeptArtifactRetired: true,
    compilerRequests: compilerRequests.length,
    outsideRequests: outside.length,
    cookies: 0,
    mobileOverflow: mobile.overflow,
  }));
  await context.close();
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
