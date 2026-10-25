// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.RC139_COMPAT_URL || 'http://127.0.0.1:18939';
const fixtureRoot = path.join(__dirname, 'fixtures', 'rc139-export-locks');
const fixtures = fs.readdirSync(fixtureRoot).filter((name) => name.endsWith('.json')).sort();

async function dismissUnsaved(page) {
  if (await page.locator('#unsaved-change-dialog').getAttribute('open') !== null) {
    await page.click('#unsaved-discard');
  }
}

const profileUi = (profile) => profile === 'board.rp2040-pico-v1'
  ? { open: '#pico-open', openInput: '#pico-open-input', message: '#pico-message', save: '#pico-save', wires: '#pico-editor-wires', wire: '.pico-editor-wire', junction: '.pico-wire-junction' }
  : profile === 'board.esp32-c3-devmodule-v1'
    ? { open: '#c3-open', openInput: '#c3-open-input', message: '#c3-message', save: '#c3-save', wires: '#c3-editor-wires', wire: '.pico-editor-wire', junction: '.pico-wire-junction' }
    : profile === 'board.stm32f429zi-nucleo144-v1'
      ? { open: '#stm32-open', openInput: '#stm32-open-input', message: '#stm32-message', save: '#stm32-save', wires: '#stm32-editor-wires', wire: '.pico-editor-wire', junction: '.pico-wire-junction' }
      : { open: '#project-open', openInput: '#project-open-input', message: '#project-message', save: '#project-save', wires: '#circuit-wires', wire: '.circuit-wire', junction: '.junction-dot' };

async function openProjectDialog(page) {
  if (await page.locator('#workbench-project-dialog').getAttribute('open') !== null) return;
  if (!(await page.locator('#workbench-more').evaluate((node) => node.open))) await page.click('#workbench-more > summary');
  await page.click('#project-files-open');
  await page.waitForSelector('#workbench-project-dialog[open]');
}

async function openBytes(page, profile, name, bytes) {
  await page.selectOption('#board-select', profile);
  await openProjectDialog(page);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.click(profileUi(profile).open);
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name, mimeType: 'application/json', buffer: Buffer.from(bytes),
  });
  try {
    await page.waitForFunction(() => document.querySelector('#unsaved-change-dialog').open
      || /opened|rejected/iu.test(['#project-message', '#pico-message', '#c3-message', '#stm32-message']
        .map((selector) => document.querySelector(selector).textContent).join('\n')), null, { timeout: 5000 });
  } catch (error) {
    const state = await page.evaluate(() => ({ message: document.querySelector('#project-message').textContent,
      technical: document.querySelector('#technical-error-detail')?.textContent,
      dialog: document.querySelector('#unsaved-change-dialog').open,
      value: document.querySelector('#project-open-input').value }));
    throw new Error(`${name}: Open produced no terminal UI state: ${JSON.stringify(state)}; ${error.message}`);
  }
  await dismissUnsaved(page);
  await page.waitForFunction((selector) => document.querySelector(selector).value === '', profileUi(profile).openInput);
}

const activeMessage = (page) => page.locator('#board-select').inputValue().then((profile) => page.textContent(
  profile === 'board.rp2040-pico-v1' ? '#pico-message'
    : profile === 'board.esp32-c3-devmodule-v1' ? '#c3-message'
      : profile === 'board.stm32f429zi-nucleo144-v1' ? '#stm32-message' : '#project-message',
));
const activeMessageSelector = (profile) => profileUi(profile).message;
const saveSelector = (profile) => profileUi(profile).save;
function assertProjectPreserved(actual, original, label) {
  const comparable = structuredClone(actual);
  if (original.circuit.layout?.idCounters === undefined && comparable.circuit.layout?.idCounters !== undefined) {
    const expectedCounters = { button: 0, ground: 0, led: 0, resistor: 0, switch: 0 };
    for (const component of original.circuit.components) {
      for (const prefix of Object.keys(expectedCounters)) {
        const match = component.id.match(new RegExp(`^${prefix}-(\\d+)$`, 'u'));
        if (match) expectedCounters[prefix] = Math.max(expectedCounters[prefix], Number(match[1]));
      }
    }
    assert.deepEqual(comparable.circuit.layout.idCounters, expectedCounters,
      `${label}: invalid migrated monotone ID counters`);
    delete comparable.circuit.layout.idCounters;
  }
  assert.deepEqual(comparable, original, `${label}: authored project fields changed`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true,
    serviceWorkers: 'block' });
  await context.addInitScript(() => { window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined; });
  try {
    for (const name of fixtures) {
      const originalBytes = fs.readFileSync(path.join(fixtureRoot, name), 'utf8');
      const original = JSON.parse(originalBytes);
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__M11_READY__ === true);

      const before = await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current());
      await openBytes(page, original.profile, name, originalBytes);
      await page.waitForFunction((profile) => document.querySelector('#board-select').value === profile
        && ['#project-message', '#pico-message', '#c3-message', '#stm32-message']
          .some((selector) => document.querySelector(selector).textContent.includes('validated data only')), original.profile);
      const opened = JSON.parse(await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current()));
      assertProjectPreserved(opened.project, original.project, `${name}: Open`);
      assert.notDeepEqual(opened.modelLibrary, original.modelLibrary, `${name}: historical lock was not migrated`);
      assert.match(await activeMessage(page), /original file is unchanged; fresh Build is required/iu,
        `${name}: data-only recovery was not visible`);
      assert.equal(await page.locator('#project-file-message').isVisible(), true,
        `${name}: recovery message was hidden`);
      assert.match(await page.textContent('#project-file-message'), /validated data only.+original file is unchanged/iu);
      const ui = profileUi(original.profile);
      const renderedNets = await page.locator(`${ui.wires} ${ui.wire}`).evaluateAll(
        (nodes) => [...new Set(nodes.map((node) => node.dataset.net))].sort(),
      );
      assert.deepEqual(renderedNets, original.project.circuit.nets.map((net) => net.id).sort(),
        `${name}: rendered wire net identities differ from graph`);
      const wirePaths = await page.locator(`${ui.wires} ${ui.wire}`).evaluateAll(
        (nodes) => nodes.map((node) => node.getAttribute('d')),
      );
      assert(wirePaths.every((value) => typeof value === 'string' && /^M [\d.-]+ [\d.-]+/u.test(value)),
        `${name}: one or more rendered wires has no path geometry`);
      const branched = original.profile === 'board.atmega328p-16mhz-v1'
        ? original.project.circuit.junctions.length
        : original.project.circuit.nets.filter((net) => net.endpoints.length === 3).length;
      assert.equal(await page.locator(`${ui.wires} ${ui.junction}`).count(), branched,
        `${name}: rendered junction count differs from graph`);

      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__M11_READY__ === true);
      await page.selectOption('#board-select', original.profile);
      const reloaded = JSON.parse(await page.evaluate((profile) => window.__COMMON_PROJECT_FILES__.current(profile), original.profile));
      assertProjectPreserved(reloaded.project, original.project, `${name}: reload`);

      await openProjectDialog(page);
      assert.equal(await page.locator(saveSelector(original.profile)).isVisible(), true,
        `${name}: Download copy control is hidden after reload`);
      assert.equal(await page.locator(saveSelector(original.profile)).isEnabled(), true,
        `${name}: Download copy control is disabled after reload`);
      const [download] = await Promise.all([page.waitForEvent('download'), page.click(saveSelector(original.profile))]);
      const downloadedBytes = fs.readFileSync(await download.path(), 'utf8');
      const downloaded = JSON.parse(downloadedBytes);
      assertProjectPreserved(downloaded.project, original.project, `${name}: Download`);
      assert.deepEqual(downloaded.modelLibrary, opened.modelLibrary, `${name}: Download did not retain validated current lock`);
      await openBytes(page, original.profile, `roundtrip-${name}`, downloadedBytes);
      await page.waitForFunction((profile) => document.querySelector('#board-select').value === profile, original.profile);
      assertProjectPreserved(JSON.parse(await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current())).project,
        original.project, `${name}: downloaded roundtrip`);

      const protectedBytes = await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current());
      const forged = structuredClone(original);
      forged.modelLibrary.manifestSha256 = `${original.modelLibrary.manifestSha256[0] === 'a' ? 'b' : 'a'}${original.modelLibrary.manifestSha256.slice(1)}`;
      await openBytes(page, original.profile, `forged-${name}`, JSON.stringify(forged));
      await page.waitForFunction(() => ['#project-message', '#pico-message', '#c3-message', '#stm32-message']
        .some((selector) => document.querySelector(selector).textContent.includes('MODEL_LIBRARY_LOCK_UNTRUSTED')));
      assert.equal(await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current()), protectedBytes,
        `${name}: altered lock changed the current project`);
      assert.match(await activeMessage(page), /Open rejected \(MODEL_LIBRARY_LOCK_UNTRUSTED\).+unchanged/iu,
        `${name}: altered lock rejection was not actionable and visible`);
      assert.equal(await page.locator('#project-file-message').isVisible(), true,
        `${name}: altered-lock rejection was hidden`);
      assert.match(await page.textContent('#project-file-message'), /MODEL_LIBRARY_LOCK_UNTRUSTED.+unchanged/iu);

      const unknown = structuredClone(original);
      unknown.modelLibrary.manifestSha256 = 'a'.repeat(64);
      unknown.modelLibrary.implementationSha256 = 'b'.repeat(64);
      await openBytes(page, original.profile, `unknown-${name}`, JSON.stringify(unknown));
      await page.waitForFunction(() => ['#project-message', '#pico-message', '#c3-message', '#stm32-message']
        .some((selector) => document.querySelector(selector).textContent.includes('MODEL_LIBRARY_LOCK_UNTRUSTED')));
      assert.equal(await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current()), protectedBytes,
        `${name}: unknown lock changed the current project`);
      await openBytes(page, original.profile, `accepted-after-rejection-${name}`, downloadedBytes);
      await page.waitForFunction(() => !document.querySelector('#project-file-message').textContent
        .includes('MODEL_LIBRARY_LOCK_UNTRUSTED'));
      assert.match(await page.textContent('#project-file-message'), /Common project opened.+fresh Build is required/iu,
        `${name}: accepted Open did not replace the stale visible rejection`);
      assertProjectPreserved(JSON.parse(await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current())).project,
        original.project, `${name}: accepted Open after rejection`);
      assert.notEqual(before, '', `${name}: initial project proof missing`);
      assert.deepEqual(pageErrors, [], `${name}: browser page errors`);
      await page.close();
    }
  } finally { await browser.close(); }
  process.stdout.write(`${JSON.stringify({ result: 'pass', actualExports: fixtures.length,
    profiles: 4, openReloadDownloadRoundtrip: true, alteredAndUnknownAtomic: true, visibleErrors: true })}\n`);
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
