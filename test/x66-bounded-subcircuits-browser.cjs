// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X66_URL || 'http://host.docker.internal:18898/dist/';
const output = process.env.X66_OUTPUT || '/tmp/x66-bounded-subcircuits';
const graphSnapshot = (page) => page.evaluate(() => structuredClone(window.__M6_PROJECT__().project?.circuit
  ?? window.__M6_PROJECT__().candidateCircuit ?? window.__M6_PROJECT__().circuit));

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true,
    serviceWorkers: 'block' });
  const page = await context.newPage();
  const observations = { producers: [], mutations: [], outside: [], errors: [] };
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/\/api\/(build|run|scenario|worker)/u.test(url.pathname)) observations.producers.push(`${request.method()} ${url.pathname}`);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) observations.mutations.push(`${request.method()} ${url.pathname}`);
    if (url.origin !== new URL(base).origin) observations.outside.push(url.href);
  });
  page.on('pageerror', (error) => observations.errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') observations.errors.push(message.text()); });
  try {
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' }))?.status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true && window.__X66_BOUNDED_SUBCIRCUITS__);
    const workersBefore = await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations);
    await page.click('#project-files-open'); await page.click('#project-demo');
    await page.click('.starter-card[data-example="blink"]');
    await page.click('#canvas-annotations-open');
    await page.selectOption('#canvas-subcircuit-source', 'net-example-1');
    await page.selectOption('#canvas-subcircuit-ground', 'net-example-3');
    await page.fill('#canvas-subcircuit-id', 'stage-one');
    await page.fill('#canvas-subcircuit-x', '0.55'); await page.fill('#canvas-subcircuit-y', '0.64');
    await page.click('#canvas-subcircuit-add');
    await page.waitForFunction(() => window.__X66_BOUNDED_SUBCIRCUITS__.snapshot().instances.length === 1);

    const created = { owner: await page.evaluate(() => window.__X66_BOUNDED_SUBCIRCUITS__.snapshot()),
      graph: await graphSnapshot(page) };
    assert.deepEqual(created.owner.instances[0].bindings, [
      { portId: 'ground', netId: 'net-example-3' }, { portId: 'source', netId: 'net-example-1' },
    ]);
    assert(created.graph.components.some(({ id }) => id === 'stage-one-resistor'));
    assert(created.graph.components.some(({ id }) => id === 'stage-one-led'));
    assert(created.graph.nets.some(({ id }) => id === 'stage-one-series'));
    assert(created.graph.nets.find(({ id }) => id === 'net-example-1').endpoints
      .some(({ component, pin }) => component === 'stage-one-resistor' && pin === 'A'));
    assert(created.graph.nets.find(({ id }) => id === 'net-example-3').endpoints
      .some(({ component, pin }) => component === 'stage-one-led' && pin === 'CATHODE'));

    await page.locator('[data-annotation-editor="stage-one"] button', { hasText: 'Collapse' }).click();
    assert.deepEqual(await graphSnapshot(page), created.graph);
    assert.equal(await page.locator('[data-subcircuit-badge="stage-one"]').getAttribute('class'),
      'canvas-subcircuit-badge collapsed');
    await page.locator('[data-annotation-editor="stage-one"] button', { hasText: 'Expand' }).click();
    assert.deepEqual(await graphSnapshot(page), created.graph);
    const row = page.locator('[data-annotation-editor="stage-one"]');
    await row.locator('label', { hasText: 'X' }).locator('input').fill('0.68');
    await row.locator('label', { hasText: 'Y' }).locator('input').fill('0.58');
    await row.getByRole('button', { name: 'Move' }).click();
    assert.deepEqual(await graphSnapshot(page), created.graph);
    assert.deepEqual((await page.evaluate(() => window.__X66_BOUNDED_SUBCIRCUITS__.snapshot())).instances
      .map(({ x, y }) => ({ x, y })), [{ x: 0.68, y: 0.58 }]);
    await page.screenshot({ path: `${output}/x66-bounded-stage-expanded.png`, fullPage: false });

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#canvas-annotations-download')]);
    const workspaceText = fs.readFileSync(await download.path(), 'utf8'); const workspace = JSON.parse(workspaceText);
    assert.equal(workspace.schema, 'intent-mcu-annotated-workspace@3');
    assert.equal(workspace.subcircuits.instances[0].id, 'stage-one');
    const acceptedText = await page.evaluate(() => window.__X66_CANVAS_ANNOTATIONS__.workspaceText());
    assert.equal(JSON.parse(acceptedText).subcircuits.instances[0].id, 'stage-one');

    const malformed = structuredClone(workspace);
    malformed.subcircuits.instances[0].bindings[0].netId = 'missing-net';
    await page.setInputFiles('#canvas-annotations-input', { name: 'tampered.intent-mcu-annotated.json',
      mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(malformed)) });
    await page.waitForFunction(() => document.querySelector('#canvas-annotations-status').textContent.includes('rejected'));
    assert.deepEqual(await graphSnapshot(page), created.graph);
    assert.equal((await page.evaluate(() => window.__X66_BOUNDED_SUBCIRCUITS__.snapshot())).instances.length, 1);

    await row.getByRole('button', { name: 'Delete' }).click();
    await page.waitForFunction(() => window.__X66_BOUNDED_SUBCIRCUITS__.snapshot().instances.length === 0);
    await page.click('#canvas-annotations-close'); await page.locator('#undo').evaluate((button) => button.click());
    await page.waitForFunction(() => window.__X66_BOUNDED_SUBCIRCUITS__.snapshot().instances.length === 1);
    assert.deepEqual(await graphSnapshot(page), created.graph);

    await page.click('#project-files-open');
    await page.locator('#local-history > summary').click(); await page.click('#local-history-enable');
    await page.waitForFunction(() => window.__LOCAL_VERSION_HISTORY__.enabled());
    await page.fill('#local-history-label', 'Reusable LED stage'); await page.click('#local-history-save');
    await page.waitForFunction(() => window.__LOCAL_VERSION_HISTORY__.list().then((rows) => rows.length === 1));
    const retained = await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list());
    assert.equal(JSON.parse(retained[0].envelope).subcircuits.instances[0].id, 'stage-one');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true && window.__X66_BOUNDED_SUBCIRCUITS__);
    assert.equal((await page.evaluate(() => window.__X66_BOUNDED_SUBCIRCUITS__.snapshot())).instances[0].id, 'stage-one');
    assert.deepEqual(await graphSnapshot(page), created.graph);
    assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), workersBefore);
    assert.deepEqual(observations.producers, []); assert.deepEqual(observations.mutations, []);
    assert.deepEqual(observations.outside, []); assert.deepEqual(observations.errors, []);
    assert.deepEqual(await context.cookies(), []);
    process.stdout.write(`${JSON.stringify({ ok: true, schema: workspace.schema, instances: 1,
      graphComponents: created.graph.components.length, history: retained.length })}\n`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
