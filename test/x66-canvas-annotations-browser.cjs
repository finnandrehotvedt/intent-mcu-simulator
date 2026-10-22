// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X66_URL || 'http://host.docker.internal:18898/dist/';
const output = process.env.X66_OUTPUT || '/tmp/x66-canvas-annotations';
const electricalSnapshot = () => {
  const project = window.__M6_PROJECT__(); const canvas = document.querySelector('#circuit-canvas').getBoundingClientRect();
  return { source: project.project?.source ?? project.source, circuit: project.candidateCircuit ?? project.circuit,
    layout: project.candidateLayout ?? project.layout,
    anchors: [...document.querySelectorAll('#component-layer .pin-anchor')].map((node) => {
      const rect = node.getBoundingClientRect(); return { endpoint: node.dataset.endpoint,
        x: Math.round((rect.left + rect.width / 2 - canvas.left) * 100) / 100,
        y: Math.round((rect.top + rect.height / 2 - canvas.top) * 100) / 100 };
    }).sort((a, b) => a.endpoint.localeCompare(b.endpoint)) };
};

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  const producers = []; const mutations = []; const outside = []; const errors = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/\/api\/(build|run|scenario|worker)/u.test(url.pathname)) producers.push(`${request.method()} ${url.pathname}`);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
    if (url.origin !== new URL(base).origin) outside.push(url.href);
  });
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true && window.__X66_CANVAS_ANNOTATIONS__);
    await page.click('#project-files-open'); await page.click('#project-demo');
    await page.click('.starter-card[data-example="avr-thermostat-boundary-v1"]');
    await page.waitForFunction(() => window.__M6_STATE__.thermostatExperiment?.active === true);
    const before = await page.evaluate(electricalSnapshot);

    await page.click('#canvas-annotations-open'); await page.waitForSelector('#canvas-annotations-dialog[open]');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'canvas-annotations-title');
    await page.fill('#canvas-note-text', 'Equality boundary: 30 C must keep the indicator off.');
    await page.fill('#canvas-note-x', '0.72'); await page.fill('#canvas-note-y', '0.16'); await page.click('#canvas-note-add');
    await page.fill('#canvas-group-label', 'Heater indicator stage');
    await page.check('#canvas-group-components input[value="heater-resistor-1"]');
    await page.check('#canvas-group-components input[value="heater-led-1"]');
    await page.click('#canvas-group-add');
    assert.equal((await page.evaluate(() => window.__X66_CANVAS_ANNOTATIONS__.snapshot())).groups.length, 1);
    const noteInput = page.locator('[data-annotation-editor="note-1"] input');
    await noteInput.fill('Equality boundary note edited safely.'); await page.locator('[data-annotation-editor="note-1"] button', { hasText: 'Save' }).click();
    await page.click('#canvas-annotations-undo');
    assert.match((await page.evaluate(() => window.__X66_CANVAS_ANNOTATIONS__.snapshot())).notes[0].text, /30 C/u);
    await page.click('#canvas-annotations-redo');
    assert.match((await page.evaluate(() => window.__X66_CANVAS_ANNOTATIONS__.snapshot())).notes[0].text, /edited safely/u);
    await page.screenshot({ path: `${output}/x66-annotations-dialog-1366x768.png`, fullPage: false });

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#canvas-annotations-download')]);
    const workspaceText = fs.readFileSync(await download.path(), 'utf8'); const workspace = JSON.parse(workspaceText);
    assert.equal(workspace.schema, 'intent-mcu-annotated-workspace@1');
    const accepted = await page.evaluate(() => window.__X66_CANVAS_ANNOTATIONS__.snapshot());
    const malformed = structuredClone(workspace); malformed.annotations.groups[0].componentIds.push('missing-component');
    await page.setInputFiles('#canvas-annotations-input', { name: 'dangling.intent-mcu-annotated.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(malformed)) });
    await page.waitForFunction(() => document.querySelector('#canvas-annotations-status').textContent.includes('rejected'));
    assert.deepEqual(await page.evaluate(() => window.__X66_CANVAS_ANNOTATIONS__.snapshot()), accepted);

    await page.click('#canvas-annotations-close');
    await page.setInputFiles('#project-open-input', { name: 'valid.intent-mcu-annotated.json', mimeType: 'application/json', buffer: Buffer.from(workspaceText) });
    await page.waitForSelector('#unsaved-change-dialog[open]'); await page.click('#unsaved-discard');
    await page.waitForFunction(() => window.__X66_CANVAS_ANNOTATIONS__.snapshot().groups.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__X66_CANVAS_ANNOTATIONS__.snapshot()), accepted);
    const after = await page.evaluate(electricalSnapshot); assert.deepEqual(after, before);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.click('[data-annotation-group="group-2"]');
    assert.equal(await page.locator('.circuit-component.annotation-highlight').count(), 2);
    await page.screenshot({ path: `${output}/x66-annotations-canvas-1440x900.png`, fullPage: false });

    await page.click('.circuit-component[data-component-id="heater-led-1"]');
    await page.click('#toggle-inspector'); await page.click('#delete-component');
    let state = await page.evaluate(() => window.__X66_CANVAS_ANNOTATIONS__.snapshot());
    assert.deepEqual(state.groups[0].componentIds, ['heater-resistor-1']);
    await page.keyboard.press('Control+z');
    state = await page.evaluate(() => window.__X66_CANVAS_ANNOTATIONS__.snapshot());
    assert.deepEqual(state.groups[0].componentIds, ['heater-led-1', 'heater-resistor-1']);
    assert(await page.locator('.circuit-component[data-component-id="heater-led-1"]').count());
    await page.keyboard.press('Control+Shift+z');
    state = await page.evaluate(() => window.__X66_CANVAS_ANNOTATIONS__.snapshot());
    assert.deepEqual(state.groups[0].componentIds, ['heater-resistor-1']);
    await page.keyboard.press('Control+z');

    assert.deepEqual(producers, []); assert.deepEqual(mutations, []); assert.deepEqual(outside, []);
    assert.equal((await context.cookies()).length, 0); assert.deepEqual(errors, []);
    const result = { result: 'pass', notes: 1, groups: 1, editUndoRedo: true, annotatedRoundtrip: true,
      danglingAtomic: true, electricalInvariant: true, groupFocus: true, deletionCleanupPairedUndoRedo: true,
      producers: 0, mutations: 0, outsideRequests: 0, cookies: 0 };
    fs.writeFileSync(`${output}/x66-canvas-annotations.json`, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally { await browser.close(); }
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
