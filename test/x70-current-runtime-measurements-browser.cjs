// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X70_CURRENT_URL || 'http://127.0.0.1:18872';
const evidenceDir = process.env.X70_CURRENT_EVIDENCE || '/evidence';
const profiles = [
  { id: 'board.atmega328p-16mhz-v1', slug: 'avr', build: '#quick-build', run: '#quick-run',
    pause: '#quick-pause', state: '__M6_STATE__', built: 'succeeded', complete: 'paused', timeout: 45_000 },
  { id: 'board.rp2040-pico-v1', slug: 'pico', build: '#pico-build', run: '#pico-run',
    pause: '#pico-pause', state: '__RP2040_PUBLIC_STATE__', built: 'built', complete: 'paused', timeout: 45_000 },
  { id: 'board.esp32-c3-devmodule-v1', slug: 'c3', build: '#c3-build', run: '#c3-run',
    state: '__ESP32C3_PUBLIC_STATE__', built: 'built', complete: 'complete', timeout: 190_000 },
  { id: 'board.stm32f429zi-nucleo144-v1', slug: 'stm32', build: '#stm32-build', run: '#stm32-run',
    state: '__STM32_PUBLIC_STATE__', built: 'built', complete: 'completed', timeout: 190_000 },
];
const visuals = Object.freeze({
  avr: '#circuit-canvas', pico: '#pico-diagram', c3: '#c3-diagram', stm32: '#stm32-diagram',
});
const storage = () => ({
  local: Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])),
  session: Object.fromEntries(Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)])),
});
const sha256 = (source) => crypto.createHash('sha256').update(source).digest('hex');

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

async function assertActiveRejected(page, profile) {
  let downloads = 0;
  const count = () => { downloads += 1; };
  page.on('download', count);
  const before = await page.locator('#accessible-svg-status').textContent();
  await page.click('#accessible-svg-export');
  await page.waitForFunction((prior) => {
    const current = document.querySelector('#accessible-svg-status')?.textContent ?? '';
    return current !== prior && /Pause the current|downloaded|rejected|cancelled/u.test(current);
  }, before, { timeout: 10_000 });
  assert.match(await page.locator('#accessible-svg-status').textContent(), /Pause the current/u);
  await page.waitForTimeout(250);
  page.off('download', count);
  assert.equal(downloads, 0, `${profile.slug}: active runtime created an export`);
}

async function downloadAndValidate(page, context, profile) {
  const beforeStorage = await page.evaluate(storage);
  const downloadEvent = page.waitForEvent('download', { timeout: 20_000 });
  await page.click('#accessible-svg-export');
  const download = await downloadEvent;
  const target = path.join(evidenceDir, `${profile.slug}.current-runtime.accessible-demonstration.svg`);
  await download.saveAs(target);
  await page.waitForFunction(() => /current observation-only runtime measurements included/u.test(
    document.querySelector('#accessible-svg-status')?.textContent ?? ''), null, { timeout: 20_000 });
  const source = fs.readFileSync(target, 'utf8');
  const result = await page.evaluate(async (svg) => window.__X70_ACCESSIBLE_DEMONSTRATION__.validate(svg), source);
  const native = await page.evaluate(() => structuredClone(window.__SHARED_INSTRUMENT_SUMMARY__));
  assertProjection(result.report, native, profile);
  assert.deepEqual(await page.evaluate(storage), beforeStorage, `${profile.slug}: export changed browser storage`);

  const standalone = await context.newPage();
  await standalone.goto(`file://${target}`);
  assert.match(await standalone.locator('title').textContent(), /accessible circuit demonstration/iu);
  assert.match(await standalone.locator('desc').textContent(), /current runtime measurements/iu);
  assert.equal(await standalone.locator('[data-kind="measurement-status"][data-id="current-runtime-measurements"]').count(), 1);
  assert.deepEqual(await standalone.locator('[data-kind="measurement-channel"]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-id'))), ['serial', 'gpio', 'logic', 'input']);
  assert.equal(await standalone.locator('script,foreignObject,image,a').count(), 0);
  if (profile.slug === 'avr') {
    await standalone.screenshot({ path: path.join(evidenceDir, 'avr-current-runtime-standalone.png'), fullPage: true });
  }
  await standalone.close();
  return { source, report: result.report, native, sha256: sha256(source), bytes: Buffer.byteLength(source) };
}

async function reopenAuthoredProject(page, profile) {
  const source = await page.evaluate((id) => window.__COMMON_PROJECT_FILES__.current(id), profile.id);
  await page.setInputFiles('#project-open-input', {
    name: `${profile.slug}.intent-mcu.json`, mimeType: 'application/json', buffer: Buffer.from(source),
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
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
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
  try {
    assert.equal((await page.goto(base, { waitUntil: 'networkidle' }))?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true && window.__X70_ACCESSIBLE_DEMONSTRATION__);
    await page.click('#project-files-open');
    await page.waitForSelector('#workbench-project-dialog[open]');
    await page.click('#project-demo');
    await page.click('.starter-card[data-example="pwm-pulse"]');
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
    await page.waitForFunction(() => document.querySelector('#example-select').value === 'pwm-pulse');

    const evidence = {};
    const geometry = {};
    let builds = 0; let runs = 0;
    for (const profile of profiles) {
      await page.selectOption('#board-select', profile.id);
      await page.waitForFunction((id) => window.__SHARED_INSTRUMENT_SUMMARY__?.profile === id, profile.id);
      assert.equal(await page.locator(profile.build).isDisabled(), false, `${profile.slug}: Build disabled`);
      await page.click(profile.build); builds += 1;
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
      await page.waitForFunction(({ name, phase }) => {
        const state = name === '__M6_STATE__' ? (window[name]?.runtime?.paused ? 'paused' : 'running') : window[name]?.phase;
        return state === phase || window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'current-runtime';
      }, { name: profile.state, phase: profile.complete }, { timeout: profile.slug === 'stm32' ? 120_000 : 70_000 });
      await page.waitForFunction(() => window.__SHARED_INSTRUMENT_SUMMARY__?.state === 'current-runtime', null,
        { timeout: profile.slug === 'stm32' ? 120_000 : 30_000 });
      if (profile.pause) {
        await assertActiveRejected(page, profile);
        await page.click(profile.pause);
        await page.waitForFunction(({ name }) => name === '__M6_STATE__'
          ? window[name]?.runtime?.paused === true && window[name]?.lifecycle?.phase === 'paused'
          : window[name]?.phase === 'paused' && window[name]?.runtime?.paused === true,
        { name: profile.state }, { timeout: 20_000 });
      }
      geometry[profile.slug] = await assertGeometry(page, profile);
      evidence[profile.slug] = await downloadAndValidate(page, context, profile);
      if (profile.slug === 'avr') {
        await page.screenshot({ path: path.join(evidenceDir, 'avr-current-runtime-control.png'), fullPage: false });
      }
      await reopenAuthoredProject(page, profile);
    }

    assert.equal(builds, 4); assert.equal(runs, 4);
    assert.deepEqual(errors, []); assert.deepEqual(outside, []);
    assert.equal(context.serviceWorkers().length, 0); assert.equal((await context.cookies()).length, 0);
    const result = { result: 'pass', schema: 'intent-mcu-accessible-demonstration@2',
      profiles: profiles.map(({ id }) => id), builds, runs, scenarios: 0,
      artifacts: Object.fromEntries(profiles.map(({ slug }) => [slug, evidence[slug].report.measurements.artifactIdentity])),
      svg: Object.fromEntries(profiles.map(({ slug }) => [slug,
        { sha256: evidence[slug].sha256, bytes: evidence[slug].bytes }])),
      classifications: Object.fromEntries(profiles.map(({ slug }) => [slug,
        evidence[slug].report.measurements.channels.map(({ classification }) => classification)])),
      timeBases: Object.fromEntries(profiles.map(({ slug }) => [slug,
        evidence[slug].report.measurements.channels.map(({ time }) => time.basis)])),
      geometry, activeRuntimeRejected: ['avr', 'pico'], saveOpenClearedRuntime: profiles.map(({ slug }) => slug),
      workersObserved: workers.length, serviceWorkers: 0, outsideRequests: 0,
      mutations, cookies: 0, browserErrors: 0 };
    fs.writeFileSync(path.join(evidenceDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
