// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.PICO_PUBLIC_URL || 'http://127.0.0.1:18774';
const screenshotDir = process.env.PICO_PUBLIC_SCREENSHOT_DIR || '/tmp';
const HIGH = `/* Intent MCU Simulator public RP2040 source v1 */
int main(void)
{
  intent_gpio0_output(1u);
  intent_uart0_text("PICO HIGH TEST");
  intent_halt();
}
`;
const LOW = HIGH.replace('1u', '0u').replace('PICO HIGH TEST', 'PICO LOW TEST');

async function selectPico(page) {
  await page.selectOption('#board-select', 'board.rp2040-pico-v1');
  await page.waitForFunction(() => !document.querySelector('#pico-public-workbench').hidden
    && window.__RP2040_PUBLIC_WORKBENCH__?.state().active === true
    && document.querySelectorAll('#pico-editor-wires .pico-editor-wire').length === 3);
}

async function build(page, source) {
  await page.fill('#pico-source', source);
  await page.click('#pico-build');
  await page.waitForFunction(() => ['built', 'failed', 'blocked'].includes(window.__RP2040_PUBLIC_WORKBENCH__.state().phase), null, { timeout: 20_000 });
  const state = await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state());
  assert.equal(state.phase, 'built', state.message);
  assert.match(state.artifact.sourceSha256, /^[0-9a-f]{64}$/);
  assert.match(state.artifact.uf2Sha256, /^[0-9a-f]{64}$/);
  return state;
}

async function editorGeometry(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(
    () => requestAnimationFrame(() => requestAnimationFrame(resolve)),
  ))));
  return page.evaluate(() => {
    const canvas = document.querySelector('#pico-diagram').getBoundingClientRect();
    const state = window.__RP2040_PUBLIC_WORKBENCH__.state();
    const anchors = Object.fromEntries([...document.querySelectorAll('[data-pico-endpoint]')].map((node) => {
      const box = node.getBoundingClientRect();
      const endpoint = node.dataset.picoEndpoint;
      const pin = endpoint.slice(endpoint.lastIndexOf('.') + 1);
      const terminal = node.closest('.pico-editor-part').querySelector(`[data-terminal-pin="${pin}"]`).getBoundingClientRect();
      return [endpoint, {
        x: box.left - canvas.left + box.width / 2,
        y: box.top - canvas.top + box.height / 2,
        terminalX: terminal.left - canvas.left + terminal.width / 2,
        terminalY: terminal.top - canvas.top + terminal.height / 2,
      }];
    }));
    const bodies = [...document.querySelectorAll('#pico-editor-components .pico-editor-part')].map((node) => {
      const box = node.getBoundingClientRect();
      return { id: node.dataset.componentId, left: box.left - canvas.left, right: box.right - canvas.left,
        top: box.top - canvas.top, bottom: box.bottom - canvas.top };
    });
    const routes = [...document.querySelectorAll('#pico-editor-wires .pico-editor-wire')].map((node) => {
      const points = JSON.parse(node.dataset.points);
      const net = state.circuit.nets.find((candidate) => candidate.id === node.dataset.net);
      const endpointKeys = net.endpoints.map((endpoint) => `${endpoint.component}.${endpoint.pin}`);
      const attached = endpointKeys.every((key) => points.some((point) => Math.hypot(point.x - anchors[key].terminalX, point.y - anchors[key].terminalY) < 1));
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
      return { net: node.dataset.net, attached, anchorsMatchTerminals, crossesComponentBody,
        orthogonal: points.slice(1).every((point, index) => point.x === points[index].x || point.y === points[index].y), points };
    });
    const labelGroups = [...document.querySelectorAll('#pico-editor-components .pico-editor-part')].map((part) => ({
      id: part.dataset.componentId,
      labels: [...part.querySelectorAll('.pico-editor-pin-label')].map((label) => ({ text: label.textContent, rect: label.getBoundingClientRect().toJSON() })),
    }));
    const labelsReadable = labelGroups.every((group) => group.labels.every((label) => label.text.trim() && label.rect.width > 4 && label.rect.height > 4)
      && group.labels.every((label, index) => group.labels.slice(index + 1).every((other) => !(
        label.rect.left < other.rect.right - 1 && label.rect.right > other.rect.left + 1
        && label.rect.top < other.rect.bottom - 1 && label.rect.bottom > other.rect.top + 1
      ))));
    return { routes, canvas: canvas.toJSON(), bodies, anchors, labelGroups, labelsReadable };
  });
}

function assertEditorGeometry(geometry) {
  assert.equal(geometry.routes.length, 3, JSON.stringify(geometry));
  assert.ok(geometry.routes.every((route) => route.attached && route.anchorsMatchTerminals
    && route.orthogonal && !route.crossesComponentBody), JSON.stringify(geometry.routes));
  assert.equal(geometry.labelsReadable, true, JSON.stringify(geometry.labelGroups));
}

async function selectWire(page, netId) {
  await page.locator('#pico-diagram').scrollIntoViewIfNeeded();
  const point = await page.evaluate((id) => {
    const wire = document.querySelector(`#pico-editor-wires .pico-editor-wire-hit[data-net="${id}"]`);
    const length = wire.getTotalLength();
    for (const fraction of [0.18, 0.3, 0.5, 0.7, 0.82]) {
      const local = wire.getPointAtLength(length * fraction);
      const screen = new DOMPoint(local.x, local.y).matrixTransform(wire.getScreenCTM());
      const topHit = document.elementsFromPoint(screen.x, screen.y).find((node) => node.classList?.contains('pico-editor-wire-hit'));
      if (topHit === wire) return { x: screen.x, y: screen.y };
    }
    throw new Error(`No independently clickable segment for ${id}`);
  }, netId);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction((id) => {
    const selection = window.__RP2040_PUBLIC_WORKBENCH__.state().circuitEditor.selection;
    return selection.kind === 'net' && selection.id === id;
  }, netId);
}

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_PROXY ? { proxy: { server: process.env.PLAYWRIGHT_PROXY } } : {}) });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  const page = await context.newPage();
  const outside = [];
  const errors = [];
  page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const response = await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);

  const desktop = await page.evaluate(() => {
    const rect = document.querySelector('main').getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width, viewport: innerWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  assert.ok(desktop.left >= 15 && desktop.left <= 24, JSON.stringify(desktop));
  assert.ok(desktop.viewport - desktop.right >= 15 && desktop.viewport - desktop.right <= 24, JSON.stringify(desktop));
  assert.ok(desktop.width >= 1880, JSON.stringify(desktop));
  assert.ok(desktop.overflow <= 1, JSON.stringify(desktop));

  await selectPico(page);
  const picoLayout = await page.evaluate(() => ({
    panel: document.querySelector('#pico-public-workbench').getBoundingClientRect().width,
    avrWorkspaceHidden: document.querySelector('#workbench-workspace').hidden,
    gp0: document.querySelector('[data-pico-endpoint="pico-1.GP0"] .pico-editor-pin-label').textContent,
    gnd: document.querySelector('[data-pico-endpoint="pico-1.GND3"] .pico-editor-pin-label').textContent,
    onboard: document.querySelector('.pico-board-led-label').textContent,
    controls: ['pico-delete', 'pico-undo', 'pico-redo', 'pico-rotate', 'pico-zoom-out', 'pico-zoom-in', 'pico-fit']
      .every((id) => document.querySelector(`#${id}`)),
  }));
  assert.ok(picoLayout.panel >= 1800, JSON.stringify(picoLayout));
  assert.equal(picoLayout.avrWorkspaceHidden, true);
  assert.match(picoLayout.gp0, /GPIO0.*physical pin 1/); assert.match(picoLayout.gnd, /GND.*physical pin 3/);
  assert.match(picoLayout.onboard, /GPIO25.*ONBOARD/); assert.equal(picoLayout.controls, true);
  const initialGeometry = await editorGeometry(page); assertEditorGeometry(initialGeometry);

  const resistorBefore = await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuit.layout.positions['resistor-1']);
  await page.locator('#pico-editor-components [data-component-id="resistor-1"]').scrollIntoViewIfNeeded();
  const resistorBox = await page.locator('#pico-editor-components [data-component-id="resistor-1"]').boundingBox();
  await page.mouse.move(resistorBox.x + resistorBox.width / 2, resistorBox.y + resistorBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resistorBox.x + resistorBox.width / 2 + 90, resistorBox.y + resistorBox.height / 2 + 110, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction((before) => {
    const after = window.__RP2040_PUBLIC_WORKBENCH__.state().circuit.layout.positions['resistor-1'];
    return Math.abs(after.x - before.x) > 0.02 && Math.abs(after.y - before.y) > 0.02;
  }, resistorBefore);
  assertEditorGeometry(await editorGeometry(page));

  await page.locator('#pico-editor-components [data-component-id="resistor-1"]').click(); await page.click('#pico-rotate');
  assert.equal(await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuit.layout.positions['resistor-1'].rotation), 90);
  await page.click('#pico-undo');
  assert.equal(await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuit.layout.positions['resistor-1'].rotation), 0);
  await page.click('#pico-redo');
  assert.equal(await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuit.layout.positions['resistor-1'].rotation), 90);
  assertEditorGeometry(await editorGeometry(page));
  for (const expectedRotation of [180, 270, 0, 90]) {
    await page.locator('#pico-editor-components [data-component-id="resistor-1"]').click(); await page.click('#pico-rotate');
    assert.equal(await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuit.layout.positions['resistor-1'].rotation), expectedRotation);
    assertEditorGeometry(await editorGeometry(page));
  }
  await page.locator('#pico-editor-components [data-component-id="resistor-1"]').click(); await page.keyboard.press('Delete');
  assert.equal((await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state())).circuitCode, 'RP2040_SERIES_RESISTOR_REQUIRED');
  await page.click('#pico-undo'); assert.equal((await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state())).circuitValid, true);
  assertEditorGeometry(await editorGeometry(page));
  await page.click('#pico-redo'); assert.equal((await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state())).circuitCode, 'RP2040_SERIES_RESISTOR_REQUIRED');
  await page.click('#pico-undo'); assert.equal((await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state())).circuitValid, true);
  await page.click('#pico-zoom-in'); assert.equal(await page.locator('#pico-zoom-value').textContent(), '110%');
  await page.click('#pico-fit'); assert.equal(await page.locator('#pico-zoom-value').textContent(), '100%');
  assertEditorGeometry(await editorGeometry(page));
  await page.setViewportSize({ width: 1440, height: 900 }); assertEditorGeometry(await editorGeometry(page));
  await page.setViewportSize({ width: 1920, height: 1080 }); assertEditorGeometry(await editorGeometry(page));
  await page.screenshot({ path: `${screenshotDir}/public-pico-rotated-resistor-desktop-1920.png`, fullPage: true });

  await page.locator('#pico-editor-components [data-component-id="led-1"]').click();
  const ledBeforeKeyboard = await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuit.layout.positions['led-1']);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('r');
  const ledAfterKeyboard = await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuit.layout.positions['led-1']);
  assert.ok(ledAfterKeyboard.x > ledBeforeKeyboard.x); assert.equal(ledAfterKeyboard.rotation, 90);
  await page.focus('#pico-source'); const ledBeforeTextarea = await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuit.layout.positions['led-1']);
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuit.layout.positions['led-1']), ledBeforeTextarea);
  assertEditorGeometry(await editorGeometry(page));

  await selectWire(page, 'net-ground');
  await page.click('#pico-delete');
  let disconnected = await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state());
  assert.equal(disconnected.circuitValid, false); assert.equal(disconnected.circuitCode, 'RP2040_GROUND_REQUIRED');
  await page.click('#pico-undo'); assert.equal((await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state())).circuitValid, true);
  await page.click('#pico-redo'); assert.equal((await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state())).circuitValid, false);
  await page.click('#pico-undo');

  await page.locator('#pico-editor-components [data-component-id="led-1"]').click(); await page.click('#pico-delete');
  assert.equal((await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state())).circuitCode, 'RP2040_PATH_OPEN');
  await page.click('#pico-undo'); assert.equal((await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state())).circuitValid, true);

  await page.fill('#pico-source', HIGH.replace('int main(void)\n{', 'int main(void) {'));
  await page.click('#pico-build');
  const rejected = await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state());
  assert.equal(rejected.phase, 'blocked'); assert.match(rejected.message, /complete template and line breaks exactly as shown/);

  const highInitial = await build(page, HIGH);
  await selectWire(page, 'net-ground'); await page.click('#pico-delete'); await page.click('#pico-undo');
  assert.equal((await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state())).runnable, false);
  assert.equal(await page.locator('#pico-run').isDisabled(), true);
  const high = await build(page, HIGH);
  assert.equal(high.artifact.uf2Sha256, highInitial.artifact.uf2Sha256);
  await page.click('#pico-run');
  await page.waitForFunction(() => document.querySelector('#pico-serial').textContent.includes('PICO HIGH TEST')
    && document.querySelector('#pico-external-led').classList.contains('on'), null, { timeout: 10_000 });
  const topologyBeforePending = high.circuit;
  await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.selectCircuit({ kind: 'net', id: 'net-gpio0' }));
  await page.click('#pico-reconnect');
  const pending = await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state());
  assert.equal(pending.circuitCode, 'RP2040_WIRING_IN_PROGRESS');
  assert.equal(pending.circuitEditor.wireDraft.mode, 'reconnect-source');
  assert.equal(pending.runnable, false); assert.equal(pending.artifact, null); assert.equal(pending.runtime, null);
  assert.equal(await page.locator('#pico-build').isDisabled(), true);
  assert.equal(await page.locator('#pico-external-led').evaluate((node) => node.classList.contains('on')), false);
  await page.keyboard.press('Escape');
  const cancelled = await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state());
  assert.deepEqual(cancelled.circuit, topologyBeforePending); assert.equal(cancelled.circuitEditor.wireDraft.mode, 'none');
  assert.equal(cancelled.artifact, null); assert.equal(cancelled.runnable, false);
  await build(page, HIGH);
  await page.click('#pico-run');
  await page.waitForFunction(() => document.querySelector('#pico-serial').textContent.includes('PICO HIGH TEST'));
  await page.click('#pico-reset'); await page.waitForFunction(() => window.__RP2040_PUBLIC_WORKBENCH__.state().phase === 'paused');
  await page.click('#pico-run'); await page.waitForFunction(() => document.querySelector('#pico-serial').textContent.includes('PICO HIGH TEST'));
  await page.click('#pico-pause'); await page.waitForFunction(() => window.__RP2040_PUBLIC_WORKBENCH__.state().phase === 'paused');
  await page.click('#pico-stop');

  const low = await build(page, LOW);
  assert.notEqual(low.artifact.sourceSha256, high.artifact.sourceSha256); assert.notEqual(low.artifact.uf2Sha256, high.artifact.uf2Sha256);
  await page.click('#pico-run'); await page.waitForFunction(() => document.querySelector('#pico-serial').textContent.includes('PICO LOW TEST'));
  assert.equal(await page.locator('#pico-external-led').evaluate((node) => node.classList.contains('on')), false); await page.click('#pico-stop');

  const downloadPromise = page.waitForEvent('download'); await page.click('#pico-save');
  const download = await downloadPromise; const savedPath = await download.path(); const savedText = fs.readFileSync(savedPath, 'utf8');
  const saved = JSON.parse(savedText);
  assert.equal(saved.schema, 'intent-mcu-project-envelope@7'); assert.equal(saved.profile, 'board.rp2040-pico-v1');
  assert.equal(saved.project.schema, 'intent-mcu-rp2040-public-project@1'); assert.equal(saved.project.source, LOW);
  assert.equal(saved.project.circuit.layout.positions['resistor-1'].rotation, 90);
  assert.ok(!/artifact|executable|firmwareBytes|uf2Sha256/iu.test(savedText));
  await page.fill('#pico-source', HIGH);
  await page.locator('#pico-open-input').setInputFiles({ name: 'invalid.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...saved, executable: 'forbidden' })) });
  await page.waitForFunction(() => document.querySelector('#pico-message').textContent.includes('Open rejected'));
  assert.equal(await page.locator('#pico-source').inputValue(), HIGH);
  await page.locator('#pico-open-input').setInputFiles(savedPath);
  await page.waitForSelector('#unsaved-change-dialog[open]'); await page.click('#unsaved-discard');
  await page.waitForFunction((expected) => document.querySelector('#pico-source').value === expected
    && window.__RP2040_PUBLIC_WORKBENCH__.state().runnable === false, LOW);
  assert.equal(await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuit.layout.positions['resistor-1'].rotation), 90);
  const rebuilt = await build(page, LOW); assert.equal(rebuilt.runnable, true);

  await page.screenshot({ path: `${screenshotDir}/public-pico-editor-desktop-1920.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload({ waitUntil: 'networkidle' }); await selectPico(page);
  await page.click('#pico-fit'); const mobileGeometry = await editorGeometry(page); assertEditorGeometry(mobileGeometry);
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    panel: document.querySelector('#pico-public-workbench').getBoundingClientRect().toJSON(),
    canvas: document.querySelector('#pico-diagram').getBoundingClientRect().toJSON(),
    controls: [...document.querySelectorAll('#quick-controls button')].map((node) => ({ id: node.id, rect: node.getBoundingClientRect().toJSON(), hidden: node.hidden })),
  }));
  assert.ok(mobile.overflow <= 1, JSON.stringify(mobile)); assert.ok(mobile.panel.left >= 8 && mobile.panel.right <= 382, JSON.stringify(mobile.panel));
  assert.ok(mobile.canvas.left >= 8 && mobile.canvas.right <= 382, JSON.stringify(mobile.canvas));
  assert.deepEqual(mobile.controls.filter((item) => item.hidden).map((item) => item.id), []);
  assert.ok(mobile.controls.filter((item) => !item.hidden).every((item) => item.rect.left >= 0 && item.rect.right <= 390), JSON.stringify(mobile.controls));
  await page.click('#toggle-catalog');
  assert.equal(await page.locator('#pico-public-workbench').evaluate((node) => node.classList.contains('parts-collapsed')), true);
  await page.click('#toggle-catalog');
  await page.click('#toggle-inspector');
  assert.equal(await page.locator('#pico-public-workbench').evaluate((node) => node.classList.contains('inspector-collapsed')), true);
  await page.click('#toggle-inspector');
  await page.locator('#pico-editor-components [data-component-id="resistor-1"]').click(); await page.keyboard.press('ArrowDown'); assertEditorGeometry(await editorGeometry(page));
  for (const expectedRotation of [90, 180, 270, 0]) {
    await page.locator('#pico-editor-components [data-component-id="resistor-1"]').click(); await page.keyboard.press('r');
    assert.equal(await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuit.layout.positions['resistor-1'].rotation), expectedRotation);
    assertEditorGeometry(await editorGeometry(page));
  }
  await page.keyboard.press('Control+z'); assert.equal(await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuit.layout.positions['resistor-1'].rotation), 270);
  assertEditorGeometry(await editorGeometry(page));
  await page.keyboard.press('Control+Shift+z'); assert.equal(await page.evaluate(() => window.__RP2040_PUBLIC_WORKBENCH__.state().circuit.layout.positions['resistor-1'].rotation), 0);
  assertEditorGeometry(await editorGeometry(page));
  await page.locator('#pico-editor-components [data-component-id="resistor-1"]').click(); await page.keyboard.press('r'); assertEditorGeometry(await editorGeometry(page));
  await page.setViewportSize({ width: 430, height: 900 }); assertEditorGeometry(await editorGeometry(page));
  await page.setViewportSize({ width: 390, height: 844 }); assertEditorGeometry(await editorGeometry(page));
  await page.screenshot({ path: `${screenshotDir}/public-pico-editor-mobile-390.png`, fullPage: true });

  assert.deepEqual(outside, []); assert.deepEqual(errors, []); assert.deepEqual(await context.cookies(), []);
  await browser.close();
  process.stdout.write(`${JSON.stringify({ status: 'pass', desktop, picoLayout, initialGeometry, high: high.artifact, low: low.artifact, rebuilt: rebuilt.artifact, mobileGeometry, mobile })}\n`);
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
