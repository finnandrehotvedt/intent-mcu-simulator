// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createReadStream } = require('node:fs');
const { createServer } = require('node:http');
const { stat } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
const post = async (origin, operation, value = {}, capability = null) => (await fetch(`${origin}/api/session/v1`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(capability ? { Authorization: `Bearer ${capability}` } : {}) },
  body: JSON.stringify({ operation, ...value }),
})).json();
async function resultFor(origin, claim, requestId) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await post(origin, 'result.read', { sessionId: claim.sessionId, requestId }, claim.clientCapability);
    if (result.code !== 'API_RESULT_PENDING') return result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('RESULT_TIMEOUT');
}
async function candidateProject() {
  const { createContactPersistenceExample } = await import('../expansion-drafts/contact-persistence-fixture-v1.mjs');
  return JSON.stringify(createContactPersistenceExample().project);
}
(async () => {
  const { createBrowserSessionRelay } = await import('../src/browser-session-relay.mjs');
  const { createBrowserSessionHttpHandler } = await import('../src/browser-session-http.mjs');
  const relay = createBrowserSessionRelay(); let base;
  const server = createServer(async (request, response) => {
    if (await createBrowserSessionHttpHandler(relay, { publicOrigin: base })(request, response)) return;
    const pathname = new URL(request.url, base).pathname;
    const file = path.join(process.cwd(), 'dist', pathname === '/' ? 'index.html' : pathname.slice(1));
    try { if (!(await stat(file)).isFile()) throw new Error('missing');
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); createReadStream(file).pipe(response); }
    catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(60_000); const errors = []; const outside = [];
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
    await page.route('**/api/page-views', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"disabled"}' }));
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(base).origin) outside.push(request.url()); });
    await page.goto(base, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true); await page.click('#workbench-view-advanced');
    await page.setInputFiles('#project-open-input', { name: 'mechanical.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(await candidateProject()) });
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
    await page.waitForFunction(() => Boolean(window.__M6_PROJECT__()?.candidateCircuit));
    if (!await page.locator('#model-library-detail').evaluate((node) => node.open)) await page.click('#model-library-detail > summary');
    assert.equal(await page.locator('#model-library-migrate').isEnabled(), true, await page.locator('#model-library-status').textContent());
    const [migration] = await Promise.all([page.waitForEvent('download'), page.locator('#model-library-migrate').click({ force: true })]);
    const migrated = fs.readFileSync(await migration.path());
    await page.setInputFiles('#project-open-input', { name: 'mechanical-current.intent-mcu.json', mimeType: 'application/json', buffer: migrated });
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
    await page.waitForFunction(() => document.querySelector('#model-library-status')?.textContent.includes('current immutable'));
    if (await page.locator('#workbench-project-dialog').evaluate((node) => node.open)) await page.click('#workbench-project-dialog .workbench-popup-close');
    if (!(await page.locator('#component-catalog').isVisible())) await page.click('#toggle-catalog');
    await page.evaluate(() => {
      for (const id of ['catalog-category', 'catalog-interface', 'catalog-status', 'catalog-supply-voltage', 'catalog-pin-voltage']) {
        const select = document.querySelector(`#${id}`); select.value = 'all'; select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const favorite = document.querySelector('#catalog-favorites'); favorite.checked = false; favorite.dispatchEvent(new Event('change', { bubbles: true }));
    });
    for (const type of ['switch.slide-spdt-v1', 'button.momentary-nc-v1', 'switch.limit-spdt-v1']) {
      await page.evaluate((query) => { const input = document.querySelector('#catalog-search'); input.value = query.split(/[.-]/u)[1]; input.dispatchEvent(new Event('input', { bubbles: true })); }, type);
      const found = await page.locator(`.catalog-item[data-type="${type}"]`).count();
      assert.equal(found, 1, JSON.stringify(await page.evaluate(() => ({ query: document.querySelector('#catalog-search')?.value, status: document.querySelector('#catalog-status')?.value, types: [...document.querySelectorAll('.catalog-item')].map((item) => item.dataset.type) }))));
      const result = await page.evaluate((componentType) => window.__M6_ADD__(componentType), type);
      assert.equal(result.ok, true, JSON.stringify({ result, model: await page.locator('#model-library-status').textContent() }));
    }
    const ids = await page.evaluate(() => window.__M6_PROJECT__().candidateCircuit.components.map((component) => component.id));
    assert(['slide-switch-1', 'nc-button-1', 'limit-switch-1'].every((id) => ids.includes(id)), JSON.stringify({ ids, message: await page.locator('#project-message').textContent(), technical: await page.locator('#technical-error-detail').textContent(), errors }));
    for (const [id, renderer] of [['slide-switch-1', 'switch-slide-spdt'], ['nc-button-1', 'button-momentary-nc'], ['limit-switch-1', 'switch-limit-spdt']]) {
      assert.equal(await page.locator(`.circuit-component[data-component-id="${id}"] [data-artwork-key="${renderer}"]`).count(), 1);
    }
    const before = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    if (await page.locator('#workbench-parts-dialog').evaluate((node) => node.open)) await page.click('#workbench-parts-dialog .workbench-popup-close');
    await page.locator('.circuit-component[data-component-id="nc-button-1"]').click();
    await page.click('#toggle-inspector');
    await page.evaluate(() => document.querySelector('[data-control="nc-button-1.pressed"]').click());
    assert.equal(await page.locator('[data-control="nc-button-1.pressed"]').textContent(), 'Pressed · open');
    await page.evaluate(() => document.querySelector('#undo').click());
    await page.evaluate(() => document.querySelector('#redo').click());
    assert.notEqual(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), before);
    const savedProject = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    if (await page.locator('#workbench-inspector-dialog').evaluate((node) => node.open)) {
      await page.click('#workbench-inspector-dialog .workbench-popup-close');
    }
    await page.click('#project-files-open');
    await page.waitForSelector('#workbench-project-dialog[open]');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
    const savedPath = await download.path();
    assert.ok(savedPath && fs.statSync(savedPath).size > 500);
    await page.setInputFiles('#project-open-input', savedPath);
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
    await page.waitForFunction((expected) => JSON.stringify(window.__M6_PROJECT__()) === expected, savedProject);

    await page.evaluate(() => [...document.querySelectorAll('#workbench-popup-controls button')]
      .find((button) => button.textContent === 'API access').click());
    const dialog = page.locator('#browser-session-api-dialog');
    await dialog.locator('[data-edit-scope]').check(); await dialog.locator('[data-enable]').click();
    await page.waitForFunction(() => document.querySelector('#browser-session-api-dialog [data-secret]').value.length > 20);
    const claim = await post(base, 'pairing.claim', { pairingSecret: await dialog.locator('[data-secret]').inputValue(),
      scopes: ['discover', 'read_project', 'edit_circuit'] });
    assert.equal(claim.ok, true); let sequence = 0;
    const command = async (requestId, name, args = {}, expectedRevision = claim.revision) => {
      const request = { schema: 'intent-mcu-browser-session-request@1', request_id: requestId,
        session_id: claim.sessionId, project_id: claim.projectId, expected_revision: expectedRevision,
        sequence: ++sequence, command: name, arguments: args };
      assert.equal((await post(base, 'request.submit', { sessionId: claim.sessionId, request }, claim.clientCapability)).ok, true);
      return resultFor(base, claim, requestId);
    };
    const catalog = await command('mechanical-catalog-1', 'components.catalog');
    assert.equal(catalog.status, 'accepted');
    for (const type of ['switch.slide-spdt-v1', 'button.momentary-nc-v1', 'switch.limit-spdt-v1']) {
      assert.ok(catalog.components[type], type);
    }
    const edited = await command('mechanical-api-add-1', 'edit.batch', { commands: [
      { command: 'component.add', id: 'api-slide-1', type: 'switch.slide-spdt-v1', position: { x: 0.82, y: 0.22, rotation: 0 } },
    ] });
    assert.equal(edited.status, 'accepted', edited.code); await page.waitForSelector('[data-component-id="api-slide-1"]');
    const apiBytes = await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__()));
    const undone = await command('mechanical-api-undo-1', 'edit.undo', { transaction_id: edited.transaction_id }, edited.revision_after);
    assert.equal(undone.status, 'accepted'); await page.waitForFunction(() => !window.__M6_PROJECT__().candidateCircuit.components.some((item) => item.id === 'api-slide-1'));
    const redone = await command('mechanical-api-redo-1', 'edit.redo',
      { transaction_id: edited.transaction_id }, undone.revision_after);
    assert.equal(redone.status, 'accepted'); await page.waitForSelector('[data-component-id="api-slide-1"]');
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), apiBytes);
    const invalid = await command('mechanical-api-invalid-1', 'edit.batch', { commands: [
      { command: 'component.property.set', component_id: 'api-slide-1', key: 'transitionPolicy', value: 'make-before-break' },
    ] }, redone.revision_after);
    assert.equal(invalid.status, 'rejected');
    assert.equal(invalid.revision_after, redone.revision_after);
    assert.equal(await page.evaluate(() => JSON.stringify(window.__M6_PROJECT__())), apiBytes);
    await dialog.locator('[data-revoke]').click();
    assert.deepEqual(errors, []); assert.deepEqual(outside, []);
    process.stdout.write(`${JSON.stringify({ ok: true, rendered: 3, manualAdd: true, controls: true,
      fileRoundtrip: true, actualPairingApi: true, apiUndoRedo: true, invalidAtomic: true, thirdPartyRequests: 0 })}\n`);
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
