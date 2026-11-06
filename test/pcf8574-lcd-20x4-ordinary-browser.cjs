// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium } = require(path.join(moduleRoot, 'playwright'));

const base = process.env.PCF8574_LCD_20X4_UI_URL || 'http://127.0.0.1:18776';
const source = fs.readFileSync(path.join(__dirname,
  '../fixtures/pcf8574_lcd_20x4_water_tank/pcf8574_lcd_20x4_water_tank.ino'), 'utf8');
const envelope = JSON.parse(fs.readFileSync(path.join(__dirname,
  '../examples/lcd/pcf8574-0x27-lcd.intent-mcu.json'), 'utf8'));
envelope.project.project.metadata.name = 'PCF8574 20x4 water-tank adapter qualification';
envelope.project.project.source.files[0].content = source;
const component = envelope.project.candidateCircuit.components
  .find((item) => item.id === 'pcf8574-lcd-1');
component.label = 'Water tank LCD 20x4';
component.properties.geometry = '20x4';
const fixtureBytes = Buffer.from(JSON.stringify(envelope));

let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(90_000);
  const pageErrors = [];
  const outside = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack || String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url());
  });

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  await page.click('#workbench-view-advanced');
  await page.setInputFiles('#project-open-input', {
    name: 'pcf8574-20x4-water-tank-adapter-qualification.intent-mcu.json',
    mimeType: 'application/json',
    buffer: fixtureBytes,
  });
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
    await page.click('#unsaved-discard');
  }
  await page.waitForSelector('[data-component-id="pcf8574-lcd-1"]');
  assert.equal(await page.locator('#model-library-migrate').isEnabled(), false,
    'fixture unexpectedly needs model migration');
  if (await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) {
    await page.click('#workbench-project-dialog .workbench-popup-close');
  }
  const authored = await page.evaluate(() => {
    const project = window.__M6_PROJECT__();
    const display = project.candidateCircuit.components.find((item) => item.id === 'pcf8574-lcd-1');
    const artwork = document.querySelector(
      '[data-component-id="pcf8574-lcd-1"] [data-artwork-key="output-character-lcd-16x2-pcf8574"]',
    );
    return { properties: display.properties, artworkGeometry: artwork?.dataset.geometry };
  });
  assert.deepEqual(authored.properties, { address: 0x27, geometry: '20x4' });
  assert.equal(authored.artworkGeometry, '20x4');

  await page.click('#quick-build');
  await page.waitForFunction(() => ['succeeded', 'failed'].includes(window.__M6_STATE__.buildState));
  assert.equal(await page.evaluate(() => window.__M6_STATE__.buildState), 'succeeded',
    await page.locator('#build-log').textContent());
  const buildIdentity = await page.evaluate(() => ({
    inputIdentity: window.__M6_STATE__.inputIdentity,
    artifactIdentity: window.__M6_STATE__.artifactIdentity,
  }));
  await page.click('#quick-run');
  await page.waitForFunction(() => !document.querySelector('#speed').disabled);
  await page.evaluate(() => {
    const speed = document.querySelector('#speed');
    speed.value = 'maximum';
    speed.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const lcd = document.querySelector(
      '[data-component-id="pcf8574-lcd-1"] [data-artwork-key="output-character-lcd-16x2-pcf8574"]',
    );
    return lcd?.dataset.protocolState === 'ready'
      && lcd.dataset.line1 === 'Level: 20.0%        '
      && lcd.dataset.line2 === 'Mode: AUTO          '
      && lcd.dataset.line3 === 'Pump: ON            '
      && lcd.dataset.line4 === 'Alarm: OK           ';
  }, null, { timeout: 30_000 });
  const visible = await page.evaluate(() => {
    const lcd = document.querySelector(
      '[data-component-id="pcf8574-lcd-1"] [data-artwork-key="output-character-lcd-16x2-pcf8574"]',
    );
    return [lcd.dataset.line1, lcd.dataset.line2, lcd.dataset.line3, lcd.dataset.line4];
  });
  assert.deepEqual(visible, [
    'Level: 20.0%        ', 'Mode: AUTO          ', 'Pump: ON            ', 'Alarm: OK           ',
  ]);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(outside, []);
  process.stdout.write(`${JSON.stringify({
    result: 'pass',
    evidenceClass: 'ordinary-build-run-project-owned-adapter-qualification-not-exact-visuino-substitute',
    actualBuilds: 1,
    sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
    ...buildIdentity,
    geometry: authored.artworkGeometry,
    visible,
    outsideRequests: outside.length,
  })}\n`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
});
