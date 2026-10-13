// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fs = require('fs');
const path = require('path');

const moduleRoot = process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules';
const { chromium, firefox, webkit } = require(path.join(moduleRoot, 'playwright'));
const browserName = process.env.M6_BROWSER || 'chromium';
const browserType = { chromium, firefox, webkit }[browserName];
const base = process.env.M3_STAGING_URL || 'http://127.0.0.1:18766';
const expectation = process.env.RECEIPT14_TERMINAL_EXPECT || 'visible';
const screenshotDirectory = process.env.RECEIPT14_TERMINAL_SCREENSHOT_DIR || null;
const fixtureOut = process.env.RECEIPT14_TERMINAL_FIXTURE_OUT || null;
const fixtureIn = process.env.RECEIPT14_TERMINAL_FIXTURE_IN || null;
const label = process.env.RECEIPT14_TERMINAL_LABEL || 'candidate';

function assert(condition, message) { if (!condition) throw new Error(message); }
const canonical = (value) => JSON.stringify(value);
const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);
const pointToRectDistance = (point, rect) => Math.hypot(
  Math.max(rect.left - point.x, 0, point.x - rect.right),
  Math.max(rect.top - point.y, 0, point.y - rect.bottom),
);

async function project(page) { return page.evaluate(() => window.__M6_PROJECT__()); }

async function readDownload(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function openBlink(page) {
  await page.click('#project-new');
  await page.selectOption('#example-select', 'blink');
  await page.click('#project-demo');
  await page.waitForFunction(() => window.__M6_PROJECT__().circuit.nets.some((net) =>
    net.endpoints.some((endpoint) => endpoint.component === 'board-1' && endpoint.pin === 'GND1')));
}

async function importFixture(page, source) {
  await page.setInputFiles('#project-import', {
    name: 'rc2-blink-visible-terminal-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(source),
  });
  await page.waitForFunction(() => window.__M6_PROJECT__().circuit.nets.some((net) =>
    net.endpoints.some((endpoint) => endpoint.component === 'board-1' && endpoint.pin === 'GND1')));
}

async function captureFixture(page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#project-export'),
  ]);
  return readDownload(download);
}

async function attachment(page, endpoint) {
  return page.evaluate((endpointName) => {
    const point = (x, y, matrix) => new DOMPoint(Number(x), Number(y)).matrixTransform(matrix);
    const centre = (box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    const [componentId, pinId] = endpointName.split('.');
    const card = document.querySelector(`[data-component-id="${componentId}"]`);
    const anchor = card?.querySelector(`.pin-anchor[data-endpoint="${endpointName}"]`);
    const terminal = card?.querySelector(`[data-terminal-pin="${pinId}"]`);
    const route = document.querySelector(`.circuit-wire[data-endpoint="${endpointName}"]`);
    if (!card || !anchor || !terminal || !route) throw new Error(`missing rendered endpoint ${endpointName}`);
    const routePoints = [...route.getAttribute('d').matchAll(/[ML]\s+(-?[\d.]+)\s+(-?[\d.]+)/gu)]
      .map((match) => point(match[1], match[2], route.getScreenCTM()));
    const anchorCentre = centre(anchor.getBoundingClientRect());
    const terminalCentre = centre(terminal.getBoundingClientRect());
    const sample = {
      x: routePoints[0].x + (routePoints[1].x - routePoints[0].x) * 0.05,
      y: routePoints[0].y + (routePoints[1].y - routePoints[0].y) * 0.05,
    };
    const pcb = card.querySelector('.board-pcb');
    const pcbLocal = pcb && new DOMPoint(sample.x, sample.y).matrixTransform(pcb.getScreenCTM().inverse());
    const sampleInsidePcb = Boolean(pcb && pcb.isPointInFill(pcbLocal));
    const stub = card.querySelector(`.terminal-wire-stub[data-endpoint="${endpointName}"]`);
    const stubLayer = stub?.closest('.component-terminal-wires') ?? null;
    const overlayPath = card.querySelector(`.component-wire-overlay-path[data-endpoint="${endpointName}"]:not(.proposal)`);
    let stubStart = null; let stubEnd = null;
    if (stub) {
      const matrix = stub.getScreenCTM();
      stubStart = point(stub.getAttribute('x1'), stub.getAttribute('y1'), matrix);
      stubEnd = point(stub.getAttribute('x2'), stub.getAttribute('y2'), matrix);
    }
    let overlayStart = null;
    if (overlayPath) {
      const local = overlayPath.getPointAtLength(0);
      const transformed = new DOMPoint(local.x, local.y).matrixTransform(overlayPath.getScreenCTM());
      overlayStart = { x: transformed.x, y: transformed.y };
    }
    return {
      endpoint: endpointName,
      routeStart: { x: routePoints[0].x, y: routePoints[0].y },
      routeEscape: { x: routePoints[1].x, y: routePoints[1].y },
      anchorCentre,
      terminalCentre: { x: terminalCentre.x, y: terminalCentre.y },
      sampleInsidePcb,
      routeLayerZ: Number.parseInt(getComputedStyle(document.querySelector('#circuit-wires')).zIndex, 10),
      componentLayerZ: Number.parseInt(getComputedStyle(document.querySelector('#component-layer')).zIndex, 10),
      stubStart: stubStart && { x: stubStart.x, y: stubStart.y },
      stubEnd: stubEnd && { x: stubEnd.x, y: stubEnd.y },
      stubBox: stub?.getBoundingClientRect().toJSON() ?? null,
      overlayStart,
      overlayPresent: Boolean(overlayPath),
      stubLayerZ: stubLayer ? Number.parseInt(getComputedStyle(stubLayer).zIndex, 10) : null,
      stubLayerPointerEvents: stubLayer ? getComputedStyle(stubLayer).pointerEvents : null,
      stubLayerOverflow: stubLayer ? getComputedStyle(stubLayer).overflow : null,
      pinLayerZ: Number.parseInt(getComputedStyle(anchor).zIndex, 10),
      stubAfterArtwork: Boolean(stubLayer && (card.querySelector('.component-artwork').compareDocumentPosition(stubLayer)
        & Node.DOCUMENT_POSITION_FOLLOWING)),
      graphEndpoint: window.__M6_PROJECT__().circuit.nets.some((net) => net.endpoints.some((item) =>
        `${item.component}.${item.pin}` === endpointName)),
      routeViewBox: route.ownerSVGElement.getAttribute('viewBox'),
      routeSvgBox: route.ownerSVGElement.getBoundingClientRect().toJSON(),
      canvasBox: document.querySelector('#circuit-canvas').getBoundingClientRect().toJSON(),
      cardBox: card.getBoundingClientRect().toJSON(),
      anchorBox: anchor.getBoundingClientRect().toJSON(),
    };
  }, endpoint);
}

function assertCommon(measurement) {
  assert(measurement.graphEndpoint, `${measurement.endpoint} is absent from canonical graph`);
  assert(distance(measurement.routeStart, measurement.anchorCentre) <= 0.51,
    `${measurement.endpoint} route is ${distance(measurement.routeStart, measurement.anchorCentre)} px from named anchor`);
  assert(distance(measurement.routeStart, measurement.terminalCentre) <= 0.51,
    `${measurement.endpoint} route is ${distance(measurement.routeStart, measurement.terminalCentre)} px from visible terminal`);
}

function assertVisible(measurement) {
  assertCommon(measurement);
  assert(measurement.stubBox && measurement.overlayPresent, `${measurement.endpoint} has no visible terminal/full-route paint`);
  assert(pointToRectDistance(measurement.anchorCentre, measurement.stubBox) <= 0.51
      && pointToRectDistance(measurement.terminalCentre, measurement.stubBox) <= 0.51,
  `${measurement.endpoint} visible lead paint does not cover the named physical terminal`);
  assert(Math.max(measurement.stubBox.width, measurement.stubBox.height) >= 10,
    `${measurement.endpoint} visible terminal lead is too short`);
  assert(measurement.stubAfterArtwork && measurement.stubLayerZ > 0 && measurement.stubLayerZ < measurement.pinLayerZ,
    `${measurement.endpoint} terminal lead paint order is not artwork < lead < pin overlay`);
  assert(measurement.stubLayerPointerEvents === 'none' && measurement.stubLayerOverflow === 'hidden',
    `${measurement.endpoint} visibility overlay can block controls or escape its component clip`);
}

async function visibilityInventory(page) {
  return page.evaluate(() => {
    const accepted = document.querySelectorAll('#circuit-wires .circuit-wire').length;
    const proposed = document.querySelectorAll('#circuit-wires .wire-drag-proposal').length;
    const cards = [...document.querySelectorAll('.circuit-component')];
    const layers = cards.map((card) => {
      const layer = card.querySelector('.component-terminal-wires');
      return {
        componentId: card.dataset.componentId,
        accepted: layer?.querySelectorAll('.component-wire-overlay-path:not(.proposal)').length ?? -1,
        proposed: layer?.querySelectorAll('.component-wire-overlay-path.proposal').length ?? -1,
        pointerEvents: layer ? getComputedStyle(layer).pointerEvents : null,
        artworkZ: Number.parseInt(getComputedStyle(card.querySelector('.component-artwork')).zIndex, 10),
        layerZ: layer ? Number.parseInt(getComputedStyle(layer).zIndex, 10) : null,
        pinZ: Number.parseInt(getComputedStyle(card.querySelector('.pin-anchor')).zIndex, 10),
      };
    });
    return { accepted, proposed, layers };
  });
}

function assertVisibilityInventory(inventory, { proposal = false } = {}) {
  assert(inventory.accepted > 0 && inventory.layers.length > 0, 'visibility inventory is empty');
  for (const layer of inventory.layers) {
    assert(layer.accepted === inventory.accepted,
      `${layer.componentId} exposes ${layer.accepted}/${inventory.accepted} accepted route paints`);
    assert(layer.pointerEvents === 'none' && layer.artworkZ < layer.layerZ && layer.layerZ < layer.pinZ,
      `${layer.componentId} paint order/input priority is invalid`);
    if (proposal) assert(layer.proposed === inventory.proposed && inventory.proposed > 0,
      `${layer.componentId} exposes ${layer.proposed}/${inventory.proposed} proposal route paints`);
  }
}

async function defaultBodyCrossings(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('.circuit-component')].map((card) => ({
      id: card.dataset.componentId, box: card.getBoundingClientRect(),
    }));
    const inside = (point, box) => point.x > box.left + 1 && point.x < box.right - 1
      && point.y > box.top + 1 && point.y < box.bottom - 1;
    const crossings = [];
    for (const route of document.querySelectorAll('.circuit-wire')) {
      const own = route.dataset.endpoint.split('.')[0];
      const length = route.getTotalLength();
      for (const card of cards) {
        let leftOwnBody = false; let reentered = false; let unrelated = false;
        for (let offset = 0; offset <= length; offset += 2) {
          const local = route.getPointAtLength(Math.min(offset, length));
          const screen = new DOMPoint(local.x, local.y).matrixTransform(route.getScreenCTM());
          const contained = inside(screen, card.box);
          if (card.id === own) {
            if (!contained) leftOwnBody = true;
            else if (leftOwnBody) reentered = true;
          } else if (contained) unrelated = true;
        }
        if (reentered || unrelated) crossings.push({ endpoint: route.dataset.endpoint, component: card.id, reentered, unrelated });
      }
    }
    return crossings;
  });
}

async function exposedRouteTarget(page, endpoint) {
  const selector = `.wire-segment-hit[data-endpoint="${endpoint}"]`;
  const candidates = page.locator(selector);
  await candidates.first().waitFor({ state: 'attached' });
  let target = null;
  for (let attempt = 0; attempt < 6 && !target; attempt += 1) {
    target = await candidates.evaluateAll((nodes) => {
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        for (const fraction of [0.25, 0.5, 0.75]) {
          const local = node.getPointAtLength(node.getTotalLength() * fraction);
          const screen = new DOMPoint(local.x, local.y).matrixTransform(node.getScreenCTM());
          const x = Math.round(screen.x); const y = Math.round(screen.y);
          if (document.elementFromPoint(x, y) === node) {
            return { index, x, y, orientation: node.dataset.orientation };
          }
        }
      }
      return null;
    });
    if (!target) await page.waitForTimeout(50);
  }
  assert(target, `no exposed actual pointer section for ${endpoint}`);
  return { ...target, selector };
}

async function screenshot(page, stage) {
  if (!screenshotDirectory) return;
  fs.mkdirSync(screenshotDirectory, { recursive: true });
  await page.locator('#circuit-canvas').screenshot({ path: path.join(screenshotDirectory, `${browserName}-${label}-${stage}.png`) });
}

let browser;
(async () => {
  assert(browserType, `unsupported browser ${browserName}`);
  assert(['occluded', 'visible'].includes(expectation), `unsupported expectation ${expectation}`);
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = []; const outside = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url());
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__M11_READY__ === true);
  if (fixtureIn) await importFixture(page, fs.readFileSync(fixtureIn));
  else await openBlink(page);
  await page.click('#view-reset');
  if (process.env.RECEIPT14_TERMINAL_SHOW_LABELS !== '0') await page.click('#show-pin-labels');
  await page.waitForTimeout(180);

  const initialGround = await attachment(page, 'board-1.GND1');
  const initialSignal = await attachment(page, 'board-1.D13');
  if (process.env.RECEIPT14_TERMINAL_DEBUG === '1') console.log(JSON.stringify({ initialGround, initialSignal }));
  assertCommon(initialGround); assertCommon(initialSignal);
  assert(initialGround.sampleInsidePcb && initialGround.routeLayerZ < initialGround.componentLayerZ,
    'fixture does not exercise a route segment painted under opaque board artwork');
  if (expectation === 'occluded') {
    assert(!initialGround.stubStart && !initialSignal.stubStart,
      'baseline unexpectedly has a terminal lead above artwork');
    await screenshot(page, 'occluded');
    if (fixtureOut) fs.writeFileSync(fixtureOut, await captureFixture(page));
    console.log(JSON.stringify({
      status: 'occlusion-reproduced', browser: browserName, label,
      endpoint: initialGround.endpoint,
      routeAnchorDistance: distance(initialGround.routeStart, initialGround.anchorCentre),
      routeTerminalDistance: distance(initialGround.routeStart, initialGround.terminalCentre),
      sampleInsideOpaqueBoard: initialGround.sampleInsidePcb,
      routeLayerZ: initialGround.routeLayerZ, componentLayerZ: initialGround.componentLayerZ,
      visibleTerminalLead: false,
    }));
    assert(errors.length === 0, `browser errors: ${JSON.stringify(errors)}`);
    assert(outside.length === 0, `outside requests: ${JSON.stringify(outside)}`);
    return;
  }

  assertVisible(initialGround); assertVisible(initialSignal);
  assertVisibilityInventory(await visibilityInventory(page));
  assert((await defaultBodyCrossings(page)).length === 0,
    `default routes cross/re-enter a component body: ${JSON.stringify(await defaultBodyCrossings(page))}`);
  await screenshot(page, 'before-pointer-edit');
  const originalGraph = canonical((await project(page)).circuit);
  const target = await exposedRouteTarget(page, 'board-1.GND1');
  const targetLocator = page.locator(target.selector).nth(target.index);
  await targetLocator.focus();
  const beforeRoute = canonical((await project(page)).layout.wireRoutes);
  await page.mouse.move(target.x, target.y); await page.mouse.down();
  await page.mouse.move(
    target.x + (target.orientation === 'vertical' ? 36 : 0),
    target.y + (target.orientation === 'horizontal' ? 36 : 0),
    { steps: 4 },
  );
  try {
    await page.waitForFunction(() => document.querySelectorAll('.wire-drag-proposal').length > 0, null, { timeout: 1_000 });
  } catch {
    await targetLocator.dispatchEvent('pointermove', {
      pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1,
      clientX: target.x + (target.orientation === 'vertical' ? 36 : 0),
      clientY: target.y + (target.orientation === 'horizontal' ? 36 : 0),
    });
    await page.waitForFunction(() => document.querySelectorAll('.wire-drag-proposal').length > 0);
  }
  assertVisibilityInventory(await visibilityInventory(page), { proposal: true });
  await page.mouse.up();
  assert(canonical((await project(page)).layout.wireRoutes) !== beforeRoute, 'actual pointer route edit did not commit');
  assert(canonical((await project(page)).circuit) === originalGraph, 'actual pointer route edit changed electrical graph');
  assertVisible(await attachment(page, 'board-1.GND1'));
  assertVisibilityInventory(await visibilityInventory(page));
  await screenshot(page, 'after-pointer-edit');

  const board = page.locator('[data-component-id="board-1"]');
  const boardBox = await board.boundingBox();
  await page.mouse.move(boardBox.x + boardBox.width * 0.5, boardBox.y + boardBox.height * 0.5);
  await page.mouse.down(); await page.mouse.move(boardBox.x + boardBox.width * 0.5 + 66, boardBox.y + boardBox.height * 0.5 - 28, { steps: 5 }); await page.mouse.up();
  assertVisible(await attachment(page, 'board-1.GND1'));
  assertVisibilityInventory(await visibilityInventory(page));
  for (const rotation of [90, 180, 270, 0]) {
    await board.click({ force: true });
    await page.click('#rotate-component');
    await page.waitForFunction((expected) => window.__M6_PROJECT__().layout.positions['board-1'].rotation === expected, rotation);
    await page.waitForTimeout(120);
    assertVisible(await attachment(page, 'board-1.GND1'));
    assertVisible(await attachment(page, 'board-1.D13'));
    assertVisibilityInventory(await visibilityInventory(page));
  }
  await page.click('#zoom-in'); await page.click('#pan-right'); await page.click('#pan-down');
  assertVisible(await attachment(page, 'board-1.GND1'));
  assertVisible(await attachment(page, 'board-1.D13'));
  assertVisibilityInventory(await visibilityInventory(page));

  await page.click('#project-save');
  const saved = canonical(await project(page));
  await page.click('#project-reload');
  await page.waitForFunction((expected) => JSON.stringify(window.__M6_PROJECT__()) === expected, saved);
  assertVisible(await attachment(page, 'board-1.GND1'));
  assertVisibilityInventory(await visibilityInventory(page));
  const exported = await captureFixture(page);
  await page.click('#project-new');
  await importFixture(page, exported);
  assert(canonical(await project(page)) === saved, 'actual export/import changed project or saved route geometry');
  assertVisible(await attachment(page, 'board-1.GND1'));
  assertVisible(await attachment(page, 'board-1.D13'));
  assertVisibilityInventory(await visibilityInventory(page));

  assert(errors.length === 0, `browser errors: ${JSON.stringify(errors)}`);
  assert(outside.length === 0, `outside requests: ${JSON.stringify(outside)}`);
  console.log(JSON.stringify({
    status: 'visible-terminal-accepted', browser: browserName, label,
    endpoint: 'board-1.GND1', pointerRouteEdit: true,
    transforms: ['move', 0, 90, 180, 270, 'zoom', 'pan'],
    durability: ['save-reopen', 'export-import'], serialRequirementRetained: Boolean(await page.locator('#serial-tab').count()),
  }));
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(async () => { await browser?.close(); });
