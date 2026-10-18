// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0

const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.STM32_PUBLIC_URL || 'http://127.0.0.1:18772';
const screenshotDirectory = process.env.STM32_PUBLIC_SCREENSHOT_DIR || null;
const assert = (value, message) => { if (!value) throw new Error(message); };

async function state(page) { return page.evaluate(() => structuredClone(window.__STM32_PUBLIC_STATE__)); }
async function waitPhase(page, phase) {
  await page.waitForFunction((value) => window.__STM32_PUBLIC_STATE__?.phase === value, phase, { timeout: 120_000 });
}

async function editorGeometry(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(
    () => requestAnimationFrame(() => requestAnimationFrame(resolve)),
  ))));
  return page.evaluate(() => {
    const canvas = document.querySelector('#stm32-diagram').getBoundingClientRect();
    const state = window.__STM32_PUBLIC_WORKBENCH__.state();
    const anchors = Object.fromEntries([...document.querySelectorAll('[data-stm32-endpoint]')].map((node) => {
      const box = node.getBoundingClientRect();
      const endpoint = node.dataset.stm32Endpoint;
      const pin = endpoint.slice(endpoint.lastIndexOf('.') + 1);
      const terminal = node.closest('.pico-editor-part').querySelector(`[data-terminal-pin="${pin}"]`).getBoundingClientRect();
      return [endpoint, {
        x: box.left - canvas.left + box.width / 2, y: box.top - canvas.top + box.height / 2,
        terminalX: terminal.left - canvas.left + terminal.width / 2,
        terminalY: terminal.top - canvas.top + terminal.height / 2,
      }];
    }));
    const bodies = [...document.querySelectorAll('#stm32-editor-components .pico-editor-part')].map((node) => {
      const box = node.getBoundingClientRect();
      return { id: node.dataset.componentId, left: box.left - canvas.left, right: box.right - canvas.left,
        top: box.top - canvas.top, bottom: box.bottom - canvas.top };
    });
    const routes = [...document.querySelectorAll('#stm32-editor-wires .pico-editor-wire')].map((node) => {
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
    const labelGroups = [...document.querySelectorAll('#stm32-editor-components .pico-editor-part')].map((part) => ({
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

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_PROXY ? { proxy: { server: process.env.PLAYWRIGHT_PROXY } } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const external = [];
  const errors = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(base).origin) external.push(request.url());
  });
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto(base, { waitUntil: 'networkidle' });
  assert(response && response.status() === 200, 'root did not load');
  await page.waitForFunction(() => window.__M11_READY__ === true && window.__STM32_PUBLIC_WORKBENCH__);
  await page.locator('#board-select').selectOption('board.stm32f429zi-nucleo144-v1');
  await page.waitForFunction(() => window.__STM32_PUBLIC_STATE__?.active === true
    && document.querySelectorAll('#stm32-editor-wires .pico-editor-wire').length === 3);
  const geometry = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    panelHidden: document.querySelector('#stm32-public-workbench').hidden,
    workspaceHidden: document.querySelector('#workbench-workspace').hidden,
    pb0: [...document.querySelectorAll('[data-stm32-endpoint]')].some((node) => node.dataset.stm32Endpoint.endsWith('.PB0')),
    gnd: [...document.querySelectorAll('[data-stm32-endpoint]')].some((node) => node.dataset.stm32Endpoint.endsWith('.GND')),
  }));
  assert(!geometry.panelHidden && geometry.workspaceHidden && geometry.pb0 && geometry.gnd, 'named STM32 editor not visible');
  assert(geometry.overflow <= 1, `desktop overflow ${geometry.overflow}`);
  const initialGeometry = await editorGeometry(page); assertEditorGeometry(initialGeometry);

  await page.click('#stm32-build');
  await waitPhase(page, 'built');
  let current = await state(page);
  assert(current.runnable && current.artifact.bytes > 4000, 'default ELF not runnable');
  const highElf = current.artifact.sha256;
  await page.click('#stm32-run');
  await waitPhase(page, 'running');
  await waitPhase(page, 'completed');
  current = await state(page);
  assert(current.runtime.observed.pb0 === true && current.runtime.observed.uartText === 'STM32 PUBLIC\n', 'default HIGH observation mismatch');
  assert(await page.locator('#stm32-diagram').getAttribute('data-led') === 'on', 'HIGH LED not on');
  assert((await page.textContent('#stm32-terminal')).includes('BOOT EPOCHS: 2'), 'reset evidence missing');

  await page.click('#stm32-reset');
  await waitPhase(page, 'running');
  await waitPhase(page, 'completed');
  assert((await state(page)).artifact.sha256 === highElf, 'Reset changed accepted ELF');
  const topologyBeforePending = (await state(page)).project.circuit;
  await page.evaluate(() => window.__STM32_PUBLIC_WORKBENCH__.selectCircuit({ kind: 'net', id: 'net-pb0' }));
  await page.click('#stm32-reconnect');
  current = await state(page);
  assert(current.circuitCode === 'STM32_WIRING_IN_PROGRESS'
    && current.circuitEditor.wireDraft.mode === 'reconnect-source', 'STM32 reconnect did not enter pending state');
  assert(!current.runnable && current.artifact === null && current.runtime === null,
    'STM32 pending wire retained executable or LED authority');
  assert(await page.locator('#stm32-build').isDisabled(), 'STM32 Build enabled during pending wire');
  assert(await page.locator('#stm32-diagram').getAttribute('data-led') === 'off', 'STM32 pending wire retained LED state');
  await page.keyboard.press('Escape');
  current = await state(page);
  assert(JSON.stringify(current.project.circuit) === JSON.stringify(topologyBeforePending), 'STM32 Escape mutated topology');
  assert(current.circuitEditor.wireDraft.mode === 'none' && current.artifact === null && !current.runnable,
    'STM32 Escape restored stale executable authority');
  await page.click('#stm32-build');
  await waitPhase(page, 'built');
  assert((await state(page)).artifact.sha256 === highElf, 'fresh STM32 Build after wire cancellation changed identical ELF');

  const resistorBeforeTextArrow = await page.evaluate(() =>
    window.__STM32_PUBLIC_WORKBENCH__.state().project.circuit.layout.positions['resistor-1']);
  await page.locator('#stm32-source').focus(); await page.keyboard.press('ArrowRight');
  assert(JSON.stringify(await page.evaluate(() =>
    window.__STM32_PUBLIC_WORKBENCH__.state().project.circuit.layout.positions['resistor-1']))
    === JSON.stringify(resistorBeforeTextArrow), 'source textarea arrow moved a circuit part');

  await page.locator('#stm32-editor-components [data-component-id="resistor-1"]').click();
  await page.keyboard.press('ArrowRight');
  current = await state(page);
  assert(!current.runnable && current.artifact === null && current.runtime === null,
    `move retained stale ELF/LED authority: ${JSON.stringify(current)}`);
  assert(await page.locator('#stm32-diagram').getAttribute('data-led') === 'off', 'move retained stale LED state');
  assertEditorGeometry(await editorGeometry(page));

  for (const expectedRotation of [90, 180, 270, 0]) {
    await page.locator('#stm32-editor-components [data-component-id="resistor-1"]').click();
    await page.click('#stm32-rotate');
    assert((await page.evaluate(() =>
      window.__STM32_PUBLIC_WORKBENCH__.state().project.circuit.layout.positions['resistor-1'].rotation)) === expectedRotation,
    `resistor rotation did not reach ${expectedRotation}`);
    assertEditorGeometry(await editorGeometry(page));
    if (screenshotDirectory) {
      fs.mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDirectory, `stm32-editor-resistor-${expectedRotation}.png`), fullPage: true });
    }
  }

  await page.locator('#stm32-editor-components [data-component-id="resistor-1"]').click();
  await page.keyboard.press('Delete');
  current = await state(page);
  assert(!current.circuitAccepted && current.circuitCode === 'STM32_SERIES_RESISTOR_REQUIRED'
    && !current.runnable && current.artifact === null && current.runtime === null,
  `invalid topology retained authority: ${JSON.stringify(current)}`);
  await page.click('#stm32-build');
  assert((await state(page)).phase === 'blocked', 'invalid STM32 circuit was allowed to build');
  await page.click('#stm32-undo'); assertEditorGeometry(await editorGeometry(page));
  assert((await state(page)).circuitAccepted, 'Undo did not restore valid STM32 circuit');
  await page.click('#stm32-redo');
  assert(!(await state(page)).circuitAccepted, 'Redo did not restore invalid STM32 circuit');
  await page.click('#stm32-undo'); assertEditorGeometry(await editorGeometry(page));
  await page.locator('#stm32-editor-components [data-component-id="resistor-1"]').click();
  await page.click('#stm32-rotate');
  assert((await page.evaluate(() =>
    window.__STM32_PUBLIC_WORKBENCH__.state().project.circuit.layout.positions['resistor-1'].rotation)) === 90,
  'saved STM32 rotation was not 90 degrees');
  await page.click('#stm32-zoom-in');
  assert((await page.locator('#stm32-zoom-value').textContent()) === '110%', 'STM32 zoom in failed');
  await page.click('#stm32-fit');
  assert((await page.locator('#stm32-zoom-value').textContent()) === '100%', 'STM32 Fit failed');
  assertEditorGeometry(await editorGeometry(page));

  const lowSource = (await page.inputValue('#stm32-source'))
    .replace('intent_pb0_output(1u)', 'intent_pb0_output(0u)')
    .replace('STM32 PUBLIC', 'STM32 LOW');
  await page.fill('#stm32-source', lowSource);
  current = await state(page);
  assert(current.phase === 'editing' && !current.runnable && current.artifact === null, 'source edit retained stale authority');
  assert(await page.locator('#stm32-run').isDisabled() && await page.locator('#stm32-reset').isDisabled(), 'Run/Reset not disabled after source edit');
  assert((await page.textContent('#stm32-terminal')).includes('No Renode execution'), 'old PB0/USART3 provenance survived source edit');

  await page.click('#stm32-build');
  await waitPhase(page, 'built');
  await page.click('#stm32-run');
  await waitPhase(page, 'running');
  await waitPhase(page, 'completed');
  current = await state(page);
  assert(current.runtime.observed.pb0 === false && current.runtime.observed.uartText === 'STM32 LOW\n', 'edited LOW observation mismatch');
  assert(current.artifact.sha256 !== highElf, 'edited source reused default ELF');
  const lowElf = current.artifact.sha256;
  assert(await page.locator('#stm32-diagram').getAttribute('data-led') === 'off', 'LOW LED not off');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#stm32-save')]);
  const savedPath = await download.path();
  assert(savedPath && fs.statSync(savedPath).size < 8192, 'data-only Save missing or oversized');
  const saved = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
  assert(saved.schema === 'intent-mcu-project-envelope@3' && saved.profile === 'board.stm32f429zi-nucleo144-v1'
    && saved.project.schema === 'intent-mcu-stm32-public-project@2' && saved.project.source === lowSource,
    'saved STM32 project identity mismatch');
  assert(saved.project.circuit.layout.positions['resistor-1'].rotation === 90, 'saved STM32 circuit lost rotation');
  assert(!('artifact' in saved) && !('runtime' in saved), 'Save retained executable/runtime state');

  await page.fill('#stm32-source', `${lowSource}intent_spi1();\n`);
  await page.click('#stm32-build');
  await waitPhase(page, 'blocked');
  current = await state(page);
  assert(!current.runnable && current.artifact === null && current.runtime === null, 'invalid source retained stale authority');
  assert((await page.textContent('#stm32-message')).includes('Source rejected'), 'invalid source not explained');

  await page.locator('#stm32-open-input').setInputFiles(savedPath);
  await page.waitForSelector('#unsaved-change-dialog[open]'); await page.click('#unsaved-discard');
  await waitPhase(page, 'editing');
  current = await state(page);
  assert(current.project.source === lowSource && !current.runnable && current.artifact === null, 'Open did not require fresh Build');
  assert(current.project.circuit.layout.positions['resistor-1'].rotation === 90, 'Open lost STM32 circuit layout');
  assert((await page.textContent('#stm32-artifact-hash')) === 'not built', 'Open restored executable hash');

  await page.click('#stm32-build');
  await waitPhase(page, 'built');
  await page.click('#stm32-run');
  await waitPhase(page, 'running');
  await waitPhase(page, 'completed');
  current = await state(page);
  assert(current.runtime.observed.pb0 === false && current.runtime.observed.uartText === 'STM32 LOW\n',
    'reopened LOW project did not execute');
  await page.click('#stm32-stop');
  current = await state(page);
  assert(current.phase === 'editing' && !current.runnable && current.artifact === null, 'Stop did not discard ELF');

  if (screenshotDirectory) {
    fs.mkdirSync(screenshotDirectory, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDirectory, 'stm32-public-desktop.png'), fullPage: true, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assertEditorGeometry(await editorGeometry(page));
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(mobileOverflow <= 1, `mobile overflow ${mobileOverflow}`);
  await page.locator('#stm32-editor-components [data-component-id="resistor-1"]').click();
  await page.keyboard.press('ArrowDown');
  assertEditorGeometry(await editorGeometry(page));
  for (const expectedRotation of [180, 270, 0, 90]) {
    await page.locator('#stm32-editor-components [data-component-id="resistor-1"]').click();
    await page.keyboard.press('r');
    assert((await page.evaluate(() =>
      window.__STM32_PUBLIC_WORKBENCH__.state().project.circuit.layout.positions['resistor-1'].rotation)) === expectedRotation,
    `mobile STM32 resistor rotation did not reach ${expectedRotation}`);
    assertEditorGeometry(await editorGeometry(page));
  }
  await page.keyboard.press('Control+z');
  assert((await page.evaluate(() =>
    window.__STM32_PUBLIC_WORKBENCH__.state().project.circuit.layout.positions['resistor-1'].rotation)) === 0,
  'mobile STM32 Undo failed');
  assertEditorGeometry(await editorGeometry(page));
  await page.keyboard.press('Control+Shift+z');
  assert((await page.evaluate(() =>
    window.__STM32_PUBLIC_WORKBENCH__.state().project.circuit.layout.positions['resistor-1'].rotation)) === 90,
  'mobile STM32 Redo failed');
  assertEditorGeometry(await editorGeometry(page));
  await page.setViewportSize({ width: 430, height: 900 }); assertEditorGeometry(await editorGeometry(page));
  await page.setViewportSize({ width: 390, height: 844 }); assertEditorGeometry(await editorGeometry(page));
  if (screenshotDirectory) await page.screenshot({ path: path.join(screenshotDirectory, 'stm32-public-mobile.png'), fullPage: true, animations: 'disabled' });

  assert((await context.cookies()).length === 0, 'cookies were set');
  assert(external.length === 0, `third-party requests: ${external.join(', ')}`);
  assert(errors.length === 0, `browser errors: ${errors.join(' | ')}`);
  const mobileGeometry = await editorGeometry(page);
  await browser.close();
  process.stdout.write(`${JSON.stringify({ status: 'pass', geometry, initialGeometry, highElf,
    lowElf, mobileOverflow, mobileGeometry, externalRequests: external.length,
    cookies: 0, screenshots: screenshotDirectory })}\n`);
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
