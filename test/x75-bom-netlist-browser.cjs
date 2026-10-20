// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X75_URL || 'http://127.0.0.1:18868';
const evidenceDir = process.env.X75_EVIDENCE || '/tmp/x75-evidence';
const profiles = [
  'board.atmega328p-16mhz-v1',
  'board.rp2040-pico-v1',
  'board.esp32-c3-devmodule-v1',
  'board.stm32f429zi-nucleo144-v1',
];
const profileVisuals = {
  'board.atmega328p-16mhz-v1': '#circuit-canvas',
  'board.rp2040-pico-v1': '#pico-diagram',
  'board.esp32-c3-devmodule-v1': '#c3-diagram',
  'board.stm32f429zi-nucleo144-v1': '#stm32-diagram',
};
const storage = () => ({
  local: Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])),
  session: Object.fromEntries(Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)])),
});

(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const page = await context.newPage();
    const outside = []; const mutations = []; const errors = []; const workers = [];
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('worker', (worker) => workers.push(worker.url()));
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== new URL(base).origin && url.protocol !== 'blob:') outside.push(request.url());
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
    });
    assert.equal((await page.goto(base, { waitUntil: 'networkidle' }))?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true && window.__X75_BOM_NETLIST__);

    const geometryCases = [];
    for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
      const requiredVisibleHeight = viewport.height <= 768 ? 430 : 540;
      await page.setViewportSize(viewport);
      for (const profile of profiles) {
        await page.selectOption('#board-select', profile);
        await page.waitForFunction((id) => document.querySelector('#board-select').value === id, profile);
        const measured = await page.evaluate(({ id, visualSelector }) => {
          const stage = document.querySelector('#active-canvas-stage').getBoundingClientRect();
          const visual = document.querySelector(visualSelector).getBoundingClientRect();
          return {
            profile: id,
            stageTop: stage.top,
            stageVisibleHeight: Math.min(innerHeight, stage.bottom) - Math.max(0, stage.top),
            visibleWidth: Math.max(0, Math.min(innerWidth, visual.right) - Math.max(0, visual.left)),
            visibleHeight: Math.max(0, Math.min(innerHeight, visual.bottom) - Math.max(0, visual.top)),
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        }, { id: profile, visualSelector: profileVisuals[profile] });
        assert(measured.stageTop <= 210, `${profile} stage starts at ${measured.stageTop}`);
        assert(measured.stageVisibleHeight >= requiredVisibleHeight);
        assert(measured.visibleWidth >= 700);
        assert(measured.visibleHeight >= requiredVisibleHeight,
          `${profile} diagram exposes ${measured.visibleHeight}px at ${viewport.width}x${viewport.height}`);
        assert(measured.overflow <= 1);
        geometryCases.push({
          viewport: `${viewport.width}x${viewport.height}`,
          requiredVisibleHeight,
          ...measured,
        });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.selectOption('#board-select', profiles[0]);

    await page.click('#project-files-open');
    await page.waitForSelector('#workbench-project-dialog[open]');
    await page.click('#project-demo');
    await page.click('.starter-card[data-example="blink"]');
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
      await page.click('#unsaved-discard');
    }
    await page.waitForFunction(() => document.querySelector('#example-select').value === 'blink');

    const downloads = new Map();
    for (const profile of profiles) {
      await page.selectOption('#board-select', profile);
      await page.waitForFunction((id) => document.querySelector('#board-select').value === id, profile);
      const beforeStorage = await page.evaluate(storage);
      const beforeWorkers = await page.evaluate(() => window.__M6_STATE__?.runtimeWorkerCreations ?? 0);
      const downloadPromise = page.waitForEvent('download');
      await page.click('#build-list-export');
      const download = await downloadPromise;
      const file = path.join(evidenceDir, `${profile.replace(/[^a-z0-9]+/giu, '-')}.json`);
      await download.saveAs(file);
      const text = fs.readFileSync(file, 'utf8');
      const value = JSON.parse(text);
      assert.equal(value.schema, 'intent-mcu-bom-netlist@1');
      assert.equal(value.profile, profile);
      assert.equal(value.procurement.status, 'not-provided');
      assert.match(value.procurement.limitations.join(' '), /Not a purchase list/u);
      assert.equal('source' in value, false);
      assert.equal('runtime' in value, false);
      assert.equal('artifact' in value, false);
      assert.deepEqual(await page.evaluate(storage), beforeStorage);
      assert.equal(await page.evaluate(() => window.__M6_STATE__?.runtimeWorkerCreations ?? 0), beforeWorkers);
      const reparsed = await page.evaluate((source) => window.__X75_BOM_NETLIST__.parse(source), text);
      assert.deepEqual(reparsed, value);
      downloads.set(profile, text);
    }

    await page.selectOption('#board-select', 'board.rp2040-pico-v1');
    await page.waitForFunction(() => document.querySelector('#board-select').value === 'board.rp2040-pico-v1');
    const repeatPromise = page.waitForEvent('download');
    await page.click('#build-list-export');
    const repeat = await repeatPromise;
    const repeatPath = path.join(evidenceDir, 'pico-repeat.json');
    await repeat.saveAs(repeatPath);
    assert.equal(fs.readFileSync(repeatPath, 'utf8'), downloads.get('board.rp2040-pico-v1'));

    const moved = await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__
      .moveCircuitComponent('resistor-1', 0.14, 0.78));
    assert.equal(moved.ok, true);
    const movedValue = await page.evaluate(() => window.__X75_BOM_NETLIST__.current());
    assert.equal(movedValue.text, downloads.get('board.rp2040-pico-v1'));

    await page.click('#active-canvas-mount [data-component-id="resistor-1"]');
    await page.click('#toggle-inspector');
    await page.fill('#resistor-1-ohms', '330');
    await page.locator('#resistor-1-ohms').evaluate((control) => control.addEventListener('change',
      (event) => event.stopImmediatePropagation(), { capture: true, once: true }));
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuit
      .components.find(({ id }) => id === 'resistor-1').properties.ohms === 330);
    await page.keyboard.press('Escape');
    const editedDownloadPromise = page.waitForEvent('download');
    await page.click('#build-list-export');
    const editedDownload = await editedDownloadPromise;
    const editedPath = path.join(evidenceDir, 'pico-inspector-330.json');
    await editedDownload.saveAs(editedPath);
    const editedText = fs.readFileSync(editedPath, 'utf8');
    const changed = await page.evaluate((source) => window.__X75_BOM_NETLIST__.parse(source), editedText);
    assert.notEqual(editedText, movedValue.text);
    assert.deepEqual(changed.nets, movedValue.value.nets);
    assert.deepEqual(changed.components.find(({ id }) => id === 'resistor-1').properties,
      [{ name: 'ohms', value: 330, unit: 'Ω' }]);
    assert.equal((await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.undoCircuit())).ok, true);
    const undone = await page.evaluate(() => window.__X75_BOM_NETLIST__.current());
    assert.equal(undone.text, movedValue.text);

    const physical = Object.fromEntries([...downloads].slice(1).map(([profile, text]) => {
      const value = JSON.parse(text);
      return [profile, value.nets.flatMap(({ endpoints }) => endpoints)
        .filter(({ physical: pin }) => pin).map(({ pinId, physical: pin }) => [pinId, pin])];
    }));
    assert.deepEqual(physical['board.rp2040-pico-v1'].find(([id]) => id === 'GP0')[1],
      { connector: null, pin: 1 });
    assert.deepEqual(physical['board.esp32-c3-devmodule-v1'].find(([id]) => id === 'GPIO2')[1],
      { connector: 'J1', pin: 4 });
    assert.deepEqual(physical['board.stm32f429zi-nucleo144-v1'].find(([id]) => id === 'PB0')[1],
      { connector: 'CN11', pin: 34 });

    let staleDownloads = 0;
    const countStaleDownload = () => { staleDownloads += 1; };
    page.on('download', countStaleDownload);
    await page.evaluate(() => {
      const original = crypto.subtle.digest.bind(crypto.subtle);
      window.__X75_DIGEST_CALLS__ = 0;
      crypto.subtle.digest = async (...args) => {
        window.__X75_DIGEST_CALLS__ += 1;
        if (window.__X75_DIGEST_CALLS__ === 2) {
          await new Promise((resolve) => setTimeout(resolve, 180));
        }
        return original(...args);
      };
    });
    await page.click('#build-list-export');
    await page.waitForFunction(() => window.__X75_DIGEST_CALLS__ >= 2);
    await page.selectOption('#board-select', 'board.esp32-c3-devmodule-v1');
    await page.waitForFunction(() => document.querySelector('#build-list-status').textContent.includes('cancelled'));
    await page.waitForTimeout(250);
    page.off('download', countStaleDownload);
    assert.equal(staleDownloads, 0);
    assert.match(await page.locator('#build-list-status').textContent(), /project or controller changed/u);

    assert.deepEqual(errors, []);
    assert.deepEqual(outside, []);
    assert.deepEqual(mutations, []);
    assert.deepEqual(workers, []);
    assert.equal(context.serviceWorkers().length, 0);
    assert.equal((await context.cookies()).length, 0);
    assert.equal(await page.locator('#build-list-export').isVisible(), true);
    assert.match(await page.locator('#build-list-status').textContent(), /cancelled/u);
    await page.screenshot({ path: path.join(evidenceDir, 'x75-private-build-list.png'), fullPage: false });
    console.log(JSON.stringify({
      result: 'pass', browser: 'chromium', profiles: profiles.length, actualDownloads: 6,
      geometryCaseCount: geometryCases.length, geometryCases,
      deterministicRepeat: true, literalInspectorEdit: true, valueOnlyChange: true,
      movementExcluded: true, undoRestored: true,
      staleCancelled: true, outsideRequests: 0, mutations: 0, workers: 0, serviceWorkers: 0,
    }));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
