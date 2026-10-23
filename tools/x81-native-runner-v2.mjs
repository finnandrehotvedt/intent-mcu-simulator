#!/usr/bin/env node
// Private, separately authorized qualification. This file does not build JS or images.
import { open, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { normalizeBuildRequestValue, buildInputIdentity, BUILD_REQUEST_SCHEMA, BOARD_PROFILE } from '../compiler/build-protocol.mjs';
import { compileHeadlessAvr } from '../src/headless-compiler-client.mjs';
import { digest, validateX81CompilerResult, validateX81Pair } from './x81-native-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'void setup(){pinMode(13,OUTPUT);}void loop(){digitalWrite(13,HIGH);}';
const FILES = ['toolchain/manifest.json', 'src/model-library.mjs', 'src/simulator.worker.mjs',
  'src/runtime-kernel.mjs', 'compiler/build-protocol.mjs', 'compiler/build-worker.mjs',
  'dist/simulator.worker.js', 'dist/x81-worker-browser-entry.js'];
const exact = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
async function checkpoint(directory, name, value) {
  const handle = await open(path.join(directory, name), 'wx', 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); await handle.sync(); }
  finally { await handle.close(); }
}

export async function qualify(authorityPath, outputDirectory) {
  const authority = JSON.parse(await readFile(authorityPath, 'utf8'));
  if (authority.schema !== 'intent-mcu-x81-native-authority@1'
      || !/^desktop-[a-z0-9-]+$/u.test(authority.receiptId)
      || !exact(authority.budget, { builds: 1, workerExecutions: 2, scenarios: 0, retries: 0, images: 0 })
      || !Number.isSafeInteger(authority.expiresAt) || Date.now() >= authority.expiresAt
      || !Number.isSafeInteger(authority.timeoutMs) || authority.timeoutMs < 1000 || authority.timeoutMs > 180000
      || Object.keys(authority.files ?? {}).sort().join('\n') !== [...FILES].sort().join('\n')) throw Error('X81_AUTHORITY_INVALID');
  const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (commit !== authority.gitCommit) throw Error('X81_SOURCE_MISMATCH');
  for (const file of FILES) {
    if (digest(await readFile(path.join(root, file))) !== authority.files[file]) throw Error(`X81_PIN_MISMATCH:${file}`);
  }
  await mkdir(outputDirectory, { recursive: false, mode: 0o700 });
  // Authority consumption is permanent and shared across output directories.
  const gateDirectory = path.resolve(authority.gateDirectory);
  await mkdir(gateDirectory, { recursive: true, mode: 0o700 });
  const ticket = await open(path.join(gateDirectory, `${authority.receiptId}.consumed`), 'wx', 0o600);
  try { await ticket.writeFile(digest(await readFile(authorityPath))); await ticket.sync(); }
  finally { await ticket.close(); }
  const usage = { builds: 0, workerExecutions: 0, scenarios: 0, retries: 0, images: 0 };
  const abort = new AbortController();
  const deadline = Math.min(authority.expiresAt, Date.now() + authority.timeoutMs);
  const timer = setTimeout(() => abort.abort(), Math.max(0, deadline - Date.now()));
  let browser, server;
  const admission = async (kind) => {
    if (abort.signal.aborted || Date.now() >= deadline) throw Error('X81_DEADLINE');
    const limit = kind === 'builds' ? 1 : 2;
    if (usage[kind] >= limit) throw Error('X81_BUDGET_EXHAUSTED');
    usage[kind]++;
    await checkpoint(outputDirectory, `reservation-${kind}-${usage[kind]}.json`, { usage, deadline });
    if (abort.signal.aborted || Date.now() >= deadline) throw Error('X81_DEADLINE');
  };
  try {
    await checkpoint(outputDirectory, 'authority.json', { authority, commit });
    const request = normalizeBuildRequestValue({ schema: BUILD_REQUEST_SCHEMA, board: BOARD_PROFILE,
      files: [{ name: 'main.ino', content: SOURCE }] });
    const expectedInputIdentity = buildInputIdentity(request, { imageId: authority.compilerImageId,
      toolchainManifestSha256: authority.toolchainManifestSha256 });
    await checkpoint(outputDirectory, 'build-request.json', request);
    await admission('builds');
    const artifact = await compileHeadlessAvr(request, { signal: abort.signal });
    await checkpoint(outputDirectory, 'build-response.json', artifact);
    if (artifact.inputIdentity !== expectedInputIdentity) throw Error('X81_BUILD_INPUT_SUBSTITUTED');
    const domains = validateX81CompilerResult(artifact);
    // Pin actual image identity as emitted by the existing fixed compiler contract.
    if (artifact.toolchainImageId !== authority.compilerImageId
        || artifact.toolchainIdentitySha256 !== authority.toolchainManifestSha256) throw Error('X81_COMPILER_IMAGE_JOIN_REQUIRED');
    const require = createRequire(import.meta.url);
    const { chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_MODULES || '/runner/node_modules', 'playwright'));
    // Expose only the frozen dist, no product app or endpoints and no public port.
    const dist = path.join(root, 'dist');
    server = createServer(async (req, res) => {
      try {
        if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><script type="module" src="/x81-worker-browser-entry.js"></script>'); return; }
        const relative = new URL(req.url, 'http://localhost').pathname.slice(1);
        const file = path.resolve(dist, relative);
        if (!file.startsWith(`${dist}${path.sep}`)) throw Error('PATH');
        res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(file));
      } catch { res.writeHead(404); res.end(); }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    abort.signal.addEventListener('abort', () => { void browser?.close(); }, { once: true });
    const page = await browser.newPage();
    await page.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin);
    await page.waitForFunction(() => globalThis.__X81_PRIVATE_WORKER__);
    const context = await page.evaluate(() => globalThis.__X81_PRIVATE_WORKER__.qualificationContext());
    if (context.modelLibraryLock.implementationSha256 !== authority.modelImplementationSha256) throw Error('X81_MODEL_MISMATCH');
    await checkpoint(outputDirectory, 'context.json', context);
    const executionContext = digest(JSON.stringify({ request, circuit: context.circuit,
      modelLibraryLock: context.modelLibraryLock, schedule: { startInstruction: 1, endInstruction: 512 } }));
    const runs = [];
    for (let n = 1; n <= 2; n++) {
      const binding = { schema: 'intent-mcu-runtime-binding@2', projectGeneration: 1, runtimeGeneration: n,
        artifactIdentity: domains.artifactIdentity, modelImplementationSha256: authority.modelImplementationSha256,
        modelExecutionContextSha256: executionContext };
      await checkpoint(outputDirectory, `run-${n}-request.json`, { binding, domains, endInstruction: 512 });
      await admission('workerExecutions');
      const response = await page.evaluate(async ({ hex, binding }) => {
        try { return { ok: true, value: await globalThis.__X81_PRIVATE_WORKER__.runX81Worker({
          hex, binding, workerUrl: '/simulator.worker.js', endInstruction: 512 }) }; }
        catch (error) { return { ok: false, error: error.message, partial: error.x81Partial ?? [] }; }
      }, { hex: artifact.artifact.hex, binding });
      await checkpoint(outputDirectory, `run-${n}-response.json`, response);
      if (!response.ok) throw Error(response.error);
      if (!exact(response.value.binding, binding)) throw Error('X81_BINDING_MISMATCH');
      runs.push(response.value);
    }
    validateX81Pair(runs);
    if (abort.signal.aborted || Date.now() >= deadline) throw Error('X81_DEADLINE');
    const result = { schema: 'intent-mcu-x81-raw-qualification@1', usage, domains, executionContext,
      observedBehavior: 'checked-equal', independentRebuildBytes: 'not-checked',
      scope: 'paused exact first 512 AVR instructions; ideal CPU/GPIO/UART; no physical equivalence' };
    await checkpoint(outputDirectory, 'accepted.json', result);
    return result;
  } catch (error) {
    await checkpoint(outputDirectory, 'failed.json', { error: error.message, usage }); throw error;
  } finally {
    clearTimeout(timer); await browser?.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    await checkpoint(outputDirectory, 'terminal.json', { terminal: true, usage });
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw Error('usage: node tools/x81-native-runner-v2.mjs AUTHORITY.json NEW_PRIVATE_EVIDENCE_DIRECTORY');
  await qualify(process.argv[2], process.argv[3]);
}
