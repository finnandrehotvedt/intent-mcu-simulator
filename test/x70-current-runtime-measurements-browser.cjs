// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const {
  ACTIVE_EXPORT_REJECTION_STATUS, POSITIVE_EXPORT_STATUS, armExactText,
  boundedBrowserCleanup, boundedPageCapture, clickAndWaitExact, emergencyPauseStop,
  hardDeadline, installPicoDriverInstrumentation, observeDownloads,
  observeSustainedPico, pausePicoWithObservation,
} = require('./x70-native-driver-safeguards.cjs');

const base = process.env.X70_CURRENT_URL || 'http://127.0.0.1:18872';
const evidenceDir = process.env.X70_CURRENT_EVIDENCE || '/evidence';
const skipAvr = process.env.X70_SKIP_AVR === '1';
const zeroProducerFailureFixture = process.env.X70_ZERO_PRODUCER_FAILURE_FIXTURE === '1';
const parsedFailureHoldMs = Number.parseInt(process.env.X70_FAILURE_HOLD_MS ?? '0', 10);
const failureHoldMs = Number.isSafeInteger(parsedFailureHoldMs)
  ? Math.max(0, Math.min(parsedFailureHoldMs, 30 * 60 * 1000)) : 0;
const parsedFailureCdpPort = Number.parseInt(process.env.X70_FAILURE_CDP_PORT ?? '0', 10);
const failureCdpPort = Number.isSafeInteger(parsedFailureCdpPort)
  && parsedFailureCdpPort >= 1024 && parsedFailureCdpPort <= 65535 ? parsedFailureCdpPort : 0;
const failureActionPath = process.env.X70_FAILURE_ACTION
  || path.join(evidenceDir, 'failure-action.json');
const failureHoldPath = path.join(evidenceDir, 'failure-hold.json');
const onlyProfiles = new Set((process.env.X70_ONLY || '').split(',').map((value) => value.trim()).filter(Boolean));
const profiles = [
  { id: 'board.atmega328p-16mhz-v1', slug: 'avr', build: '#quick-build', run: '#quick-run',
    pause: '#quick-pause', save: '#project-save', open: '#project-open-input',
    state: '__M6_STATE__', built: 'succeeded', complete: 'paused', timeout: 45_000 },
  { id: 'board.rp2040-pico-v1', slug: 'pico', build: '#quick-build', run: '#quick-run',
    pause: '#quick-pause', save: '#pico-save', open: '#pico-open-input',
    state: '__RP2040_PUBLIC_STATE__', built: 'built', complete: 'paused', timeout: 45_000 },
  { id: 'board.esp32-c3-devmodule-v1', slug: 'c3', build: '#quick-build', run: '#quick-run',
    save: '#c3-save', open: '#c3-open-input', state: '__ESP32C3_PUBLIC_STATE__',
    built: 'built', complete: 'complete', timeout: 190_000 },
  { id: 'board.stm32f429zi-nucleo144-v1', slug: 'stm32', build: '#quick-build', run: '#quick-run',
    save: '#stm32-save', open: '#stm32-open-input', state: '__STM32_PUBLIC_STATE__',
    built: 'built', complete: 'completed', timeout: 190_000 },
];
const journeyProfiles = onlyProfiles.size
  ? profiles.filter(({ slug }) => onlyProfiles.has(slug))
  : skipAvr ? profiles.filter(({ slug }) => slug !== 'avr') : profiles;
const visuals = Object.freeze({
  avr: '#circuit-canvas', pico: '#pico-diagram', c3: '#c3-diagram', stm32: '#stm32-diagram',
});
const storage = () => ({
  local: Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])),
  session: Object.fromEntries(Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)])),
});
const sha256 = (source) => crypto.createHash('sha256').update(source).digest('hex');
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function writeJson(target, value) {
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function holdFailedPage(stage, error) {
  if (failureHoldMs === 0) return { status: 'disabled' };
  assert(failureCdpPort > 0, 'X70_FAILURE_CDP_PORT is required when failure hold is enabled');
  const token = crypto.randomUUID();
  const startedAt = new Date();
  const deadline = Date.now() + failureHoldMs;
  const record = {
    schema: 'intent-mcu-x70-failure-hold@1', status: 'held', token, stage,
    error: { message: error.message, stack: error.stack }, pid: process.pid,
    cdpEndpoint: `http://127.0.0.1:${failureCdpPort}`,
    actionPath: failureActionPath, startedAt: startedAt.toISOString(),
    expiresAt: new Date(deadline).toISOString(),
    allowedActions: ['release'],
  };
  writeJson(failureHoldPath, record);
  while (Date.now() < deadline) {
    try {
      const action = JSON.parse(fs.readFileSync(failureActionPath, 'utf8'));
      if (action?.schema === 'intent-mcu-x70-failure-action@1'
          && action.token === token && action.action === 'release') {
        const released = { ...record, status: 'released', releasedAt: new Date().toISOString() };
        writeJson(failureHoldPath, released);
        return released;
      }
    } catch { /* control file absent or incomplete; keep the bounded page alive */ }
    await delay(250);
  }
  const timedOut = { ...record, status: 'timed-out', timedOutAt: new Date().toISOString() };
  writeJson(failureHoldPath, timedOut);
  return timedOut;
}

async function assertZeroProducerFailureSurface(page) {
  const selectors = [
    '#board-select', '#quick-build', '#quick-run', '#quick-pause',
    '#accessible-svg-export', '#accessible-svg-status',
    '#project-open-input', '#pico-open-input', '#c3-open-input', '#stm32-open-input',
    '#workbench-project-dialog', '#unsaved-change-dialog',
  ];
  for (const selector of selectors) assert.equal(await page.locator(selector).count(), 1, `${selector} missing`);
  const profileChecks = [];
  for (const profile of [
    { id: 'board.atmega328p-16mhz-v1', status: 'ATmega328P · compile and tested virtual runtime.',
      build: 'Build', run: 'Run' },
    { id: 'board.rp2040-pico-v1', status: 'RP2040 Pico · bounded public C11 build + browser-worker GPIO0/UART0 runtime.',
      build: 'Build Pico', run: 'Run Pico' },
  ]) {
    await page.selectOption('#board-select', profile.id);
    await page.waitForFunction((id) => window.__SHARED_INSTRUMENT_SUMMARY__?.profile === id, profile.id);
    for (const selector of ['#quick-build', '#quick-run', '#quick-pause', '#accessible-svg-export']) {
      assert.equal(await page.locator(selector).isVisible(), true, `${profile.id} ${selector} hidden`);
    }
    assert.equal((await page.locator('#controller-status').textContent()).trim(), profile.status);
    assert.equal((await page.locator('#quick-build').textContent()).trim(), profile.build);
    assert.equal((await page.locator('#quick-run').textContent()).trim(), profile.run);
    assert.equal(await page.locator('#quick-build').isDisabled(), false);
    assert.equal(await page.locator('#quick-run').isDisabled(), true);
    assert.equal(await page.locator('#quick-pause').isDisabled(), true);
    assert.equal(await page.locator('#accessible-svg-export').isDisabled(), false);
    profileChecks.push({ profile: profile.id, status: profile.status, build: profile.build, run: profile.run,
      buildReady: true, runInitiallyDisabled: true, pauseInitiallyDisabled: true, exportEnabled: true });
  }
  assert.equal(await page.locator('#workbench-project-dialog').evaluate((node) => node.open), false);
  assert.equal(await page.locator('#unsaved-change-dialog').evaluate((node) => node.open), false);
  assert.equal(await page.evaluate(() => window.__M11_READY__ === true), true);
  return { selectors, profileChecks, dialogsClosed: true, builds: 0, runs: 0, scenarios: 0 };
}

function expectedSerial(channel, profile) {
  const allRecords = Array.isArray(channel.value?.records) ? channel.value.records : [];
  const records = allRecords.slice(-128);
  const text = typeof channel.value?.text === 'string' ? channel.value.text : allRecords
    .filter((record) => record.direction === 'tx')
    .map((record) => typeof record.text === 'string' ? record.text
      : Number.isInteger(record.value) && record.value >= 0 && record.value <= 255
        ? String.fromCodePoint(record.value) : '').join('');
  return profile.slug === 'c3'
    ? { text, records, displayed: records.length, bootEpochs: channel.value.bootEpochs }
    : { text, records, displayed: records.length };
}

function assertProjection(report, native, profile) {
  const measurements = report.measurements;
  assert.equal(measurements.status, 'current-runtime-measurements');
  assert.equal(measurements.profile, profile.id);
  assert.equal(measurements.artifactIdentity, native.artifactIdentity);
  assert.equal(measurements.revision, native.revision);
  assert.equal(measurements.provenance, native.provenance);
  assert.equal(measurements.authority, 'observation-only');
  assert.deepEqual(measurements.channels.map(({ id }) => id), ['serial', 'gpio', 'logic', 'input']);
  for (const projected of measurements.channels) {
    const channel = native.channels[projected.id];
    assert.equal(projected.classification, channel.classification, `${profile.slug}.${projected.id}.classification`);
    assert.equal(projected.provenance, channel.provenance, `${profile.slug}.${projected.id}.provenance`);
    assert.deepEqual(projected.time, channel.time, `${profile.slug}.${projected.id}.time`);
    assert.deepEqual(projected.retention, channel.retention, `${profile.slug}.${projected.id}.retention`);
    if (channel.classification === 'unavailable') {
      assert.equal(projected.value, null);
    } else if (projected.id === 'serial') {
      assert.deepEqual(projected.value, expectedSerial(channel, profile));
    } else if (projected.id === 'gpio') {
      assert.deepEqual(projected.value.pins, channel.value.pins);
      assert.equal(projected.value.selectedPin, channel.value.selectedPin);
      assert.deepEqual(projected.value.source, channel.value.source ?? null);
    } else if (projected.id === 'logic') {
      assert.deepEqual(projected.value.channels, channel.value.channels);
      assert.deepEqual(projected.value.transitions, channel.value.transitions.slice(-128));
      assert.equal(projected.value.displayed, projected.value.transitions.length);
    } else {
      assert.deepEqual(projected.value, channel.value);
    }
  }
  if (profile.slug === 'c3') {
    const gpio = measurements.channels.find(({ id }) => id === 'gpio');
    const logic = measurements.channels.find(({ id }) => id === 'logic');
    assert.equal(gpio.classification, 'project-model');
    assert.equal(logic.classification, 'project-model');
    assert.match(gpio.provenance, /not QEMU pin state|project-owned/iu);
    assert.match(logic.provenance, /not QEMU CPU GPIO|project-owned/iu);
    assert.equal(gpio.time.basis, 'adapter-epoch-sequence');
    assert.equal(logic.time.basis, 'adapter-epoch-sequence');
    assert.equal(gpio.retention.retained, logic.retention.retained);
    assert.notEqual(gpio.retention.retained, gpio.value.pins.length,
      'C3 retained adapter epochs were incorrectly presented as projected pin count');
  }
  if (profile.slug === 'stm32') {
    for (const id of ['gpio', 'logic']) {
      assert.equal(measurements.channels.find((channel) => channel.id === id).time.basis,
        'instruction-order-only');
    }
  }
}

async function assertGeometry(page, profile) {
  const cases = [];
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => scrollTo(0, 0));
    const geometry = await page.evaluate((selector) => {
      const stage = document.querySelector('#active-canvas-stage').getBoundingClientRect();
      const visual = document.querySelector(selector).getBoundingClientRect();
      const visible = (rect) => ({
        width: Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left)),
        height: Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top)),
      });
      return { stageTop: stage.top, stage: visible(stage), visual: visible(visual),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    }, visuals[profile.slug]);
    assert(geometry.stageTop <= 210, `${profile.slug}: stage top ${geometry.stageTop}`);
    assert(geometry.visual.width > 700, `${profile.slug}: visual width ${geometry.visual.width}`);
    assert(geometry.visual.height >= (viewport.height === 768 ? 430 : 540),
      `${profile.slug}: visual height ${geometry.visual.height}`);
    assert(geometry.overflow <= 1, `${profile.slug}: horizontal overflow ${geometry.overflow}`);
    cases.push({ viewport: `${viewport.width}x${viewport.height}`, ...geometry });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  return cases;
}

async function assertActiveRejected(page, profile, downloads) {
  const before = downloads.count();
  const button = page.locator('#accessible-svg-export');
  assert.equal(await button.isVisible(), true, `${profile.slug}: export hidden`);
  assert.equal(await button.isDisabled(), false, `${profile.slug}: export disabled`);
  const observed = await clickAndWaitExact({
    page, selector: '#accessible-svg-status', expected: ACTIVE_EXPORT_REJECTION_STATUS,
    click: () => button.click({ noWaitAfter: true }), timeoutMs: 10_000,
  });
  await page.waitForTimeout(250);
  assert.equal(downloads.count(), before, `${profile.slug}: active runtime created an export`);
  return { ...observed, downloadsBefore: before, downloadsAfter: downloads.count() };
}

async function downloadAndValidate(page, context, profile, downloads, setStage = () => {}) {
  setStage('export-click-download');
  const beforeStorage = await page.evaluate(storage);
  const exportButton = page.locator('#accessible-svg-export');
  assert.equal(await exportButton.isVisible(), true, `${profile.slug}: positive export hidden`);
  assert.equal(await exportButton.isDisabled(), false, `${profile.slug}: positive export disabled`);
  const beforeDownloads = downloads.count();
  const statusObserver = await armExactText(page, '#accessible-svg-status', POSITIVE_EXPORT_STATUS,
    { timeoutMs: 20_000 });
  let download;
  try {
    [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      exportButton.click({ noWaitAfter: true }),
      statusObserver.wait(),
    ]);
  } finally {
    await statusObserver.dispose();
  }
  assert.equal(downloads.count(), beforeDownloads + 1,
    `${profile.slug}: positive export download accounting`);
  const target = path.join(evidenceDir, `${profile.slug}.current-runtime.accessible-demonstration.svg`);
  await download.saveAs(target);
  setStage('export-status');
  const source = fs.readFileSync(target, 'utf8');
  setStage('app-validate');
  const result = await page.evaluate(async (svg) => window.__X70_ACCESSIBLE_DEMONSTRATION__.validate(svg), source);
  const native = await page.evaluate(() => structuredClone(window.__SHARED_INSTRUMENT_SUMMARY__));
  setStage('native-summary-match');
  assertProjection(result.report, native, profile);
  setStage('storage-unchanged');
  assert.deepEqual(await page.evaluate(storage), beforeStorage, `${profile.slug}: export changed browser storage`);

  setStage('standalone-open');
  const standalone = await context.newPage();
  await standalone.goto(`file://${target}`);
  setStage('standalone-semantics');
  assert.match(await standalone.locator('title').textContent(), /accessible circuit demonstration/iu);
  assert.match(await standalone.locator('desc').textContent(), /current (?:observation-only )?runtime measurements/iu);
  assert.equal(await standalone.locator('[data-kind="measurement-status"][data-id="current-runtime-measurements"]').count(), 1);
  assert.deepEqual(await standalone.locator('[data-kind="measurement-channel"]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-id'))), ['serial', 'gpio', 'logic', 'input']);
  assert.equal(await standalone.locator('script,foreignObject,image,a').count(), 0);
  if (profile.slug === 'avr') {
    setStage('standalone-screenshot');
    await standalone.screenshot({ path: path.join(evidenceDir, 'avr-current-runtime-standalone.png'),
      fullPage: true, timeout: 10_000 });
  }
  await standalone.close();
  return { source, report: result.report, native, sha256: sha256(source), bytes: Buffer.byteLength(source) };
}

async function reopenAuthoredProject(page, profile, setStage = () => {}) {
  setStage('project-save-download');
  if (!await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) {
    await page.locator('#project-files-open').click();
    await page.waitForSelector('#workbench-project-dialog[open]');
  }
  const saveButton = page.locator(profile.save);
  assert.equal(await saveButton.isVisible(), true, `${profile.slug}: project Save hidden`);
  assert.equal(await saveButton.isDisabled(), false, `${profile.slug}: project Save disabled`);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20_000 }),
    saveButton.click({ noWaitAfter: true }),
  ]);
  const target = path.join(evidenceDir, `${profile.slug}.saved-project.intent-mcu.json`);
  await download.saveAs(target);
  const source = fs.readFileSync(target, 'utf8');
  assert(source.length > 100, `${profile.slug}: saved project empty`);
  setStage('project-open');
  await page.setInputFiles(profile.open, {
    name: download.suggestedFilename(), mimeType: 'application/json', buffer: Buffer.from(source),
  });
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
  await page.waitForFunction(() => window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'no-current-runtime');
  const cleared = await page.evaluate(async () => ({
    summary: structuredClone(window.__SHARED_INSTRUMENT_SUMMARY__),
    report: (await window.__X70_ACCESSIBLE_DEMONSTRATION__.current()).report,
  }));
  assert.equal(cleared.summary.artifactIdentity, null);
  assert.equal(cleared.report.measurements.status, 'no-current-measurements');
  assert.equal(cleared.report.measurements.artifactIdentity, null);
}

(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: failureCdpPort
    ? [`--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${failureCdpPort}`] : [] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await installPicoDriverInstrumentation(context);
  const page = await context.newPage();
  const errors = []; const outside = []; const mutations = []; const workers = [];
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('worker', (worker) => workers.push(worker.url()));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['blob:', 'file:'].includes(url.protocol) && url.origin !== new URL(base).origin) outside.push(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
  });
  let stage = 'page-open';
  let builds = 0; let runs = 0;
  try {
    assert.equal((await page.goto(base, { waitUntil: 'networkidle' }))?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true && window.__X70_ACCESSIBLE_DEMONSTRATION__);
    if (zeroProducerFailureFixture) {
      stage = 'zero-producer-failure-fixture';
      const surface = await assertZeroProducerFailureSurface(page);
      writeJson(path.join(evidenceDir, 'zero-producer-surface.json'), surface);
      throw new Error('X70_ZERO_PRODUCER_FAILURE_FIXTURE');
    }
    if (journeyProfiles.some(({ slug }) => slug === 'avr')) {
      await page.click('#project-files-open');
      await page.waitForSelector('#workbench-project-dialog[open]');
      await page.click('#project-demo');
      await page.click('.starter-card[data-example="pwm-pulse"]');
      if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
      await page.waitForFunction(() => document.querySelector('#example-select').value === 'pwm-pulse');
    }

    const evidence = {};
    const geometry = {};
    const driverObservations = {};
    for (const profile of journeyProfiles) {
      const downloads = observeDownloads(page);
      const driver = { downloads: downloads.records };
      stage = `${profile.slug}:select`;
      await page.selectOption('#board-select', profile.id);
      await page.waitForFunction((id) => window.__SHARED_INSTRUMENT_SUMMARY__?.profile === id, profile.id);
      assert.equal(await page.locator(profile.build).isDisabled(), false, `${profile.slug}: Build disabled`);
      await page.click(profile.build); builds += 1;
      stage = `${profile.slug}:build`;
      await page.waitForFunction(({ name, phase }) => {
        const state = name === '__M6_STATE__' ? window[name]?.buildState : window[name]?.phase;
        return state === phase || ['failed', 'blocked', 'cancelled', 'timeout'].includes(state);
      }, { name: profile.state, phase: profile.built }, { timeout: profile.timeout });
      const buildPhase = await page.evaluate(({ name }) => name === '__M6_STATE__'
        ? window[name].buildState : window[name].phase, { name: profile.state });
      assert.equal(buildPhase, profile.built, `${profile.slug}: build ended ${buildPhase}`);
      await page.waitForFunction((selector) => !document.querySelector(selector)?.disabled,
        profile.run, { timeout: 20_000 });
      assert.equal(await page.locator(profile.run).isDisabled(), false, `${profile.slug}: Run disabled after Build`);
      await page.click(profile.run); runs += 1;
      stage = `${profile.slug}:run`;
      await page.waitForFunction(({ name, phase, slug }) => {
        const source = window[name];
        const state = name === '__M6_STATE__' ? (source?.runtime?.paused ? 'paused' : 'running') : source?.phase;
        if (['failed', 'blocked', 'cancelled', 'timeout'].includes(state)) return true;
        if (slug === 'avr') return state === 'running' && source?.runtime?.paused === false
          && window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'current-runtime';
        if (slug === 'pico') return state === 'running' && source?.runtime?.paused === false
          && window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'current-runtime';
        return state === phase;
      }, { name: profile.state, phase: profile.complete, slug: profile.slug },
      { timeout: profile.slug === 'stm32' ? 120_000 : 70_000 });
      const runtimePhase = await page.evaluate(({ name }) => name === '__M6_STATE__'
        ? (window[name]?.runtime?.paused ? 'paused' : 'running') : window[name]?.phase, { name: profile.state });
      assert(!['failed', 'blocked', 'cancelled', 'timeout'].includes(runtimePhase),
        `${profile.slug}: runtime ended ${runtimePhase}`);
      await page.waitForFunction(() => window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'current-runtime', null,
        { timeout: profile.slug === 'stm32' ? 120_000 : 30_000 });
      if (profile.slug === 'pico') {
        await page.waitForFunction(() => /Pico runtime started/u.test(
          document.querySelector('#pico-message')?.textContent ?? '')
          && !document.querySelector('#quick-pause')?.disabled, null, { timeout: 20_000 });
      }
      if (profile.slug === 'avr') {
        await page.waitForFunction(() => /Running/u.test(
          document.querySelector('#worker-state')?.textContent ?? '')
          && !document.querySelector('#quick-pause')?.disabled, null, { timeout: 20_000 });
      }
      if (profile.slug === 'pico') {
        stage = `${profile.slug}:sustained-responsiveness`;
        driver.sustained = await observeSustainedPico(page);
      }
      if (profile.pause) {
        stage = `${profile.slug}:active-export-rejection`;
        driver.activeExportRejection = await assertActiveRejected(page, profile, downloads);
        stage = `${profile.slug}:pause`;
        if (profile.slug === 'pico') {
          driver.pause = await pausePicoWithObservation(page,
            () => page.click(profile.pause), { timeoutMs: 2_000,
              priorObservation: driver.sustained.last });
        } else {
          await page.click(profile.pause);
          await page.waitForFunction(({ name }) => name === '__M6_STATE__'
            ? window[name]?.runtime?.paused === true && window[name]?.lifecycle?.phase === 'paused'
            : window[name]?.phase === 'paused' && window[name]?.runtime?.paused === true,
          { name: profile.state }, { timeout: 20_000 });
        }
      }
      stage = `${profile.slug}:geometry`;
      geometry[profile.slug] = await assertGeometry(page, profile);
      stage = `${profile.slug}:download-and-validate`;
      evidence[profile.slug] = await downloadAndValidate(page, context, profile, downloads,
        (substage) => { stage = `${profile.slug}:download-and-validate:${substage}`; });
      downloads.stop();
      driverObservations[profile.slug] = driver;
      if (profile.slug === 'avr') {
        await page.screenshot({ path: path.join(evidenceDir, 'avr-current-runtime-control.png'), fullPage: false });
      }
      stage = `${profile.slug}:save-open-invalidation`;
      await reopenAuthoredProject(page, profile,
        (substage) => { stage = `${profile.slug}:save-open-invalidation:${substage}`; });
    }

    assert.equal(builds, journeyProfiles.length); assert.equal(runs, journeyProfiles.length);
    assert.deepEqual(errors, []); assert.deepEqual(outside, []);
    assert.equal(context.serviceWorkers().length, 0); assert.equal((await context.cookies()).length, 0);
    const result = { result: 'pass', schema: 'intent-mcu-accessible-demonstration@2',
      profiles: journeyProfiles.map(({ id }) => id), builds, runs, scenarios: 0,
      artifacts: Object.fromEntries(journeyProfiles.map(({ slug }) => [slug, evidence[slug].report.measurements.artifactIdentity])),
      svg: Object.fromEntries(journeyProfiles.map(({ slug }) => [slug,
        { sha256: evidence[slug].sha256, bytes: evidence[slug].bytes }])),
      classifications: Object.fromEntries(journeyProfiles.map(({ slug }) => [slug,
        evidence[slug].report.measurements.channels.map(({ classification }) => classification)])),
      timeBases: Object.fromEntries(journeyProfiles.map(({ slug }) => [slug,
        evidence[slug].report.measurements.channels.map(({ time }) => time.basis)])),
      geometry, driverObservations,
      activeRuntimeRejected: journeyProfiles.filter(({ pause }) => pause).map(({ slug }) => slug),
      saveOpenClearedRuntime: journeyProfiles.map(({ slug }) => slug),
      workersObserved: workers.length, serviceWorkers: 0, outsideRequests: 0,
      mutations, cookies: 0, browserErrors: 0 };
    fs.writeFileSync(path.join(evidenceDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const emergency = await emergencyPauseStop(page);
    const captured = await boundedPageCapture(page, {
      stage, error: { message: error.message, stack: error.stack },
      producerActivity: { builds, runs, scenarios: 0 }, emergency,
    });
    const failure = captured.value;
    fs.writeFileSync(path.join(evidenceDir, 'failure-state.json'), `${JSON.stringify(failure, null, 2)}\n`);
    await hardDeadline(() => page.screenshot({ path: path.join(evidenceDir, 'failure-page.png'),
      fullPage: true, timeout: 1_000 }), 1_100, 'failure screenshot').catch(() => {});
    const hold = await holdFailedPage(stage, error);
    if (!(zeroProducerFailureFixture && error.message === 'X70_ZERO_PRODUCER_FAILURE_FIXTURE')) throw error;
    process.stdout.write(`${JSON.stringify({ result: 'expected-zero-producer-failure',
      producerActivity: { builds, runs, scenarios: 0 }, holdStatus: hold.status })}\n`);
  } finally {
    const finalSafety = await emergencyPauseStop(page);
    const cleanup = await boundedBrowserCleanup({ pages: [page], contexts: [context], browser });
    writeJson(path.join(evidenceDir, 'driver-cleanup.json'), { finalSafety, cleanup });
  }
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
