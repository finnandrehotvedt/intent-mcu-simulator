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
const output = process.env.CONFIGURABLE_SHORTCUTS_OUTPUT || '';
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

(async () => {
  if (output) fs.mkdirSync(output, { recursive: true });
  const server = staticServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const errors = []; const buildInputs = [];
  let buildSequence = 0; let buildStatusDelayMs = 0; let nextPostResolve = null;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(60_000);
    page.on('pageerror', (error) => errors.push(error.stack || String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route((url) => url.pathname.startsWith('/api/build'), async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const submitted = JSON.parse(request.postData() || '{}');
        const inputIdentity = crypto.createHash('sha256').update(JSON.stringify({
          schema: submitted.schema, board: submitted.board, files: submitted.files,
        })).digest('hex');
        buildInputs.push(inputIdentity); buildSequence += 1;
        nextPostResolve?.(); nextPostResolve = null;
        await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({
          jobId: `shortcut-${buildSequence}`, capability: 'shortcut-browser-fixture',
        }) });
        return;
      }
      const delay = buildStatusDelayMs;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      const jobIndex = Number(/shortcut-(\d+)$/u.exec(new URL(request.url()).pathname)?.[1] ?? 0) - 1;
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
    assert.equal(await page.locator('#shortcut-settings-open').isVisible(), true);
    assert.equal(await page.locator('#quick-build').getAttribute('data-shortcut'), 'B');
    assert.equal(await page.locator('#quick-run').getAttribute('data-shortcut'), 'F5');

    await page.click('#shortcut-settings-open');
    assert.equal(await page.locator('#shortcut-settings-dialog').evaluate((dialog) => dialog.open), true);
    assert.equal(await page.locator('#shortcut-command-search-count').textContent(), '6 of 6 commands shown');
    await page.fill('#shortcut-command-search', 'stop');
    assert.equal(await page.locator('[data-command-search]:visible').count(), 1);
    assert.equal(await page.locator('#shortcut-key-stop').isVisible(), true);
    assert.equal(await page.locator('#quick-build').isVisible(), true);
    assert.equal(await page.locator('#quick-run').isVisible(), true);
    await page.click('#shortcut-command-search-clear');
    assert.equal(await page.locator('[data-command-search]:visible').count(), 6);
    await page.locator('#shortcut-key-build').focus(); await page.keyboard.press('k');
    await page.locator('#shortcut-key-run').focus(); await page.keyboard.press('k');
    assert.match(await page.locator('#shortcut-settings-status').textContent(), /conflicts between build and run/iu);
    await page.click('#shortcut-settings-save');
    assert.equal(await page.locator('#shortcut-settings-dialog').evaluate((dialog) => dialog.open), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('intent-mcu.keyboard-shortcuts.v1')), null);

    await page.locator('#shortcut-key-run').focus(); await page.keyboard.press('F5');
    await page.check('#shortcut-sequence-enabled');
    await page.locator('#shortcut-key-sequence').focus(); await page.keyboard.press('Shift+g');
    await page.click('#shortcut-settings-save');
    assert.equal(await page.locator('#shortcut-settings-dialog').evaluate((dialog) => dialog.open), false);
    assert.equal(await page.locator('#quick-build').getAttribute('data-shortcut'), 'K');
    assert.equal(await page.locator('[data-shortcut-label="sequence"]').isVisible(), true);
    const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('intent-mcu.keyboard-shortcuts.v1')));
    assert.equal(stored.bindings.build, 'K');
    assert.equal(stored.bindings.sequence, 'Shift+G');
    assert.deepEqual(stored.sequence, { enabled: true, steps: ['build', 'run'] });

    await page.click('#shortcut-settings-open');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#shortcut-settings-export');
    const download = await downloadPromise;
    const exportPath = await download.path();
    const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    assert.deepEqual(exported, stored);
    assert.deepEqual(Object.keys(exported).sort(), ['bindings', 'schema', 'sequence']);
    assert.equal(JSON.stringify(exported).includes(retainedHex), false);

    const beforeRejectedImport = await page.evaluate(
      () => localStorage.getItem('intent-mcu.keyboard-shortcuts.v1'),
    );
    await page.locator('#shortcut-settings-import-file').setInputFiles({
      name: 'invalid-shortcuts.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ ...stored, executable: 'alert(1)' })),
    });
    await page.waitForFunction(() => /Import rejected/iu.test(
      document.querySelector('#shortcut-settings-status').textContent,
    ));
    assert.match(await page.locator('#shortcut-settings-status').textContent(), /Import rejected/iu);
    assert.equal(await page.evaluate(
      () => localStorage.getItem('intent-mcu.keyboard-shortcuts.v1'),
    ), beforeRejectedImport);
    assert.equal(await page.locator('#quick-build').getAttribute('data-shortcut'), 'K');

    await page.locator('#shortcut-settings-import-file').setInputFiles({
      name: 'oversized-shortcuts.json', mimeType: 'application/json',
      buffer: Buffer.alloc((16 * 1024) + 1, 0x20),
    });
    await page.waitForFunction(() => /exceeds the 16384-byte/iu.test(
      document.querySelector('#shortcut-settings-status').textContent,
    ));
    assert.match(await page.locator('#shortcut-settings-status').textContent(), /exceeds the 16384-byte/iu);
    assert.equal(await page.evaluate(
      () => localStorage.getItem('intent-mcu.keyboard-shortcuts.v1'),
    ), beforeRejectedImport);

    const imported = structuredClone(stored);
    imported.bindings.build = 'L';
    await page.locator('#shortcut-settings-import-file').setInputFiles({
      name: 'valid-shortcuts.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(imported)),
    });
    await page.waitForFunction(() => /inactive draft/iu.test(
      document.querySelector('#shortcut-settings-status').textContent,
    ));
    assert.match(await page.locator('#shortcut-settings-status').textContent(), /inactive draft/iu);
    assert.equal(await page.locator('#shortcut-key-build').inputValue(), 'L');
    assert.equal(await page.locator('#quick-build').getAttribute('data-shortcut'), 'K');
    assert.equal(await page.evaluate(
      () => localStorage.getItem('intent-mcu.keyboard-shortcuts.v1'),
    ), beforeRejectedImport);
    await page.click('#shortcut-settings-save');
    assert.equal(await page.locator('#quick-build').getAttribute('data-shortcut'), 'L');
    assert.equal(JSON.parse(await page.evaluate(
      () => localStorage.getItem('intent-mcu.keyboard-shortcuts.v1'),
    )).bindings.build, 'L');

    await page.click('#serial-tab');
    await page.locator('#serial-input').focus();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'serial-input');
    await page.keyboard.press('k'); await page.waitForTimeout(100);
    assert.equal(buildInputs.length, 0, 'shortcut fired while source input held focus');
    await page.click('#serial-close');
    await page.locator('body').click({ position: { x: 12, y: 12 } });
    await page.keyboard.press('l');
    await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded');
    assert.equal(buildInputs.length, 1);

    await page.keyboard.press('Shift+g');
    await page.waitForFunction(() => document.querySelector('#worker-state').textContent === 'Running');
    await page.waitForFunction(() => window.__M6_STATE__.runtimeInteractionLocked === true);
    assert.equal(buildInputs.length, 2);
    assert.match(await page.locator('#shortcut-sequence-status').textContent(), /completed/iu);
    await page.keyboard.press('Shift+F5');
    await page.waitForFunction(() => window.__M6_STATE__.runtimeInteractionLocked === false);

    buildStatusDelayMs = 500;
    const posted = new Promise((resolve) => { nextPostResolve = resolve; });
    await page.keyboard.press('Shift+g'); await posted;
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => /cancelled by Esc/iu.test(
      document.querySelector('#shortcut-sequence-status').textContent,
    ));
    await page.waitForFunction(() => document.querySelector('#build-state').textContent === 'Build succeeded');
    await page.waitForTimeout(120);
    assert.notEqual(await page.locator('#worker-state').textContent(), 'Running');
    assert.equal(buildInputs.length, 3);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    assert.equal(await page.locator('#quick-build').getAttribute('data-shortcut'), 'L');
    await page.click('#shortcut-settings-open');
    await page.click('#shortcut-settings-reset');
    await page.click('#shortcut-settings-close');
    assert.equal(await page.locator('#quick-build').getAttribute('data-shortcut'), 'B');
    assert.equal(await page.locator('[data-shortcut-label="sequence"]').isVisible(), false);

    if (output) await page.screenshot({ path: path.join(output, 'configurable-shortcuts.png'), fullPage: false });
    assert.deepEqual(errors, []);
    process.stdout.write(`${JSON.stringify({ result: 'pass', configurableActions: 5,
      conflictRejected: true, textInputSuppressed: true, localPersistence: true,
      searchableCommands: true, primaryControlsRemainVisible: true,
      exactSchemaExport: true, rejectedImportUnchanged: true, importedDraftInactive: true,
      oversizedImportRejected: true,
      sequenceBuildThenRun: true, escapeCancellation: true, resetDefaults: true,
      builds: buildInputs.length })}\n`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
