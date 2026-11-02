// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const base = process.env.SENSOR_AUDIT_URL || 'https://lab-preview.rust.finnandre.no';
const files = process.env.CLIMATE_ONLY === '1' ? [] : [
  'examples/analogue-detection-sensors/avr-analogue-detection-sensors.intent-mcu.json',
  'examples/analogue-direction-field-sensors/avr-analogue-direction-field-sensors.intent-mcu.json',
  'examples/analogue-exposure-sensors/avr-analogue-exposure-sensors.intent-mcu.json',
  'examples/analogue-moisture-level-sensors/avr-analogue-moisture-level-sensors.intent-mcu.json',
  'examples/analogue-temperature-ic-sensors/avr-analogue-temperature-ic-sensors.intent-mcu.json',
  'examples/resistive-divider-sensors/avr-resistive-divider-sensors.intent-mcu.json',
];
const projectValue = (page, id, key) => page.evaluate(({ id, key }) => { const project = window.__M6_PROJECT__();
  return (project.candidateCircuit ?? project.circuit).components.find((component) => component.id === id).controls[key]; }, { id, key });
async function discard(page) {
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
}
async function closeProject(page) {
  if (await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) {
    await page.click('#workbench-project-dialog .workbench-popup-close');
  }
}
async function openFile(page, file) {
  await page.setInputFiles('#project-open-input', path.resolve(file)); await discard(page);
  await page.waitForFunction(() => Boolean(window.__M6_PROJECT__()?.candidateCircuit));
  if (await page.locator('#model-library-migrate').isEnabled()) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#model-library-migrate')]);
    await page.setInputFiles('#project-open-input', fs.readFileSync(await download.path())); await discard(page);
    await page.waitForFunction(() => document.querySelector('#model-library-status')?.textContent.includes('current immutable'));
  }
  await closeProject(page); await page.click('#serial-tab');
}
async function exerciseVisibleRanges(page, allowedIds = null) {
  const controls = page.locator('#workbench-instruments-dialog input[type="range"][data-control]:visible');
  const count = await controls.count(); const covered = [];
  for (let index = 0; index < count; index += 1) {
    let control = controls.nth(index); const token = await control.getAttribute('data-control');
    const [id, key] = token.split('.'); const { min, max, step } = await control.evaluate((node) =>
      ({ min: Number(node.min), max: Number(node.max), step: Number(node.step || 1) }));
    if (allowedIds && !allowedIds.includes(id)) continue;
    const candidates = [min, min + Math.round(((max - min) / 2) / step) * step, max];
    for (const candidate of candidates) {
      control = page.locator(`[data-control="${token}"]:visible`); await control.fill(String(candidate));
      const expected = max > 1 && max <= 100 && ['position', 'lightLevel', 'flameIntensityRatio', 'wetnessRatio', 'soundLevelRatio',
        'co2ResponseRatio', 'gasResponseRatio', 'uvResponseRatio', 'moistureRatio',
        'waterLevelRatio'].includes(key) ? candidate / 100 : candidate;
      assert.equal(await projectValue(page, id, key), expected, token);
    }
    const rowText = await page.locator(`[data-control="${token}"]:visible`).locator('xpath=..').textContent();
    assert.match(rowText, /(V|°C|°|%|hPa|ratio|Relative|Temperature|Bend|force|threshold|Hysteresis)/u, token);
    covered.push(token);
  }
  return covered;
}
async function saveOpen(page) {
  const expected = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
  await page.click('#workbench-instruments-dialog .workbench-popup-close');
  if (!(await page.locator('#project-files-open').isVisible())) await page.click('#workbench-view-advanced');
  await page.click('#project-files-open');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
  await page.setInputFiles('#project-open-input', await download.path()); await page.waitForTimeout(100); await discard(page);
  await page.waitForFunction((value) => JSON.stringify(window.__M6_PROJECT__()) === value, expected);
  await closeProject(page); return expected;
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    page.setDefaultTimeout(60_000); await page.goto(base); await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.click('#workbench-view-advanced'); const analogue = [];
    for (const file of files) { await openFile(page, file); analogue.push(...await exerciseVisibleRanges(page)); await saveOpen(page); }
    const climate = [];
    await page.click('#workbench-view-simple');
    const starters = [['#beginner-dht11', 'dht11-1', null], ['#beginner-dht22', 'dht22-1', null],
      ['#beginner-bme280', 'bme280-1', null], [null, 'ds18b20-1', 'avr-ds18b20-temperature'],
      [null, 'pot-1', 'adc'], [null, 'light-sensor-1', 'avr-light-analogue'],
      [null, 'light-threshold-1', 'avr-light-threshold'], [null, 'temperature-sensor-1', 'temperature-lcd-threshold']];
    for (const [button, id, starter] of starters) {
      if (button) await page.click(button);
      else { await page.click('#beginner-examples'); await page.click(`.starter-card[data-example="${starter}"] .starter-action`); }
      await discard(page); await page.waitForSelector(`[data-component-id="${id}"]`);
      await page.click('#serial-tab'); climate.push(...await exerciseVisibleRanges(page, [id]));
      if (id === 'light-threshold-1') {
        const output = async () => projectValue(page, id, 'outputActive');
        await page.locator(`[data-control="${id}.thresholdPercent"]:visible`).fill('50');
        await page.locator(`[data-control="${id}.hysteresisPercentagePoints"]:visible`).fill('0');
        await page.locator(`[data-control="${id}.lightLevelPercent"]:visible`).fill('100'); const high = await output();
        await page.locator(`[data-control="${id}.lightLevelPercent"]:visible`).fill('0'); const low = await output();
        assert.notEqual(high, low); climate.push(`${id}.outputActive`);
      }
      await saveOpen(page);
      await page.click('#workbench-view-simple');
    }
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__M11_READY__ === true);
    assert.equal(await page.evaluate(() => Boolean(window.__M6_PROJECT__()?.candidateCircuit)), true);
    process.stdout.write(`${JSON.stringify({ ok: true, analogueFields: analogue.length, climateFields: climate.length,
      fields: analogue.length + climate.length, analogue, climate, minMidMax: true, saveOpen: true, reload: true })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
