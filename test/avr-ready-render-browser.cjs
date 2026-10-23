// Copyright 2026 Finn Andre Hotvedt and IntentForce
// SPDX-License-Identifier: Apache-2.0
// Actual browser worker and current model, retained inert artifact, no compiler
// producer and no firmware Run. Guards the complete initial-ready render path.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const root = path.resolve(__dirname, '..', 'dist');
const artifactIdentity = 'a'.repeat(64);
const inputIdentity = 'b'.repeat(64);

function contentType(file) {
  if (file.endsWith('.js')) return 'text/javascript';
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.json')) return 'application/json';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  return 'text/html';
}

(async () => {
  let serverBuildRequests = 0;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname.startsWith('/api/build')) serverBuildRequests += 1;
    const file = path.resolve(root, pathname === '/' ? 'index.html' : pathname.replace(/^\//u, ''));
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) {
      response.writeHead(404); response.end(); return;
    }
    response.setHeader('Content-Type', contentType(file));
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const failures = [];
    const intercepted = [];
    page.on('pageerror', (error) => failures.push(error.stack || error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') failures.push(message.text());
    });
    await page.route((url) => url.pathname.startsWith('/api/build'), async (route) => {
      const request = route.request();
      intercepted.push(`${request.method()} ${new URL(request.url()).pathname}`);
      if (request.method() === 'POST') {
        await route.fulfill({
          status: 202, contentType: 'application/json',
          body: JSON.stringify({ jobId: 'retained-ready-render', capability: 'retained-inert-artifact' }),
        });
        return;
      }
      if (request.method() === 'DELETE') {
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          status: 'succeeded', cacheHit: false,
          result: {
            artifactIdentity, inputIdentity,
            artifact: { hex: ':00000001FF' },
            diagnostics: [],
          },
        }),
      });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    if (await page.locator('#walkthrough').getAttribute('open') !== null) {
      await page.locator('#walkthrough button').last().click();
    }
    await page.evaluate(() => {
      const NativeWorker = window.Worker;
      window.Worker = class ActualPartialReadyWorker {
        constructor(...args) {
          this.native = new NativeWorker(...args);
          this.listeners = new Map();
        }
        addEventListener(type, listener, options) {
          if (type !== 'message') {
            this.native.addEventListener(type, listener, options);
            return;
          }
          const projected = (event) => {
            const data = structuredClone(event.data);
            if (data?.kind === 'ready') {
              delete data.trace;
              delete data.pins;
              delete data.circuit;
              delete data.instruments;
            }
            listener(new MessageEvent('message', { data }));
          };
          this.listeners.set(listener, projected);
          this.native.addEventListener(type, projected, options);
        }
        removeEventListener(type, listener, options) {
          this.native.removeEventListener(type, this.listeners.get(listener) ?? listener, options);
          this.listeners.delete(listener);
        }
        postMessage(...args) { this.native.postMessage(...args); }
        terminate() { this.native.terminate(); }
      };
    });
    await page.click('#project-files-open');
    await page.click('#project-demo');
    await page.click('.starter-card[data-example="avr-thermostat-boundary-v1"]');
    await page.waitForFunction(() => window.__M6_STATE__.graph?.components?.some(
      (component) => component.id === 'temperature-sensor-1',
    ));
    const retainedProject = await page.evaluate(() => {
      const value = JSON.parse(window.__COMMON_PROJECT_FILES__.current());
      value.schema = 'intent-mcu-project-envelope@6';
      delete value.modelLibrary;
      return JSON.stringify(value);
    });
    await page.setInputFiles('#project-open-input', {
      name: 'retained-avr-ready.intent-mcu.json',
      mimeType: 'application/json',
      buffer: Buffer.from(retainedProject),
    });
    await page.waitForFunction(() => document.querySelector('#unsaved-change-dialog').open === true);
    await page.click('#unsaved-discard');
    await page.waitForFunction(() => document.querySelector('#model-library-summary').textContent.includes('retained'));
    await page.click('#quick-build');
    await page.waitForFunction(() => window.__M6_STATE__?.buildState === 'succeeded');
    await page.waitForFunction(() => window.__M6_STATE__?.runtime?.kind === 'ready');
    await page.waitForFunction(() => document.querySelector('#worker-state').textContent === 'Paused');
    const ready = await page.evaluate(() => ({
      kind: window.__M6_STATE__.runtime.kind,
      cycle: window.__M6_STATE__.runtime.cycle,
      instructions: window.__M6_STATE__.runtime.instructions,
      tracePresent: Array.isArray(window.__M6_STATE__.runtime.trace),
      runDisabled: document.querySelector('#run').disabled,
      quickRunDisabled: document.querySelector('#quick-run').disabled,
      traceRows: document.querySelectorAll('#trace li').length,
      logicRows: document.querySelectorAll('#logic-output li').length,
      serialText: document.querySelector('#serial-output').textContent,
      workerState: document.querySelector('#worker-state').textContent,
    }));
    assert.deepEqual(
      { kind: ready.kind, cycle: ready.cycle, instructions: ready.instructions },
      { kind: 'ready', cycle: 0, instructions: 0 },
    );
    assert.equal(ready.tracePresent, false, 'fixture must exercise the accepted partial-ready projection');
    assert.equal(ready.runDisabled, false);
    assert.equal(ready.quickRunDisabled, false);
    assert.equal(ready.traceRows, 1);
    assert.equal(ready.logicRows, 1);
    assert.equal(ready.serialText, 'No firmware bytes.');
    assert.equal(ready.workerState, 'Paused');
    assert.equal(page.workers().length, 1, 'actual simulator worker was not created');
    assert.deepEqual(intercepted, ['POST /api/build', 'GET /api/build/retained-ready-render']);
    assert.equal(serverBuildRequests, 0, 'a compiler producer request reached the server');
    assert.deepEqual(failures, []);
    process.stdout.write(`${JSON.stringify({
      status: 'pass', scope: 'actual-worker-ready-render', ready,
      compilerProducerRequests: 0, firmwareRuns: 0,
    })}\n`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
