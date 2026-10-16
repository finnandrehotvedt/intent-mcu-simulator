// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const path = require('path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium, firefox, webkit } = require(path.join(moduleRoot, 'playwright'));
const browserName = process.env.M6_BROWSER || 'chromium';
const browserType = { chromium, firefox, webkit }[browserName];
const base = process.env.M3_STAGING_URL || 'http://127.0.0.1:18766';
const screenshotDirectory = process.env.RECEIPT14_SCREENSHOT_DIR || null;

function assert(condition, message) { if (!condition) throw new Error(message); }
const canonical = (value) => JSON.stringify(value);

async function openExample(page, id) {
  await page.click('#project-new');
  await page.selectOption('#example-select', id);
  await page.click('#project-demo');
  await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.length >= 2);
}

async function waitBuild(page) {
  await page.click('#build');
  await page.waitForFunction(() => ['succeeded', 'failed', 'cancelled', 'timeout'].includes(window.__M6_STATE__.buildState), null, { timeout: 30_000 });
  const state = await page.evaluate(() => structuredClone(window.__M6_STATE__));
  assert(state.buildState === 'succeeded', `build failed: ${state.buildState}`);
  await page.waitForFunction(() => window.__M6_STATE__.runtime?.kind === 'ready', null, { timeout: 10_000 });
}

async function routePoint(locator, fraction = 0.5) {
  return locator.evaluate((node, ratio) => {
    const local = node.getPointAtLength(node.getTotalLength() * ratio);
    const point = new DOMPoint(local.x, local.y).matrixTransform(node.getScreenCTM());
    return { x: point.x, y: point.y, orientation: node.dataset.orientation };
  }, fraction);
}

async function directTarget(page, selector, orientation = null, fraction = 0.5) {
  await page.locator('#circuit-canvas').scrollIntoViewIfNeeded();
  const candidates = page.locator(selector);
  const result = await candidates.evaluateAll((nodes, options) => nodes.flatMap((node, index) => {
    const { wanted, fraction: ratio } = options;
    if (wanted && node.dataset.orientation !== wanted) return [];
    const local = node.getPointAtLength(node.getTotalLength() * ratio);
    const point = new DOMPoint(local.x, local.y).matrixTransform(node.getScreenCTM());
    const top = document.elementFromPoint(point.x, point.y);
    return top && !top.closest?.('.pin-anchor,.component-control-hit') ? [{ index, x: point.x, y: point.y }] : [];
  })[0] ?? null, { wanted: orientation, fraction });
  assert(result, `no directly exposed ${orientation ?? ''} route target for ${selector}`);
  return { locator: candidates.nth(result.index), point: result };
}

async function project(page) { return page.evaluate(() => window.__M6_PROJECT__()); }

let browser;
(async () => {
  assert(browserType, `unsupported browser ${browserName}`);
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = []; const outside = []; const workers = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push({ text: message.text(), location: message.location() }); });
  page.on('worker', (worker) => workers.push(worker.url()));
  page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__M11_READY__ === true);

  // A01-A05/A07/A09/A10: the destructive key follows the sole selection.
  await openExample(page, 'button');
  await page.locator('[data-component-id="board-1"]').click({ force: true });
  assert((await page.evaluate(() => window.__M6_STATE__.selection)).kind === 'component', 'component selection did not become authoritative');
  await page.locator('.wire-segment-hit').first().focus();
  const wireSelection = await page.evaluate(() => structuredClone(window.__M6_STATE__.selection));
  assert(wireSelection.kind === 'wire-segment', 'wire focus did not clear component selection');
  const beforeWireDelete = await project(page);
  await page.keyboard.press('Delete');
  let current = await project(page);
  assert(current.circuit.components.length === beforeWireDelete.circuit.components.length
    && current.circuit.nets.length === beforeWireDelete.circuit.nets.length - 1, 'wire Delete removed a component or failed to remove only the connection');
  await page.click('#undo'); assert(canonical(await project(page)) === canonical(beforeWireDelete), 'wire Delete undo did not restore exact project');
  await page.click('#redo'); assert((await project(page)).circuit.nets.length === beforeWireDelete.circuit.nets.length - 1, 'wire Delete redo failed');
  await page.click('#undo');
  await page.selectOption('#selected-net', 'net-example-1');
  const beforeNetKey = canonical(await project(page)); await page.keyboard.press('Delete');
  assert(canonical(await project(page)) === beforeNetKey, 'Delete silently removed a whole selected net');
  await page.click('#delete-wire');
  assert((await project(page)).circuit.nets.length === JSON.parse(beforeNetKey).circuit.nets.length - 1,
    'separately labelled whole-net action did not remove only the selected net');
  await page.click('#undo'); assert(canonical(await project(page)) === beforeNetKey, 'whole-net Delete undo was not exact');
  await page.locator('[data-component-id="button-1"]').click({ force: true });
  assert((await page.evaluate(() => window.__M6_STATE__.selection)).kind === 'component', 'component selection did not clear wire/net selection');
  const beforeTextDelete = canonical(await project(page));
  await page.fill('#project-name', 'Delete me'); await page.locator('#project-name').press('Control+A'); await page.locator('#project-name').press('Delete');
  assert(canonical(await project(page)) === beforeTextDelete, 'native text Delete mutated the circuit');
  const nativeEditing = await page.evaluate(() => {
    const host = document.createElement('div'); host.id = 'receipt14-native-editors';
    host.innerHTML = '<textarea>textarea text</textarea><div contenteditable="true">editable text</div><select><option>one</option><option>two</option></select>';
    document.body.append(host); return true;
  });
  assert(nativeEditing, 'native editor fixture failed');
  const textarea = page.locator('#receipt14-native-editors textarea');
  await textarea.focus(); await page.keyboard.press('End'); await page.keyboard.press('Backspace');
  assert(await textarea.inputValue() === 'textarea tex', 'textarea did not retain native Backspace behavior');
  const editable = page.locator('#receipt14-native-editors [contenteditable]');
  await editable.focus(); await page.keyboard.press('End'); await page.keyboard.press('Backspace');
  assert(await editable.textContent() === 'editable tex', 'contenteditable did not retain native Backspace behavior');
  await page.locator('#receipt14-native-editors select').focus(); await page.keyboard.press('Delete');
  assert(canonical(await project(page)) === beforeTextDelete, 'native textarea/select/contenteditable key mutated the project');
  await page.evaluate(() => document.querySelector('#receipt14-native-editors').remove());
  await page.click('#project-new');
  const emptyBefore = canonical(await project(page)); await page.locator('#circuit-canvas').focus(); await page.keyboard.press('Delete');
  assert(canonical(await project(page)) === emptyBefore, 'Delete with no selection mutated the project');

  // A06/A08: component and multibranch deletion stay distinct and undoable.
  await openExample(page, 'button');
  await page.evaluate(() => window.__M6_ADD__('potentiometer.linear-v1'));
  await page.evaluate(() => window.__M6_CONNECT__('board-1.GND1', 'pot-1.LOW'));
  await page.waitForFunction(() => window.__M6_PROJECT__().circuit.nets.find((net) => net.id === 'net-example-2')?.endpoints.length === 3);
  const branchBefore = await project(page);
  await page.locator('.wire-segment-hit[data-net="net-example-2"][data-endpoint="pot-1.LOW"]').first().focus();
  await page.keyboard.press('Delete');
  current = await project(page);
  assert(current.circuit.components.length === branchBefore.circuit.components.length
    && current.circuit.nets.find((net) => net.id === 'net-example-2')?.endpoints.length === 2,
  'multi-branch Delete did not preserve components and remaining net');
  await page.click('#undo'); assert(canonical(await project(page)) === canonical(branchBefore), 'branch Delete undo was not exact');
  await page.locator('[data-component-id="pot-1"]').click({ force: true });
  const componentBefore = await project(page); await page.keyboard.press('Delete');
  current = await project(page);
  assert(!current.circuit.components.some((item) => item.id === 'pot-1') && current.circuit.components.length === componentBefore.circuit.components.length - 1,
    'component Delete targeted the wrong object');
  await page.click('#undo'); assert(canonical(await project(page)) === canonical(componentBefore), 'component Delete undo was not exact');

  // B/C/D: direct hit area, actual axis drag, cancellation, overlap cycling, topology isolation.
  await openExample(page, 'button');
  const graphBeforeDrag = canonical((await project(page)).circuit);
  const horizontal = await directTarget(page, '.wire-segment-hit', 'horizontal');
  const routeBefore = canonical((await project(page)).layout.wireRoutes);
  const noOpRevision = await page.evaluate(() => window.__M6_STATE__.revision);
  await page.mouse.move(horizontal.point.x, horizontal.point.y); await page.mouse.down(); await page.mouse.up();
  assert(await page.evaluate(() => window.__M6_STATE__.revision) === noOpRevision
    && canonical((await project(page)).layout.wireRoutes) === routeBefore, 'no-op wire gesture entered history');
  const horizontalDrag = await directTarget(page, '.wire-segment-hit', 'horizontal', 0.35);
  await page.mouse.move(horizontalDrag.point.x, horizontalDrag.point.y); await page.mouse.down();
  await page.mouse.move(horizontalDrag.point.x, horizontalDrag.point.y + 44, { steps: 4 });
  await page.waitForFunction(() => document.querySelectorAll('.wire-drag-proposal').length > 0, null, { timeout: 2_000 })
    .catch(async () => {
      const diagnostic = await page.evaluate(() => ({
        selection: window.__M6_STATE__.selection,
        wireState: document.querySelector('#wire-state')?.textContent,
        dragging: [...document.querySelectorAll('.wire-segment-hit.dragging')].map((node) => ({
          net: node.dataset.net, endpoint: node.dataset.endpoint, segment: node.dataset.segment,
          orientation: node.dataset.orientation, captured: node.dataset.pointerCaptured,
        })),
      }));
      throw new Error(`actual pointer drag did not show a live proposal: ${JSON.stringify(diagnostic)}`);
    });
  await page.mouse.up();
  current = await project(page);
  assert(canonical(current.layout.wireRoutes) !== routeBefore && canonical(current.circuit) === graphBeforeDrag, 'axis drag changed no route or changed connectivity');
  await page.click('#undo'); assert(canonical((await project(page)).layout.wireRoutes) === routeBefore, 'route drag undo was not one exact transaction');
  const vertical = await directTarget(page, '.wire-segment-hit', 'vertical');
  const beforeCancel = canonical(await project(page));
  await page.mouse.move(vertical.point.x, vertical.point.y); await page.mouse.down(); await page.mouse.move(vertical.point.x + 42, vertical.point.y, { steps: 3 });
  await page.keyboard.press('Escape'); await page.mouse.up();
  assert(canonical(await project(page)) === beforeCancel, 'Escape did not restore exact route/project state');
  assert(await page.locator('.wire-segment-hit').first().getAttribute('stroke-width') === '18', 'wire hit width regressed');

  if (browserName === 'chromium') {
    const touch = await directTarget(page, '.wire-segment-hit', 'horizontal');
    const beforeTouch = canonical(await project(page));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touch.point.x, y: touch.point.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touch.point.x, y: touch.point.y + 36 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert(canonical(await project(page)) !== beforeTouch, 'touch route drag did not commit through the pointer-capture path');
    await page.click('#undo'); assert(canonical(await project(page)) === beforeTouch, 'touch route drag undo was not exact');
  }

  if (browserName === 'chromium') {
    const lostCapture = await directTarget(page, '.wire-segment-hit', 'vertical');
    const beforeLostCapture = canonical(await project(page));
    const lostCaptureRevision = await page.evaluate(() => window.__M6_STATE__.revision);
    await page.mouse.move(lostCapture.point.x, lostCapture.point.y); await page.mouse.down();
    await page.waitForFunction((node) => node.dataset.pointerCaptured === 'true', await lostCapture.locator.elementHandle());
    await page.mouse.move(lostCapture.point.x + 34, lostCapture.point.y, { steps: 3 });
    await lostCapture.locator.evaluate((node) => node.releasePointerCapture(1)); await page.mouse.up();
    assert(canonical(await project(page)) === beforeLostCapture
      && await page.evaluate(() => window.__M6_STATE__.revision) === lostCaptureRevision,
    'lost pointer capture did not restore the exact route/history');
  }

  const overlapProject = await project(page);
  const commonHub = { x: 0.58, y: 0.52 };
  overlapProject.layout.wireRoutes = Object.fromEntries(overlapProject.circuit.nets.map((net, netIndex) => [net.id, {
    schema: 'intent-mcu-route@1',
    branches: net.endpoints.map((endpoint, endpointIndex) => ({
      endpoint,
      points: endpointIndex === 0
        ? [{ x: 0.58, y: netIndex ? 0.74 : 0.28 }, commonHub]
        : [{ x: 0.72, y: 0.35 }, { x: 0.58, y: 0.35 }, commonHub],
    })),
  }]));
  const imported = await page.evaluate((source) => window.__M6_IMPORT__(source, 'replace'), JSON.stringify(overlapProject));
  assert(imported.ok, `overlap fixture import failed: ${imported.code}`);
  await page.waitForTimeout(180);
  const overlapping = page.locator('.wire-segment-hit[data-endpoint="button-1.A"][data-segment="2"],.wire-segment-hit[data-endpoint="button-1.B"][data-segment="2"]');
  await overlapping.first().scrollIntoViewIfNeeded();
  const overlapPoint = await routePoint(overlapping.first());
  await page.mouse.click(overlapPoint.x, overlapPoint.y);
  const firstOverlap = await page.evaluate(() => structuredClone(window.__M6_STATE__.selection));
  await page.mouse.click(overlapPoint.x, overlapPoint.y);
  const secondOverlap = await page.evaluate(() => structuredClone(window.__M6_STATE__.selection));
  assert(firstOverlap.kind === 'wire-segment' && secondOverlap.kind === 'wire-segment'
    && `${firstOverlap.netId}/${firstOverlap.endpoint}` !== `${secondOverlap.netId}/${secondOverlap.endpoint}`,
  `overlap selection did not cycle deterministically: ${canonical({ firstOverlap, secondOverlap })}`);
  await overlapping.first().focus();
  await page.keyboard.press('Enter');
  const firstKeyboardCycle = await page.evaluate(() => structuredClone(window.__M6_STATE__.selection));
  await page.keyboard.press('Enter');
  const secondKeyboardCycle = await page.evaluate(() => structuredClone(window.__M6_STATE__.selection));
  assert(`${firstKeyboardCycle.netId}/${firstKeyboardCycle.endpoint}/${firstKeyboardCycle.segmentIndex}`
    !== `${secondKeyboardCycle.netId}/${secondKeyboardCycle.endpoint}/${secondKeyboardCycle.segmentIndex}`,
  `keyboard overlap selection did not cycle: ${canonical({ firstKeyboardCycle, secondKeyboardCycle })}`);
  assert(canonical((await project(page)).circuit) === graphBeforeDrag, 'overlap cycling changed electrical connectivity');

  // C07/C08: GND identity/anchor and route geometry are tested separately.
  await openExample(page, 'blink');
  const ground = await page.evaluate(() => {
    const project = window.__M6_PROJECT__(); const canvas = document.querySelector('#circuit-canvas').getBoundingClientRect();
    const board = document.querySelector('[data-component-id="board-1"]').getBoundingClientRect();
    const anchor = document.querySelector('.pin-anchor[data-endpoint="board-1.GND1"]'); const anchorBox = anchor.getBoundingClientRect();
    const path = document.querySelector('.circuit-wire[data-endpoint="board-1.GND1"]');
    const points = [...path.getAttribute('d').matchAll(/[ML]\s+(-?[\d.]+)\s+(-?[\d.]+)/gu)].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
    const anchorPoint = { x: anchorBox.left - canvas.left + anchorBox.width / 2, y: anchorBox.top - canvas.top + anchorBox.height / 2 };
    const interior = { left: board.left - canvas.left + 2, right: board.right - canvas.left - 2, top: board.top - canvas.top + 2, bottom: board.bottom - canvas.top - 2 };
    const reentry = points.slice(1).some((point) => point.x > interior.left && point.x < interior.right && point.y > interior.top && point.y < interior.bottom);
    return {
      endpoint: project.circuit.nets.find((net) => net.id === path.dataset.net).endpoints.find((endpoint) => endpoint.component === 'board-1'),
      title: anchor.title, startError: Math.max(Math.abs(points[0].x - anchorPoint.x), Math.abs(points[0].y - anchorPoint.y)), reentry,
    };
  });
  assert(ground.endpoint.pin === 'GND1' && ground.title.includes('GND') && ground.title.includes('ground') && ground.startError <= 0.51,
    `GND electrical/anchor identity failed: ${canonical(ground)}`);
  assert(!ground.reentry, `GND route re-entered the board body: ${canonical(ground)}`);

  // E/F: one docked view, one worker, real button press/hold/release and firmware text.
  await openExample(page, 'button');
  await page.fill('#source', (await page.inputValue('#source')).replace('delay(120)', 'delay(10)'));
  await waitBuild(page);
  assert(workers.length === 1, `expected one runtime worker after build, got ${workers.length}`);
  const lifecycleBeforeDock = await page.evaluate(() => structuredClone(window.__M6_STATE__.lifecycle));
  await page.click('#serial-tab'); await page.click('#canvas-interact-mode');
  assert(await page.getAttribute('#serial-tab', 'aria-expanded') === 'true'
    && await page.getAttribute('#serial-tab', 'aria-controls') === 'serial-dock', 'Serial tab ARIA state is wrong');
  assert(await page.locator('#serial-dock').isVisible() && await page.locator('#circuit-canvas').isVisible(), 'wide canvas and Serial dock are not simultaneously visible');
  assert(canonical(await page.evaluate(() => window.__M6_STATE__.lifecycle)) === canonical(lifecycleBeforeDock) && workers.length === 1,
    'opening the Serial dock changed lifecycle or duplicated the worker');
  const widthBefore = (await page.locator('#serial-dock').boundingBox()).width;
  await page.locator('#serial-resizer').focus(); await page.keyboard.press('ArrowLeft');
  assert((await page.locator('#serial-dock').boundingBox()).width > widthBefore, 'keyboard dock resize failed');
  await page.selectOption('#speed', 'maximum'); await page.click('#run');
  await page.waitForFunction(() => window.__M6_STATE__.runtime?.instruments?.serial?.text?.includes('RELEASED'), null, { timeout: 10_000 });
  const tactile = page.locator('.component-control-hit'); await tactile.scrollIntoViewIfNeeded(); const tactileBox = await tactile.boundingBox();
  await page.mouse.move(tactileBox.x + tactileBox.width / 2, tactileBox.y + tactileBox.height / 2); await page.mouse.down();
  await page.waitForFunction(() => window.__M6_STATE__.runtime?.instruments?.serial?.text?.trimEnd().endsWith('PRESSED'), null, { timeout: 10_000 });
  assert(await tactile.getAttribute('aria-pressed') === 'true', 'canvas button did not stay pressed during hold');
  await page.mouse.up();
  await page.waitForFunction(() => window.__M6_STATE__.runtime?.instruments?.serial?.text?.trimEnd().endsWith('RELEASED'), null, { timeout: 10_000 });
  assert(await tactile.getAttribute('aria-pressed') === 'false', 'canvas button did not release on pointerup');
  await tactile.focus(); await page.keyboard.down('Enter');
  await page.waitForFunction(() => document.querySelector('.component-control-hit')?.getAttribute('aria-pressed') === 'true');
  await page.keyboard.up('Enter');
  await page.waitForFunction(() => document.querySelector('.component-control-hit')?.getAttribute('aria-pressed') === 'false');
  const cancelBox = await tactile.boundingBox();
  await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y + cancelBox.height / 2); await page.mouse.down();
  await page.waitForFunction(() => document.querySelector('.component-control-hit')?.getAttribute('aria-pressed') === 'true');
  await tactile.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' }); await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('.component-control-hit')?.getAttribute('aria-pressed') === 'false');
  if (browserName === 'chromium') {
    await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y + cancelBox.height / 2); await page.mouse.down();
    await page.waitForFunction(() => document.querySelector('.component-control-hit')?.getAttribute('aria-pressed') === 'true');
    await tactile.evaluate((node) => node.releasePointerCapture(1)); await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('.component-control-hit')?.getAttribute('aria-pressed') === 'false');
  }
  if (screenshotDirectory && browserName === 'chromium') await page.screenshot({ path: path.join(screenshotDirectory, `${browserName}-wide-serial-button.png`), animations: 'allow', caret: 'initial' });

  await page.click('#serial-event-mode'); assert((await page.textContent('#serial-output')).includes('TX'), 'Serial Events mode did not use current records');
  await page.click('#serial-text-mode');
  await page.waitForFunction(() => {
    const output = document.querySelector('#serial-output');
    return output.scrollHeight > output.clientHeight + 8;
  }, null, { timeout: 30_000 });
  await page.locator('#serial-output').focus();
  await page.keyboard.press('Home');
  await page.evaluate(() => { document.querySelector('#serial-output').scrollTop = 0; });
  await page.waitForFunction(() => {
    const output = document.querySelector('#serial-output');
    return window.__M6_STATE__.serialAutoscroll === false
      && output.scrollHeight - output.scrollTop - output.clientHeight > 6;
  });
  await page.waitForFunction(() => !document.querySelector('#serial-new-output').hidden, null, { timeout: 10_000 });
  await page.click('#serial-resume');
  const serialResumeImmediate = await page.evaluate(() => ({
    autoscroll: window.__M6_STATE__.serialAutoscroll,
    unread: window.__M6_STATE__.serialUnreadRecords,
    indicatorHidden: document.querySelector('#serial-new-output').hidden,
  }));
  try {
    await page.waitForFunction(() => window.__M6_STATE__.serialAutoscroll === true
      && window.__M6_STATE__.serialUnreadRecords === 0
      && document.querySelector('#serial-new-output').hidden, null, { timeout: 5_000 });
  } catch {
    const serialResumeState = await page.evaluate(() => ({
      autoscroll: window.__M6_STATE__.serialAutoscroll,
      unread: window.__M6_STATE__.serialUnreadRecords,
      indicatorHidden: document.querySelector('#serial-new-output').hidden,
      scrollTop: document.querySelector('#serial-output').scrollTop,
      scrollHeight: document.querySelector('#serial-output').scrollHeight,
      clientHeight: document.querySelector('#serial-output').clientHeight,
    }));
    throw new Error(`Serial resume did not settle: immediate=${canonical(serialResumeImmediate)} final=${canonical(serialResumeState)}`);
  }
  const downloadPromise = page.waitForEvent('download'); await page.click('#serial-export');
  assert((await downloadPromise).suggestedFilename() === 'intent-mcu-serial.txt', 'Serial export failed');
  await page.click('#pause'); await page.waitForFunction(() => window.__M6_STATE__.runtime?.paused === true);
  await page.click('#serial-clear'); await page.waitForFunction(() => window.__M6_STATE__.runtime?.instruments?.serial?.records?.length === 0);
  await page.fill('#serial-input', 'Z'); await page.selectOption('#serial-newline', 'lf'); await page.click('#serial-send');
  await page.click('#serial-event-mode'); await page.click('#run'); await page.waitForFunction(() => document.querySelector('#serial-output').textContent.includes('RX'), null, { timeout: 10_000 });

  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(150);
  const narrow = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    dock: document.querySelector('#serial-dock').getBoundingClientRect(), canvas: document.querySelector('#circuit-canvas').getBoundingClientRect(),
  }));
  assert(narrow.overflow <= 1 && narrow.dock.height > 200 && narrow.canvas.height > 400, `narrow dock/canvas layout failed: ${canonical(narrow)}`);
  if (screenshotDirectory && browserName === 'chromium') await page.screenshot({ path: path.join(screenshotDirectory, `${browserName}-narrow-serial-button.png`), fullPage: true, animations: 'allow', caret: 'initial' });
  await page.click('#serial-close');
  const tabFocused = await page.locator('#serial-tab').evaluate((node) => document.activeElement === node);
  assert(tabFocused && await page.getAttribute('#serial-tab', 'aria-expanded') === 'false', 'Serial close did not restore tab focus/state');
  assert(workers.length === 1, `Serial view created duplicate workers: ${workers.length}`);

  assert(errors.length === 0, `browser errors: ${canonical(errors)}`);
  assert(outside.length === 0, `third-party requests: ${canonical(outside)}`);
  process.stdout.write(`${JSON.stringify({
    status: 'pass', browser: browserName, staleDeleteFixed: true, overlapCycle: true,
    gndIdentity: ground.endpoint.pin, gndRouteBodyReentry: ground.reentry,
    serialDock: true, tactileButton: true, workers: workers.length, outsideRequests: outside.length,
  })}\n`);
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close().catch(() => {}); });
