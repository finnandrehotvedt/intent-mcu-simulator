// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict'); const crypto = require('node:crypto'); const fs = require('node:fs'); const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const base = process.env.FIRMWARE_ACCEPTANCE_URL || 'http://127.0.0.1:18999';
async function discard(page) { if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard'); }
async function open(page, file, id) {
  await page.setInputFiles('#project-open-input', path.resolve(file)); await discard(page);
  await page.waitForFunction((componentId) => window.__M6_PROJECT__()?.candidateCircuit?.components?.some((item) => item.id === componentId), id);
  if (await page.locator('#model-library-migrate').isEnabled()) { const [download] = await Promise.all([page.waitForEvent('download'), page.click('#model-library-migrate')]); await page.setInputFiles('#project-open-input', fs.readFileSync(await download.path())); await discard(page); }
  if (await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) await page.click('#workbench-project-dialog .workbench-popup-close');
}
async function accept(page, { file, id, key, wrong }) {
  await open(page, file, id); await page.click('#quick-build'); await page.waitForFunction(() => ['succeeded', 'failed'].includes(window.__M6_STATE__.buildState));
  assert.equal(await page.evaluate(() => window.__M6_STATE__.buildState), 'succeeded', await page.locator('#build-log').textContent());
  const identity = await page.evaluate(() => { const project = window.__M6_PROJECT__().project; return { artifact: window.__M6_STATE__.artifactIdentity, input: window.__M6_STATE__.inputIdentity, source: project.source.files.map((fileEntry) => fileEntry.content).join('\n') }; });
  await page.click('#quick-run'); await page.waitForFunction(() => !document.querySelector('#speed').disabled); await page.evaluate(() => { const speed = document.querySelector('#speed'); speed.value = 'maximum'; speed.dispatchEvent(new Event('change', { bubbles: true })); }); await page.click('#serial-tab');
  const control = page.locator(`[data-control="${id}.pressedKey"]:visible`); const before = await page.locator('#serial-output').textContent(); await control.selectOption(key); const uart = key.slice(1).replace('C', '');
  await page.waitForFunction(({ offset, expected }) => document.querySelector('#serial-output').textContent.slice(offset).includes(`${expected}\n`), { offset: before.length, expected: uart });
  const delta = (await page.locator('#serial-output').textContent()).slice(before.length); assert(delta.includes(`${uart}\n`)); assert(!delta.includes(`${wrong}\n`), `neighbor key ${wrong} appeared: ${JSON.stringify(delta.slice(-300))}`);
  await control.selectOption('none'); await page.waitForTimeout(300); const released = await page.locator('#serial-output').textContent(); await page.waitForTimeout(500); assert.equal((await page.locator('#serial-output').textContent()).length, released.length, 'released keypad continued producing UART key records');
  await page.click('#workbench-instruments-dialog .workbench-popup-close'); await page.click('#quick-stop');
  return { model: id, key, uart, released: true, artifactIdentity: identity.artifact, inputIdentity: identity.input, sourceSha256: crypto.createHash('sha256').update(identity.source).digest('hex') };
}
(async () => { const browser = await chromium.launch({ headless: true }); try { const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(90000); await page.goto(base, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__M11_READY__ === true); await page.click('#workbench-view-advanced'); const observations = [];
  observations.push(await accept(page, { file: 'examples/joystick-keypads/avr-matrix-keypad-3x4.intent-mcu.json', id: 'keypad-3x4-1', key: 'R4C3', wrong: '44' }));
  observations.push(await accept(page, { file: 'examples/joystick-keypads/avr-matrix-keypad-4x4.intent-mcu.json', id: 'keypad-4x4-1', key: 'R4C4', wrong: '43' }));
  process.stdout.write(`${JSON.stringify({ ok: true, models: 2, fields: 2, actualBuilds: 2, observations })}\n`); } finally { await browser.close(); } })().catch((error) => { console.error(error); process.exitCode = 1; });
