// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const base = process.env.FINAL_CONTROLS_URL || 'http://127.0.0.1:18999';
const value = (page, id, key) => page.evaluate(({ id, key }) => { const project = window.__M6_PROJECT__();
  return (project.candidateCircuit ?? project.circuit).components.find((item) => item.id === id).controls[key]; }, { id, key });
async function discard(page) { if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard'); }
async function closeProject(page) { if (await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) await page.click('#workbench-project-dialog .workbench-popup-close'); }
async function open(page, file) { await page.setInputFiles('#project-open-input', path.resolve(file)); await discard(page);
  await page.waitForFunction(() => Boolean(window.__M6_PROJECT__()));
  if (await page.locator('#model-library-migrate').isEnabled()) { const [download] = await Promise.all([page.waitForEvent('download'), page.click('#model-library-migrate')]);
    await page.setInputFiles('#project-open-input', fs.readFileSync(await download.path())); await discard(page); }
  await closeProject(page); await page.click('#serial-tab'); }
async function toggle(page, id, key, token = `${id}.${key}`) { const before = await value(page, id, key); await page.locator(`[data-control="${token}"]:visible`).click();
  const after = await value(page, id, key); assert.notEqual(after, before, token); return [before, after]; }
(async () => { const browser = await chromium.launch({ headless: true }); try { const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(60_000); await page.goto(base); await page.waitForFunction(() => window.__M11_READY__ === true); await page.click('#workbench-view-advanced');
  await open(page, 'examples/input-controls/avr-mechanical-inputs.intent-mcu.json');
  for (const [id, key] of [['slide-switch-1','selectedThrow'],['nc-button-1','pressed'],['limit-switch-1','actuated']]) await toggle(page,id,key);
  await page.click('#workbench-instruments-dialog .workbench-popup-close');
  await open(page, 'examples/input-controls/avr-safety-pedal-inputs.intent-mcu.json');
  for (const [id, key] of [['reed-switch-1','magnetPresent'],['emergency-stop-1','latched'],['foot-pedal-1','pressed']]) await toggle(page,id,key);
  await page.click('#workbench-instruments-dialog .workbench-popup-close');
  await open(page, 'examples/input-controls/avr-quadrature-encoder.intent-mcu.json');
  await toggle(page,'encoder-1','detent','encoder-1.cw'); await page.click('#workbench-instruments-dialog .workbench-popup-close');
  const added = await page.evaluate(() => window.__M6_ADD__('output.dc-motor-encoder-v1')); assert.equal(added.ok, true, JSON.stringify(added));
  await page.click('#serial-tab'); await toggle(page,'dc-motor-encoder-1','detent','dc-motor-encoder-1.detent-cw');
  const project = JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__()));
  await page.click('#workbench-instruments-dialog .workbench-popup-close'); await page.click('#project-files-open');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]); await page.setInputFiles('#project-open-input', await download.path()); await page.waitForTimeout(100); await discard(page);
  await page.waitForFunction((expected) => JSON.stringify(window.__M6_PROJECT__()) === expected, project);
  process.stdout.write(`${JSON.stringify({ ok:true, models:8, fields:8, saveOpen:true, dcMotorEncoderVisible:true })}\n`);
} finally { await browser.close(); } })().catch((error) => { console.error(error); process.exitCode=1; });
