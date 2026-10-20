// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X70_URL || 'http://127.0.0.1:18870';
const evidenceDir = process.env.X70_EVIDENCE || '/evidence';
const profiles = [
  'board.atmega328p-16mhz-v1',
  'board.rp2040-pico-v1',
  'board.esp32-c3-devmodule-v1',
  'board.stm32f429zi-nucleo144-v1',
];
const storage = () => ({
  local: Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])),
  session: Object.fromEntries(Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)])),
});

async function downloadSvg(page, name) {
  const event = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
  await page.focus('#accessible-svg-export');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /downloaded|rejected|cancelled/u.test(
    document.querySelector('#accessible-svg-status')?.textContent ?? ''), null, { timeout: 15_000 });
  const download = await event;
  assert(download, await page.locator('#accessible-svg-status').textContent());
  const target = path.join(evidenceDir, `${name}.svg`);
  await download.saveAs(target);
  assert.match(download.suggestedFilename(), /\.accessible-demonstration\.svg$/u);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'accessible-svg-export');
  return { target, source: fs.readFileSync(target, 'utf8') };
}

async function delayedRace(page, action, expectedDownloads = 0) {
  await page.evaluate(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    window.__X70_DELAY_CALLS__ = 0;
    crypto.subtle.digest = async (...args) => {
      window.__X70_DELAY_CALLS__ += 1;
      if (window.__X70_DELAY_CALLS__ === 1) await new Promise((resolve) => setTimeout(resolve, 180));
      return original(...args);
    };
  });
  let downloads = 0; const count = () => { downloads += 1; };
  page.on('download', count);
  await page.click('#accessible-svg-export');
  await page.waitForFunction(() => window.__X70_DELAY_CALLS__ >= 1);
  await action();
  await page.waitForFunction(() => /cancelled|downloaded/u.test(
    document.querySelector('#accessible-svg-status')?.textContent ?? ''), null, { timeout: 15_000 });
  page.off('download', count);
  assert.equal(downloads, expectedDownloads);
  assert.match(await page.locator('#accessible-svg-status').textContent(), /cancelled|downloaded/u);
}

(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await context.newPage(); const errors = []; const outside = []; const mutations = []; const workers = [];
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('worker', (worker) => workers.push(worker.url()));
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!['blob:', 'file:'].includes(url.protocol) && url.origin !== new URL(base).origin) outside.push(request.url());
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
    });
    assert.equal((await page.goto(base, { waitUntil: 'networkidle' }))?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true && window.__X70_ACCESSIBLE_DEMONSTRATION__);
    const baselineWorkers = await page.evaluate(() => window.__M6_STATE__?.runtimeWorkerCreations ?? 0);

    const viewportCases = [];
    for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      const geometry = await page.evaluate(() => {
        const button = document.querySelector('#accessible-svg-export').getBoundingClientRect();
        return { visible: button.top >= 0 && button.bottom <= innerHeight && button.left >= 0 && button.right <= innerWidth,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      assert.equal(geometry.visible, true);
      assert(geometry.overflow <= 1);
      viewportCases.push({ viewport: `${viewport.width}x${viewport.height}`, ...geometry });
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.selectOption('#board-select', profiles[0]);
    await page.click('#project-files-open');
    await page.waitForSelector('#workbench-project-dialog[open]');
    await page.click('#project-demo');
    await page.click('.starter-card[data-example="blink"]');
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
      await page.click('#unsaved-discard');
    }
    await page.waitForFunction(() => document.querySelector('#example-select').value === 'blink');

    const exports = {};
    for (const profile of profiles) {
      await page.selectOption('#board-select', profile);
      await page.waitForFunction((id) => document.querySelector('#board-select').value === id, profile);
      const beforeExportStorage = await page.evaluate(storage);
      const result = await downloadSvg(page, profile.replace(/[^a-z0-9]+/giu, '-'));
      const validated = await page.evaluate(async (source) => {
        const value = await window.__X70_ACCESSIBLE_DEMONSTRATION__.validate(source);
        return value.report;
      }, result.source);
      assert.equal(validated.schema, 'intent-mcu-accessible-demonstration@1');
      assert.equal(validated.profile, profile);
      assert.equal(validated.measurements.status, 'no-current-measurements');
      assert.equal(validated.measurements.artifactIdentity, null);
      assert.equal(validated.measurements.authority, 'none');
      assert(validated.nets.every((net) => net.endpoints.every((endpoint) =>
        result.source.includes(`data-id="${endpoint.key}"`))));
      const standalone = await context.newPage();
      await standalone.goto(`file://${result.target}`);
      assert.match(await standalone.locator('title').textContent(), /accessible circuit demonstration/u);
      assert.match(await standalone.locator('desc').textContent(), /connected named pins.*No current measurements/u);
      assert.equal(await standalone.locator('[data-kind="net"]').count(), validated.counts.nets);
      assert.equal(await standalone.locator('[data-kind="pin"]').count(), validated.counts.endpoints);
      assert.equal(await standalone.locator('[data-kind="endpoint-label"]').count(), validated.counts.endpoints);
      for (const net of validated.nets) {
        for (const endpoint of net.endpoints) {
          assert.equal(await standalone.locator(`[data-kind="endpoint-label"][data-id="${endpoint.key}"]`).count(), 1);
          const pin = standalone.locator(`[data-kind="pin"][data-id="${endpoint.key}"]`);
          const wire = standalone.locator(`path[data-endpoint="${endpoint.key}"]`);
          const [cx, cy, d] = await Promise.all([
            pin.getAttribute('cx'), pin.getAttribute('cy'), wire.getAttribute('d'),
          ]);
          const start = d.match(/^M ([0-9.-]+) ([0-9.-]+)/u);
          assert(start && Number(start[1]) === Number(cx) && Number(start[2]) === Number(cy), endpoint.key);
        }
      }
      const box = await standalone.locator('svg').boundingBox();
      assert(box && box.width > 0 && box.height > 0);
      await standalone.close();
      assert.deepEqual(await page.evaluate(storage), beforeExportStorage);
      exports[profile] = { ...result, report: validated };
    }

    await page.selectOption('#board-select', 'board.rp2040-pico-v1');
    await page.waitForFunction(() => document.querySelector('#board-select').value === 'board.rp2040-pico-v1');
    const repeat = await downloadSvg(page, 'pico-repeat');
    assert.equal(repeat.source, exports['board.rp2040-pico-v1'].source);

    assert.equal((await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__
      .moveCircuitComponent('resistor-1', 0.62, 0.38))).ok, true);
    assert.equal((await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__
      .rotateCircuitComponent('resistor-1'))).ok, true);
    await page.click('#active-canvas-mount [data-component-id="resistor-1"]');
    await page.click('#toggle-inspector');
    await page.fill('#resistor-1-ohms', '330');
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuit
      .components.find(({ id }) => id === 'resistor-1').properties.ohms === 330);
    await page.keyboard.press('Escape');
    const edited = await downloadSvg(page, 'pico-moved-rotated-330');
    const editedReport = await page.evaluate(async (source) =>
      (await window.__X70_ACCESSIBLE_DEMONSTRATION__.validate(source)).report, edited.source);
    const editedResistor = editedReport.components.find(({ id }) => id === 'resistor-1');
    assert.deepEqual(editedResistor.position, { x: 0.62, y: 0.38, rotation: 90 });
    assert.equal(editedResistor.properties.find(({ name }) => name === 'ohms').value, 330);
    assert.notEqual(edited.source, exports['board.rp2040-pico-v1'].source);

    // Tampering never replaces the accepted project or runtime state.
    const beforeTamper = await page.evaluate(() => ({ guard: window.__X70_ACCESSIBLE_DEMONSTRATION__.guard(),
      storage: { local: Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])),
        session: Object.fromEntries(Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)])) },
      workers: window.__M6_STATE__?.runtimeWorkerCreations ?? 0 }));
    const maliciousCases = [
      edited.source.replace('</svg>', '<script>throw new Error("x")</script></svg>'),
      edited.source.replace('</svg>', '<rect onload="throw 1"/></svg>'),
      edited.source.replace('</svg>', '<a href="https://example.invalid/">outside</a></svg>'),
      edited.source.replace('</svg>', '<image href="data:image/svg+xml,forbidden"/></svg>'),
      edited.source.replace('<svg ', '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg '),
      edited.source.replace('</svg>', '<foreignObject><p>forbidden</p></foreignObject></svg>'),
    ];
    for (const malicious of maliciousCases) {
      await assert.rejects(() => page.evaluate((source) =>
        window.__X70_ACCESSIBLE_DEMONSTRATION__.validate(source), malicious));
    }
    const tamperedHash = edited.source.replace(editedReport.integrity.reportSha256, '0'.repeat(64));
    await assert.rejects(() => page.evaluate((source) => window.__X70_ACCESSIBLE_DEMONSTRATION__.validate(source), tamperedHash));
    assert.deepEqual(await page.evaluate(() => ({ guard: window.__X70_ACCESSIBLE_DEMONSTRATION__.guard(),
      storage: { local: Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])),
        session: Object.fromEntries(Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)])) },
      workers: window.__M6_STATE__?.runtimeWorkerCreations ?? 0 })), beforeTamper);

    // Each async race is fresh because the page reload restores native crypto.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__X70_ACCESSIBLE_DEMONSTRATION__);
    await delayedRace(page, async () => {
      const selected = await page.inputValue('#board-select');
      await page.selectOption('#board-select', selected === profiles[0] ? profiles[1] : profiles[0]);
    });
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__X70_ACCESSIBLE_DEMONSTRATION__);
    const openSource = await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current());
    await delayedRace(page, async () => page.setInputFiles('#project-open-input', {
      name: 'x70-open-race.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(openSource),
    }));
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__X70_ACCESSIBLE_DEMONSTRATION__);
    await page.selectOption('#board-select', 'board.rp2040-pico-v1');
    await delayedRace(page, async () => page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__
      .moveCircuitComponent('resistor-1', 0.63, 0.37)));
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__X70_ACCESSIBLE_DEMONSTRATION__);
    await page.selectOption('#board-select', 'board.rp2040-pico-v1');
    await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.moveCircuitComponent('resistor-1', 0.63, 0.37));
    await delayedRace(page, async () => page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.undoCircuit()));
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__X70_ACCESSIBLE_DEMONSTRATION__);
    await delayedRace(page, async () => page.dispatchEvent('#quick-reset', 'click'));
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => window.__X70_ACCESSIBLE_DEMONSTRATION__);
    await delayedRace(page, async () => page.click('#accessible-svg-export'), 1);

    assert.equal(await page.evaluate(() => window.__M6_STATE__?.runtimeWorkerCreations ?? 0), baselineWorkers);
    assert.deepEqual(errors, []); assert.deepEqual(outside, []); assert.deepEqual(mutations, []);
    assert.deepEqual(workers, []); assert.equal(context.serviceWorkers().length, 0);
    assert.equal((await context.cookies()).length, 0);
    await page.screenshot({ path: path.join(evidenceDir, 'x70-private-export-control.png'), fullPage: false });
    console.log(JSON.stringify({ result: 'pass', profiles: 4, actualSvgDownloads: 7,
      standaloneOpens: 4, viewportCases, inspector330: true, movement: true, rotation: true,
      maliciousRejected: maliciousCases.length, tamperRejected: true, staleRaceClasses: 6,
      builds: 0, runs: 0, scenarios: 0, workers: 0, serviceWorkers: 0,
      outsideRequests: 0, mutations: 0 }));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
