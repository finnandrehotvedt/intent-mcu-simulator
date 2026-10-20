// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X76_URL || 'http://127.0.0.1:18861';
const evidenceDir = process.env.X76_EVIDENCE || '/tmp';
const profiles = [
  ['board.atmega328p-16mhz-v1', 6], ['board.rp2040-pico-v1', 5],
  ['board.esp32-c3-devmodule-v1', 6], ['board.stm32f429zi-nucleo144-v1', 6],
];
const workbenchState = () => ({
  localStorage: Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])),
  sessionStorage: Object.fromEntries(Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)])),
  project: window.__COMMON_PROJECT_FILES__?.current?.() ?? null,
  buildState: window.__M6_STATE__?.buildState ?? null,
  artifactIdentity: window.__M6_STATE__?.artifactIdentity ?? null,
  runtimeWorkerCreations: window.__M6_STATE__?.runtimeWorkerCreations ?? null,
  lifecycle: document.querySelector('#lifecycle-state')?.textContent ?? null,
});

(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const deviceCalls = [];
    await context.addInitScript(() => {
      globalThis.__X76_DEVICE_CALLS__ = [];
      for (const name of ['serial', 'usb', 'hid', 'bluetooth']) {
        try { Object.defineProperty(Navigator.prototype, name, { configurable: true, get() {
          globalThis.__X76_DEVICE_CALLS__.push(name); return undefined;
        } }); } catch {}
      }
    });
    const outside = []; const mutations = []; const errors = []; const workers = [];
    const observe = (page) => {
      page.on('pageerror', (error) => errors.push(error.stack || String(error)));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('worker', (worker) => workers.push(worker.url()));
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.origin !== new URL(base).origin && url.protocol !== 'blob:') outside.push(request.url());
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
      });
    };

    const workbench = await context.newPage(); observe(workbench);
    assert.equal((await workbench.goto(base, { waitUntil: 'networkidle' }))?.status(), 200);
    await workbench.waitForFunction(() => window.__M11_READY__ === true);
    const before = await workbench.evaluate(workbenchState);
    const databasesBefore = await workbench.evaluate(async () => indexedDB.databases());

    const page = await context.newPage(); observe(page);
    assert.equal((await page.goto(`${base}/physical-checklist.html`, { waitUntil: 'networkidle' }))?.status(), 200);
    await page.waitForFunction(() => window.__X76_READY__ === true);
    assert.match(await page.locator('#physical-boundary').textContent(), /Physical evidence absent/u);

    let total = 0;
    for (const [profile, expected] of profiles) {
      await page.locator('#physical-profile').focus();
      await page.keyboard.press('Home');
      const index = profiles.findIndex(([id]) => id === profile);
      for (let step = 0; step < index; step += 1) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForFunction((id) => document.querySelector('#physical-profile').value === id, profile);
      const rows = page.locator('[data-item-id]');
      assert.equal(await rows.count(), expected);
      for (let row = 0; row < expected; row += 1) {
        assert(await rows.nth(row).getAttribute('data-item-id'));
        assert.match(await rows.nth(row).locator('.physical-basis').textContent(), /tested|project-model|unavailable/u);
        await rows.nth(row).locator('[data-item-status]').focus();
        assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-item-status]')), true);
      }
      total += expected;
    }
    assert.equal(total, 23);

    await page.locator('#physical-profile').selectOption('board.atmega328p-16mhz-v1');
    const first = page.locator('[data-item-id="avr-supply-under-load"]');
    await first.locator('[data-item-status]').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await first.locator('[data-observation="value"]').fill('4.98');
    await first.locator('[data-observation="unit"]').fill('V');
    await first.locator('[data-observation="method"]').fill('manual bench note');
    assert.match(await page.locator('#physical-boundary').textContent(), /not independently verified/iu);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#physical-download').focus();
    await page.keyboard.press('Enter');
    const download = await downloadPromise;
    const downloadedPath = path.join(evidenceDir, 'x76-actual-download.json');
    await download.saveAs(downloadedPath);
    const downloadedText = fs.readFileSync(downloadedPath, 'utf8');
    const downloaded = JSON.parse(downloadedText);
    assert.equal(downloaded.evidenceBoundary.physicalEvidencePresent, true);
    assert.equal(downloaded.evidenceBoundary.independentlyVerified, false);
    assert(Object.values(downloaded.authority).every((value) => value === false));

    await first.locator('[data-observation="notes"]').fill('😀'.repeat(500));
    assert.match(await page.locator('#physical-status').textContent(), /accepted in this tab only/u);
    const emojiDownloadPromise = page.waitForEvent('download');
    await page.locator('#physical-download').click();
    await (await emojiDownloadPromise).cancel();
    await first.locator('[data-observation="notes"]').fill('😀'.repeat(501));
    assert.match(await page.locator('#physical-status').textContent(), /500 Unicode|Complete value|prior accepted checklist/iu);
    await first.locator('[data-observation="notes"]').fill('');
    assert.match(await page.locator('#physical-status').textContent(), /accepted in this tab only/u);

    await page.locator('#physical-clear').click();
    assert.match(await page.locator('#physical-boundary').textContent(), /Physical evidence absent/u);
    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator('#physical-open').focus();
    await page.keyboard.press('Enter');
    await (await chooserPromise).setFiles(downloadedPath);
    assert.match(await page.locator('#physical-status').textContent(), /Opened .* locally/u);
    assert.match(await page.locator('#physical-boundary').textContent(), /not independently verified/iu);

    const acceptedIdentity = await page.locator('#physical-identity').textContent();
    const acceptedStatus = await first.locator('[data-item-status]').inputValue();
    const malformed = structuredClone(downloaded);
    malformed.profile = 'board.unknown-v1';
    const malformedPath = path.join('/tmp', 'x76-unknown-identity.json');
    fs.writeFileSync(malformedPath, JSON.stringify(malformed));
    const badChooser = page.waitForEvent('filechooser');
    await page.locator('#physical-open').click();
    await (await badChooser).setFiles(malformedPath);
    await page.waitForFunction(() => document.querySelector('#physical-status')?.textContent.includes('Rejected checklist atomically'));
    assert.match(await page.locator('#physical-status').textContent(), /Rejected checklist atomically/u);
    assert.equal(await page.locator('#physical-identity').textContent(), acceptedIdentity);
    assert.equal(await first.locator('[data-item-status]').inputValue(), acceptedStatus);

    const cancelChooser = page.waitForEvent('filechooser');
    await page.locator('#physical-open').click();
    await (await cancelChooser).setFiles([]);
    assert.equal(await page.locator('#physical-identity').textContent(), acceptedIdentity);
    assert.equal(await first.locator('[data-item-status]').inputValue(), acceptedStatus);

    await page.locator('#physical-profile').selectOption('board.esp32-c3-devmodule-v1');
    const c3DownloadPromise = page.waitForEvent('download');
    await page.locator('#physical-download').click();
    const c3Download = await c3DownloadPromise;
    const c3Path = path.join(evidenceDir, 'x76-c3-default.json');
    await c3Download.saveAs(c3Path);
    const c3Text = fs.readFileSync(c3Path, 'utf8');

    await page.evaluate(() => {
      const originalText = File.prototype.text;
      window.__X76_FILE_READS__ = [];
      File.prototype.text = async function patchedText() {
        window.__X76_FILE_READS__.push(this.name);
        if (this.name.startsWith('slow-')) await new Promise((resolve) => setTimeout(resolve, 180));
        return originalText.call(this);
      };
    });

    let delayedChooser = page.waitForEvent('filechooser');
    await page.locator('#physical-open').click();
    await (await delayedChooser).setFiles({ name: 'slow-clear.json', mimeType: 'application/json', buffer: Buffer.from(downloadedText) });
    await page.locator('#physical-clear').click();
    await page.waitForTimeout(240);
    assert.match(await page.locator('#physical-boundary').textContent(), /Physical evidence absent/u);
    assert.match(await page.locator('#physical-status').textContent(), /Current-tab entries cleared/u);

    delayedChooser = page.waitForEvent('filechooser');
    await page.locator('#physical-open').click();
    await (await delayedChooser).setFiles({ name: 'slow-profile.json', mimeType: 'application/json', buffer: Buffer.from(downloadedText) });
    await page.locator('#physical-profile').selectOption('board.rp2040-pico-v1');
    await page.waitForTimeout(240);
    assert.equal(await page.locator('#physical-profile').inputValue(), 'board.rp2040-pico-v1');
    assert.equal(await page.locator('[data-item-id]').count(), 5);
    assert.match(await page.locator('#physical-status').textContent(), /Profile changed/u);

    delayedChooser = page.waitForEvent('filechooser');
    await page.locator('#physical-open').click();
    await (await delayedChooser).setFiles({ name: 'slow-old.json', mimeType: 'application/json', buffer: Buffer.from(downloadedText) });
    const latestChooser = page.waitForEvent('filechooser');
    await page.locator('#physical-open').click();
    await (await latestChooser).setFiles({ name: 'latest-c3.json', mimeType: 'application/json', buffer: Buffer.from(c3Text) });
    await page.waitForFunction(() => document.querySelector('#physical-status')?.textContent.includes('latest-c3.json'));
    await page.waitForTimeout(240);
    assert.equal(await page.locator('#physical-profile').inputValue(), 'board.esp32-c3-devmodule-v1');
    assert.match(await page.locator('#physical-status').textContent(), /latest-c3\.json/u);

    const slowMalformed = { ...downloaded, profile: 'board.unknown-v1' };
    delayedChooser = page.waitForEvent('filechooser');
    await page.locator('#physical-open').click();
    await (await delayedChooser).setFiles({ name: 'slow-invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(slowMalformed)) });
    await page.locator('#physical-clear').click();
    await page.waitForTimeout(240);
    assert.match(await page.locator('#physical-status').textContent(), /Current-tab entries cleared/u);

    const largeReadsBefore = await page.evaluate(() => window.__X76_FILE_READS__.length);
    const largeChooser = page.waitForEvent('filechooser');
    await page.locator('#physical-open').click();
    await (await largeChooser).setFiles({ name: 'too-large.json', mimeType: 'application/json', buffer: Buffer.from(' '.repeat(65537)) });
    await page.waitForFunction(() => document.querySelector('#physical-status')?.textContent.includes('PHYSICAL_CHECKLIST_INPUT_LIMIT'));
    assert.equal(await page.evaluate(() => window.__X76_FILE_READS__.length), largeReadsBefore);

    await page.evaluate(() => { window.__X76_PRINT_CALLS__ = 0; window.print = () => { window.__X76_PRINT_CALLS__ += 1; }; });
    await page.locator('#physical-print').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.__X76_PRINT_CALLS__), 1);
    assert.match(await page.locator('#physical-status').textContent(), /cannot confirm an operating-system print or PDF save/u);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.no-print').first().evaluate((element) => getComputedStyle(element).display), 'none');
    assert.equal(await page.locator('[data-item-id]').count(), 6);
    assert.match(await page.locator('footer').textContent(), /no device access, firmware action, automatic verdict or certification/iu);
    await page.screenshot({ path: path.join(evidenceDir, 'x76-private-checklist.png'), fullPage: true });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__X76_READY__ === true);
    assert.match(await page.locator('#physical-boundary').textContent(), /Physical evidence absent/u);
    assert.equal(await page.locator('[data-item-id="avr-supply-under-load"] [data-item-status]').inputValue(), 'manual-not-measured');

    const after = await workbench.evaluate(workbenchState);
    const databasesAfter = await workbench.evaluate(async () => indexedDB.databases());
    assert.deepEqual(after, before);
    assert.deepEqual(databasesAfter, databasesBefore);
    deviceCalls.push(...await page.evaluate(() => globalThis.__X76_DEVICE_CALLS__));
    assert.deepEqual(deviceCalls, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(outside, []);
    assert.deepEqual(mutations, []);
    assert.deepEqual(workers, []);
    assert.equal((await context.cookies()).length, 0);
    assert.equal(context.serviceWorkers().length, 0);
    console.log(JSON.stringify({ result: 'pass', profiles: 4, items: 23, keyboard: true,
      actualDownloadOpen: true, malformedIdentityAtomic: true, cancelNoLoss: true,
      delayedReadGuard: true, latestOpenWins: true, oversizeRejectedBeforeRead: true,
      unicodeScalarBoundary: true,
      printProjection: true, reloadClears: true, projectIdentityUnchanged: true,
      deviceApiCalls: 0, workers: 0, networkWrites: 0, outsideRequests: 0, storage: 0, cookies: 0 }));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
