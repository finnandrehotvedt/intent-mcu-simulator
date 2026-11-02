// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const base = process.env.SENSOR_AUDIT_URL || 'https://lab-preview.rust.finnandre.no';
const files = ['contact-sensors/avr-contact-sensors', 'digital-presence-sensors/avr-digital-presence-sensors',
  'digital-pulse-sensors/avr-digital-pulse-sensors', 'digital-reflective-sensors/avr-digital-reflective-sensors']
  .map((value) => `examples/${value}.intent-mcu.json`);
const value = (page, id, key) => page.evaluate(({ id, key }) => window.__M6_PROJECT__().candidateCircuit.components
  .find((component) => component.id === id).controls[key], { id, key });
const discard = async (page) => { if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard'); };
const closeProject = async (page) => { if (await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) await page.click('#workbench-project-dialog .workbench-popup-close'); };
async function open(page, file) {
  await page.setInputFiles('#project-open-input', path.resolve(file)); await discard(page);
  await page.waitForFunction(() => Boolean(window.__M6_PROJECT__()?.candidateCircuit));
  if (await page.locator('#model-library-migrate').isEnabled()) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#model-library-migrate')]);
    await page.setInputFiles('#project-open-input', fs.readFileSync(await download.path())); await discard(page);
    await page.waitForFunction(() => document.querySelector('#model-library-status')?.textContent.includes('current immutable'));
  }
  await closeProject(page); await page.click('#serial-tab');
}
async function roundTrip(page) {
  const expected = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
  await page.click('#workbench-instruments-dialog .workbench-popup-close'); await page.click('#project-files-open');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
  await page.setInputFiles('#project-open-input', await download.path()); await page.waitForTimeout(100); await discard(page);
  await page.waitForFunction((project) => JSON.stringify(window.__M6_PROJECT__()) === project, expected); await closeProject(page);
}
(async () => { const browser = await chromium.launch({ headless: true }); try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page.setDefaultTimeout(60_000); await page.goto(base); await page.waitForFunction(() => window.__M11_READY__ === true);
  await page.click('#workbench-view-advanced'); const covered = [];
  for (const file of files) { await open(page, file);
    const buttons = page.locator('#workbench-instruments-dialog button[data-control]:visible'); const count = await buttons.count();
    for (let index = 0; index < count; index += 1) { let button = buttons.nth(index); const token = await button.getAttribute('data-control');
      const [id, key] = token.split('.'); const initial = await value(page, id, key); const initialText = await button.textContent();
      await button.click(); assert.equal(await value(page, id, key), !initial, token);
      button = page.locator(`[data-control="${token}"]:visible`); assert.notEqual(await button.textContent(), initialText, token);
      await button.click(); assert.equal(await value(page, id, key), initial, token); covered.push(token); }
    await roundTrip(page); }
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__M11_READY__ === true);
  assert.equal(await page.evaluate(() => Boolean(window.__M6_PROJECT__()?.candidateCircuit)), true);
  process.stdout.write(`${JSON.stringify({ ok: true, models: covered.length, fields: covered.length,
    covered, bothStates: true, labels: true, saveOpen: true, reload: true })}\n`);
} finally { await browser.close(); } })().catch((error) => { console.error(error); process.exitCode = 1; });
