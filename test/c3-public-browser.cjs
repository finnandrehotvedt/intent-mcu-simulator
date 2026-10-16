// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('fs');
const path = require('path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.C3_STAGING_URL || 'http://127.0.0.1:18777';
const screenshotDirectory = process.env.C3_SCREENSHOT_DIR || null;
const expectTestState = process.env.C3_EXPECT_TEST_STATE !== '0';

function assert(condition, message) { if (!condition) throw new Error(message); }
function source(marker, mode = 'OUTPUT', level = 'HIGH') {
  return `// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0

void setup() {
  Serial.begin(115200);
  pinMode(2, ${mode});
  digitalWrite(2, ${level});
  Serial.println("${marker}");
}

void loop() {
  delay(1000);
}
`;
}

let browser;
const failures = [];
(async () => {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const outside = [];
  page.on('pageerror', (error) => failures.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url());
  });
  page.on('response', async (response) => {
    if (response.url().includes('/api/c3/') && response.status() >= 400) {
      failures.push(`${response.status()} ${response.url()} ${(await response.text()).slice(0, 1600)}`);
    }
  });
  const response = await page.goto(base, { waitUntil: 'domcontentloaded' });
  assert(response?.status() === 200, 'public root did not load');
  await page.waitForFunction(() => window.__M11_READY__ === true);
  await page.selectOption('#board-select', 'board.esp32-c3-devmodule-v1');
  await page.waitForFunction(() => window.__ESP32C3_PUBLIC_WORKBENCH__?.state().active === true);

  const activeLayout = await page.evaluate(() => ({
    c3Hidden: document.querySelector('#c3-public-workbench').hidden,
    avrWorkspaceHidden: document.querySelector('#workbench-workspace').hidden,
    returnHidden: document.querySelector('#controller-return-avr').hidden,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert(!activeLayout.c3Hidden && activeLayout.avrWorkspaceHidden && !activeLayout.returnHidden,
    `active C3 circuit was not isolated from parked AVR canvas: ${JSON.stringify(activeLayout)}`);
  assert(activeLayout.overflow <= 1, `C3 desktop overflow: ${activeLayout.overflow}`);

  async function buildAndRun(sourceText, marker) {
    await page.fill('#c3-source', sourceText);
    const started = Date.now();
    await page.click('#c3-build');
    await page.waitForFunction(() => ['built', 'failed', 'blocked'].includes(
      window.__ESP32C3_PUBLIC_WORKBENCH__.state().phase,
    ), null, { timeout: 190_000 });
    const built = await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state());
    assert(built.phase === 'built', `C3 build failed: ${built.message}`);
    assert(built.runnable === true, 'fresh C3 build did not become runnable');
    assert(/^[0-9a-f]{64}$/u.test(built.artifact.sourceSha256), 'source identity missing');
    assert(/^[0-9a-f]{64}$/u.test(built.artifact.flashSha256), 'flash identity missing');
    await page.click('#c3-run');
    await page.waitForFunction(() => ['complete', 'failed'].includes(
      window.__ESP32C3_PUBLIC_WORKBENCH__.state().phase,
    ), null, { timeout: 45_000 });
    const complete = await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state());
    assert(complete.phase === 'complete', `C3 run failed: ${complete.message}`);
    assert(complete.runtime.engine.actualExecution === true, 'QEMU execution truth missing');
    assert(complete.runtime.engine.provider === 'Espressif', 'QEMU provider mismatch');
    assert(complete.runtime.uart.markerCount === 2, 'reset replay did not produce two UART epochs');
    assert(complete.runtime.uart.bootEpochs.every((epoch) => epoch.marker === marker && epoch.mode === 'DIO'),
      'UART marker or DIO boot provenance mismatch');
    assert(complete.runtime.gpio.qemuPinStateObserved === false, 'QEMU pin-state overclaim');
    assert(complete.runtime.modeledCircuit.qemuPinStateObserved === false, 'model pin-state overclaim');
    return { state: complete, elapsedMs: Date.now() - started };
  }

  const high = await buildAndRun(source('C3_HIGH', 'OUTPUT', 'HIGH'), 'C3_HIGH');
  assert(high.state.runtime.modeledCircuit.epochs.at(-1).led.code === 'LED_ON', 'HIGH did not light modeled LED');
  assert(await page.locator('#c3-diagram').getAttribute('data-led') === 'on', 'HIGH LED visual stayed off');

  await page.click('#c3-disconnect');
  const disconnectedBeforeBuild = await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state());
  assert(!disconnectedBeforeBuild.circuitAccepted && !disconnectedBeforeBuild.runnable,
    'disconnect did not retire executable authority');
  const disconnected = await buildAndRun(source('C3_DISCONNECTED', 'OUTPUT', 'HIGH'), 'C3_DISCONNECTED');
  assert(disconnected.state.runtime.modeledCircuit.validation.code === 'CIRCUIT_DISCONNECTED',
    'disconnected circuit was not reported');
  assert(disconnected.state.runtime.modeledCircuit.epochs.at(-1).led.on === false,
    'disconnected model lit the LED');

  await page.click('#c3-reconnect');
  const low = await buildAndRun(source('C3_LOW', 'OUTPUT', 'LOW'), 'C3_LOW');
  assert(low.state.runtime.modeledCircuit.epochs.at(-1).led.code === 'LED_OFF', 'LOW did not turn modeled LED off');
  assert(low.state.artifact.sourceSha256 !== high.state.artifact.sourceSha256, 'edited source reused source identity');
  assert(low.state.artifact.flashSha256 !== high.state.artifact.flashSha256, 'edited source reused flash identity');

  const input = await buildAndRun(source('C3_INPUT', 'INPUT', 'HIGH'), 'C3_INPUT');
  assert(input.state.runtime.modeledCircuit.epochs.at(-1).led.code === 'GPIO_WRONG_MODE',
    'INPUT mode did not stay high-impedance in the project model');

  if (screenshotDirectory) {
    fs.mkdirSync(screenshotDirectory, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDirectory, 'c3-public-desktop.png'), fullPage: true });
  }
  await page.click('#c3-stop');
  assert((await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state())).runnable === false,
    'Stop retained executable authority');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    panel: document.querySelector('#c3-public-workbench').getBoundingClientRect().toJSON(),
    workspaceHidden: document.querySelector('#workbench-workspace').hidden,
  }));
  assert(mobile.overflow <= 1 && mobile.panel.left >= 8 && mobile.panel.right <= 382,
    `C3 mobile layout invalid: ${JSON.stringify(mobile)}`);
  assert(mobile.workspaceHidden, 'parked AVR canvas reappeared on mobile');
  if (screenshotDirectory) {
    await page.screenshot({ path: path.join(screenshotDirectory, 'c3-public-mobile.png'), fullPage: true });
  }

  if (expectTestState) {
    const stateResponse = await context.request.get(`${base}/api/c3/__test/state`);
    assert(stateResponse.status() === 200, 'C3 test-state endpoint unavailable locally');
    const state = await stateResponse.json();
    assert(state.activeSessions === 0 && state.retainedFlashBytes === 0
      && state.buildInFlight === 0 && state.runtimeInFlight === 0,
    `C3 service retained transient state: ${JSON.stringify(state)}`);
  }
  assert(outside.length === 0, `third-party requests: ${outside.join(', ')}`);
  assert((await context.cookies()).length === 0, 'C3 workbench set cookies');
  assert(failures.length === 0, failures.join(' | '));
  console.log(JSON.stringify({ result: 'pass', activeLayout,
    journeys: {
      high: { elapsedMs: high.elapsedMs, flash: high.state.artifact.flashSha256 },
      disconnected: { elapsedMs: disconnected.elapsedMs },
      low: { elapsedMs: low.elapsedMs, flash: low.state.artifact.flashSha256 },
      input: { elapsedMs: input.elapsedMs },
    }, mobile }));
  await context.close();
})().catch((error) => {
  console.error(`${error.stack || error}\n${failures.join('\n')}`);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
