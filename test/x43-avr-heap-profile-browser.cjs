// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

const base = process.env.X43_HEAP_URL || 'http://127.0.0.1:18886';
const fixturePath = process.env.X43_HEAP_FIXTURE
  || '/srv/codex-workspaces/intentforce-station/handoffs/desktop-etvt6l5-ct109-lab-x70-avr-pico-acceptance-recovery-20261020-001/browser/avr-recovery/failure-state.json';
const fixtureSha256 = '5989993916aa2a07eb2be6ae31546801565e71a7f32484a8715f83f4f2d64946';
const evidenceDir = process.env.X43_HEAP_EVIDENCE_DIR || '';

(async () => {
  const bytes = await readFile(fixturePath);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), fixtureSha256);
  const fixture = JSON.parse(bytes).avrState;
  if (evidenceDir) await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const outside = []; const errors = []; const producerRequests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) outside.push(request.url());
    if (/^\/api\/(build|rp2040|c3|stm32)/u.test(url.pathname)) producerRequests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    window.__X43_HEAP_ACTIVITY__ = { workers: 0, requests: 0 };
    const NativeWorker = window.Worker;
    window.Worker = class CountedWorker extends NativeWorker {
      constructor(...args) { window.__X43_HEAP_ACTIVITY__.workers += 1; super(...args); }
    };
    document.addEventListener('x43-heap-sample-request', (event) => {
      window.__X43_HEAP_ACTIVITY__.requests += 1;
      window.__X43_HEAP_REQUEST_TOKEN__ = event.detail?.token ?? null;
    }, true);
  });
  try {
    assert.equal((await page.goto(base, { waitUntil: 'networkidle' })).status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ === true && window.__X43_AVR_PROFILE__);
    await page.evaluate((source) => {
      const next = structuredClone(source);
      const identity = next.runtime.runtimeIdentity;
      next.runtime.x43HeapProfile = {
        schema: 'intent-mcu-x43-avr-heap-symbols@1', state: 'supported', reason: null,
        artifactIdentity: identity.artifactIdentity, elfSha256: 'd'.repeat(64),
        modelImplementationSha256: identity.modelImplementationSha256,
        modelExecutionContextSha256: identity.modelExecutionContextSha256,
        allocator: 'avr-libc@2.0.0-malloc', symbols: { staticHeapStart: 0x0180,
          brkvalAddress: 0x0110, freeListAddress: 0x0112, heapStartAddress: 0x0114,
          heapEndAddress: 0x0116, marginAddress: 0x0118 },
      };
      next.runtime.x43Heap = null;
      for (const key of ['compilerTarget', 'revision', 'artifactIdentity', 'inputIdentity', 'lifecycle', 'runtime']) {
        window.__M6_STATE__[key] = structuredClone(next[key]);
      }
    }, fixture);
    await page.click('#instruments-open');
    const panel = page.locator('#workbench-instruments-dialog [data-x43-runtime-profile]');
    await panel.waitFor({ state: 'visible' });
    const refresh = () => page.evaluate(() => window.__X43_AVR_PROFILE__.refresh());
    await refresh();
    const button = panel.locator('[data-x43-heap-sample]');
    assert.equal(await button.isEnabled(), true);
    assert.match(await panel.locator('[data-x43-heap-frontier]').textContent(), /Available on explicit request/u);
    await button.click();
    await page.waitForFunction(() => window.__X43_HEAP_REQUEST_TOKEN__);
    await page.evaluate(() => {
      const identity = window.__M6_STATE__.runtime.runtimeIdentity;
      window.__M6_STATE__.runtime.x43Heap = {
        schema: 'intent-mcu-x43-avr-heap-frontier-sample@1',
        token: window.__X43_HEAP_REQUEST_TOKEN__, artifactIdentity: identity.artifactIdentity,
        elfSha256: 'd'.repeat(64), modelImplementationSha256: identity.modelImplementationSha256,
        modelExecutionContextSha256: identity.modelExecutionContextSha256,
        allocator: 'avr-libc@2.0.0-malloc', cycle: 1272247, instructions: 980000,
        stackPointer: 0x08e0, staticHeapStart: 0x0180, configuredHeapStart: 0x0180,
        configuredHeapEnd: null, allocatorMarginBytes: 128, allocatorExtended: true,
        frontier: 0x01c0, frontierToStackAddressGapBytes: 1824, relation: 'separated',
        freeListState: 'present-not-inspected', semantics: { measuresAllocatorFrontier: true,
          measuresHeapContents: false, measuresLiveOrUsedHeapBytes: false,
          measuresFragmentation: false, measuresFreeSram: false, measuresAllocatableRam: false,
          provesNoStackCollision: false, physicalHardwareBenchmark: false },
      };
      window.__X43_AVR_PROFILE__.refresh();
    });
    await page.waitForFunction(() => document.querySelector('[data-x43-heap-frontier]').dataset.status === 'available');
    const view = {
      frontier: await panel.locator('[data-x43-heap-frontier]').textContent(),
      gap: await panel.locator('[data-x43-heap-gap]').textContent(),
      boundary: await panel.locator('[data-x43-heap-boundary]').textContent(),
    };
    assert.match(view.frontier, /0x01c0.*__brkval extended.*cycle 1,272,247/u);
    assert.match(view.gap, /1,824 B address gap.*not free SRAM or allocatable RAM/u);
    assert.match(view.boundary, /contents\/live use\/fragmentation\/collision safety unavailable/u);
    const activity = await page.evaluate(() => ({ ...window.__X43_HEAP_ACTIVITY__,
      runtimeWorkerCreations: window.__M6_STATE__.runtimeWorkerCreations,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    assert.deepEqual(activity, { workers: 0, requests: 1, runtimeWorkerCreations: 0, overflow: 0 });
    assert.deepEqual(outside, []); assert.deepEqual(errors, []); assert.deepEqual(producerRequests, []);
    assert.equal((await context.cookies()).length, 0);
    if (evidenceDir) await panel.screenshot({
      path: path.join(evidenceDir, 'x43-heap-frontier-synthetic-1440x1000.png'),
    });
    process.stdout.write(`${JSON.stringify({ status: 'pass', fixtureSha256,
      authority: 'synthetic presentation fixture; no firmware producer or memory-content authority',
      producers: { builds: 0, runs: 0, scenarios: 0, workers: 0 }, activity, view }, null, 2)}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
