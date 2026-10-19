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

async function editorGeometry(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(
    () => requestAnimationFrame(() => requestAnimationFrame(resolve)),
  ))));
  return page.evaluate(() => {
    const canvas = document.querySelector('#c3-diagram').getBoundingClientRect();
    const state = window.__ESP32C3_PUBLIC_WORKBENCH__.state();
    const anchors = Object.fromEntries([...document.querySelectorAll('[data-c3-endpoint]')].map((node) => {
      const box = node.getBoundingClientRect();
      const endpoint = node.dataset.c3Endpoint;
      const pin = endpoint.slice(endpoint.lastIndexOf('.') + 1);
      const terminal = node.closest('.pico-editor-part').querySelector(`[data-terminal-pin="${pin}"]`).getBoundingClientRect();
      return [endpoint, {
        x: box.left - canvas.left + box.width / 2,
        y: box.top - canvas.top + box.height / 2,
        terminalX: terminal.left - canvas.left + terminal.width / 2,
        terminalY: terminal.top - canvas.top + terminal.height / 2,
      }];
    }));
    const bodies = [...document.querySelectorAll('#c3-editor-components .pico-editor-part')].map((node) => {
      const box = node.getBoundingClientRect();
      return { id: node.dataset.componentId, left: box.left - canvas.left, right: box.right - canvas.left,
        top: box.top - canvas.top, bottom: box.bottom - canvas.top };
    });
    const routes = [...document.querySelectorAll('#c3-editor-wires .pico-editor-wire')].map((node) => {
      const points = JSON.parse(node.dataset.points);
      const net = state.project.circuit.nets.find((candidate) => candidate.id === node.dataset.net);
      const endpointKeys = net.endpoints.map((endpoint) => `${endpoint.component}.${endpoint.pin}`);
      const attached = endpointKeys.every((key) => points.some((point) => Math.hypot(
        point.x - anchors[key].terminalX, point.y - anchors[key].terminalY,
      ) < 1));
      const anchorsMatchTerminals = endpointKeys.every((key) => Math.hypot(
        anchors[key].x - anchors[key].terminalX, anchors[key].y - anchors[key].terminalY,
      ) < 1);
      const crossesComponentBody = points.slice(1).some((end, index) => {
        const start = points[index];
        return bodies.some((body) => {
          const namedEscape = index === 0 && body.id === net.endpoints[0].component
            || index === points.length - 2 && body.id === net.endpoints[1].component;
          if (namedEscape) return false;
          if (Math.abs(start.y - end.y) < 0.5) return start.y > body.top && start.y < body.bottom
            && Math.max(start.x, end.x) > body.left && Math.min(start.x, end.x) < body.right;
          if (Math.abs(start.x - end.x) < 0.5) return start.x > body.left && start.x < body.right
            && Math.max(start.y, end.y) > body.top && Math.min(start.y, end.y) < body.bottom;
          return true;
        });
      });
      return { net: node.dataset.net, endpointKeys, attached, anchorsMatchTerminals, crossesComponentBody,
        orthogonal: points.slice(1).every((point, index) => point.x === points[index].x || point.y === points[index].y), points };
    });
    const labelGroups = [...document.querySelectorAll('#c3-editor-components .pico-editor-part')].map((part) => ({
      id: part.dataset.componentId,
      labels: [...part.querySelectorAll('.pico-editor-pin-label, .pico-editor-part-label')]
        .map((label) => ({ text: label.textContent, rect: label.getBoundingClientRect().toJSON() })),
    }));
    const labelsReadable = labelGroups.every((group) => group.labels.every((label) => label.text.trim() && label.rect.width > 4 && label.rect.height > 4)
      && group.labels.every((label, index) => group.labels.slice(index + 1).every((other) => !(
        label.rect.left < other.rect.right - 1 && label.rect.right > other.rect.left + 1
        && label.rect.top < other.rect.bottom - 1 && label.rect.bottom > other.rect.top + 1
      ))));
    return { routes, bodies, anchors, labelGroups, labelsReadable };
  });
}

function assertEditorGeometry(geometry) {
  assert(geometry.routes.length === 3, JSON.stringify(geometry));
  assert(geometry.routes.every((route) => route.attached && route.anchorsMatchTerminals
    && route.orthogonal && !route.crossesComponentBody), JSON.stringify(geometry));
  assert(geometry.labelsReadable, JSON.stringify(geometry.labelGroups));
}

let browser;
const failures = [];
(async () => {
  browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_PROXY ? { proxy: { server: process.env.PLAYWRIGHT_PROXY } } : {}) });
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
  await page.waitForFunction(() => window.__ESP32C3_PUBLIC_WORKBENCH__?.state().active === true
    && document.querySelectorAll('#c3-editor-wires .pico-editor-wire').length === 3);
  const boundary = await page.locator('#c3-public-workbench').innerText();
  assert(boundary.includes('ACTUAL EXECUTION') && boundary.includes('SEPARATE PROJECT MODEL')
    && boundary.includes('QEMU pin state is not observed or claimed'), 'C3 execution/model labels missing');
  const initialGeometry = await editorGeometry(page); assertEditorGeometry(initialGeometry);

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
  const topologyBeforePending = high.state.project.circuit;
  await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.selectCircuit({ kind: 'net', id: 'net-gpio2' }));
  await page.click('#c3-reconnect');
  let pending = await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state());
  assert(pending.circuitCode === 'C3_WIRING_IN_PROGRESS' && pending.circuitEditor.wireDraft.mode === 'reconnect-source',
    'C3 reconnect did not enter an explicit pending state');
  assert(!pending.runnable && pending.artifact === null && pending.runtime === null,
    'C3 pending wire retained executable or LED authority');
  assert(await page.locator('#c3-build').isDisabled(), 'C3 Build enabled during pending wire');
  assert(await page.locator('#c3-diagram').getAttribute('data-led') === 'off', 'C3 pending wire retained LED state');
  await page.keyboard.press('Escape');
  pending = await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state());
  assert(JSON.stringify(pending.project.circuit) === JSON.stringify(topologyBeforePending), 'C3 Escape mutated topology');
  assert(pending.circuitEditor.wireDraft.mode === 'none' && pending.artifact === null && !pending.runnable,
    'C3 Escape restored stale executable authority');
  await page.click('#c3-build');
  await page.waitForFunction(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state().phase === 'built', null, { timeout: 190_000 });

  const resistorBeforeTextArrow = await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state().project.circuit.layout.positions['resistor-1']);
  await page.locator('#c3-source').focus(); await page.keyboard.press('ArrowRight');
  assert(JSON.stringify(await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state().project.circuit.layout.positions['resistor-1']))
    === JSON.stringify(resistorBeforeTextArrow), 'source textarea arrow moved a circuit part');

  await page.locator('#c3-editor-components [data-component-id="resistor-1"]').click(); await page.keyboard.press('ArrowRight');
  let edited = await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state());
  assert(!edited.runnable && edited.artifact === null && edited.runtime === null,
    `move retained stale flash/LED authority: ${JSON.stringify({ phase: edited.phase, runnable: edited.runnable,
      artifact: Boolean(edited.artifact), runtime: Boolean(edited.runtime), selection: edited.circuitEditor.selection,
      position: edited.project.circuit.layout.positions['resistor-1'] })}`);
  assert(await page.locator('#c3-diagram').getAttribute('data-led') === 'off', 'move retained stale LED state');
  assertEditorGeometry(await editorGeometry(page));

  for (const expectedRotation of [90, 180, 270, 0]) {
    await page.locator('#c3-editor-components [data-component-id="resistor-1"]').click(); await page.click('#c3-rotate');
    assert((await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state().project.circuit.layout.positions['resistor-1'].rotation)) === expectedRotation,
      `resistor rotation did not reach ${expectedRotation}`);
    assertEditorGeometry(await editorGeometry(page));
    if (screenshotDirectory) {
      fs.mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDirectory, `c3-editor-resistor-${expectedRotation}.png`), fullPage: true });
    }
  }

  await page.locator('#c3-editor-components [data-component-id="resistor-1"]').click(); await page.keyboard.press('Delete');
  edited = await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state());
  assert(!edited.circuitAccepted && edited.circuitCode === 'C3_SERIES_RESISTOR_REQUIRED'
    && !edited.runnable && edited.artifact === null && edited.runtime === null,
  `invalid topology retained authority: ${JSON.stringify(edited)}`);
  await page.click('#c3-build');
  assert((await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state())).phase === 'blocked',
    'invalid C3 circuit was allowed to build');
  await page.click('#c3-undo'); assertEditorGeometry(await editorGeometry(page));
  assert((await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state())).circuitAccepted, 'Undo did not restore valid circuit');
  await page.click('#c3-redo');
  assert(!(await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state())).circuitAccepted, 'Redo did not restore invalid circuit');
  await page.click('#c3-undo'); assertEditorGeometry(await editorGeometry(page));
  await page.locator('#c3-editor-components [data-component-id="resistor-1"]').click(); await page.click('#c3-rotate');
  assert((await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state().project.circuit.layout.positions['resistor-1'].rotation)) === 90,
    'saved rotation was not 90 degrees');
  await page.click('#c3-zoom-in'); assert((await page.locator('#c3-zoom-value').textContent()) === '110%', 'C3 zoom in failed');
  await page.click('#c3-fit'); assert((await page.locator('#c3-zoom-value').textContent()) === '100%', 'C3 Fit failed');
  assertEditorGeometry(await editorGeometry(page));

  const low = await buildAndRun(source('C3_LOW', 'OUTPUT', 'LOW'), 'C3_LOW');
  assert(low.state.runtime.modeledCircuit.epochs.at(-1).led.code === 'LED_OFF', 'LOW did not turn modeled LED off');
  assert(low.state.artifact.sourceSha256 !== high.state.artifact.sourceSha256, 'edited source reused source identity');
  assert(low.state.artifact.flashSha256 !== high.state.artifact.flashSha256, 'edited source reused flash identity');

  const downloadPromise = page.waitForEvent('download'); await page.click('#c3-save');
  const download = await downloadPromise; const savedPath = await download.path(); const savedText = fs.readFileSync(savedPath, 'utf8');
  const saved = JSON.parse(savedText);
  assert(saved.schema === 'intent-mcu-project-envelope@7' && saved.profile === 'board.esp32-c3-devmodule-v1'
    && saved.project.schema === 'intent-mcu-esp32c3-public-project@1' && saved.project.source.includes('C3_LOW'), 'saved C3 project identity mismatch');
  assert(saved.project.circuit.layout.positions['resistor-1'].rotation === 90, 'saved C3 circuit lost rotation');
  assert(!/artifact|executable|flashSha256|sessionId|capability/iu.test(savedText), 'saved C3 project leaked executable authority');
  await page.locator('#c3-open-input').setInputFiles({ name: 'invalid-c3.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...saved, executable: 'forbidden' })) });
  await page.waitForFunction(() => document.querySelector('#c3-message').textContent.includes('Open rejected'));
  assert((await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state())).runnable, 'rejected C3 file changed accepted project');
  await page.locator('#c3-open-input').setInputFiles(savedPath);
  await page.waitForSelector('#unsaved-change-dialog[open]'); await page.click('#unsaved-discard');
  await page.waitForFunction(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state().runnable === false);
  assert((await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state().project.circuit.layout.positions['resistor-1'].rotation)) === 90,
    'opened C3 project lost circuit layout');
  const reopened = await buildAndRun(source('C3_LOW', 'OUTPUT', 'LOW'), 'C3_LOW');
  assert(reopened.state.runtime.modeledCircuit.epochs.at(-1).led.code === 'LED_OFF', 'reopened C3 project did not rebuild/run LOW');

  const input = await buildAndRun(source('C3_INPUT', 'INPUT', 'HIGH'), 'C3_INPUT');
  assert(input.state.runtime.modeledCircuit.epochs.at(-1).led.code === 'GPIO_WRONG_MODE',
    'INPUT mode did not stay high-impedance in the project model');

  if (screenshotDirectory) {
    fs.mkdirSync(screenshotDirectory, { recursive: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    assertEditorGeometry(await editorGeometry(page));
    await page.screenshot({ path: path.join(screenshotDirectory, 'c3-public-desktop.png'), fullPage: true });
  }
  await page.click('#c3-stop');
  assert((await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state())).runnable === false,
    'Stop retained executable authority');

  await page.setViewportSize({ width: 390, height: 844 });
  assertEditorGeometry(await editorGeometry(page));
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    panel: document.querySelector('#c3-public-workbench').getBoundingClientRect().toJSON(),
    workspaceHidden: document.querySelector('#workbench-workspace').hidden,
  }));
  assert(mobile.overflow <= 1 && mobile.panel.left >= 8 && mobile.panel.right <= 382,
    `C3 mobile layout invalid: ${JSON.stringify(mobile)}`);
  assert(mobile.workspaceHidden, 'parked AVR canvas reappeared on mobile');
  await page.locator('#c3-editor-components [data-component-id="resistor-1"]').click(); await page.keyboard.press('ArrowDown');
  assertEditorGeometry(await editorGeometry(page));
  for (const expectedRotation of [180, 270, 0, 90]) {
    await page.locator('#c3-editor-components [data-component-id="resistor-1"]').click(); await page.keyboard.press('r');
    assert((await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state().project.circuit.layout.positions['resistor-1'].rotation)) === expectedRotation,
      `mobile resistor rotation did not reach ${expectedRotation}`);
    assertEditorGeometry(await editorGeometry(page));
  }
  await page.keyboard.press('Control+z');
  assert((await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state().project.circuit.layout.positions['resistor-1'].rotation)) === 0,
    'mobile Undo failed');
  assertEditorGeometry(await editorGeometry(page));
  await page.keyboard.press('Control+Shift+z');
  assert((await page.evaluate(() => window.__ESP32C3_PUBLIC_WORKBENCH__.state().project.circuit.layout.positions['resistor-1'].rotation)) === 90,
    'mobile Redo failed');
  assertEditorGeometry(await editorGeometry(page));
  await page.setViewportSize({ width: 430, height: 900 }); assertEditorGeometry(await editorGeometry(page));
  await page.setViewportSize({ width: 390, height: 844 }); assertEditorGeometry(await editorGeometry(page));
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
      low: { elapsedMs: low.elapsedMs, flash: low.state.artifact.flashSha256 },
      reopened: { elapsedMs: reopened.elapsedMs, flash: reopened.state.artifact.flashSha256 },
      input: { elapsedMs: input.elapsedMs },
    }, initialGeometry, mobileGeometry: await editorGeometry(page), mobile }));
  await context.close();
})().catch((error) => {
  console.error(`${error.stack || error}\n${failures.join('\n')}`);
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
