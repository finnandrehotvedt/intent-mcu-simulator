// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const path = require('path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium, firefox, webkit } = require(path.join(moduleRoot, 'playwright'));
const base = process.env.M3_STAGING_URL || 'http://127.0.0.1:18766';
const browserName = process.env.M6_BROWSER || 'chromium';
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unsupported browser: ${browserName}`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function state(page, predicate, timeout = 30_000) {
  await page.waitForFunction(predicate, null, { timeout });
  return page.evaluate(() => structuredClone(window.__M6_STATE__));
}

async function build(page) {
  await page.click('#build');
  const result = await state(page, () => ['succeeded', 'failed', 'cancelled', 'timeout'].includes(window.__M6_STATE__?.buildState), 30_000);
  if (result.buildState === 'succeeded') await state(page, () => window.__M6_STATE__?.runtime?.kind === 'ready');
  return result;
}

async function connect(page, from, to) {
  await page.locator(`.pin-anchor[data-endpoint="${from}"]`).click({ force: true });
  await page.locator(`.pin-anchor[data-endpoint="${to}"]`).click({ force: true });
}

async function setMainSource(page, source) {
  await page.selectOption('#source-file', 'main.ino');
  await page.fill('#source', source);
}

async function wireMetrics(page) {
  await page.waitForTimeout(80);
  return page.evaluate(() => {
    const canvas = document.querySelector('#circuit-canvas').getBoundingClientRect();
    const errors = [...document.querySelectorAll('path.circuit-wire')].map((wire) => {
      const anchor = document.querySelector(`.pin-anchor[data-endpoint="${wire.dataset.endpoint}"]`).getBoundingClientRect();
      const start = /^M ([\d.-]+) ([\d.-]+)/.exec(wire.getAttribute('d'));
      return { endpoint: wire.dataset.endpoint, path: wire.getAttribute('d'), anchor: [anchor.left - canvas.left + anchor.width / 2, anchor.top - canvas.top + anchor.height / 2], error: Math.max(
        Math.abs(Number(start[1]) - (anchor.left - canvas.left + anchor.width / 2)),
        Math.abs(Number(start[2]) - (anchor.top - canvas.top + anchor.height / 2)),
      ) };
    });
    const worst = errors.sort((a, b) => b.error - a.error)[0] ?? null;
    return { paths: errors.length, maximumEndpointError: worst?.error ?? 0, worst };
  });
}

async function automaticRouteIntersections(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#circuit-canvas').getBoundingClientRect();
    const bodies = [...document.querySelectorAll('.circuit-component')].map((node) => {
      const box = node.getBoundingClientRect();
      return {
        id: node.dataset.componentId,
        left: box.left - canvas.left + 2,
        right: box.right - canvas.left - 2,
        top: box.top - canvas.top + 2,
        bottom: box.bottom - canvas.top - 2,
      };
    });
    const collisions = [];
    for (const path of document.querySelectorAll('path.circuit-wire')) {
      const owner = path.dataset.endpoint.slice(0, path.dataset.endpoint.lastIndexOf('.'));
      const points = [...path.getAttribute('d').matchAll(/[ML]\s+(-?[\d.]+)\s+(-?[\d.]+)/gu)]
        .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
      for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1]; const to = points[index];
        for (const body of bodies) {
          if (body.id === owner) continue;
          const vertical = Math.abs(from.x - to.x) < 0.01 && from.x > body.left && from.x < body.right
            && Math.max(Math.min(from.y, to.y), body.top) < Math.min(Math.max(from.y, to.y), body.bottom);
          const horizontal = Math.abs(from.y - to.y) < 0.01 && from.y > body.top && from.y < body.bottom
            && Math.max(Math.min(from.x, to.x), body.left) < Math.min(Math.max(from.x, to.x), body.right);
          if (vertical || horizontal) collisions.push({ net: path.dataset.net, endpoint: path.dataset.endpoint, body: body.id, from, to });
        }
      }
    }
    return collisions;
  });
}

(async () => {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const outside = [];
  const errors = [];
  const websockets = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url());
  });
  page.on('websocket', (socket) => websockets.push(socket.url()));
  page.on('pageerror', (error) => errors.push(String(error)));

  const response = await page.goto(base, { waitUntil: 'networkidle' });
  assert(response && response.status() === 200, 'M7 staging page failed');
  await page.waitForFunction(() => window.__M6_READY__ === true);
  let project = await page.evaluate(() => window.__M6_PROJECT__());
  assert(project.circuit.components.length === 0 && project.circuit.nets.length === 0, 'project did not start empty');
  assert(project.source.files.length === 1 && project.source.files[0].content === '', 'empty project concealed source');
  assert(await page.isDisabled('#run'), 'Run enabled without a current artifact');
  await page.click('#project-demo');
  let demo = await page.evaluate(() => window.__M6_PROJECT__());
  assert(demo.circuit.components.length === 3 && demo.circuit.nets.length === 3
    && demo.source.files[0].content.includes("Serial.write('1')"), 'optional Blink action did not create the validated three-part project');
  let demoState = await build(page);
  assert(demoState.buildState === 'succeeded', 'optional Blink project did not compile');
  await page.click('#run');
  try {
    await page.waitForFunction(() => document.querySelector('#component-layer [data-led-id="led-1"]')?.classList.contains('on'), null, { timeout: 5_000 });
  } catch {
    const failure = await page.evaluate(() => ({ runtime: window.__M6_STATE__.runtime, ledClass: document.querySelector('#component-layer [data-led-id="led-1"]')?.getAttribute('class') }));
    throw new Error(`optional Blink LED never became visibly on: ${JSON.stringify(failure)}`);
  }
  await page.waitForFunction(() => !document.querySelector('#component-layer [data-led-id="led-1"]')?.classList.contains('on'), null, { timeout: 5_000 });
  await page.click('#pause');
  demoState = await state(page, () => window.__M6_STATE__?.runtime?.kind === 'paused');
  const pausedCycle = demoState.runtime.cycle;
  await page.waitForTimeout(150);
  assert((await page.evaluate(() => window.__M6_STATE__.runtime.cycle)) === pausedCycle, 'Blink demo advanced while paused');
  await page.click('#reset');
  demoState = await state(page, () => window.__M6_STATE__?.runtime?.kind === 'reset');
  assert(demoState.runtime.cycle === 0 && demoState.runtime.circuit.leds[0].on === false, 'Blink demo reset did not clear machine and LED state');
  await page.click('#undo');
  project = await page.evaluate(() => window.__M6_PROJECT__());
  assert(project.circuit.components.length === 0 && project.source.files[0].content === '', 'undo did not restore the mandatory empty project after the optional demo');
  assert(await page.locator('.catalog-item').count() === 5, 'foundation catalog incomplete');
  assert(await page.locator('#catalog-category option').count() === 10, 'nine approved catalogue categories were not exposed');
  const benchmark = await page.evaluate(() => window.__M7_CATALOG_BENCHMARK__('start'));
  const cataloguePaintCaptureStarted = performance.now();
  const catalogueCapture = await page.locator('#catalog-list').screenshot({ animations: 'disabled' });
  const cataloguePaintCaptureMilliseconds = performance.now() - cataloguePaintCaptureStarted;
  assert(benchmark.records === 1000 && benchmark.matches === 1000 && benchmark.rendered === 80
    && benchmark.attached && benchmark.attachedLayout.width > 0 && benchmark.attachedLayout.height > 0
    && benchmark.initialAttachedWorkMilliseconds < 250 && catalogueCapture.length > 1_000 && cataloguePaintCaptureMilliseconds < 250,
  `attached large catalogue initial budget failed: ${JSON.stringify({ ...benchmark, cataloguePaintCaptureMilliseconds })}`);
  await page.waitForFunction(() => document.querySelectorAll('#catalog-list .catalog-thumbnail').length > 0);
  const firstWindow = await page.evaluate(() => {
    const list = document.querySelector('#catalog-list');
    list.scrollTop = list.scrollHeight;
    return {
      scrollTop: list.scrollTop, scrollHeight: list.scrollHeight, clientHeight: list.clientHeight,
      first: list.firstElementChild?.dataset.type, last: list.lastElementChild?.dataset.type,
    };
  });
  assert(firstWindow.scrollHeight > firstWindow.clientHeight && firstWindow.scrollTop > 0
    && firstWindow.first === 'benchmark.component-0-v1' && firstWindow.last === 'benchmark.component-79-v1',
  `attached catalogue did not scroll through its first bounded window: ${JSON.stringify(firstWindow)}`);
  await page.click('#catalog-next');
  let fixtureState = await page.evaluate(() => window.__M7_CATALOG__());
  assert(fixtureState.windowStart === 80 && fixtureState.visible === 80
    && fixtureState.visibleTypes[0] === 'benchmark.component-80-v1',
  `catalogue did not advance beyond the first 80 without an exact query: ${JSON.stringify(fixtureState)}`);
  for (let pageIndex = 2; pageIndex <= 12; pageIndex += 1) await page.click('#catalog-next');
  fixtureState = await page.evaluate(() => window.__M7_CATALOG__());
  assert(fixtureState.windowStart === 960 && fixtureState.visible === 40
    && fixtureState.visibleTypes.at(-1) === 'benchmark.component-999-v1' && await page.isDisabled('#catalog-next'),
  `catalogue final window was not reachable: ${JSON.stringify(fixtureState)}`);
  await page.fill('#catalog-search', 'Maker-group-7');
  const searchState = {
    rows: await page.locator('.catalog-item').count(), page: await page.textContent('#catalog-page'),
    catalog: await page.evaluate(() => window.__M7_CATALOG__()),
  };
  assert(searchState.rows === 50 && searchState.page.includes('1–50 of 50'),
    `attached 1,000-record fixture search did not use the real catalogue UI: ${JSON.stringify(searchState)}`);
  await page.fill('#catalog-search', 'benchmark');
  const benchmarkFinished = await page.evaluate(() => window.__M7_CATALOG_BENCHMARK__('stop'));
  assert(benchmarkFinished.records === 1000 && benchmarkFinished.attached
    && benchmarkFinished.maximumRenderMilliseconds < 100
    && benchmarkFinished.longTaskObserverSupported === benchmark.longTaskObserverSupported
    && (!benchmarkFinished.longTaskObserverSupported || benchmarkFinished.longTasks.length === 0)
    && benchmarkFinished.progressiveThumbnails > 0,
  `attached catalogue interaction budget failed: ${JSON.stringify(benchmarkFinished)}`);
  assert(await page.locator('.catalog-item').count() === 5, 'catalogue benchmark did not restore the real registry');

  for (const [query, count, label] of [
    ['LED', 1, 'name'], ['Intent Learning', 1, 'manufacturer'], ['RES-AXIAL-025W', 1, 'part number'],
    ['pushbutton', 1, 'alias'], ['voltage divider', 1, 'function'], ['3.4', 1, 'voltage'],
    ['four-terminal through-hole', 1, 'package'], ['Simulated', 5, 'support status'],
  ]) {
    await page.fill('#catalog-search', query);
    assert(await page.locator('.catalog-item').count() === count, `catalogue ${label} search mismatch`);
  }
  await page.fill('#catalog-search', '');
  await page.selectOption('#catalog-interface', 'analogue');
  assert(await page.locator('.catalog-item').count() === 2, 'catalogue interface filter mismatch');
  await page.selectOption('#catalog-interface', 'all');
  await page.selectOption('#catalog-category', 'inputs');
  assert(await page.locator('.catalog-item').count() === 2, 'catalog category did not isolate inputs');
  await page.selectOption('#catalog-category', 'all');

  await page.selectOption('#catalog-supply-voltage', '5');
  await page.selectOption('#catalog-pin-voltage', '5');
  assert(await page.locator('.catalog-item').count() === 1, 'separate supply and pin-limit filters did not isolate the 5 V controller');
  await page.selectOption('#catalog-category', 'inputs');
  await page.selectOption('#catalog-supply-voltage', '3.3');
  await page.selectOption('#catalog-pin-voltage', 'undeclared');
  assert(await page.locator('.catalog-item').count() === 2, 'combined actual catalogue voltage facets mismatch');
  await page.selectOption('#catalog-category', 'controllers');
  assert(await page.locator('.catalog-item').count() === 0, 'empty catalogue fixture unexpectedly matched');
  assert(await page.locator('#catalog-empty').isVisible(), 'empty catalogue guidance was not visible');
  assert((await page.textContent('#catalog-empty')).includes('broaden supply, pin-limit'), 'empty catalogue guidance was not actionable');
  await page.click('#catalog-clear');
  assert(await page.locator('.catalog-item').count() === 5, 'clear catalogue filters did not restore supported parts');
  assert(!(await page.locator('#catalog-empty').isVisible()), 'empty catalogue guidance remained after clearing filters');

  const projectBeforePreferences = JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__()));
  await page.locator('.catalog-item[data-type="led.basic-v1"] .catalog-favourite').click();
  assert((await page.evaluate(() => window.__M7_CATALOG__())).preferences.favorites.includes('led.basic-v1'), 'favourite was not recorded');
  assert(JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__())) === projectBeforePreferences, 'catalogue preference changed project identity');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__M7_READY__ === true);
  assert((await page.evaluate(() => window.__M7_CATALOG__())).preferences.favorites.includes('led.basic-v1'), 'favourite did not survive reload');
  await page.check('#catalog-favorites');
  assert(await page.locator('.catalog-item').count() === 1, 'favourites-only filter mismatch');
  await page.uncheck('#catalog-favorites');
  await page.evaluate(() => {
    window.__M7_ORIGINAL_SET_ITEM__ = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('catalogue quota', 'QuotaExceededError'); };
  });
  await page.locator('.catalog-item[data-type="led.basic-v1"] .catalog-favourite').click();
  assert((await page.textContent('#project-message')).includes('Catalogue preferences could not be saved'), 'preference quota failure was not reported');
  assert(JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__())) === projectBeforePreferences, 'preference quota failure changed project identity');
  await page.evaluate(() => { Storage.prototype.setItem = window.__M7_ORIGINAL_SET_ITEM__; delete window.__M7_ORIGINAL_SET_ITEM__; });
  await page.locator('.catalog-item[data-type="led.basic-v1"] .catalog-favourite').click();
  await page.evaluate(() => localStorage.setItem('intent-mcu.catalog-preferences.v1', '{invalid'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__M7_READY__ === true);
  assert((await page.evaluate(() => window.__M7_CATALOG__())).preferences.favorites.length === 0, 'invalid preferences were not rejected safely');
  assert(JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__())) === projectBeforePreferences, 'invalid preferences changed project identity');

  for (const type of [
    'board.atmega328p-16mhz-v1', 'resistor.fixed-v1', 'led.basic-v1', 'button.momentary-v1',
  ]) await page.click(`.catalog-item[data-type="${type}"]`);
  await page.locator('.catalog-item[data-type="potentiometer.linear-v1"]').dragTo(page.locator('#circuit-canvas'), { targetPosition: { x: 500, y: 470 } });
  await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.length === 5);
  project = await page.evaluate(() => window.__M6_PROJECT__());
  assert(new Set(project.circuit.components.map((component) => component.id)).size === 5, 'component IDs are not unique');
  assert(project.circuit.components.map((component) => component.id).join(',') === 'board-1,button-1,led-1,pot-1,resistor-1', 'stable IDs mismatch');
  assert((await page.evaluate(() => window.__M7_CATALOG__())).preferences.recent.length === 5, 'bounded recent-part history was not updated');
  await page.click('.catalog-item[data-type="board.atmega328p-16mhz-v1"]');
  assert((await page.evaluate(() => window.__M6_PROJECT__())).circuit.components.length === 5, 'second controller was not rejected atomically');

  const artwork = await page.evaluate(() => {
    const parts = [...document.querySelectorAll('.circuit-component')];
    const pinResults = parts.flatMap((part) => [...part.querySelectorAll('.pin-anchor')].map((anchor) => {
      const pin = anchor.dataset.endpoint.slice(anchor.dataset.endpoint.lastIndexOf('.') + 1);
      const terminal = part.querySelector(`[data-terminal-pin="${CSS.escape(pin)}"]`);
      const target = anchor.getBoundingClientRect();
      const visible = terminal?.getBoundingClientRect();
      return {
        endpoint: anchor.dataset.endpoint,
        hasTerminal: Boolean(terminal),
        centerError: visible ? Math.max(
          Math.abs(target.left + target.width / 2 - (visible.left + visible.width / 2)),
          Math.abs(target.top + target.height / 2 - (visible.top + visible.height / 2)),
        ) : 999,
        width: target.width,
        height: target.height,
        color: getComputedStyle(anchor).color,
      };
    }));
    return {
      parts: parts.length,
      originalSvg: parts.every((part) => part.querySelectorAll(':scope > svg.component-artwork').length === 1),
      noCards: parts.every((part) => !part.querySelector('h3,.component-type,.component-pins')
        && ['rgba(0, 0, 0, 0)', 'transparent'].includes(getComputedStyle(part).backgroundColor)
        && getComputedStyle(part).borderTopWidth === '0px'),
      buttonTerminals: [...document.querySelectorAll('[data-component-id="button-1"] [data-physical-terminal]')]
        .map((node) => node.getAttribute('data-physical-terminal')).sort(),
      pinResults,
    };
  });
  assert(artwork.parts === 5 && artwork.originalSvg && artwork.noCards, `placed artwork retained card UI: ${JSON.stringify(artwork)}`);
  assert(JSON.stringify(artwork.buttonTerminals) === JSON.stringify(['A1', 'A2', 'B1', 'B2']), 'four-terminal button artwork lost its internally common terminals');
  assert(artwork.pinResults.every((pin) => pin.hasTerminal && pin.centerError <= 0.51 && pin.width >= 24 && pin.height >= 24),
    `visible terminal/hit-target alignment failed: ${JSON.stringify(artwork.pinResults.filter((pin) => !pin.hasTerminal || pin.centerError > 0.51 || pin.width < 24 || pin.height < 24))}`);
  await page.locator('[data-component-id="board-1"]').click({ force: true });
  assert((await page.textContent('#selection-support')).includes('Simulated')
    && (await page.textContent('#selection-support')).includes('Tested ATmega328P subset'), 'honest support status/limitation was not visible');

  await connect(page, 'board-1.D13', 'resistor-1.A');
  await connect(page, 'resistor-1.B', 'led-1.ANODE');
  await connect(page, 'board-1.GND1', 'led-1.CATHODE');
  await connect(page, 'board-1.GND1', 'button-1.B');
  await connect(page, 'board-1.GND1', 'pot-1.LOW');
  await connect(page, 'board-1.D2', 'button-1.A');
  await connect(page, 'board-1.5V', 'pot-1.HIGH');
  await connect(page, 'board-1.A0', 'pot-1.WIPER');
  project = await page.evaluate(() => window.__M6_PROJECT__());
  assert(project.circuit.nets.length === 6 && project.circuit.junctions.length === 1, `manual wiring graph mismatch: ${JSON.stringify(project.circuit)}`);
  assert((await page.textContent('#circuit-diagnostics')).includes('accepted'), 'manual circuit failed validation');
  assert(!(await page.textContent('#wire-state')).includes('choose destination'), 'completed connection retained a pending-wire message');

  await page.selectOption('#selected-net', 'net-3');
  assert((await page.textContent('#net-members')).includes('pot-1.LOW'), 'whole-net inspection omitted a branch');
  const branchTarget = page.locator('.wire-segment-hit[data-net="net-3"][data-endpoint="pot-1.LOW"]').first();
  await branchTarget.focus();
  assert((await branchTarget.getAttribute('aria-label')).includes('Junction hubs remain fixed'), 'route target lacks the fixed-hub accessibility policy');
  await page.click('#delete-branch');
  project = await page.evaluate(() => window.__M6_PROJECT__());
  assert(project.circuit.nets.some((net) => net.id === 'net-3')
    && !project.circuit.nets.find((net) => net.id === 'net-3').endpoints.some((endpoint) => endpoint.component === 'pot-1' && endpoint.pin === 'LOW'),
  'branch delete removed the whole net or retained the selected endpoint');
  await page.click('#undo');
  await page.selectOption('#selected-net', 'net-3');
  const netCountBeforeWholeDelete = (await page.evaluate(() => window.__M6_PROJECT__())).circuit.nets.length;
  await page.click('#delete-wire');
  project = await page.evaluate(() => window.__M6_PROJECT__());
  assert(!project.circuit.nets.some((net) => net.id === 'net-3')
    && project.circuit.nets.length === netCountBeforeWholeDelete - 1,
  'whole-net delete did not remain distinct from branch deletion');
  await page.click('#undo');
  await page.selectOption('#selected-net', 'net-3');
  await page.click('#remove-junction');
  project = await page.evaluate(() => window.__M6_PROJECT__());
  assert(project.circuit.junctions.length === 0 && !JSON.stringify(project.circuit).includes('pot-1","pin":"LOW'), 'junction removal did not detach the named branch');
  await connect(page, 'board-1.GND1', 'pot-1.LOW');
  assert((await page.evaluate(() => window.__M6_PROJECT__())).circuit.junctions.length === 1, 'explicit junction was not restored');
  const defaultRouteCollisions = await automaticRouteIntersections(page);
  assert(defaultRouteCollisions.length === 0, `automatic orthogonal routes crossed component bodies: ${JSON.stringify(defaultRouteCollisions)}`);

  const circuitBeforeWireLayout = JSON.stringify((await page.evaluate(() => window.__M6_PROJECT__())).circuit);
  await page.selectOption('#selected-net', 'net-1');
  await page.selectOption('#wire-color', '#5f8cff');
  await page.locator('.wire-segment-hit[data-net="net-1"]').first().focus();
  await page.click('#add-bend');
  await page.selectOption('#selected-net', 'net-4');
  await page.locator('.wire-segment-hit[data-net="net-4"]').first().focus();
  await page.click('#add-bend');
  project = await page.evaluate(() => window.__M6_PROJECT__());
  assert(Object.keys(project.layout.wireRoutes).length === 2 && project.circuit.nets.length === 6, 'wire routes changed electrical connectivity');
  assert(project.layout.wireStyles['net-1'].color === '#5f8cff'
    && project.layout.wireRoutes['net-1'].schema === 'intent-mcu-route@1'
    && project.layout.wireRoutes['net-1'].branches.every((branch) => branch.points.length >= 1),
  'wire colour or editable bend did not persist');
  assert(JSON.stringify(project.circuit) === circuitBeforeWireLayout, 'wire route/style changed electrical graph identity');
  assert(await page.locator('path.circuit-wire[data-net="net-1"]').first().evaluate((path) => path.style.getPropertyValue('--wire-color')) === '#5f8cff', 'wire colour did not reach the renderer');
  await page.click('#fit-project');
  const fit = (await page.evaluate(() => window.__M6_PROJECT__())).layout.viewport;
  assert(fit.zoom >= 0.5 && fit.zoom <= 2 && Math.abs(fit.panX) <= 1 && Math.abs(fit.panY) <= 1, 'fit-project produced an invalid viewport');

  await page.locator('[data-component-id="led-1"]').click({ force: true });
  const graphBeforeLayout = JSON.stringify((await page.evaluate(() => window.__M6_PROJECT__())).circuit);
  await page.click('#rotate-component');
  const ledCard = page.locator('[data-component-id="led-1"]');
  const box = await ledCard.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 24, box.y + box.height / 2 + 38, { steps: 4 });
  await page.mouse.up();
  await ledCard.focus();
  await page.keyboard.press('ArrowRight');
  project = await page.evaluate(() => window.__M6_PROJECT__());
  assert(project.layout.positions['led-1'].rotation === 90, 'rotation was not persisted');
  assert(JSON.stringify(project.circuit) === graphBeforeLayout, 'layout edit changed electrical identity');
  let metrics = await wireMetrics(page);
  assert(metrics.paths === 14 && metrics.maximumEndpointError <= 0.51, `moved wire anchor mismatch: ${JSON.stringify(metrics)}`);
  for (const rotation of [180, 270, 0, 90]) {
    await page.click('#rotate-component');
    assert((await page.evaluate(() => window.__M6_PROJECT__())).layout.positions['led-1'].rotation === rotation, `rotation ${rotation} was not persisted`);
    metrics = await wireMetrics(page);
    assert(metrics.maximumEndpointError <= 0.51, `rotation ${rotation} detached a named pin: ${JSON.stringify(metrics)}`);
  }
  await page.click('#zoom-in');
  await page.click('#pan-right');
  await page.click('#pan-down');
  metrics = await wireMetrics(page);
  assert(metrics.maximumEndpointError <= 0.51, `zoom/pan detached a named pin: ${JSON.stringify(metrics)}`);
  assert(JSON.stringify((await page.evaluate(() => window.__M6_PROJECT__())).circuit) === graphBeforeLayout, 'view transforms changed electrical identity');
  assert((await page.evaluate(() => window.__M6_PROJECT__())).layout.wireRoutes['net-1'].schema === 'intent-mcu-route@1', 'component/view interaction unexpectedly rewrote a wire route');

  await page.click('#duplicate-component');
  assert((await page.evaluate(() => window.__M6_PROJECT__())).circuit.components.some((component) => component.id === 'led-2'), 'duplicate did not allocate a fresh ID');
  await page.click('#undo');
  assert((await page.evaluate(() => window.__M6_PROJECT__())).circuit.components.length === 5, 'undo did not remove duplicate');
  await page.click('#redo');
  await page.locator('[data-component-id="led-2"]').click({ force: true });
  await page.click('#delete-component');
  assert((await page.evaluate(() => window.__M6_PROJECT__())).circuit.components.length === 5, 'delete did not remove duplicate');

  await page.fill('#source-file-name', 'threshold.h');
  await page.click('#source-file-add');
  assert(await page.inputValue('#source-file') === 'threshold.h', 'multi-file editor did not open added file');
  await page.fill('#source', '#pragma once\nconst int THRESHOLD = 700;\n');
  const controlSource = `#include "threshold.h"
void setup() {
  pinMode(13, OUTPUT);
  pinMode(2, INPUT_PULLUP);
}
void loop() {
  int sensor = analogRead(A0);
  bool active = digitalRead(2) == LOW || sensor > THRESHOLD;
  digitalWrite(13, active ? HIGH : LOW);
  delay(5);
}`;
  await setMainSource(page, controlSource);
  let current = await build(page);
  assert(current.buildState === 'succeeded', 'manual multi-file project did not compile');
  assert((await page.evaluate(() => window.__M6_PROJECT__())).source.files.length === 2, 'build discarded local source file');
  await page.selectOption('#speed', 'maximum');
  await page.click('#run');
  await state(page, () => window.__M6_STATE__?.runtime?.cycle > 100_000);
  let circuit = (await page.evaluate(() => structuredClone(window.__M6_STATE__.runtime.circuit)));
  assert(circuit.leds.length === 1 && !circuit.leds[0].on, 'released manual circuit did not start dark');
  await page.click('[data-control="button-1.pressed"]');
  circuit = (await state(page, () => window.__M6_STATE__?.runtime?.circuit?.leds?.[0]?.on)).runtime.circuit;
  assert(circuit.leds[0].currentAmps > 0 && circuit.leds[0].brightness > 0, 'button did not drive the compiled LED path');
  await page.click('[data-control="button-1.pressed"]');
  await state(page, () => window.__M6_STATE__?.runtime?.circuit?.leds?.[0]?.on === false);
  await page.locator('[data-control="pot-1.position"]').evaluate((input) => { input.value = '90'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  circuit = (await state(page, () => window.__M6_STATE__?.runtime?.circuit?.leds?.[0]?.on)).runtime.circuit;
  assert(circuit.analogue[0].voltage === 4.5, 'potentiometer did not feed the current worker');
  await page.locator('[data-control="pot-1.position"]').evaluate((input) => { input.value = '50'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('#pause');
  await state(page, () => window.__M6_STATE__?.runtime?.kind === 'paused');

  await page.locator('.wire-segment-hit[data-net="net-4"][data-endpoint="board-1.D2"]').first().focus();
  await page.click('#reconnect-mode');
  await page.locator('.pin-anchor[data-endpoint="board-1.D4"]').click({ force: true });
  await page.locator('.wire-segment-hit[data-net="net-6"][data-endpoint="board-1.A0"]').first().focus();
  await page.click('#reconnect-mode');
  await page.locator('.pin-anchor[data-endpoint="board-1.A1"]').click({ force: true });
  const arbitraryPinSource = `void setup() {
  pinMode(13, OUTPUT);
  pinMode(4, INPUT_PULLUP);
}
void loop() {
  int sensor = analogRead(A1);
  bool pressed = digitalRead(4) == LOW;
  digitalWrite(13, pressed || sensor > 700 ? HIGH : LOW);
  delay(2);
}`;
  await setMainSource(page, arbitraryPinSource);
  current = await build(page);
  assert(current.buildState === 'succeeded', 'D4/A1 project did not compile');
  await page.selectOption('#speed', 'maximum');
  await page.click('#run');
  const setPotAndRead = async (position, expected) => {
    await page.locator('[data-control="pot-1.position"]').evaluate((input, next) => { input.value = String(next); input.dispatchEvent(new Event('input', { bubbles: true })); }, position);
    await page.waitForFunction((target) => window.__M6_STATE__?.runtime?.pins
      ?.some((pin) => pin.pin === 'A1' && pin.adc === target), expected, { timeout: 10_000 });
    return page.evaluate(() => structuredClone(window.__M6_STATE__));
  };
  current = await setPotAndRead(0, 0);
  assert(current.runtime.pins.find((pin) => pin.pin === 'D4').level === true && !current.runtime.circuit.leds[0].on, 'released D4 pull-up was not HIGH/dark');
  current = await setPotAndRead(50, 512);
  assert(!current.runtime.circuit.leds[0].on, 'A1 midpoint crossed the 700 threshold');
  current = await setPotAndRead(100, 1023);
  assert(current.runtime.circuit.leds[0].on, 'A1 full scale did not drive compiled firmware output');
  await setPotAndRead(0, 0);
  await page.click('[data-control="button-1.pressed"]');
  current = await state(page, () => window.__M6_STATE__?.runtime?.pins?.find((pin) => pin.pin === 'D4')?.level === false
    && window.__M6_STATE__?.runtime?.circuit?.leds?.[0]?.on === true);
  assert(current.runtime.pins.find((pin) => pin.pin === 'D4').level === false, 'pressed D4 input did not reach firmware');
  await page.click('[data-control="button-1.pressed"]');
  await state(page, () => window.__M6_STATE__?.runtime?.pins?.find((pin) => pin.pin === 'D4')?.level === true
    && window.__M6_STATE__?.runtime?.circuit?.leds?.[0]?.on === false);
  await page.click('#pause');
  await state(page, () => window.__M6_STATE__?.runtime?.kind === 'paused');
  await page.locator('.wire-segment-hit[data-net="net-4"][data-endpoint="board-1.D4"]').first().focus();
  await page.click('#reconnect-mode');
  await page.locator('.pin-anchor[data-endpoint="board-1.D2"]').click({ force: true });
  await page.locator('.wire-segment-hit[data-net="net-6"][data-endpoint="board-1.A1"]').first().focus();
  await page.click('#reconnect-mode');
  await page.locator('.pin-anchor[data-endpoint="board-1.A0"]').click({ force: true });
  await setMainSource(page, controlSource);
  current = await build(page);
  assert(current.buildState === 'succeeded', 'restored D2/A0 project did not compile');
  await page.selectOption('#speed', 'maximum');
  await page.click('#run');
  await state(page, () => window.__M6_STATE__?.runtime?.cycle > 100_000);
  await page.click('#pause');
  await state(page, () => window.__M6_STATE__?.runtime?.kind === 'paused');
  const artifactBeforeVisualRoute = (await page.evaluate(() => window.__M6_PROJECT__())).build.artifactIdentity;
  await page.locator('.wire-segment-hit[data-net="net-1"]').first().focus();
  await page.keyboard.press('ArrowDown');
  const visualRouteState = await page.evaluate(() => ({
    project: window.__M6_PROJECT__(), lifecycle: window.__M11_STATE__.lifecycle,
  }));
  assert(visualRouteState.project.build.status === 'succeeded'
    && visualRouteState.project.build.artifactIdentity === artifactBeforeVisualRoute
    && visualRouteState.lifecycle.phase === 'paused',
  'keyboard route edit unnecessarily invalidated or stopped the matching artifact');

  await page.locator('.wire-segment-hit[data-net="net-1"][data-endpoint="board-1.D13"]').first().focus();
  await page.click('#reconnect-mode');
  await page.locator('.pin-anchor[data-endpoint="board-1.D12"]').click({ force: true });
  const d12Source = controlSource.replaceAll('13', '12');
  await setMainSource(page, d12Source);
  assert(await page.isDisabled('#run'), 'topology/source edit left stale artifact runnable');
  current = await build(page);
  assert(current.buildState === 'succeeded', 'reassigned D12 project did not compile');
  await page.selectOption('#speed', 'maximum');
  await page.click('#run');
  await state(page, () => window.__M6_STATE__?.runtime?.cycle > 100_000);
  await page.click('[data-control="button-1.pressed"]');
  await state(page, () => window.__M6_STATE__?.runtime?.circuit?.leds?.[0]?.on === true);
  await page.click('[data-control="button-1.pressed"]');
  await page.click('#pause');
  await state(page, () => window.__M6_STATE__?.runtime?.kind === 'paused');
  assert((await page.evaluate(() => window.__M6_PROJECT__())).circuit.nets.find((net) => net.id === 'net-1').endpoints.some((endpoint) => endpoint.pin === 'D12'), 'worker journey used a fixed D13 graph');

  await page.locator('.wire-segment-hit[data-net="net-1"][data-endpoint="board-1.D12"]').first().focus();
  await page.click('#reconnect-mode');
  await page.locator('.pin-anchor[data-endpoint="board-1.D13"]').click({ force: true });
  const instrumentSource = `void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
  Serial.write('R');
}
void loop() {
  digitalWrite(13, HIGH); delay(5);
  digitalWrite(13, LOW); delay(5);
  if (Serial.available()) Serial.write(Serial.read());
}`;
  await setMainSource(page, instrumentSource);
  current = await build(page);
  assert(current.buildState === 'succeeded', 'instrument firmware did not compile');
  await page.locator('[data-control="pot-1.position"]').evaluate((input) => { input.value = '80'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.selectOption('#speed', 'maximum');
  await page.click('#run');
  current = await state(page, () => window.__M6_STATE__?.runtime?.instruments?.serial?.text?.includes('R')
    && window.__M6_STATE__?.runtime?.instruments?.logic?.transitions?.length >= 4);
  await page.fill('#serial-input', 'Z');
  await page.click('#serial-send');
  current = await state(page, () => window.__M6_STATE__?.runtime?.instruments?.serial?.text?.includes('Z'));
  await page.click('#pause');
  current = await state(page, () => window.__M6_STATE__?.runtime?.kind === 'paused');
  const instruments = current.runtime.instruments;
  assert(current.runtime.eventLog.log.length === 2 && current.runtime.eventLog.log[0].type === 'control'
    && current.runtime.eventLog.log[1].type === 'uart-rx', 'ordered input provenance mismatch');
  assert(instruments.serial.records.some((entry) => entry.direction === 'tx' && entry.value === 90), 'USART echo provenance missing');
  assert(instruments.logic.transitions.every((entry) => ['D13', 'D2'].includes(entry.pin)), 'logic analyser emitted an unselected pin');
  assert(instruments.pin.pin === 'D13' && instruments.pin.mode === 'OUTPUT', 'pin inspector diverged from worker state');
  const serialMachine = JSON.stringify(current.runtime.serial);
  await page.click('#serial-clear');
  current = await state(page, () => window.__M6_STATE__?.runtime?.kind === 'serial-clear');
  assert(current.runtime.instruments.serial.records.length === 0 && JSON.stringify(current.runtime.serial) === serialMachine, 'console clear changed MCU state');

  await page.click('#project-save');
  const beforeReopen = await page.evaluate(() => window.__M6_PROJECT__());
  const preferencesBeforeReopen = await page.evaluate(() => window.__M7_CATALOG__().preferences);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__M6_READY__ === true);
  const reopened = await page.evaluate(() => window.__M6_PROJECT__());
  const expectedReopen = structuredClone(beforeReopen);
  expectedReopen.build = { status: 'dirty', inputIdentity: null, artifactIdentity: null };
  assert(JSON.stringify(reopened) === JSON.stringify(expectedReopen), 'validated local reopen changed anything beyond clearing obsolete artifact identity');
  assert(reopened.layout.wireStyles['net-1'].color === '#5f8cff'
    && reopened.layout.wireRoutes['net-1'].schema === 'intent-mcu-route@1',
  'project reopen lost wire colour or bend geometry');
  assert(JSON.stringify(await page.evaluate(() => window.__M7_CATALOG__().preferences)) === JSON.stringify(preferencesBeforeReopen), 'catalogue preferences did not survive independently of project state');
  assert(await page.isDisabled('#run'), 'reopen treated metadata as a loaded artifact');

  const canonical = JSON.stringify(reopened);
  const invalid = await page.evaluate(() => window.__M6_IMPORT__('{"schema":', 'replace'));
  assert(!invalid.ok && invalid.atomic && JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__())) === canonical, 'malformed import partially mutated state');
  await page.selectOption('#project-import-mode', 'replace');
  await page.setInputFiles('#project-import', { name: 'intent-project.json', mimeType: 'application/json', buffer: Buffer.from(canonical) });
  await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('Project replaced safely'));
  assert(JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__())) === canonical, 'explicit project replace changed canonical data');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#project-export')]);
  assert(download.suggestedFilename() === 'intent-mcu-project.json', 'canonical export filename mismatch');

  const legacy = {
    schema: 'teach-lab-project@1',
    selected: ['controller-1', 'resistor-1', 'led-1', 'button-1'],
    positions: {
      'controller-1': { x: 0.15, y: 0.5 }, 'resistor-1': { x: 0.42, y: 0.25 },
      'led-1': { x: 0.7, y: 0.25 }, 'button-1': { x: 0.7, y: 0.7 },
    },
    netlist: {
      schema: 'teach-lab-netlist@1',
      components: [
        { id: 'controller-1', type: 'controller.generic-avr-v1', properties: {} },
        { id: 'resistor-1', type: 'resistor.v1', properties: { ohms: 220 } },
        { id: 'led-1', type: 'led.v1', properties: {} },
        { id: 'button-1', type: 'button.momentary.v1', properties: {} },
      ],
      wires: [
        { from: 'controller-1.D13', to: 'resistor-1.A' }, { from: 'resistor-1.B', to: 'led-1.ANODE' },
        { from: 'led-1.CATHODE', to: 'controller-1.GND1' }, { from: 'controller-1.D2', to: 'button-1.A' },
        { from: 'button-1.B', to: 'controller-1.GND2' },
      ],
      firmwarePins: { led: 'D13', button: 'D2', buttonMode: 'INPUT_PULLUP' },
    },
  };
  await page.selectOption('#project-import-mode', 'migrate-v1');
  await page.setInputFiles('#project-import', { name: 'legacy-project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
  await page.waitForFunction(() => document.querySelector('#project-message').textContent.includes('Older project migrated'));
  const migrated = await page.evaluate(() => ({ project: window.__M6_PROJECT__(), legacyKey: localStorage.getItem('teach-lab.project.v1') }));
  assert(migrated.project.source.files[0].content === '' && migrated.project.build.status === 'dirty'
    && migrated.project.circuit.components.length === 4 && migrated.legacyKey === null, 'explicit v1 migration boundary mismatch');
  await page.click('#undo');
  assert(JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__())) === canonical, 'v1 migration was not one undoable replacement');

  await page.locator('#prompt-drawer').evaluate((drawer) => { drawer.open = true; });
  await page.click('#prompt-generate');
  const prompt = await page.inputValue('#prompt-output');
  assert(prompt.includes('teach-lab-circuit@2') && prompt.includes('64 components') && prompt.includes('board.atmega328p-16mhz-v1'), 'portable prompt omitted schema/catalog/limits');
  assert(!/https?:|```|firmware binary/i.test(prompt), 'portable prompt requested a privileged field');
  const sourceBeforePrompt = JSON.stringify((await page.evaluate(() => window.__M6_PROJECT__())).source);
  const circuitBeforePrompt = (await page.evaluate(() => window.__M6_PROJECT__())).circuit;
  await page.fill('#prompt-response', JSON.stringify(circuitBeforePrompt));
  await page.click('#prompt-apply');
  project = await page.evaluate(() => window.__M6_PROJECT__());
  assert(JSON.stringify(project.source) === sourceBeforePrompt && JSON.stringify(project.circuit) === JSON.stringify(circuitBeforePrompt), 'Prompt Bridge crossed the circuit-only boundary');
  const beforeRejectedPrompt = JSON.stringify(project);
  await page.fill('#prompt-response', `${JSON.stringify(circuitBeforePrompt)}\ntrailing prose`);
  await page.click('#prompt-apply');
  assert(JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__())) === beforeRejectedPrompt, 'rejected prompt changed project/history');
  await page.locator('[data-component-id="resistor-1"]').click({ force: true });
  await page.click('#rotate-component');
  assert((await page.evaluate(() => window.__M6_PROJECT__())).layout.positions['resistor-1'].rotation === 90, 'accepted proposal was not manually editable');

  await page.evaluate(() => {
    window.__M6_ORIGINAL_SET_ITEM__ = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('simulated quota', 'QuotaExceededError'); };
  });
  const beforeQuota = JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__()));
  await page.click('#project-save');
  assert((await page.textContent('#project-message')).includes('in-memory project remains usable'), 'quota error was not reported');
  assert(JSON.stringify(await page.evaluate(() => window.__M6_PROJECT__())) === beforeQuota, 'quota failure corrupted in-memory project');
  await page.evaluate(() => { Storage.prototype.setItem = window.__M6_ORIGINAL_SET_ITEM__; delete window.__M6_ORIGINAL_SET_ITEM__; });

  const widths = [];
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    const dimensions = await page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        cookies: document.cookie,
      };
    });
    metrics = await wireMetrics(page);
    assert(dimensions.scrollWidth <= dimensions.width + 1, `${width}: horizontal overflow`);
    assert(!dimensions.cookies, `${width}: unexpected cookie`);
    assert(metrics.paths === 14 && metrics.maximumEndpointError <= 0.51, `${width}: wire attachment mismatch ${JSON.stringify(metrics)}`);
    widths.push({ width, ...metrics });
  }

  const accessibility = await page.evaluate(async () => ({
    unlabeledInputs: [...document.querySelectorAll('input,select,textarea')].filter((node) => !node.labels?.length && !node.getAttribute('aria-label')).map((node) => node.id),
    tabStops: [...document.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter((node) => !node.disabled).length,
    serviceWorkers: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
  }));
  assert(accessibility.unlabeledInputs.length === 0 && accessibility.tabStops > 30, `accessibility labels/tab stops mismatch: ${JSON.stringify(accessibility)}`);
  assert(accessibility.serviceWorkers === 0, 'unexpected service worker');
  assert(outside.length === 0, `third-party requests: ${outside.join(', ')}`);
  assert(websockets.length === 0, `unexpected WebSocket: ${websockets.join(', ')}`);
  assert(errors.length === 0, `page errors: ${errors.join(', ')}`);

  await page.click('#project-new');
  const cleared = await page.evaluate(() => ({
    lifecycle: window.__M11_STATE__.lifecycle,
    cycle: document.querySelector('#cycle').textContent,
    instructions: document.querySelector('#instructions').textContent,
    artifact: document.querySelector('#artifact').textContent,
    serial: document.querySelector('#serial-output').textContent,
    selected: document.querySelector('#selection-name').textContent,
    title: document.querySelector('#canvas-title').textContent,
  }));
  assert(cleared.lifecycle.phase === 'empty' && cleared.lifecycle.artifact === null
    && cleared.cycle === '0' && cleared.instructions === '0' && cleared.artifact === 'none'
    && cleared.serial === 'No firmware bytes.' && cleared.selected === 'Nothing selected'
    && cleared.title === 'Untitled project circuit',
  `new project retained obsolete state: ${JSON.stringify(cleared)}`);

  await context.close();
  await browser.close();
  process.stdout.write(`${JSON.stringify({
    status: 'pass', browser: browserName, components: 5, nets: 6, endpoints: 14,
    multiFile: true, nonFixturePin: 'D12', serialRecords: instruments.serial.records.length,
    logicTransitions: instruments.logic.transitions.length, promptBridge: 'circuit-only',
    catalogBenchmark: {
      ...benchmarkFinished,
      initialAttachedWorkMilliseconds: benchmark.initialAttachedWorkMilliseconds,
      cataloguePaintCaptureMilliseconds,
    },
  })}\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
