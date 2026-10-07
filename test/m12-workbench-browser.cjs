// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const path = require('path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium, firefox, webkit } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.M3_STAGING_URL || 'http://127.0.0.1:18766';
const browserName = process.env.M6_BROWSER || 'chromium';
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unsupported browser: ${browserName}`);

function assert(condition, message) { if (!condition) throw new Error(message); }

async function waitBuild(page) {
  await page.click('#build');
  await page.waitForFunction(() => ['succeeded', 'failed', 'cancelled', 'timeout'].includes(window.__M6_STATE__?.buildState), null, { timeout: 30_000 });
  const state = await page.evaluate(() => structuredClone(window.__M6_STATE__));
  if (state.buildState === 'succeeded') await page.waitForFunction(() => window.__M6_STATE__?.runtime?.kind === 'ready', null, { timeout: 10_000 });
  return state;
}

async function openExample(page, id) {
  await page.selectOption('#example-select', id);
  await page.click('#project-demo');
  return page.evaluate(() => window.__M6_PROJECT__());
}

function worldAt(viewport, screenX, screenY) {
  return {
    x: (screenX - 0.5 - viewport.panX) / viewport.zoom + 0.5,
    y: (screenY - 0.5 - viewport.panY) / viewport.zoom + 0.5,
  };
}

(async () => {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__M11_READY__ === true);

  assert(await page.locator('#example-select option').count() === 4, 'four first-project examples are not reachable');
  await page.click('#walkthrough-open');
  assert(await page.locator('#walkthrough').evaluate((dialog) => dialog.open) && await page.locator('#walkthrough li').count() === 4, 'first-project walkthrough did not open');
  await page.locator('#walkthrough button[value="close"]').click();

  await openExample(page, 'blink');
  const initialCanvas = await page.locator('#circuit-canvas').boundingBox();
  await page.click('#focus-canvas'); await page.waitForTimeout(120);
  const focusedCanvas = await page.locator('#circuit-canvas').boundingBox();
  assert(focusedCanvas.width > initialCanvas.width + 300, `focus mode did not enlarge canvas: ${initialCanvas.width} -> ${focusedCanvas.width}`);
  await page.click('#focus-canvas');
  await page.click('#fullscreen-canvas'); await page.waitForTimeout(80);
  assert(await page.evaluate(() => Boolean(document.fullscreenElement) || document.querySelector('.workspace').classList.contains('canvas-focus')), 'fullscreen control provided neither fullscreen nor its focus-mode fallback');
  if (await page.evaluate(() => Boolean(document.fullscreenElement))) await page.keyboard.press('Escape');

  await page.click('#show-pin-labels');
  assert(await page.locator('#circuit-canvas').evaluate((node) => node.classList.contains('show-pin-labels')), 'show-labels mode did not activate');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  assert(await page.locator('#circuit-canvas').evaluate((node) => node.classList.contains('show-pin-labels')), 'show-labels preference did not persist');
  assert(await page.locator('#source-lines').textContent() === (await page.inputValue('#source')).split('\n').map((_, index) => index + 1).join('\n')
    && await page.locator('#source-highlight .tok-keyword').count() > 0, 'source line numbers or syntax highlighting are missing');
  const editorSource = await page.inputValue('#source'); const brace = editorSource.indexOf('{') + 1;
  await page.locator('#source').focus(); await page.locator('#source').evaluate((node, at) => node.setSelectionRange(at, at), brace); await page.keyboard.press('Enter');
  assert((await page.inputValue('#source')).includes('{\n  '), 'source editor did not preserve sensible indentation'); await page.click('#undo');

  await page.click('#toggle-catalog');
  assert(await page.locator('.workspace').evaluate((node) => node.classList.contains('catalog-collapsed')), 'catalogue did not collapse'); await page.click('#toggle-catalog');
  await page.click('#toggle-inspector');
  assert(await page.locator('.workspace').evaluate((node) => node.classList.contains('inspector-collapsed')), 'inspector did not collapse'); await page.click('#toggle-inspector');

  await page.evaluate(() => { window.__M12_ORIGINAL_SET_ITEM__ = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); }; });
  await page.click('#project-save');
  assert(await page.isEnabled('#recovery-export') && (await page.textContent('#project-message')).includes('in-memory project remains usable'), 'storage denial did not offer in-memory recovery export');
  const recoveryDownload = page.waitForEvent('download'); await page.click('#recovery-export'); assert((await (await recoveryDownload).suggestedFilename()) === 'intent-mcu-recovery.json', 'recovery download failed');
  await page.evaluate(() => { Storage.prototype.setItem = window.__M12_ORIGINAL_SET_ITEM__; delete window.__M12_ORIGINAL_SET_ITEM__; }); await page.click('#project-save');

  const densePin = page.locator('.pin-anchor[data-endpoint="board-1.D4"]');
  await densePin.scrollIntoViewIfNeeded(); await densePin.click({ force: true });
  assert((await page.textContent('#wire-state')).includes('board-1.D4'), 'dense header chose a different pin than D4');
  await densePin.click({ force: true });

  const resistor = page.locator('[data-component-id="resistor-1"]');
  await resistor.scrollIntoViewIfNeeded();
  const original = await page.evaluate(() => ({ revision: window.__M6_STATE__.revision, position: window.__M6_PROJECT__().layout.positions['resistor-1'] }));
  let box = await resistor.boundingBox();
  const start = { x: box.x + box.width * 0.58, y: box.y + box.height * 0.52 };
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 67, start.y + 43, { steps: 5 });
  const preview = await resistor.boundingBox();
  assert(Math.abs(preview.x - box.x) > 20 && await resistor.evaluate((node) => node.classList.contains('dragging')), 'component had no live movement preview');
  const attachedDuringPreview = await page.evaluate(() => {
    const canvas = document.querySelector('#circuit-canvas').getBoundingClientRect();
    return [...document.querySelectorAll('path.circuit-wire[data-endpoint="resistor-1.A"],path.circuit-wire[data-endpoint="resistor-1.B"]')].every((wire) => {
      const anchor = document.querySelector(`.pin-anchor[data-endpoint="${wire.dataset.endpoint}"]`).getBoundingClientRect();
      const match = /^M ([\d.-]+) ([\d.-]+)/u.exec(wire.getAttribute('d'));
      return match && Math.max(Math.abs(Number(match[1]) - (anchor.left - canvas.left + anchor.width / 2)), Math.abs(Number(match[2]) - (anchor.top - canvas.top + anchor.height / 2))) < 0.8;
    });
  });
  assert(attachedDuringPreview, 'routes detached during live component preview');
  await page.keyboard.press('Escape'); await page.mouse.up(); await page.waitForTimeout(50);
  assert(JSON.stringify((await page.evaluate(() => window.__M6_PROJECT__().layout.positions['resistor-1']))) === JSON.stringify(original.position), 'Escape did not restore original component position');

  box = await resistor.boundingBox();
  await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.52); await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.58 + 81, box.y + box.height * 0.52 + 51, { steps: 6 });
  assert(await resistor.evaluate((node) => node.classList.contains('dragging')), `second component drag did not begin after cancellation: ${await page.textContent('#wire-state')}`);
  const secondPreview = await resistor.boundingBox();
  assert(Math.abs(secondPreview.x - box.x) > 5, `second component drag had no live movement: ${JSON.stringify({ box, secondPreview, wire: await page.textContent('#wire-state') })}`);
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))); await page.mouse.up();
  const moved = await page.evaluate(() => ({ revision: window.__M6_STATE__.revision, position: window.__M6_PROJECT__().layout.positions['resistor-1'] }));
  const snapped = (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000_001;
  assert(moved.revision === original.revision + 1 && snapped(moved.position.x) && snapped(moved.position.y), `component drag was not one snapped transaction: ${JSON.stringify({ original, moved })}`);
  await page.click('#undo');
  assert(JSON.stringify((await page.evaluate(() => window.__M6_PROJECT__().layout.positions['resistor-1']))) === JSON.stringify(original.position), 'one Undo did not reverse one component drag');
  await resistor.click({ force: true }); await page.click('#rotate-component'); await page.waitForTimeout(80);
  const rotationAttachment = await page.evaluate(() => {
    const canvasBox = document.querySelector('#circuit-canvas').getBoundingClientRect();
    return [...document.querySelectorAll('path.circuit-wire[data-endpoint^="resistor-1."]')].every((wire) => {
      const anchor = document.querySelector(`.pin-anchor[data-endpoint="${wire.dataset.endpoint}"]`).getBoundingClientRect();
      const start = /^M ([\d.-]+) ([\d.-]+)/u.exec(wire.getAttribute('d'));
      return start && Math.max(Math.abs(Number(start[1]) - (anchor.left - canvasBox.left + anchor.width / 2)), Math.abs(Number(start[2]) - (anchor.top - canvasBox.top + anchor.height / 2))) < 0.8;
    });
  });
  assert(rotationAttachment, 'routes detached after component rotation'); await page.click('#undo');

  const canvas = page.locator('#circuit-canvas'); box = await canvas.boundingBox();
  const pointer = { x: box.x + box.width * 0.72, y: box.y + box.height * 0.74 };
  const beforeZoom = await page.evaluate(() => structuredClone(window.__M6_PROJECT__().layout.viewport));
  const beforeWorld = worldAt(beforeZoom, 0.72, 0.74);
  await page.mouse.move(pointer.x, pointer.y); await page.mouse.wheel(0, -180); await page.waitForTimeout(100);
  const afterZoom = await page.evaluate(() => structuredClone(window.__M6_PROJECT__().layout.viewport));
  const afterWorld = worldAt(afterZoom, 0.72, 0.74);
  assert(afterZoom.zoom > beforeZoom.zoom && Math.hypot(afterWorld.x - beforeWorld.x, afterWorld.y - beforeWorld.y) < 0.002, 'wheel zoom did not preserve the world point under the pointer');
  const netsBeforePan = (await page.evaluate(() => window.__M6_PROJECT__().circuit.nets.length));
  const panPoint = await page.evaluate(() => {
    const box = document.querySelector('#circuit-canvas').getBoundingClientRect();
    for (const y of [0.88, 0.76, 0.62, 0.48]) for (const x of [0.08, 0.2, 0.38, 0.58, 0.86]) {
      const clientX = box.left + box.width * x; const clientY = box.top + box.height * y;
      const target = document.elementFromPoint(clientX, clientY);
      if (target && !target.closest('.circuit-component,.wire-segment-hit,.quick-controls')) return { x: clientX, y: clientY };
    }
    throw new Error('No empty canvas point found');
  });
  await page.mouse.move(panPoint.x, panPoint.y); await page.mouse.down(); await page.mouse.move(panPoint.x + 46, panPoint.y - 32, { steps: 4 }); await page.mouse.up();
  const afterPan = await page.evaluate(() => window.__M6_PROJECT__());
  assert(afterPan.circuit.nets.length === netsBeforePan && (afterPan.layout.viewport.panX !== afterZoom.panX || afterPan.layout.viewport.panY !== afterZoom.panY), 'background pan conflicted with wiring or did not commit');

  await page.locator('[data-component-id="resistor-1"]').click({ force: true });
  assert((await page.textContent('#property-editor')).includes('Ω'), 'component property unit is missing');
  const widthBefore = await page.locator('.catalog').evaluate((node) => node.getBoundingClientRect().width);
  await page.locator('#catalog-resizer').focus(); await page.keyboard.press('ArrowRight');
  const widthAfter = await page.locator('.catalog').evaluate((node) => node.getBoundingClientRect().width);
  assert(widthAfter > widthBefore, 'keyboard-accessible panel resize failed');
  const inspectorBefore = await page.locator('.inspector').evaluate((node) => node.getBoundingClientRect().width);
  await page.locator('#inspector-resizer').focus(); await page.keyboard.press('ArrowLeft');
  const inspectorAfter = await page.locator('.inspector').evaluate((node) => node.getBoundingClientRect().width);
  assert(inspectorAfter > inspectorBefore, 'keyboard-accessible inspector resize failed');

  for (const id of ['button', 'adc', 'pwm', 'blink']) {
    const project = await openExample(page, id);
    assert(project.source.files[0].content.includes('void setup') && project.circuit.components.length >= 2, `${id} example is not an ordinary editable project`);
    const build = await waitBuild(page);
    assert(build.buildState === 'succeeded', `${id} example did not build: ${await page.textContent('#diagnostics')}`);
  }

  await page.click('#run');
  await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('ON') && document.querySelectorAll('#logic-waveform .wave-path').length > 0, null, { timeout: 10_000 });
  await page.waitForFunction(() => document.querySelector('#achieved-speed').textContent !== '—', null, { timeout: 10_000 });
  assert((await page.textContent('#simulated-time')).includes('ms') && (await page.textContent('#requested-speed')).includes('×'), 'time/requested/measured speed labels are incomplete');
  const cursorBefore = await page.textContent('#logic-cursor'); await page.fill('#logic-cursor-a', '10');
  const cursorAfter = await page.textContent('#logic-cursor');
  assert(cursorAfter !== cursorBefore && cursorAfter.includes('cycles'), 'user waveform cursor did not update measured delta');
  await page.click('#serial-event-mode');
  assert((await page.textContent('#serial-output')).includes('TX'), 'serial event mode was not retained alongside text mode');
  await page.click('#serial-text-mode');
  const downloadPromise = page.waitForEvent('download'); await page.click('#serial-export');
  const download = await downloadPromise; assert((await download.suggestedFilename()) === 'intent-mcu-serial.txt', 'serial text export failed');
  assert(await page.locator('#pin-select option').count() === 20, 'pin inspector does not expose D0-D13 and A0-A5');
  await page.click('#pause');

  const sourceBeforeFailure = await page.inputValue('#source');
  await page.route('**/api/build', (route) => route.abort('connectionfailed'));
  await page.click('#build'); await page.waitForFunction(() => window.__M6_STATE__.buildState === 'failed');
  assert(await page.inputValue('#source') === sourceBeforeFailure && (await page.textContent('#build-log')).length > 0, 'compiler-unavailable recovery lost source or full-log guidance');
  await page.unroute('**/api/build');

  await page.route(/\/api\/build\/[^/]+$/u, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'building' }) }));
  await page.click('#build'); await page.waitForFunction(() => window.__M6_STATE__.buildState === 'building' && !document.querySelector('#cancel').disabled); await page.click('#cancel');
  await page.waitForFunction(() => window.__M6_STATE__.buildState === 'cancelled');
  assert(await page.inputValue('#source') === sourceBeforeFailure, 'build cancellation lost edited source');
  await page.unroute(/\/api\/build\/[^/]+$/u);

  await page.route('**/api/build', (route) => route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ jobId: 'm12-timeout', capability: 'm12-test-capability' }) }));
  await page.route('**/api/build/m12-timeout', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'timeout', error: 'Bounded compiler timeout' }) }));
  await page.click('#build'); await page.waitForFunction(() => window.__M6_STATE__.buildState === 'timeout');
  assert(await page.inputValue('#source') === sourceBeforeFailure && (await page.textContent('#project-message')).length > 0, 'timeout recovery lost source or actionable guidance');
  await page.unroute('**/api/build/m12-timeout'); await page.unroute('**/api/build');

  await page.fill('#source', `${sourceBeforeFailure}\nthis will not compile`);
  const failure = await waitBuild(page);
  assert(failure.buildState === 'failed' && await page.locator('#diagnostic-links button').count() > 0, 'compiler failure did not provide clickable diagnostics');
  await page.locator('#diagnostic-links button').first().click();
  assert((await page.inputValue('#source')).includes('this will not compile') && await page.evaluate(() => document.activeElement?.id === 'source'), 'diagnostic navigation lost edited source or failed to focus the editor');
  await page.click('#project-save');
  assert((await page.textContent('#project-message')).includes('Saved'), 'project did not recover after compiler failure');

  const narrow = await browser.newContext({ viewport: { width: 320, height: 780 }, hasTouch: true });
  const narrowPage = await narrow.newPage(); await narrowPage.goto(base, { waitUntil: 'networkidle' }); await narrowPage.waitForFunction(() => window.__M11_READY__ === true);
  const narrowLayout = await narrowPage.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, buttons: [...document.querySelectorAll('#quick-build,#quick-run,#quick-pause,#quick-reset')].every((node) => node.getBoundingClientRect().width > 0) }));
  assert(narrowLayout.scroll <= narrowLayout.width + 1 && narrowLayout.buttons, `narrow layout overflowed or lost controls: ${JSON.stringify(narrowLayout)}`);
  await narrowPage.click('#project-demo');
  const narrowPin = narrowPage.locator('.pin-anchor[data-endpoint="board-1.D5"]'); await narrowPin.focus(); await narrowPage.keyboard.press('Enter');
  assert((await narrowPage.textContent('#wire-state')).includes('board-1.D5'), 'narrow keyboard access selected the wrong dense-header pin'); await narrowPage.keyboard.press('Enter');
  const touchCanvas = await narrowPage.locator('#circuit-canvas').boundingBox();
  const touchBefore = await narrowPage.evaluate(() => structuredClone(window.__M6_PROJECT__().layout.viewport));
  await narrowPage.locator('#circuit-canvas').dispatchEvent('pointerdown', { pointerId: 91, pointerType: 'touch', button: 0, clientX: touchCanvas.x + 16, clientY: touchCanvas.y + touchCanvas.height - 16 });
  await narrowPage.locator('#circuit-canvas').dispatchEvent('pointermove', { pointerId: 91, pointerType: 'touch', buttons: 1, clientX: touchCanvas.x + 48, clientY: touchCanvas.y + touchCanvas.height - 38 });
  await narrowPage.locator('#circuit-canvas').dispatchEvent('pointerup', { pointerId: 91, pointerType: 'touch', button: 0, clientX: touchCanvas.x + 48, clientY: touchCanvas.y + touchCanvas.height - 38 });
  const touchAfter = await narrowPage.evaluate(() => structuredClone(window.__M6_PROJECT__().layout.viewport));
  assert(touchAfter.panX !== touchBefore.panX || touchAfter.panY !== touchBefore.panY, 'touch pointer pan did not update the viewport');
  await narrow.close();

  assert(errors.length === 0, `page errors: ${errors.join(', ')}`);
  await context.close(); await browser.close();
  process.stdout.write(`${JSON.stringify({ status: 'pass', browser: browserName, examples: 4, liveMove: true, pointerZoomPan: true, serialText: true, waveform: true, narrow: 320 })}\n`);
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
