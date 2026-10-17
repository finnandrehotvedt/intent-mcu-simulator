// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const path = require('path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium, firefox, webkit } = require(path.join(moduleRoot, 'playwright'));
const browserName = process.env.M6_BROWSER || 'chromium';
const browserType = { chromium, firefox, webkit }[browserName];
const base = process.env.M3_STAGING_URL || 'http://127.0.0.1:18766';
const screenshotDirectory = process.env.RECEIPT14_FOLLOWUP_SCREENSHOT_DIR || null;
const expectBaselineLoop = process.env.RECEIPT14_EXPECT_BASELINE_LOOP === '1';

function assert(condition, message) { if (!condition) throw new Error(message); }
const canonical = (value) => JSON.stringify(value);

async function openExample(page, id) {
  await page.click('#project-new');
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
  await page.selectOption('#example-select', id);
  await page.click('#project-demo');
  await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.length >= 2);
}

async function waitBuild(page) {
  await page.click('#quick-build');
  await page.waitForFunction(() => ['succeeded', 'failed', 'cancelled', 'timeout'].includes(window.__M6_STATE__.buildState), null, { timeout: 30_000 });
  assert((await page.evaluate(() => window.__M6_STATE__.buildState)) === 'succeeded', 'button firmware build failed');
  await page.waitForFunction(() => window.__M6_STATE__.runtime?.kind === 'ready', null, { timeout: 10_000 });
}

async function directlyHitSegment(page, selector) {
  const segments = page.locator(selector);
  const target = await segments.evaluateAll((nodes) => {
    const candidates = [];
    nodes.forEach((node, index) => {
      const length = node.getTotalLength();
      for (const fraction of [0.5, 0.3, 0.7]) {
        const local = node.getPointAtLength(length * fraction);
        const point = new DOMPoint(local.x, local.y).matrixTransform(node.getScreenCTM());
        if (document.elementFromPoint(point.x, point.y) === node) {
          candidates.push({ index, x: point.x, y: point.y, orientation: node.dataset.orientation, length });
          break;
        }
      }
    });
    return candidates.sort((left, right) => right.length - left.length)[0] || null;
  });
  assert(target, `no directly hit-testable segment for ${selector}`);
  return { locator: segments.nth(target.index), ...target };
}

async function renderedRouteState(page, netId, endpoint) {
  return page.evaluate(({ netId: selectedNet, endpoint: selectedEndpoint }) => {
    const path = document.querySelector(`.circuit-wire[data-net="${selectedNet}"][data-endpoint="${selectedEndpoint}"]`);
    const points = [...path.getAttribute('d').matchAll(/[ML]\s+(-?[\d.]+)\s+(-?[\d.]+)/gu)]
      .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
    const between = (value, left, right) => value >= Math.min(left, right) - 0.01
      && value <= Math.max(left, right) + 0.01;
    const intersections = [];
    const edges = [];
    for (let first = 0; first < points.length - 1; first += 1) {
      const a = points[first]; const b = points[first + 1];
      edges.push([`${a.x}:${a.y}`, `${b.x}:${b.y}`].sort().join('>'));
      for (let second = first + 2; second < points.length - 1; second += 1) {
        const c = points[second]; const d = points[second + 1];
        const firstHorizontal = Math.abs(a.y - b.y) < 0.01;
        const secondHorizontal = Math.abs(c.y - d.y) < 0.01;
        if (firstHorizontal !== secondHorizontal) {
          const horizontal = firstHorizontal ? [a, b] : [c, d];
          const vertical = firstHorizontal ? [c, d] : [a, b];
          if (between(vertical[0].x, horizontal[0].x, horizontal[1].x)
              && between(horizontal[0].y, vertical[0].y, vertical[1].y)) intersections.push([first, second]);
        } else {
          const fixed = firstHorizontal ? 'y' : 'x'; const moving = firstHorizontal ? 'x' : 'y';
          const overlap = Math.min(Math.max(a[moving], b[moving]), Math.max(c[moving], d[moving]))
            - Math.max(Math.min(a[moving], b[moving]), Math.min(c[moving], d[moving]));
          if (Math.abs(a[fixed] - c[fixed]) < 0.01 && overlap > 0.01) intersections.push([first, second, 'overlap']);
        }
      }
    }
    return { points, intersections, repeatedEdges: edges.length - new Set(edges).size };
  }, { netId, endpoint });
}

async function testingGeometry(page, label) {
  return page.evaluate((name) => {
    const selectors = {
      canvas: '#circuit-canvas', button: '.component-control-hit', d2: '.pin-anchor[data-endpoint="board-1.D2"]',
      ground: '.pin-anchor[data-endpoint="board-1.GND1"]', serial: '#serial-output', dock: '#serial-dock',
      build: '#quick-build', run: '#quick-run', pause: '#quick-pause', reset: '#quick-reset',
      partsToggle: '#toggle-catalog', inspectorToggle: '#toggle-inspector',
    };
    const rectangles = Object.fromEntries(Object.entries(selectors).map(([key, selector]) => {
      const node = document.querySelector(selector); const box = node?.getBoundingClientRect();
      return [key, box ? { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom } : null];
    }));
    const intersectsViewport = (box) => box && box.right > 0 && box.bottom > 0 && box.x < innerWidth && box.y < innerHeight;
    const fullyVisible = (box) => box && box.x >= -1 && box.y >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1;
    const serialStyle = getComputedStyle(document.querySelector('#serial-output'));
    return {
      label: name, viewport: { width: innerWidth, height: innerHeight }, scrollY,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rectangles,
      allRequiredIntersect: ['canvas', 'button', 'd2', 'ground', 'serial', 'build', 'run', 'pause', 'reset']
        .every((key) => intersectsViewport(rectangles[key])),
      controlsFullyVisible: ['build', 'run', 'pause', 'reset', 'partsToggle', 'inspectorToggle']
        .every((key) => fullyVisible(rectangles[key])),
      serialFontPixels: Number.parseFloat(serialStyle.fontSize),
      panels: {
        partsCollapsed: document.querySelector('.workspace').classList.contains('catalog-collapsed'),
        inspectorCollapsed: document.querySelector('.workspace').classList.contains('inspector-collapsed'),
        partsTogglePressed: document.querySelector('#toggle-catalog').getAttribute('aria-pressed'),
        inspectorTogglePressed: document.querySelector('#toggle-inspector').getAttribute('aria-pressed'),
      },
    };
  }, label);
}

let browser;
(async () => {
  assert(browserType, `unsupported browser ${browserName}`);
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = []; const outside = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__M11_READY__ === true);

  // C09-C11/D08/G09: seed the reported persisted rectangular lap without copying screenshot data.
  await openExample(page, 'blink');
  const loopFixture = await page.evaluate(() => {
    const project = window.__M6_PROJECT__(); const net = project.circuit.nets.find((item) => item.id === 'net-example-3');
    const board = net.endpoints.find((endpoint) => endpoint.component === 'board-1');
    const remote = net.endpoints.find((endpoint) => endpoint.component !== 'board-1');
    project.layout.wireRoutes[net.id] = {
      schema: 'intent-mcu-route@1',
      branches: [
        { endpoint: board, points: [
          { x: 0.63, y: 0.6 }, { x: 0.63, y: 0.38 }, { x: 0.38, y: 0.38 },
          { x: 0.38, y: 0.55 }, { x: 0.71, y: 0.55 }, { x: 0.71, y: 0.69 },
        ] },
        { endpoint: remote, points: [{ x: 0.71, y: 0.3 }, { x: 0.71, y: 0.69 }] },
      ],
    };
    return { project, graph: JSON.stringify(project.circuit), boardEndpoint: `${board.component}.${board.pin}` };
  });
  const imported = await page.evaluate((project) => window.__M6_IMPORT__(JSON.stringify(project), 'replace'), loopFixture.project);
  assert(imported.ok, `legacy loop fixture import failed: ${canonical(imported)}`);
  const loadedRoute = await page.evaluate(() => structuredClone(window.__M6_PROJECT__().layout.wireRoutes['net-example-3']));
  assert(loadedRoute.branches.find((branch) => branch.endpoint.component === 'board-1').points.length === 6,
    'legacy route was silently wiped during load');
  const beforeRepair = await renderedRouteState(page, 'net-example-3', loopFixture.boardEndpoint);
  assert(beforeRepair.intersections.length > 0, `reported rectangular lap was not reproduced: ${canonical(beforeRepair)}`);
  const repairTarget = page.locator(`.wire-segment-hit[data-net="net-example-3"][data-endpoint="${loopFixture.boardEndpoint}"]`).first();
  const repairRevision = await page.evaluate(() => window.__M6_STATE__.revision);
  await repairTarget.focus();
  await page.keyboard.press(await repairTarget.getAttribute('data-orientation') === 'horizontal' ? 'ArrowDown' : 'ArrowRight');
  await page.waitForFunction((revision) => window.__M6_STATE__.revision > revision, repairRevision);
  const repaired = await renderedRouteState(page, 'net-example-3', loopFixture.boardEndpoint);
  if (expectBaselineLoop) {
    assert(repaired.intersections.length > 0 || repaired.repeatedEdges > 0,
      `baseline unexpectedly repaired the persisted lap: ${canonical(repaired)}`);
    process.stdout.write(`${JSON.stringify({
      status: 'baseline-reproduced', browser: browserName,
      loopBefore: beforeRepair.intersections.length, loopAfterEdit: repaired.intersections.length,
      source: 'pre-loop-correction-candidate',
    })}\n`);
    return;
  }
  assert(repaired.intersections.length === 0 && repaired.repeatedEdges === 0, `route lap survived edit: ${canonical(repaired)}`);
  assert(canonical(await page.evaluate(() => window.__M6_PROJECT__().circuit)) === loopFixture.graph, 'route repair changed electrical graph');

  let acceptedDrags = 1; let attempts = 0; let beforeLast = null;
  while (acceptedDrags < 24 && attempts < 80) {
    attempts += 1;
    const beforeRevision = await page.evaluate(() => window.__M6_STATE__.revision);
    const beforeProject = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    const selector = `.wire-segment-hit[data-net="net-example-3"][data-endpoint="${loopFixture.boardEndpoint}"]`;
    if (browserName === 'webkit') {
      const candidates = page.locator(selector);
      const longest = await candidates.evaluateAll((nodes) => nodes.map((node, index) => ({ index, length: node.getTotalLength() }))
        .sort((left, right) => right.length - left.length)[0]);
      const target = candidates.nth(longest.index); await target.focus();
      const horizontal = await target.getAttribute('data-orientation') === 'horizontal';
      await page.keyboard.press(horizontal ? (attempts % 2 ? 'ArrowDown' : 'ArrowUp') : (attempts % 2 ? 'ArrowRight' : 'ArrowLeft'));
    } else {
      const target = await directlyHitSegment(page, selector);
      const distance = attempts % 2 ? 16 : -16;
      await page.mouse.move(target.x, target.y); await page.mouse.down();
      await page.mouse.move(target.x + (target.orientation === 'vertical' ? distance : 0), target.y + (target.orientation === 'horizontal' ? distance : 0), { steps: 3 });
      await page.mouse.up();
    }
    await page.waitForTimeout(35);
    const afterRevision = await page.evaluate(() => window.__M6_STATE__.revision);
    if (afterRevision === beforeRevision) continue;
    beforeLast = beforeProject; acceptedDrags += 1;
    const state = await renderedRouteState(page, 'net-example-3', loopFixture.boardEndpoint);
    const branchPoints = await page.evaluate(() => window.__M6_PROJECT__().layout.wireRoutes['net-example-3']
      .branches.find((branch) => branch.endpoint.component === 'board-1').points.length);
    assert(state.intersections.length === 0 && state.repeatedEdges === 0 && branchPoints <= 7,
      `drag ${acceptedDrags} grew a route lap: ${canonical({ state, branchPoints })}`);
  }
  assert(acceptedDrags === 24, `only ${acceptedDrags} of 24 repeated drags committed`);
  const repeatedFinal = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
  await page.click('#undo'); assert(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())) === beforeLast, 'loop-regression undo was not exact');
  await page.click('#redo'); assert(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())) === repeatedFinal, 'loop-regression redo was not exact');
  await page.click('#project-save'); await page.click('#project-reload');
  assert(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())) === repeatedFinal, 'save/reopen grew or changed the corrected route');
  const exportPromise = page.waitForEvent('download'); await page.click('#project-export'); const download = await exportPromise; const downloadPath = await download.path();
  await page.click('#project-new');
  if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
  await page.selectOption('#project-import-mode', 'replace'); await page.setInputFiles('#project-import', downloadPath);
  await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('Project replaced safely'));
  assert(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())) === repeatedFinal, 'export/import grew or changed the corrected route');

  // E10-E12/F10: practical simultaneous testing view with real firmware and canvas input.
  await openExample(page, 'button');
  await page.fill('#source', (await page.inputValue('#source')).replace('delay(120)', 'delay(10)'));
  await waitBuild(page);
  if (await page.getAttribute('#toggle-catalog', 'aria-pressed') !== 'true') await page.click('#toggle-catalog');
  if (await page.getAttribute('#toggle-inspector', 'aria-pressed') !== 'true') await page.click('#toggle-inspector');
  await page.click('#serial-tab'); await page.click('#canvas-interact-mode');
  await page.selectOption('#speed', 'maximum'); await page.click('#quick-run');
  await page.waitForFunction(() => window.__M6_STATE__.runtime?.instruments?.serial?.text?.includes('RELEASED'), null, { timeout: 10_000 });
  await page.locator('#circuit-canvas').evaluate((node) => node.scrollIntoView({ block: 'center' })); await page.waitForTimeout(120);
  const wideBeforeScroll = await page.evaluate(() => scrollY);
  const tactile = page.locator('.component-control-hit'); const tactileBox = await tactile.boundingBox();
  await page.mouse.move(tactileBox.x + tactileBox.width / 2, tactileBox.y + tactileBox.height / 2); await page.mouse.down();
  await page.waitForFunction(() => window.__M6_STATE__.runtime?.instruments?.serial?.text?.trimEnd().endsWith('PRESSED'), null, { timeout: 10_000 });
  const wide = await testingGeometry(page, '1440x900');
  assert(wide.allRequiredIntersect && wide.controlsFullyVisible && wide.overflowX <= 1,
    `wide simultaneous testing view clipped required content: ${canonical(wide)}`);
  assert(wide.rectangles.canvas.width >= 700 && wide.rectangles.canvas.height >= 500
    && wide.rectangles.serial.width >= 300 && wide.rectangles.serial.height >= 180 && wide.serialFontPixels >= 11,
  `wide circuit/Serial dimensions are not practical: ${canonical(wide)}`);
  assert(wide.panels.partsCollapsed && wide.panels.inspectorCollapsed
    && wide.panels.partsTogglePressed === 'true' && wide.panels.inspectorTogglePressed === 'true',
  `collapsed panels lost accessible reopening state: ${canonical(wide.panels)}`);
  if (screenshotDirectory && browserName === 'chromium') await page.screenshot({
    path: path.join(screenshotDirectory, 'chromium-simultaneous-testing-view.png'), animations: 'allow', caret: 'initial',
  });
  await page.mouse.up();
  await page.waitForFunction(() => window.__M6_STATE__.runtime?.instruments?.serial?.text?.trimEnd().endsWith('RELEASED'), null, { timeout: 10_000 });
  assert(await page.evaluate(() => scrollY) === wideBeforeScroll, 'button/Serial testing required document scrolling');

  await page.locator('#serial-resizer').focus();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await page.setViewportSize({ width: 1152, height: 720 });
  await page.locator('#circuit-canvas').evaluate((node) => node.scrollIntoView({ block: 'center' })); await page.waitForTimeout(140);
  const zoomed = await testingGeometry(page, '1152x720-effective-125-percent');
  assert(zoomed.allRequiredIntersect && zoomed.controlsFullyVisible && zoomed.overflowX <= 1,
    `effective 125% testing view clipped required content: ${canonical(zoomed)}`);
  assert(zoomed.rectangles.canvas.width >= 650 && zoomed.rectangles.serial.width >= 280
    && zoomed.rectangles.serial.height >= 170, `effective 125% dimensions are not usable: ${canonical(zoomed)}`);

  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(140);
  const narrow = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    canvas: document.querySelector('#circuit-canvas').getBoundingClientRect().toJSON(),
    dock: document.querySelector('#serial-dock').getBoundingClientRect().toJSON(),
    tabExpanded: document.querySelector('#serial-tab').getAttribute('aria-expanded'),
  }));
  assert(narrow.overflowX <= 1 && narrow.canvas.height >= 500 && narrow.dock.height >= 300
    && narrow.tabExpanded === 'true', `narrow drawer/split geometry failed: ${canonical(narrow)}`);
  await page.click('#serial-close');
  assert(await page.locator('#serial-tab').evaluate((node) => document.activeElement === node), 'narrow close did not return focus to Serial tab');
  await page.click('#serial-tab'); assert(await page.getAttribute('#serial-tab', 'aria-expanded') === 'true', 'Serial tab did not reopen accessibly');

  assert(errors.length === 0, `browser errors: ${canonical(errors)}`);
  assert(outside.length === 0, `third-party requests: ${canonical(outside)}`);
  process.stdout.write(`${JSON.stringify({
    status: 'pass', browser: browserName, acceptedDrags, loopBefore: beforeRepair.intersections.length,
    loopAfter: repaired.intersections.length, wide, zoomed,
    narrow: { overflowX: narrow.overflowX, canvasHeight: narrow.canvas.height, dockHeight: narrow.dock.height },
  })}\n`);
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close().catch(() => {}); });
