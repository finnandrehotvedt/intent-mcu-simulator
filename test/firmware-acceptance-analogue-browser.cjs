// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict'); const crypto = require('node:crypto'); const fs = require('node:fs'); const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const base = process.env.FIRMWARE_ACCEPTANCE_URL || 'http://127.0.0.1:18999';
const suites = [
  ['examples/analogue-detection-sensors/avr-analogue-detection-sensors.intent-mcu.json', ['flame-sensor-1.flameIntensityRatio','rain-sensor-1.wetnessRatio','sound-level-1.soundLevelRatio'], /rain=\d+,sound=\d+,flame=\d+/gu],
  ['examples/analogue-exposure-sensors/avr-analogue-exposure-sensors.intent-mcu.json', ['co2-sensor-1.co2ResponseRatio','mq-gas-1.gasResponseRatio','uv-sensor-1.uvResponseRatio'], /mq_response=\d+,co2_response=\d+,uv_response=\d+/gu],
  ['examples/analogue-moisture-level-sensors/avr-analogue-moisture-level-sensors.intent-mcu.json', ['soil-capacitive-1.moistureRatio','soil-resistive-1.moistureRatio','water-level-1.waterLevelRatio'], /soil_res=\d+,soil_cap=\d+,water=\d+/gu],
  ['examples/analogue-direction-field-sensors/avr-analogue-direction-field-sensors.intent-mcu.json', ['hall-field-1.magneticFieldRatio','wind-direction-1.directionDegrees'], /wind_direction_adc=\d+,hall_field_adc=\d+/gu],
  ['examples/analogue-temperature-ic-sensors/avr-analogue-temperature-ic-sensors.intent-mcu.json', ['lm35-1.temperatureC','tmp36-1.temperatureC'], /tmp36_c=-?\d+\.\d,lm35_c=-?\d+\.\d/gu],
  ['examples/resistive-divider-sensors/avr-resistive-divider-sensors.intent-mcu.json', ['flex-divider-1.bendRatio','fsr-divider-1.forceRatio','ldr-divider-1.lightLevel','ntc-divider-1.temperatureC'], /LDR=\d+,NTC=\d+,FLEX=\d+/gu],
];
async function latestComplete(page, pattern, prior = null) {
  if (prior !== null) await page.waitForFunction(({ source, priorValue }) => {
    const matches = [...document.querySelector('#serial-output').textContent.matchAll(new RegExp(source, 'gu'))];
    return Boolean(matches.at(-1)?.[0]) && matches.at(-1)[0] !== priorValue;
  }, { source: pattern.source, priorValue: prior }, { timeout: 10_000 });
  await page.waitForTimeout(100);
  const value = await page.locator('#serial-output').evaluate((node, source) => {
    const matches = [...node.textContent.matchAll(new RegExp(source, 'gu'))];
    return matches.at(-1)?.[0] ?? '';
  }, pattern.source);
  assert(value, `no complete UART line matching ${pattern}`);
  if (prior !== null) assert.notEqual(value, prior, `UART observation did not change for ${pattern}`);
  return value;
}
async function discard(page) { if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard'); }
async function open(page, file) { await page.setInputFiles('#project-open-input', path.resolve(file)); await discard(page);
  await page.waitForFunction(() => Boolean(window.__M6_PROJECT__()?.candidateCircuit));
  if (await page.locator('#model-library-migrate').isEnabled()) { const [download] = await Promise.all([page.waitForEvent('download'), page.click('#model-library-migrate')]);
    await page.setInputFiles('#project-open-input', fs.readFileSync(await download.path())); await discard(page); }
  if (await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) await page.click('#workbench-project-dialog .workbench-popup-close'); }
async function buildRun(page) { await page.click('#quick-build'); await page.waitForFunction(() => window.__M6_STATE__.buildState === 'succeeded', null, { timeout: 90_000 });
  const identity = await page.evaluate(() => ({ artifact: window.__M6_STATE__.artifactIdentity, input: window.__M6_STATE__.inputIdentity,
    source: window.__M6_PROJECT__().project.source.files.map((file) => file.content).join('\n') }));
  assert.match(identity.artifact, /^[a-f0-9]{64}$/u); await page.waitForFunction(() => !document.querySelector('#quick-run').disabled);
  await page.click('#quick-run'); await page.click('#serial-tab');
  await page.waitForFunction(() => document.querySelector('#serial-output').textContent.trim().length > 0, null, { timeout: 20_000 });
  return { artifact: identity.artifact, input: identity.input, sourceSha256: crypto.createHash('sha256').update(identity.source).digest('hex') }; }
(async () => { const browser = await chromium.launch({ headless: true }); try { const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(60_000); await page.goto(base); await page.waitForFunction(() => window.__M11_READY__ === true); await page.click('#workbench-view-advanced'); const results=[];
  for (const [file, fields, pattern] of suites) { await open(page,file); const identity=await buildRun(page); const observations=[];
    for (const token of fields) { let control=page.locator(`[data-control="${token}"]:visible`); const {min,max}=await control.evaluate((node)=>({min:node.min,max:node.max}));
      const observationPattern = token.startsWith('fsr-divider-') ? /,FSR=\d+/gu : pattern;
      const before=await latestComplete(page,observationPattern); await control.fill(String(min)); const low=await latestComplete(page,observationPattern,before);
      control=page.locator(`[data-control="${token}"]:visible`); await control.fill(String(max)); const high=await latestComplete(page,observationPattern,low);
      observations.push({field:token,controlMin:min,controlMax:max,low,high}); }
    results.push({file,identity,observations}); await page.click('#workbench-instruments-dialog .workbench-popup-close'); await page.click('#quick-stop'); }
  process.stdout.write(`${JSON.stringify({ok:true,models:17,fields:17,actualBuilds:results.length,results})}\n`);
} finally { await browser.close(); } })().catch((error)=>{console.error(error);process.exitCode=1;});
