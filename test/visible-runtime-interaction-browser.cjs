// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const repository = path.resolve(__dirname, '..');
const dist = path.join(repository, 'dist');
const output = process.env.VISIBLE_RUNTIME_OUTPUT || '';
const retainedHex = Buffer.from(fs.readFileSync(
  path.join(__dirname, 'fixtures', 'avr-thermostat-retained.hex.base64'), 'utf8',
).trim(), 'base64').toString('utf8');
const artifactIdentity = crypto.createHash('sha256').update(retainedHex).digest('hex');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function staticServer() {
  return http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(dist, relative);
    if (!file.startsWith(`${dist}${path.sep}`) || !fs.existsSync(file)) {
      response.writeHead(404); response.end('not found'); return;
    }
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(response);
  });
}

async function loadStarter(page, id, expectedName) {
  await page.locator(`.starter-card[data-example="${id}"] .starter-action`).evaluate(
    (button) => button.click(),
  );
  if (await page.locator('#unsaved-change-dialog').evaluate((dialog) => dialog.open)) {
    await page.click('#unsaved-discard');
  }
  await page.waitForFunction((name) => window.__M6_PROJECT__().metadata.name === name, expectedName);
}

async function buildAndRunWithKeyboard(page) {
  await page.keyboard.press('b');
  await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded');
  await page.waitForFunction(() => !document.querySelector('#quick-run').disabled);
  await page.keyboard.press('F5');
  await page.waitForFunction(() => document.querySelector('#worker-state').textContent === 'Running');
  await page.waitForFunction(() => document.querySelector('#circuit-canvas').dataset.mode === 'interact'
    && window.__M6_STATE__.runtimeInteractionLocked === true);
}

async function openCanonicalProject(page, relativePath, componentId) {
  await page.locator('#project-files-open').evaluate((button) => button.click());
  await page.setInputFiles('#project-open-input', path.join(repository, relativePath));
  if (await page.locator('#unsaved-change-dialog').evaluate((dialog) => dialog.open)) {
    await page.click('#unsaved-discard');
  }
  await page.waitForSelector(`[data-component-id="${componentId}"]`);
  if (await page.locator('#workbench-project-dialog').evaluate((dialog) => dialog.open)) {
    await page.click('#workbench-project-dialog .workbench-popup-close');
  }
}

async function selectComponentCard(page, componentId) {
  await page.locator(`[data-component-id="${componentId}"]`).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction((id) => window.__M6_STATE__.selectedComponentId === id, componentId);
}

(async () => {
  if (output) fs.mkdirSync(output, { recursive: true });
  const server = staticServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const errors = []; const buildInputs = [];
  let buildSequence = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(180_000);
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route((url) => url.pathname.startsWith('/api/build'), async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const submitted = JSON.parse(request.postData() || '{}');
        const inputIdentity = crypto.createHash('sha256').update(JSON.stringify({
          schema: submitted.schema, board: submitted.board, files: submitted.files,
        })).digest('hex');
        buildInputs.push(inputIdentity);
        buildSequence += 1;
        await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({
          jobId: `visible-runtime-${buildSequence}`, capability: 'visible-runtime-browser-fixture',
        }) });
        return;
      }
      const jobIndex = Number(/visible-runtime-(\d+)$/u.exec(new URL(request.url()).pathname)?.[1] ?? 0) - 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'succeeded', cacheHit: false, result: {
          artifactIdentity, inputIdentity: buildInputs[jobIndex],
          artifact: { hex: retainedHex, hexSha256: artifactIdentity }, diagnostics: [],
        },
      }) });
    });
    await page.route('**/api/page-views', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: '{"status":"disabled"}',
    }));

    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    if (await page.locator('#walkthrough').evaluate((dialog) => dialog.open)) {
      await page.locator('#walkthrough button').last().click();
    }

    assert.equal(await page.locator('#workbench-more').evaluate((details) => details.open), false);
    for (const selector of ['#quick-build', '#quick-run', '#quick-pause', '#quick-reset', '#quick-stop',
      '#runtime-shortcuts', '#canvas-select-mode', '#canvas-interact-mode']) {
      assert.equal(await page.locator(selector).isVisible(), true, `${selector} is hidden`);
    }
    assert.equal(await page.locator('#workbench-more > summary').textContent(), 'Tools');

    await loadStarter(page, 'trimmer', 'Trimmer calibration');
    await page.locator('[data-component-id="trimmer-1"]').click();
    const originalPosition = await page.evaluate(() => structuredClone(
      window.__M6_PROJECT__().layout.positions['trimmer-1'],
    ));
    await buildAndRunWithKeyboard(page);

    assert.equal(await page.locator('#canvas-select-mode').isDisabled(), true);
    assert.equal(await page.locator('#source').isDisabled(), true);
    assert.equal(await page.locator('.pin-anchor').first().isDisabled(), true);
    assert.deepEqual(await page.locator('#selected-runtime-value').evaluate((node) => ({
      visible: !node.hidden, min: node.min, max: node.max, step: node.step, value: node.value,
    })), { visible: true, min: '0', max: '100', step: '1', value: '50' });
    assert.match(await page.locator('#selected-runtime-range').textContent(), /Min 0% · max 100% · step 1%/u);

    const card = page.locator('[data-component-id="trimmer-1"]');
    const box = await card.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 40);
    await page.mouse.up();
    assert.deepEqual(await page.evaluate(() => window.__M6_PROJECT__().layout.positions['trimmer-1']),
      originalPosition, 'runtime drag changed component placement');

    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.find(
      ({ id }) => id === 'trimmer-1').controls.position === 0.51);
    assert.equal(await page.locator('#selected-runtime-value').inputValue(), '51');
    await page.locator('#selected-runtime-value').fill('80');
    await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.find(
      ({ id }) => id === 'trimmer-1').controls.position === 0.8);

    await page.locator('body').click({ position: { x: 10, y: 10 } });
    await page.keyboard.press('p');
    await page.waitForFunction(() => document.querySelector('#worker-state').textContent === 'Paused');
    assert.equal(await page.locator('#canvas-select-mode').isDisabled(), true);
    assert.equal(await page.locator('#circuit-canvas').getAttribute('data-mode'), 'interact');
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    await page.keyboard.press('Shift+F5');
    await page.waitForFunction(() => window.__M6_STATE__.runtimeInteractionLocked === false
      && document.querySelector('#circuit-canvas').dataset.mode === 'select');
    assert.equal(await page.locator('#canvas-select-mode').isDisabled(), false);
    assert.equal(await page.locator('#source').isDisabled(), false);
    assert.equal(await page.locator('.pin-anchor').first().isDisabled(), false);

    await loadStarter(page, 'button', 'Button input');
    await page.locator('[data-component-id="button-1"]').click();
    await buildAndRunWithKeyboard(page);
    assert.equal(await page.locator('#selected-runtime-action').isVisible(), true);
    assert.match(await page.locator('#selected-runtime-action').textContent(), /Hold switch · Space/u);
    await page.keyboard.down('Space');
    await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.find(
      ({ id }) => id === 'button-1').controls.pressed === true);
    await page.keyboard.up('Space');
    await page.waitForFunction(() => window.__M6_PROJECT__().circuit.components.find(
      ({ id }) => id === 'button-1').controls.pressed === false);
    await page.keyboard.press('Shift+F5');
    await page.waitForFunction(() => window.__M6_STATE__.runtimeInteractionLocked === false);

    await openCanonicalProject(page,
      'examples/digital-presence-sensors/avr-digital-presence-sensors.intent-mcu.json',
      'touch-button-1');
    await selectComponentCard(page, 'touch-button-1');
    await buildAndRunWithKeyboard(page);
    assert.equal(await page.evaluate(() => window.__M6_STATE__.selectedComponentId), 'touch-button-1');
    assert.match(await page.locator('#selected-runtime-action').textContent(), /Toggle switch · Space/u);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.components.find(
      ({ id }) => id === 'touch-button-1').controls.touched === false);
    await page.keyboard.press('Shift+F5');
    await page.waitForFunction(() => window.__M6_STATE__.runtimeInteractionLocked === false);
    assert.equal(await page.evaluate(() => window.__M6_STATE__.selectedComponentId), 'touch-button-1');

    await openCanonicalProject(page,
      'examples/digital-reflective-sensors/avr-digital-reflective-sensors.intent-mcu.json',
      'ir-obstacle-1');
    assert.equal(await page.evaluate(() => window.__M6_STATE__.selectedComponentId), null,
      'opening a replacement project retained a stale component selection');
    assert.equal(await page.locator('#selected-runtime-control-name').textContent(),
      'No interactive component selected');
    await selectComponentCard(page, 'ir-obstacle-1');
    await buildAndRunWithKeyboard(page);
    assert.equal(await page.evaluate(() => window.__M6_STATE__.selectedComponentId), 'ir-obstacle-1');
    assert.match(await page.locator('#selected-runtime-action').textContent(), /Toggle switch · Space/u);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__M6_PROJECT__().candidateCircuit.components.find(
      ({ id }) => id === 'ir-obstacle-1').controls.obstacleDetected === false);
    await page.keyboard.press('Shift+F5');
    await page.waitForFunction(() => window.__M6_STATE__.runtimeInteractionLocked === false);

    if (output) await page.screenshot({ path: path.join(output, 'visible-runtime-controls.png'), fullPage: false });
    assert.deepEqual(errors, []);
    assert.equal(buildInputs.length, 4);
    process.stdout.write(`${JSON.stringify({ result: 'pass', visibleControls: 8,
      automaticInteract: true, lockedAuthoring: true, potKeyboardAndField: true,
      switchSpaceHoldRelease: true, presenceSpaceToggle: true, activeLowSpaceToggle: true,
      selectionPreservedThroughBuildRun: true, staleSelectionClearedOnProjectReplace: true,
      stopReturnsEdit: true, builds: buildInputs.length })}\n`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
