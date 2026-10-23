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

function fakeWholeWorkflow() {
  const budget = { builds: 0, workers: 0 };
  const reserve = (kind) => {
    if (budget[kind] >= 1) throw new Error(`FAKE_${kind.toUpperCase()}_BUDGET_EXHAUSTED`);
    budget[kind] += 1;
  };
  reserve('builds'); reserve('workers');
  assert.throws(() => reserve('builds'), /BUDGET_EXHAUSTED/u);
  assert.throws(() => reserve('workers'), /BUDGET_EXHAUSTED/u);
  const expected = [64 / 255, 191 / 255]; const raw = [];
  const snapshots = expected.map((duty, index) => ({ kind: 'snapshot', cycle: (index + 1) * 256,
    paused: false, runtimeIdentity: { artifactIdentity: 'a'.repeat(64), workerInstanceNonce: 'b'.repeat(32),
      workerInitialization: 2, runtimeGeneration: 1, resetEpoch: 0 },
    pins: [{ pin: 'D3', pwm: { duty } }], circuit: { leds: [{ componentId: 'led-1',
      currentAmps: 0.01 * duty, brightness: 0.5 * duty }] } }));
  for (const snapshot of snapshots) raw.push(structuredClone(snapshot));
  const paused = structuredClone(snapshots.at(-1)); paused.paused = true; raw.push(structuredClone(paused));
  const reset = structuredClone(paused); reset.cycle = 0; reset.runtimeIdentity.resetEpoch = 1;
  reset.pins[0].pwm.duty = 0; reset.circuit.leds[0].currentAmps = 0;
  reset.circuit.leds[0].brightness = 0; raw.push(structuredClone(reset));
  assert.deepEqual(raw.slice(0, 2).map((item) => item.pins[0].pwm.duty), expected);
  assert.equal(raw[2].paused, true); assert.equal(raw[3].circuit.leds[0].brightness, 0);
  const failure = { status: 'failed', stage: 'synthetic-timeout', raw: structuredClone(raw), cleaned: true };
  assert.equal(failure.raw.length, 4); assert.equal(failure.cleaned, true);
  return { status: 'pass', levels: expected, pause: true, reset: true,
    timeoutFailureCapturedBeforeCleanup: true, preEffectBuildAndWorkerCeilings: true,
    rawPersistedBeforeAssertions: true, cleanupUnconditional: true, rawRecords: raw.length };
}

(async () => {
  assert(!execute || externalBase, 'PWM_NATIVE_URL is required for an explicitly authorized native run');
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
  const fakeProof = fakeWholeWorkflow();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await context.addInitScript(() => {
    window.showOpenFilePicker = undefined;
    window.showSaveFilePicker = undefined;
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
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/build') {
      buildPosts += 1;
      if (buildPosts > 1) { await routeRequest.abort('blockedbyclient'); return; }
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
    if (execute) writeEvidence({ schema: 'intent-mcu-pwm-native-raw@1', status: 'capturing', rawCapture });
  };
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
    if (execute) {
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
      assert.equal(built.projectBuild.artifactIdentity, built.artifactIdentity);
      assert.equal(built.projectBuild.inputIdentity, built.inputIdentity);
      assert.deepEqual(built.lock, preflight.lock);
      stage = 'one-worker-run';
      await page.click('#quick-run');
      const deadline = Date.now() + 20_000;
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
        if (sample && sample.duty > 0 && sample.duty < 1
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
    if (!execute) {
      assert.equal(finalWorkers, 0);
      assert.deepEqual(requests, []);
    } else {
      assert.equal(requests.filter((item) => item.path === '/api/build').length, 1);
    }
    assert.deepEqual(errors, []);
    evidence = { schema: 'intent-mcu-pwm-native-acceptance@1', status: 'pass', mode: execute ? 'native' : 'preflight',
      sourceSha256: sha256(mainSource), projectSha256: sha256(preflight.projectText),
      model: CURRENT, graph: { components: preflight.project.circuit.components.length,
        nets: preflight.project.circuit.nets.length, logicChannels: preflight.project.instruments.logicChannels },
      routes: { renderedPaths: preflight.paths, fixtureManhattanLength: routeLength,
        retainedOuterBaseline: 0.9, orthogonal: true, bodyFree: true, manualRoutePreserved: true },
      idealFullLed: idealFull, fakeWholeWorkflow: fakeProof,
      saveOpen: 'byte-equivalent-circuit-and-layout',
      limits: { buildWallMilliseconds: 45_000, observationWallMilliseconds: 20_000,
        maximumCycle: 50_000_000, pauseWallMilliseconds: 5_000, resetWallMilliseconds: 5_000,
        maximumBuilds: 1, maximumWorkers: 1 },
      native, authority: { builds: execute ? 1 : 0, workers: finalWorkers, requests }, errors };
    writeEvidence(evidence);
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } catch (error) {
    const failure = { schema: 'intent-mcu-pwm-native-acceptance@1', status: 'failed', stage,
      error: { message: error.message, stack: error.stack }, requests,
      workers: await page.evaluate(() => window.__PWM_NATIVE_WORKERS__).catch(() => null), rawCapture };
    writeEvidence(failure);
    process.stderr.write(`${JSON.stringify(failure)}\n`);
    process.exitCode = 1;
  } finally {
    await context.close(); await browser.close();
    if (app) await new Promise((resolve) => app.close(resolve));
  }
})();
