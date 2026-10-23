// Copyright 2026 Finn Andre Hotvedt and IntentForce
// SPDX-License-Identifier: Apache-2.0
// Actual browser worker and current model, retained inert artifact, no compiler
// producer and no firmware Run. Guards the complete initial-ready render path.

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(path.join(
  process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright',
));

const root = path.resolve(__dirname, '..', 'dist');
const artifactIdentity = 'a'.repeat(64);
const inputIdentity = 'b'.repeat(64);
const retainedHex = Buffer.from(fs.readFileSync(
  path.join(__dirname, 'fixtures', 'avr-thermostat-retained.hex.base64'), 'utf8',
).trim(), 'base64').toString('utf8');
const retainedHexSha256 = '15e063cfc10eb127fae0cb87ea57037a388a98db08b099fc7f8da061ed0b0505';
const productionCsp = "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self'; object-src 'none'; script-src 'self' 'sha256-Ol4fhdsQWg9x10Ho2zA++OfTuRE50DQvqSmJ894ef4Y='; script-src-attr 'none'; style-src 'self'; worker-src 'self'; upgrade-insecure-requests";

function contentType(file) {
  if (file.endsWith('.js')) return 'text/javascript';
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.json')) return 'application/json';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  return 'text/html';
}

(async () => {
  const { RC112_CURRENT_MODEL_LIBRARY_LOCK } = await import(pathToFileURL(
    path.join(__dirname, '..', 'src', 'model-library.mjs'),
  ).href);
  assert.equal(createHash('sha256').update(retainedHex).digest('hex'), retainedHexSha256,
    'retained actual compiler bytes changed');
  let serverBuildRequests = 0;
  let buildSequence = 0;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname.startsWith('/api/build')) serverBuildRequests += 1;
    const file = path.resolve(root, pathname === '/' ? 'index.html' : pathname.replace(/^\//u, ''));
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) {
      response.writeHead(404); response.end(); return;
    }
    response.setHeader('Content-Type', contentType(file));
    response.setHeader('Content-Security-Policy', productionCsp);
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
        const jobId = [
          'current-ready-render', 'migrated-recovery-ready-render',
          'retained-ready-render', 'stalled-ready-render',
        ][buildSequence]
          ?? `unexpected-ready-render-${buildSequence}`;
        buildSequence += 1;
        await route.fulfill({
          status: 202, contentType: 'application/json',
          body: JSON.stringify({ jobId, capability: 'retained-inert-artifact' }),
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
            artifact: { hex: retainedHex, hexSha256: retainedHexSha256 },
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
    await page.click('#project-files-open');
    await page.click('#project-demo');
    await page.click('.starter-card[data-example="avr-thermostat-boundary-v1"]');
    await page.waitForFunction(() => window.__M6_STATE__.graph?.components?.some(
      (component) => component.id === 'temperature-sensor-1',
    ));
    assert.match(await page.locator('#model-library-summary').textContent(), /current/u);
    await page.click('#quick-build');
    await page.waitForFunction(() => window.__M6_STATE__?.buildState === 'succeeded');
    await page.waitForFunction(() => window.__M6_STATE__?.runtime?.kind === 'ready');
    await page.waitForFunction(() => document.querySelector('#worker-state').textContent === 'Paused');
    const current = await page.evaluate(() => ({
      kind: window.__M6_STATE__.runtime.kind,
      cycle: window.__M6_STATE__.runtime.cycle,
      instructions: window.__M6_STATE__.runtime.instructions,
      tracePresent: Array.isArray(window.__M6_STATE__.runtime.trace),
      runDisabled: document.querySelector('#run').disabled,
      quickRunDisabled: document.querySelector('#quick-run').disabled,
      traceText: document.querySelector('#trace').textContent,
      logicText: document.querySelector('#logic-output').textContent,
      serialText: document.querySelector('#serial-output').textContent,
      workerState: document.querySelector('#worker-state').textContent,
    }));
    assert.deepEqual(
      { kind: current.kind, cycle: current.cycle, instructions: current.instructions },
      { kind: 'ready', cycle: 0, instructions: 0 },
    );
    assert.equal(current.tracePresent, true, 'current-model case must retain the unmodified actual ready event');
    assert.equal(current.runDisabled, false);
    assert.equal(current.quickRunDisabled, false);
    assert.equal(current.traceText, 'No D13 observations.');
    assert.equal(current.logicText, 'No logic observations.');
    assert.equal(current.serialText, 'No firmware bytes.');
    assert.equal(current.workerState, 'Paused');
    assert.equal(page.workers().length, 1, 'actual current-model simulator worker was not created');

    const historicalRecovery = await page.evaluate((modelLibrary) => {
      const value = JSON.parse(window.__COMMON_PROJECT_FILES__.current());
      value.modelLibrary = modelLibrary;
      return JSON.stringify(value);
    }, RC112_CURRENT_MODEL_LIBRARY_LOCK);
    await page.evaluate((source) => {
      localStorage.setItem('teach-lab.simulator.project.v2', source);
      localStorage.removeItem('teach-lab.simulator.project.recovery.v2');
    }, historicalRecovery);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    assert.match(await page.locator('#project-message').textContent(), /Reopened and revalidated/u);
    assert.match(await page.locator('#model-library-summary').textContent(),
      /2\.0\.0-x48-current-source-integration\.1-current.*retained/u);
    const requestsBeforeMigrationGuard = intercepted.length;
    await page.click('#quick-build');
    await page.waitForFunction(() => window.__M6_STATE__?.buildState === 'migration-required');
    const migrationGuard = await page.evaluate(() => ({
      buildState: document.querySelector('#build-state').textContent,
      projectMessage: document.querySelector('#project-message').textContent,
      diagnostics: document.querySelector('#diagnostics').textContent,
      technical: document.querySelector('#technical-error-detail').textContent,
      modelDetailsOpen: document.querySelector('#model-library-detail').open,
      runDisabled: document.querySelector('#run').disabled,
      quickRunDisabled: document.querySelector('#quick-run').disabled,
      workers: window.__M6_STATE__.runtimeWorkerCreations,
    }));
    assert.equal(intercepted.length, requestsBeforeMigrationGuard,
      'migration-only recovery reached the compiler producer path');
    assert.equal(migrationGuard.buildState, 'Model migration required');
    assert.match(migrationGuard.projectMessage, /retained model version/u);
    assert.match(migrationGuard.diagnostics, /download the migrated copy/u);
    assert.match(migrationGuard.technical, /MODEL_LIBRARY_MIGRATION_REQUIRED/u);
    assert.equal(migrationGuard.modelDetailsOpen, true);
    assert.equal(migrationGuard.runDisabled, true);
    assert.equal(migrationGuard.quickRunDisabled, true);
    assert.equal(migrationGuard.workers, 0);

    assert.equal(await page.locator('#model-library-migrate').isDisabled(), false);
    const migratedDownloadPromise = page.waitForEvent('download', { timeout: 2_000 }).catch(() => null);
    await page.click('#model-library-migrate');
    const migratedDownload = await migratedDownloadPromise;
    assert(migratedDownload, JSON.stringify(await page.evaluate(() => ({
      projectMessage: document.querySelector('#project-message').textContent,
      modelStatus: document.querySelector('#model-library-status').textContent,
      modelButtonDisabled: document.querySelector('#model-library-migrate').disabled,
    }))));
    const migratedPath = await migratedDownload.path();
    const migratedBytes = fs.readFileSync(migratedPath);
    await page.setInputFiles('#project-open-input', {
      name: 'recovered-thermostat.migrated.intent-mcu.json',
      mimeType: 'application/json', buffer: migratedBytes,
    });
    await page.waitForTimeout(100);
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
      await page.click('#unsaved-discard');
    }
    await page.waitForFunction(() => document.querySelector('#model-library-summary').textContent.includes('current'));
    await page.click('#quick-build');
    await page.waitForFunction(() => window.__M6_STATE__?.buildState === 'succeeded');
    await page.waitForFunction(() => window.__M6_STATE__?.runtime?.kind === 'ready');
    await page.waitForFunction(() => document.querySelector('#worker-state').textContent === 'Paused');
    const migrated = await page.evaluate(() => ({
      model: document.querySelector('#model-library-summary').textContent,
      workerState: document.querySelector('#worker-state').textContent,
      runDisabled: document.querySelector('#run').disabled,
      quickRunDisabled: document.querySelector('#quick-run').disabled,
      cycle: window.__M6_STATE__.runtime.cycle,
      instructions: window.__M6_STATE__.runtime.instructions,
    }));
    assert.match(migrated.model, /current/u);
    assert.equal(migrated.workerState, 'Paused');
    assert.equal(migrated.runDisabled, false);
    assert.equal(migrated.quickRunDisabled, false);
    assert.equal(migrated.cycle, 0);
    assert.equal(migrated.instructions, 0);

    const retainedProject = await page.evaluate(() => {
      const value = JSON.parse(window.__COMMON_PROJECT_FILES__.current());
      value.schema = 'intent-mcu-project-envelope@6';
      delete value.modelLibrary;
      return JSON.stringify(value);
    });
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
    await page.setInputFiles('#project-open-input', {
      name: 'retained-avr-ready.intent-mcu.json',
      mimeType: 'application/json',
      buffer: Buffer.from(retainedProject),
    });
    await page.waitForTimeout(100);
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) {
      await page.click('#unsaved-discard');
    }
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
      traceText: document.querySelector('#trace').textContent,
      logicText: document.querySelector('#logic-output').textContent,
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
    assert.equal(ready.traceText, 'No D13 observations.');
    assert.equal(ready.logicText, 'No logic observations.');
    assert.equal(ready.serialText, 'No firmware bytes.');
    assert.equal(ready.workerState, 'Paused');
    assert.equal(page.workers().length, 1, 'actual retained-model simulator worker was not created');

    await page.evaluate(() => {
      window.Worker = class SilentRuntimeWorker {
        addEventListener() {}
        removeEventListener() {}
        postMessage() {}
        terminate() {}
      };
    });
    await page.click('#quick-build');
    await page.waitForFunction(() => window.__M6_STATE__?.buildState === 'succeeded');
    await page.waitForFunction(() => window.__M6_STATE__?.runtimeLoadState === 'failed', null, { timeout: 7_000 });
    const timeout = await page.evaluate(() => ({
      workerState: document.querySelector('#worker-state').textContent,
      projectMessage: document.querySelector('#project-message').textContent,
      technical: document.querySelector('#technical-error-detail').textContent,
      runDisabled: document.querySelector('#run').disabled,
      quickRunDisabled: document.querySelector('#quick-run').disabled,
    }));
    assert.match(timeout.workerState, /Runtime failed to start/u);
    assert.match(timeout.projectMessage, /did not start/u);
    assert.match(timeout.technical, /RUNTIME_WORKER_READY_TIMEOUT/u);
    assert.equal(timeout.runDisabled, true);
    assert.equal(timeout.quickRunDisabled, true);
    assert.deepEqual(intercepted, [
      'POST /api/build', 'GET /api/build/current-ready-render',
      'POST /api/build', 'GET /api/build/migrated-recovery-ready-render',
      'POST /api/build', 'GET /api/build/retained-ready-render',
      'POST /api/build', 'GET /api/build/stalled-ready-render',
    ]);
    assert.equal(serverBuildRequests, 0, 'a compiler producer request reached the server');
    assert.deepEqual(failures, []);
    process.stdout.write(`${JSON.stringify({
      status: 'pass', scope: 'actual-worker-ready-render', current, migrationGuard,
      migratedRecovery: migrated, retained: ready, timeout,
      retainedHexSha256, productionCsp: true,
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
