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
const execute = process.env.PWM_NATIVE_EXECUTE === '1';
const fakeExecute = process.env.PWM_FAKE_EXECUTE === '1';
const activeExecution = execute || fakeExecute;
const fakeForceTimeout = process.env.PWM_FAKE_FORCE_TIMEOUT === '1';
const observationWallMilliseconds = fakeForceTimeout ? 500 : 20_000;
const externalBase = process.env.PWM_NATIVE_URL || '';
const evidencePath = process.env.PWM_NATIVE_EVIDENCE || '';
const CURRENT = Object.freeze({
  version: '2.0.0-pwm-led-short-routing.1-current',
  manifestSha256: '0907503c8a77e0ec7eda48079b138c23da2ba02be6f3ac2878ec1d64e64eacee',
  implementationSha256: '31613553d024e84e3ea14cfc12ed98441f70d8a410a3eddb755cb69830d2c06c',
});
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function server() {
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

function writeEvidence(value) {
  if (!evidencePath) return;
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  const temporary = `${evidencePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, evidencePath);
}

function segmentEntersBody(start, end, obstacle) {
  if (start.x === end.x) return start.x > obstacle.left && start.x < obstacle.right
    && Math.max(Math.min(start.y, end.y), obstacle.top) < Math.min(Math.max(start.y, end.y), obstacle.bottom);
  if (start.y === end.y) return start.y > obstacle.top && start.y < obstacle.bottom
    && Math.max(Math.min(start.x, end.x), obstacle.left) < Math.min(Math.max(start.x, end.x), obstacle.right);
  return true;
}

function fakeWorkerInstaller({ fullCurrent, fullBrightness, failRun }) {
  window.__PWM_FAKE_CONTEXT_CLOSED__ = false;
  window.__PWM_NATIVE_WORKERS__ = 0;
  const clone = (value) => structuredClone(value);
  class PwmWorker extends EventTarget {
    constructor() {
      super();
      if (window.__PWM_NATIVE_WORKERS__ >= 1) throw new Error('PWM_NATIVE_WORKER_BUDGET_EXHAUSTED');
      window.__PWM_NATIVE_WORKERS__ += 1; this.identity = null; this.lastDuty = 191 / 255;
    }
    dispatch(data, delay = 0) {
      setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: clone(data) })), delay);
    }
    snapshot(kind, duty, paused, cycle) {
      return { kind, paused, cycle, instructions: cycle, speed: 1, trace: [], retentionDrops: {},
        runtimeIdentity: clone(this.identity), modelExecutionContextSha256: this.identity.modelExecutionContextSha256,
        pins: [{ pin: 'D3', mode: duty ? 'DIGITAL_PWM' : 'OUTPUT', level: duty > 0,
          externalDrive: 'RELEASED', diagnostic: 'OK', pwm: duty ? { periodCycles: 255,
            highCycles: Math.round(duty * 255), duty } : null }],
        circuit: { leds: [{ componentId: 'led-1', on: duty > 0,
          currentAmps: fullCurrent * duty, brightness: fullBrightness * duty, color: 'red' }] },
        instruments: { serial: { records: [], dropped: 0 },
          logic: { channels: ['D3'], transitions: [], dropped: 0 }, pin: null },
        eventLog: { log: [], pending: [], applied: [], dropped: 0 } };
    }
    postMessage(data) {
      if (data.command === 'init') {
        this.identity = { ...clone(data.runtimeBinding), schema: 'intent-mcu-worker-runtime-identity@2',
          workerInitialization: 1, workerInstanceNonce: 'b'.repeat(32) };
        this.dispatch(this.snapshot('ready', 0, true, 0));
      } else if (data.command === 'run') {
        if (failRun) return;
        this.dispatch(this.snapshot('running', 64 / 255, false, 255), 20);
        this.dispatch(this.snapshot('running', 191 / 255, false, 510), 250);
      } else if (data.command === 'pause') {
        this.dispatch(this.snapshot('paused', this.lastDuty, true, 510));
      } else if (data.command === 'reset') {
        this.dispatch(this.snapshot('reset', 0, true, 0));
      } else if (data.command === 'dispose') {
        this.dispatch({ ...this.snapshot('disposed', 0, true, 0), disposeToken: data.disposeToken });
      }
    }
    terminate() { window.__PWM_FAKE_CONTEXT_CLOSED__ = true; }
  }
  window.Worker = PwmWorker;
}

(async () => {
  assert(!execute || externalBase, 'PWM_NATIVE_URL is required for an explicitly authorized native run');
  assert(!(execute && fakeExecute), 'native and fake execution modes are mutually exclusive');
  const app = externalBase ? null : server();
  if (app) await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const base = externalBase || `http://127.0.0.1:${app.address().port}`;
  const [route, circuitEngine, examples] = await Promise.all([
    import('../src/route-model.mjs'), import('../src/circuit-engine.mjs'), import('../src/example-projects.mjs'),
  ]);
  const pwmProject = examples.createExampleProject('pwm-pulse').project;
  const idealRuntime = new circuitEngine.CircuitRuntime(pwmProject.circuit);
  const idealFull = idealRuntime.observe({ digitalPins: { D3: true },
    pins: [{ pin: 'D3', mode: 'OUTPUT', level: true, pwm: null }] })
    .leds.find((item) => item.componentId === 'led-1');
  assert(idealFull.currentAmps > 0 && idealFull.brightness > 0);
  const routeNet = { id: 'net-obstacle-safe', endpoints: [
    { component: 'board-1', pin: 'D13' }, { component: 'resistor-1', pin: 'A' },
  ] };
  const routeAnchors = {
    'board-1.D13': { pin: { x: 0.2, y: 0.5 }, escape: { x: 0.2, y: 0.45 } },
    'resistor-1.A': { pin: { x: 0.8, y: 0.5 }, escape: { x: 0.75, y: 0.5 } },
  };
  const routeObstacles = [
    { component: 'board-1', left: 0.05, right: 0.35, top: 0.5, bottom: 0.7 },
    { component: 'resistor-1', left: 0.8, right: 0.95, top: 0.44, bottom: 0.56 },
    { component: 'led-1', left: 0.4, right: 0.6, top: 0.34, bottom: 0.58 },
  ];
  const routeFamily = route.materializeRouteFamily(routeNet, null, routeAnchors, routeObstacles);
  const routePaths = route.routeFamilyPaths(routeFamily, routeAnchors);
  const routeLength = routePaths.reduce((total, branch) => total + branch.points.slice(1)
    .reduce((sum, point, index) => sum + Math.abs(point.x - branch.points[index].x)
      + Math.abs(point.y - branch.points[index].y), 0), 0);
  assert(routeLength < 0.9, `route ${routeLength} did not beat retained 0.9 outer baseline`);
  for (const branch of routePaths) for (let index = 1; index < branch.points.length; index += 1) {
    assert(route.routeSegmentOrientation(branch.points[index - 1], branch.points[index]));
    for (const obstacle of routeObstacles) {
      if (index === 1 && obstacle.component === branch.endpoint.component) continue;
      assert.equal(segmentEntersBody(branch.points[index - 1], branch.points[index], obstacle), false,
        `${branch.endpoint.component} route entered ${obstacle.component}`);
    }
  }
  assert.deepEqual(route.materializeRouteFamily(routeNet, structuredClone(routeFamily),
    routeAnchors, routeObstacles), routeFamily);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await context.addInitScript(() => {
    window.showOpenFilePicker = undefined;
    window.showSaveFilePicker = undefined;
  });
  if (fakeExecute) await context.addInitScript(fakeWorkerInstaller,
    { fullCurrent: idealFull.currentAmps, fullBrightness: idealFull.brightness, failRun: fakeForceTimeout });
  else await context.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__PWM_NATIVE_WORKERS__ = 0;
    window.Worker = class CountedWorker extends NativeWorker {
      constructor(...args) {
        if (window.__PWM_NATIVE_WORKERS__ >= 1) throw new Error('PWM_NATIVE_WORKER_BUDGET_EXHAUSTED');
        window.__PWM_NATIVE_WORKERS__ += 1; super(...args);
      }
    };
  });
  let buildPosts = 0;
  await context.route('**/*', async (routeRequest) => {
    const request = routeRequest.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'POST' && pathname === '/api/build') {
      buildPosts += 1;
      if (buildPosts > 1) { await routeRequest.abort('blockedbyclient'); return; }
      if (fakeExecute) {
        await routeRequest.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({
          jobId: 'pwm-fake-build', capability: 'pwm-fake-capability',
        }) }); return;
      }
    }
    if (fakeExecute && request.method() === 'GET' && pathname === '/api/build/pwm-fake-build') {
      await routeRequest.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: 'succeeded', cacheHit: false, result: { artifactIdentity: 'a'.repeat(64),
          inputIdentity: 'c'.repeat(64), artifact: { hex: ':00000001FF' }, diagnostics: [] },
      }) }); return;
    }
    await routeRequest.continue();
  });
  const page = await context.newPage();
  const requests = []; const errors = []; let stage = 'open';
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      requests.push({ method: request.method(), path: url.pathname });
    }
  });
  page.on('pageerror', (error) => errors.push(error.stack || String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  let evidence; const rawCapture = { stage: 'created', samples: [] };
  const persistRaw = (rawStage) => {
    rawCapture.stage = rawStage;
    if (activeExecution) writeEvidence({ schema: 'intent-mcu-pwm-native-raw@1', status: 'capturing', rawCapture });
  };
  page.on('response', async (response) => {
    if (!activeExecution || !new URL(response.url()).pathname.startsWith('/api/build')) return;
    try {
      rawCapture.compilerResponses ??= [];
      rawCapture.compilerResponses.push({ url: response.url(), status: response.status(), body: await response.text() });
      persistRaw('compiler-response-captured');
    } catch (error) { rawCapture.compilerCaptureError = String(error); }
  });
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__M11_READY__ === true);
    stage = 'load-pwm-pulse';
    await page.evaluate(() => document.querySelector('#project-demo').click());
    await page.evaluate(() => document.querySelector('[data-example="pwm-pulse"]').click());
    await page.waitForFunction(() => document.querySelector('#example-select').value === 'pwm-pulse');

    stage = 'identity-and-graph-preflight';
    const preflight = await page.evaluate(() => {
      const projectText = window.__COMMON_PROJECT_FILES__.current();
      const envelope = JSON.parse(projectText);
      const project = envelope.project;
      const paths = [...document.querySelectorAll('#circuit-wires path')].map((node) => ({
        d: node.getAttribute('d'), net: node.dataset.netId || node.closest('[data-net-id]')?.dataset.netId || null,
      }));
      return {
        projectText, envelope, project, lock: window.__COMMON_PROJECT_FILES__.modelLibraryLock(), paths,
        selectors: Object.fromEntries(['#quick-build', '#quick-run', '#quick-pause', '#quick-reset',
          '#source', '#component-layer', '#circuit-wires', '#project-save', '#project-open-input']
          .map((selector) => [selector, document.querySelectorAll(selector).length])),
        buildState: window.__M6_STATE__.buildState,
        artifactIdentity: window.__M6_STATE__.artifactIdentity,
        runtime: window.__M6_STATE__.runtime,
        workers: window.__PWM_NATIVE_WORKERS__,
      };
    });
    assert(Object.values(preflight.selectors).every((count) => count === 1));
    assert.equal(preflight.project.metadata.name, 'PWM pulse');
    const mainSource = preflight.project.source.files.find((file) => file.name === 'main.ino').content;
    assert.match(mainSource, /analogWrite\(3, 64\)[\s\S]*analogWrite\(3, 191\)/u);
    assert.deepEqual(preflight.project.instruments.logicChannels, ['D3']);
    assert.equal(preflight.project.circuit.components.find((item) => item.type === 'led.basic-v1').id, 'led-1');
    assert(preflight.project.circuit.nets.some((net) => net.endpoints.some((end) => end.pin === 'D3')));
    assert.equal(preflight.lock.version, CURRENT.version);
    assert.equal(preflight.lock.manifestSha256, CURRENT.manifestSha256);
    assert.equal(preflight.lock.implementationSha256, CURRENT.implementationSha256);
    assert.equal(preflight.artifactIdentity, null);
    assert.equal(preflight.runtime, null);
    assert.equal(preflight.workers, 0);
    assert(preflight.paths.length >= 3);

    stage = 'save-open-roundtrip';
    await page.click('#project-files-open');
    await page.waitForSelector('#workbench-project-dialog[open]');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#project-save')]);
    const saved = await download.createReadStream(); const chunks = [];
    for await (const chunk of saved) chunks.push(chunk);
    const savedText = Buffer.concat(chunks).toString('utf8');
    const savedProject = JSON.parse(savedText);
    assert.deepEqual(savedProject.project.circuit, preflight.project.circuit);
    assert.deepEqual(savedProject.project.layout, preflight.project.layout);
    await page.setInputFiles('#project-open-input', {
      name: 'pwm-native-preflight.intent-mcu.json', mimeType: 'application/json', buffer: Buffer.from(savedText),
    });
    if (await page.locator('#unsaved-change-dialog').evaluate((node) => node.open)) await page.click('#unsaved-discard');
    await page.waitForFunction(() => window.__COMMON_PROJECT_FILES__.current().includes('PWM pulse'));
    const reopened = JSON.parse(await page.evaluate(() => window.__COMMON_PROJECT_FILES__.current()));
    assert.deepEqual(reopened.project.circuit, preflight.project.circuit);
    assert.deepEqual(reopened.project.layout, preflight.project.layout);

    const native = { executed: false, levels: [], paused: null, reset: null };
    if (activeExecution) {
      stage = 'one-build';
      const buildResponsePromise = page.waitForResponse((response) => {
        const request = response.request();
        return new URL(response.url()).pathname === '/api/build' && request.method() === 'POST';
      }, { timeout: 45_000 });
      await page.click('#quick-build');
      const buildResponse = await buildResponsePromise;
      rawCapture.buildResponse = { status: buildResponse.status(), body: await buildResponse.text() };
      persistRaw('build-response-captured');
      await page.waitForFunction(() => ['succeeded', 'failed', 'blocked', 'cancelled', 'timeout']
        .includes(window.__M6_STATE__.buildState), null, { timeout: 45_000 });
      assert.equal(await page.evaluate(() => window.__M6_STATE__.buildState), 'succeeded');
      const built = await page.evaluate(() => ({ artifactIdentity: window.__M6_STATE__.artifactIdentity,
        inputIdentity: window.__M6_STATE__.inputIdentity,
        projectBuild: JSON.parse(window.__COMMON_PROJECT_FILES__.current()).project.build,
        lock: window.__COMMON_PROJECT_FILES__.modelLibraryLock() }));
      rawCapture.built = built;
      persistRaw('build-identity-captured');
      assert.match(built.artifactIdentity, /^[a-f0-9]{64}$/u);
      assert.deepEqual(built.projectBuild, { status: 'dirty', inputIdentity: null, artifactIdentity: null });
      const completedCompiler = rawCapture.compilerResponses.map((item) => {
        try { return JSON.parse(item.body); } catch { return null; }
      }).find((item) => item?.status === 'succeeded');
      assert.equal(completedCompiler.result.artifactIdentity, built.artifactIdentity);
      assert.equal(completedCompiler.result.inputIdentity, built.inputIdentity);
      assert.equal(typeof completedCompiler.result.artifact.hex, 'string');
      assert.deepEqual(built.lock, preflight.lock);
      stage = 'one-worker-run';
      await page.click('#quick-run');
      const deadline = Date.now() + observationWallMilliseconds;
      while (Date.now() < deadline && native.levels.length < 2) {
        const sample = await page.evaluate(() => {
          const runtime = window.__M6_STATE__.runtime;
          const led = runtime?.circuit?.leds?.find((item) => item.componentId === 'led-1');
          const pin = runtime?.pins?.find((item) => item.pin === 'D3');
          const visual = document.querySelector('#component-layer [data-led-id="led-1"]');
          return runtime && led && pin ? { cycle: runtime.cycle, duty: pin.pwm?.duty,
            brightness: led.brightness, domBrightness: visual?.dataset.brightness,
            currentAmps: led.currentAmps, opacity: visual?.style.opacity,
            label: visual?.getAttribute('aria-label'), artifactIdentity: window.__M6_STATE__.artifactIdentity,
            runtimeIdentity: structuredClone(runtime.runtimeIdentity),
            modelExecutionContextSha256: runtime.modelExecutionContextSha256 } : null;
        });
        if (sample) { rawCapture.samples.push(sample); persistRaw('runtime-snapshot-captured'); }
        if (sample?.cycle > 50_000_000) throw new Error('PWM_NATIVE_CYCLE_LIMIT');
        const domMatches = sample?.domBrightness === sample?.brightness?.toFixed(3);
        if (sample && domMatches && sample.duty > 0 && sample.duty < 1
            && !native.levels.some((item) => Math.abs(item.duty - sample.duty) < 1e-9)) native.levels.push(sample);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert(native.levels.length >= 2);
      const expectedDuties = [64 / 255, 191 / 255];
      for (const [index, sample] of [...native.levels].sort((a, b) => a.duty - b.duty).entries()) {
        assert(Math.abs(sample.duty - expectedDuties[index]) <= 1 / 255);
        assert(Math.abs(sample.currentAmps - idealFull.currentAmps * sample.duty) < 1e-12);
        assert(Math.abs(sample.brightness - idealFull.brightness * sample.duty) < 1e-12);
        assert.equal(sample.domBrightness, sample.brightness.toFixed(3));
        assert.match(sample.label, /percent ideal relative brightness/u);
        assert.equal(sample.artifactIdentity, built.artifactIdentity);
        assert.equal(sample.runtimeIdentity.artifactIdentity, built.artifactIdentity);
        assert.equal(sample.runtimeIdentity.modelImplementationSha256, CURRENT.implementationSha256);
        assert.equal(sample.runtimeIdentity.modelExecutionContextSha256,
          sample.modelExecutionContextSha256);
        assert.match(sample.modelExecutionContextSha256, /^[a-f0-9]{64}$/u);
        assert.match(sample.runtimeIdentity.workerInstanceNonce, /^[a-f0-9]{32}$/u);
        assert(Number.isSafeInteger(sample.runtimeIdentity.workerInitialization));
        assert(Number.isSafeInteger(sample.runtimeIdentity.runtimeGeneration));
      }
      stage = 'pause';
      await page.click('#quick-pause');
      await page.waitForFunction(() => window.__M6_STATE__.runtime?.paused === true, null, { timeout: 5_000 });
      native.paused = await page.evaluate(() => structuredClone(window.__M6_STATE__.runtime));
      rawCapture.paused = native.paused;
      persistRaw('pause-captured');
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.deepEqual(await page.evaluate(() => window.__M6_STATE__.runtime), native.paused);
      assert.equal(native.paused.runtimeIdentity.artifactIdentity, built.artifactIdentity);
      stage = 'reset';
      await page.click('#quick-reset');
      await page.waitForFunction(() => window.__M6_STATE__.runtime?.circuit?.leds
        ?.find((item) => item.componentId === 'led-1')?.brightness === 0, null, { timeout: 5_000 });
      native.reset = await page.evaluate(() => structuredClone(window.__M6_STATE__.runtime));
      rawCapture.resetOrdinal = 1;
      rawCapture.reset = native.reset;
      persistRaw('reset-captured');
      assert.equal(native.reset.cycle, 0);
      assert.equal(native.reset.runtimeIdentity.artifactIdentity, built.artifactIdentity);
      assert.equal(native.reset.runtimeIdentity.workerInstanceNonce,
        native.paused.runtimeIdentity.workerInstanceNonce);
      assert.equal(native.reset.runtimeIdentity.workerInitialization,
        native.paused.runtimeIdentity.workerInitialization);
      assert.equal(native.reset.runtimeIdentity.runtimeGeneration,
        native.paused.runtimeIdentity.runtimeGeneration);
      native.executed = true;
      assert.equal(await page.evaluate(() => window.__PWM_NATIVE_WORKERS__), 1);
    }

    const finalWorkers = await page.evaluate(() => window.__PWM_NATIVE_WORKERS__);
    if (!activeExecution) {
      assert.equal(finalWorkers, 0);
      assert.deepEqual(requests, []);
    } else {
      assert.equal(requests.filter((item) => item.path === '/api/build').length, 1);
    }
    assert.deepEqual(errors, []);
    evidence = { schema: 'intent-mcu-pwm-native-acceptance@1', status: 'pass',
      mode: execute ? 'native' : fakeExecute ? 'fake-browser' : 'preflight',
      sourceSha256: sha256(mainSource), projectSha256: sha256(preflight.projectText),
      model: CURRENT, graph: { components: preflight.project.circuit.components.length,
        nets: preflight.project.circuit.nets.length, logicChannels: preflight.project.instruments.logicChannels },
      routes: { renderedPaths: preflight.paths, fixtureManhattanLength: routeLength,
        retainedOuterBaseline: 0.9, orthogonal: true, bodyFree: true, manualRoutePreserved: true },
      idealFullLed: idealFull,
      saveOpen: 'byte-equivalent-circuit-and-layout',
      limits: { buildWallMilliseconds: 45_000, observationWallMilliseconds,
        maximumCycle: 50_000_000, pauseWallMilliseconds: 5_000, resetWallMilliseconds: 5_000,
        maximumBuilds: 1, maximumWorkers: 1 },
      native, rawCapture: structuredClone(rawCapture),
      authority: { builds: activeExecution ? 1 : 0, workers: finalWorkers, requests }, errors };
  } catch (error) {
    evidence = { schema: 'intent-mcu-pwm-native-acceptance@1', status: 'failed', stage,
      error: { message: error.message, stack: error.stack }, requests,
      workers: await page.evaluate(() => window.__PWM_NATIVE_WORKERS__).catch(() => null), rawCapture };
    process.exitCode = 1;
  } finally {
    await context.close(); await browser.close();
    if (app) await new Promise((resolve) => app.close(resolve));
    evidence.cleanup = { contextClosed: true, browserClosed: true, serverClosed: true };
    writeEvidence(evidence);
    (evidence.status === 'pass' ? process.stdout : process.stderr).write(`${JSON.stringify(evidence)}\n`);
  }
})();
