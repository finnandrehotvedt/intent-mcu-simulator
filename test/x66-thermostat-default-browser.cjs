// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X66_URL || 'http://127.0.0.1:18898/dist/';
const output = process.env.X66_OUTPUT || '/tmp/x66-thermostat-default';
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const graphSnapshot = (page) => page.evaluate(() => structuredClone(window.__M6_PROJECT__().candidateCircuit
  ?? window.__M6_PROJECT__().project?.circuit ?? window.__M6_PROJECT__().circuit));

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
    await page.click('.starter-card[data-example="avr-thermostat-boundary-v1"]');
    await page.click('#canvas-annotations-open');
    await page.selectOption('#canvas-subcircuit-source', 'net-thermostat-heater-drive');
    await page.selectOption('#canvas-subcircuit-ground', 'net-thermostat-ground');
    await page.fill('#canvas-subcircuit-id', 'stage-one');
    await page.click('#canvas-subcircuit-add');
    await page.waitForFunction(() => window.__X66_BOUNDED_SUBCIRCUITS__.snapshot().instances.length === 1);
    assert.doesNotMatch(await page.locator('#canvas-annotations-status').textContent(), /rejected|UNKNOWN_COMPONENT_TYPE/u);

    const created = { graph: await graphSnapshot(page),
      owner: await page.evaluate(() => window.__X66_BOUNDED_SUBCIRCUITS__.snapshot()) };
    const createdDigest = digest(created.graph);
    assert(created.graph.components.some(({ id, type }) => id === 'temperature-sensor-1'
      && type === 'sensor.temperature-analogue-v1'));
    assert(created.graph.components.some(({ id }) => id === 'stage-one-resistor'));
    assert(created.graph.components.some(({ id }) => id === 'stage-one-led'));
    assert.deepEqual(created.owner.instances[0].bindings, [
      { portId: 'ground', netId: 'net-thermostat-ground' },
      { portId: 'source', netId: 'net-thermostat-heater-drive' },
    ]);

    const row = page.locator('[data-annotation-editor="stage-one"]');
    await row.getByRole('button', { name: 'Collapse' }).click();
    assert.equal(digest(await graphSnapshot(page)), createdDigest);
    await row.getByRole('button', { name: 'Expand' }).click();
    await row.locator('label', { hasText: 'X' }).locator('input').fill('0.68');
    await row.locator('label', { hasText: 'Y' }).locator('input').fill('0.58');
    await row.getByRole('button', { name: 'Move' }).click();
    assert.equal(digest(await graphSnapshot(page)), createdDigest);
    await page.screenshot({ path: `${output}/x66-default-thermostat-created.png`, fullPage: false });

    const [workspaceDownload] = await Promise.all([
      page.waitForEvent('download'), page.click('#canvas-annotations-download'),
    ]);
    const workspace = JSON.parse(fs.readFileSync(await workspaceDownload.path(), 'utf8'));
    assert.equal(workspace.schema, 'intent-mcu-annotated-workspace@3');
    assert.equal(workspace.subcircuits.instances[0].id, 'stage-one');
    await page.click('#canvas-annotations-close');
    await page.click('#project-files-open');
    const [projectDownload] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
    assert.equal(JSON.parse(fs.readFileSync(await projectDownload.path(), 'utf8')).subcircuits.instances[0].id, 'stage-one');

    await page.click('#project-files-open');
    await page.locator('#local-history > summary').click();
    await page.click('#local-history-enable');
    await page.fill('#local-history-label', 'Default thermostat reusable stage'); await page.click('#local-history-save');
    await page.waitForFunction(() => window.__LOCAL_VERSION_HISTORY__.list().then((rows) => rows.length === 1));
    assert.equal(JSON.parse((await page.evaluate(() => window.__LOCAL_VERSION_HISTORY__.list()))[0].envelope)
      .subcircuits.instances[0].id, 'stage-one');

    await page.locator('#workbench-project-dialog .workbench-popup-close').click();
    await page.click('#canvas-annotations-open');
    await row.getByRole('button', { name: 'Delete' }).click();
    await page.waitForFunction(() => window.__X66_BOUNDED_SUBCIRCUITS__.snapshot().instances.length === 0);
    await page.click('#canvas-annotations-close'); await page.locator('#undo').evaluate((button) => button.click());
    await page.waitForFunction(() => window.__X66_BOUNDED_SUBCIRCUITS__.snapshot().instances.length === 1);
    assert.equal(digest(await graphSnapshot(page)), createdDigest);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true && window.__X66_BOUNDED_SUBCIRCUITS__);
    assert.equal((await page.evaluate(() => window.__X66_BOUNDED_SUBCIRCUITS__.snapshot())).instances[0].id, 'stage-one');
    assert.equal(digest(await graphSnapshot(page)), createdDigest);
    assert.equal(await page.evaluate(() => window.__M6_STATE__.runtimeWorkerCreations), workersBefore);
    assert.deepEqual(observations.producers, []); assert.deepEqual(observations.mutations, []);
    assert.deepEqual(observations.outside, []); assert.deepEqual(observations.errors, []);
    assert.deepEqual(await context.cookies(), []);
    const result = { result: 'pass', journey: 'default-thermostat-subcircuit-create', graphDigest: createdDigest,
      collapseMoveDigestPreserved: true, deleteUndo: true, projectSave: true, annotatedSave: true,
      localHistory: true, reload: true, producers: 0, mutations: 0, outsideRequests: 0, cookies: 0,
      runtimeWorkers: workersBefore };
    fs.writeFileSync(`${output}/x66-default-thermostat.json`, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally { await context.close(); await browser.close(); }
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
