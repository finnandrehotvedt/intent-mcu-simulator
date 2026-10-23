// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));

function retainedElf() {
  const flash = new Uint8Array(0x102); const flashView = new DataView(flash.buffer);
  flashView.setUint32(0, 0x20030000, true); flashView.setUint32(4, 0x08000101, true);
  flashView.setUint16(0x100, 0xe7fe, true);
  const bytes = new Uint8Array(0x100 + flash.byteLength); const view = new DataView(bytes.buffer);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1, 0], 0);
  view.setUint16(16, 2, true); view.setUint16(18, 40, true); view.setUint32(20, 1, true);
  view.setUint32(24, 0x08000101, true); view.setUint32(28, 52, true);
  view.setUint32(36, 0x05000000, true); view.setUint16(40, 52, true);
  view.setUint16(42, 32, true); view.setUint16(44, 1, true); view.setUint32(52, 1, true);
  view.setUint32(56, 0x100, true); view.setUint32(60, 0x08000000, true);
  view.setUint32(64, 0x08000000, true); view.setUint32(68, flash.byteLength, true);
  view.setUint32(72, flash.byteLength, true); view.setUint32(76, 5, true);
  view.setUint32(80, 0x100, true); bytes.set(flash, 0x100);
  return { bytes, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

(async () => {
  const [{ createStm32PublicService }, protocol, { CURRENT_MODEL_LIBRARY_LOCK }] = await Promise.all([
    import('../stm32/public-service.mjs'), import('../stm32/protocol.mjs'), import('../src/model-library.mjs'),
  ]);
  const fixture = retainedElf(); let builderCalls = 0; let runtimeCalls = 0;
  const lock = { image: 'local/fake-process-only:1', imageId: `sha256:${'a'.repeat(64)}`,
    runtimeImageIds: [], toolchainManifestSha256: 'b'.repeat(64) };
  const service = createStm32PublicService({ builderImageLock: lock, runtimeImageLock: lock,
    testMode: true,
    builder: async ({ source, sourceSha256 }) => {
      builderCalls += 1; const parsed = protocol.validateStm32Source(source);
      return { schema: 'intent-mcu-stm32-builder-result@1', status: 'succeeded',
        profile: protocol.STM32_PROFILE, sourceSha256,
        behavior: { pb0: parsed.pb0, marker: parsed.marker, uartText: parsed.uartText },
        elf: { format: 'elf32', bytes: fixture.bytes.byteLength, sha256: fixture.sha256,
          base64: Buffer.from(fixture.bytes).toString('base64') },
        vector: { initialStackPointer: 0x20030000, resetVector: 0x08000101, entryPoint: 0x08000101 },
        compiler: { id: 'arm-none-eabi-gcc', version: '14.3.1', compilerInvoked: true } };
    },
    runtime: async ({ expected }) => { runtimeCalls += 1; return {
      engine: { version: '1.17.0' }, observed: { pb0: expected.pb0, uartText: expected.uartText },
      resetReplay: true,
    }; },
  });
  const root = path.resolve(__dirname, '..', 'dist');
  const server = http.createServer(async (request, response) => {
    if (await service.handle(request, response)) return;
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const file = path.join(root, pathname === '/' ? 'index.html' : pathname.replace(/^\//u, ''));
    if (!file.startsWith(root) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8'
      : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(); const base = `http://127.0.0.1:${server.address().port}/`;
    assert.equal((await page.goto(base, { waitUntil: 'domcontentloaded' })).status(), 200);
    await page.waitForFunction(() => window.__M11_READY__ && window.__AGENT_ACTIONS__);
    await page.selectOption('#board-select', protocol.STM32_PROFILE);
    await page.waitForFunction(() => window.__STM32_PUBLIC_WORKBENCH__?.state().active === true);
    await page.click('#quick-build');
    await page.waitForFunction(() => window.__STM32_PUBLIC_WORKBENCH__.state().phase === 'built');
    await page.click('#brief-tests-open'); await page.click('#x92-budget-start');
    const result = await page.evaluate(() => window.__AGENT_ACTIONS__.execute(
      window.__AGENT_ACTIONS__.request('runtime.run', {},
        { requestId: 'x92-stm32-real-http-join', ttlMs: 30000 })));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.privatePermitAccepted, true);
    assert.equal(result.result.runtime.engine.actualExecution, true);
    assert.equal(result.completion.processExited, true);
    assert.equal(result.completion.daemonContainerAbsent, true);
    assert.equal(result.completion.completedNaturally, true);
    assert.equal(result.result.executionIdentity.modelIdentity,
      `sha256:${CURRENT_MODEL_LIBRARY_LOCK.implementationSha256}`);
    assert.deepEqual(service.metrics(), { builds: 1, runs: 1, failures: 0, cancelled: 0,
      buildInFlight: 0, runtimeInFlight: 0, retainedServerBytes: 0 });
    assert.equal(builderCalls, 1); assert.equal(runtimeCalls, 1);
    process.stdout.write(`${JSON.stringify({ status: 'pass', transport: 'real-http-service',
      processProviders: 'fake-only', modelIdentity: result.result.executionIdentity.modelIdentity })}\n`);
  } finally {
    await browser.close(); await service.close(); await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
