// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const root = process.cwd();
const types = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'],
]);
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const file = path.resolve(root, 'dist', pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!file.startsWith(path.resolve(root, 'dist')) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404); response.end(); return;
  }
  response.writeHead(200, { 'Content-Type': types.get(path.extname(file)) ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; const producerRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (/^\/api\/(?:build|c3|stm32)(?:\/|$)/u.test(pathname)) producerRequests.push(pathname);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    await page.setInputFiles('#project-open-input', path.join(
      root, 'examples/transistor-components/avr-transistor-components.intent-mcu.json',
    ));
    if (await page.locator('#unsaved-change-dialog').evaluate((dialog) => dialog.open)) {
      await page.click('#unsaved-discard');
    }
    await page.waitForFunction(() => window.__BROWSER_SESSION_CANONICAL_OWNER__?.snapshot?.()
      .project?.circuit?.components?.some((component) => component.id === 'npn-1'));
    if (await page.locator('#workbench-project-dialog').evaluate((dialog) => dialog.open)) {
      await page.click('#workbench-project-dialog .workbench-popup-close');
    }

    const result = await page.evaluate(() => {
      const owner = window.__BROWSER_SESSION_CANONICAL_OWNER__;
      const baseline = owner.snapshot();
      const text = () => JSON.stringify(owner.snapshot().project);
      const apply = (transactionId, key, value) => {
        const snapshot = owner.snapshot();
        return owner.batch({
          expectedProjectId: snapshot.projectId, expectedRevision: snapshot.revision, transactionId,
          commands: [{ type: 'component.property.set', componentId: 'npn-1', key, value }],
        });
      };
      const travel = (method, transactionId) => {
        const snapshot = owner.snapshot();
        return owner[method]({
          expectedProjectId: snapshot.projectId, expectedRevision: snapshot.revision, transactionId,
        });
      };
      const baselineText = text();
      const first = apply('candidate-browser-first', 'nominalCurrentGain', 200);
      const firstText = text();
      const second = apply('candidate-browser-second', 'maxCollectorEmitterVoltageVolts', 80);
      const secondText = text();
      const wrong = travel('undo', 'candidate-browser-first');
      const afterWrong = text();
      const undoSecond = travel('undo', 'candidate-browser-second');
      const afterUndoSecond = text();
      const undoFirst = travel('undo', 'candidate-browser-first');
      const afterUndoFirst = text();
      const redoFirst = travel('redo', 'candidate-browser-first');
      const afterRedoFirst = text();
      const redoSecond = travel('redo', 'candidate-browser-second');
      const afterRedoSecond = text();
      return { baselineRevision: baseline.revision, first, second, wrong, undoSecond, undoFirst,
        redoFirst, redoSecond, baselineText, firstText, secondText, afterWrong,
        afterUndoSecond, afterUndoFirst, afterRedoFirst, afterRedoSecond,
        workers: window.__M6_STATE__.runtimeWorkerCreations };
    });

    assert.equal(result.baselineRevision, 0);
    assert.equal(result.first.ok, true); assert.equal(result.second.ok, true);
    assert.equal(result.wrong.code, 'API_UNDO_CONFLICT');
    assert.equal(result.afterWrong, result.secondText);
    assert.equal(result.undoSecond.ok, true); assert.equal(result.afterUndoSecond, result.firstText);
    assert.equal(result.undoFirst.ok, true); assert.equal(result.afterUndoFirst, result.baselineText);
    assert.equal(result.redoFirst.ok, true); assert.equal(result.afterRedoFirst, result.firstText);
    assert.equal(result.redoSecond.ok, true); assert.equal(result.afterRedoSecond, result.secondText);
    assert.equal(result.workers, 0);
    assert.deepEqual(producerRequests, []);
    assert.deepEqual(errors, []);
    process.stdout.write(`${JSON.stringify({ ok: true, consecutiveTransactions: 2,
      exactUndo: 2, exactRedo: 2, producerRequests: 0, runtimeWorkers: 0 })}\n`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { server.close(); console.error(error); process.exitCode = 1; });
