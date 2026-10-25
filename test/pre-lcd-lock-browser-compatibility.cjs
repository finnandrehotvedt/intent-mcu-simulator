// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const base = process.env.PRE_LCD_COMPAT_URL || 'http://127.0.0.1:18776';
const fixtureRoot = path.join(__dirname, 'fixtures/rc138-browser-recovery');
const fixtures = [
  ['board.atmega328p-16mhz-v1', 'public-rc138-recovery-avr.json'],
  ['board.rp2040-pico-v1', 'public-rc138-recovery-pico-sentinel.json'],
  ['board.esp32-c3-devmodule-v1', 'public-rc138-recovery-c3-sentinel.json'],
  ['board.stm32f429zi-nucleo144-v1', 'public-rc138-recovery-stm32-sentinel.json'],
];
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/model-bundles/pre-lcd-current-manifest.json'), 'utf8'));
const preLock = { schema: 'intent-mcu-model-library-lock@2', libraryId: manifest.libraryId,
  version: manifest.version, manifestSha256: manifest.manifestSha256, implementationSha256: manifest.implementationSha256 };
function authored(project, expected) {
  const value = structuredClone(project);
  if (expected.circuit.layout?.idCounters === undefined && value.circuit.layout) delete value.circuit.layout.idCounters;
  return value;
}
const ui = (profile) => profile === fixtures[0][0]
  ? { open: '#project-open', message: '#project-message', save: '#project-save', wireRoot: '#circuit-wires' }
  : profile === fixtures[1][0]
    ? { open: '#pico-open', message: '#pico-message', save: '#pico-save', wireRoot: '#pico-editor-wires' }
    : profile === fixtures[2][0]
      ? { open: '#c3-open', message: '#c3-message', save: '#c3-save', wireRoot: '#c3-editor-wires' }
      : { open: '#stm32-open', message: '#stm32-message', save: '#stm32-save', wireRoot: '#stm32-editor-wires' };
async function dialog(page) {
  if (await page.locator('#workbench-project-dialog').getAttribute('open') === null) {
    if (!(await page.locator('#workbench-more').evaluate((node) => node.open))) await page.click('#workbench-more > summary');
    await page.click('#project-files-open');
  }
}
async function open(page, profile, bytes) {
  await page.selectOption('#board-select', profile); await dialog(page);
  const chooserPromise = page.waitForEvent('filechooser'); await page.click(ui(profile).open);
  await (await chooserPromise).setFiles({ name: `${profile}.intent-mcu.json`, mimeType: 'application/json', buffer: Buffer.from(bytes) });
  if (await page.locator('#unsaved-change-dialog').getAttribute('open') !== null) await page.click('#unsaved-discard');
  await page.waitForFunction(({ profile, message }) => document.querySelector('#board-select').value === profile
    && /validated data only/iu.test(document.querySelector(message).textContent), { profile, message: ui(profile).message });
}
(async () => {
  const browser = await chromium.launch({ headless: true }); const reports = [];
  try {
    for (const [profile, name] of fixtures) {
      const fixtureRaw = fs.readFileSync(path.join(fixtureRoot, name), 'utf8').trimEnd();
      const fixture = JSON.parse(fixtureRaw); const expected = profile === fixtures[0][0]
        ? fixture.project : { ...fixture.project, circuit: fixture.circuit };
      const seed = await browser.newPage(); await seed.goto(base); await seed.waitForFunction(() => window.__M11_READY__ === true);
      const envelope = JSON.parse(await seed.evaluate((selected) => window.__COMMON_PROJECT_FILES__.current(selected), profile));
      envelope.modelLibrary = preLock; envelope.project = expected; const bytes = JSON.stringify(envelope); await seed.close();

      const page = await browser.newPage({ acceptDownloads: true }); const mutations = [];
      page.on('request', (request) => { if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(request.url()); });
      await page.goto(base); await page.waitForFunction(() => window.__M11_READY__ === true); await open(page, profile, bytes);
      const actual = JSON.parse(await page.evaluate((selected) => window.__COMMON_PROJECT_FILES__.current(selected), profile));
      assert.deepEqual(authored(actual.project, expected), expected, `${profile}: actual Open changed authored graph/source`);
      if (profile !== fixtures[0][0]) assert.equal(
        actual.project.circuit.components.find((part) => part.id === 'resistor-1')?.properties.ohms, 470,
        `${profile}: 470 ohm sentinel was reset`);
      assert.deepEqual([...new Set(await page.locator(`${ui(profile).wireRoot} [data-net]`).evaluateAll((nodes) => nodes.map((node) => node.dataset.net)))].sort(),
        expected.circuit.nets.map((net) => net.id).sort(), `${profile}: visible nets differ`);
      await dialog(page);
      const [current] = await Promise.all([page.waitForEvent('download'), page.click(ui(profile).save)]);
      assert.deepEqual(authored(JSON.parse(fs.readFileSync(await current.path(), 'utf8')).project, expected), expected,
        `${profile}: current download changed project`);
      assert.deepEqual(mutations, []); await page.close();

      const draftId = `21000000-0000-4000-8000-000000000${reports.length + 1}10`;
      const key = profile === fixtures[0][0] ? `teach-lab.simulator.project.v2.tab.${draftId}`
        : `intent-mcu.profile-draft.v1.${profile}.tab.${draftId}`;
      const storageBytes = profile === fixtures[0][0] ? bytes : fixtureRaw;
      const context = await browser.newContext();
      await context.addInitScript(({ draftId, profile, key, storageBytes }) => {
        sessionStorage.setItem('intent-mcu.active-draft-id.v1', draftId);
        sessionStorage.setItem('intent-mcu.active-profile.v1', profile);
        localStorage.setItem(key, storageBytes);
      }, { draftId, profile, key, storageBytes });
      const startup = await context.newPage(); await startup.goto(base); await startup.waitForFunction(() => window.__M11_READY__ === true);
      assert.equal(await startup.locator('#board-select').inputValue(), profile, `${profile}: fresh startup profile`);
      const restored = JSON.parse(await startup.evaluate((selected) => window.__COMMON_PROJECT_FILES__.current(selected), profile));
      assert.deepEqual(authored(restored.project, expected), expected, `${profile}: fresh startup changed authored graph/source`);
      assert.equal(await startup.evaluate((storageKey) => localStorage.getItem(storageKey), key), storageBytes,
        `${profile}: fresh startup rewrote exact raw bytes`);
      reports.push(profile); await context.close();
    }
    process.stdout.write(`${JSON.stringify({ result: 'pass', profiles: reports, actualOpen: 4,
      currentDownloads: 4, freshStartupRawBytes: 4, mutationRequests: 0 })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
