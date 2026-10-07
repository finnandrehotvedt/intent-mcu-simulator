// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(new URL('..', import.meta.url).pathname);
const goodLock = process.env.COMPILER_IMAGE_LOCK
  ? path.resolve(process.env.COMPILER_IMAGE_LOCK)
  : path.join(root, 'compiler/image-lock.json');
const source = (delay) => `void setup(){pinMode(13,OUTPUT);} void loop(){digitalWrite(13,HIGH);delay(${delay});digitalWrite(13,LOW);delay(${delay});}`;

async function startServer(port, lock = goodLock) {
  const output = [];
  const child = spawn(process.execPath, ['staging/server.mjs'], {
    cwd: root,
    env: {
      ...process.env, STAGING_HOST: '127.0.0.1', STAGING_PORT: String(port),
      COMPILER_IMAGE_LOCK: lock, DEPLOYMENT_SCOPE: 'm13-disposable-operations-test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => output.push(chunk.toString('utf8')));
  child.stderr.on('data', (chunk) => output.push(chunk.toString('utf8')));
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`server exited early: ${output.join('')}`);
    try { if ((await fetch(`${base}/healthz`)).status === 200) return { child, base, output }; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  child.kill('SIGTERM');
  throw new Error(`server did not become healthy: ${output.join('')}`);
}

async function stopServer(server) {
  if (server.child.exitCode === null) server.child.kill('SIGTERM');
  await new Promise((resolve) => server.child.once('exit', resolve));
}

async function submit(base, delay) {
  const response = await fetch(`${base}/api/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1', Origin: base },
    body: JSON.stringify({
      schema: 'teach-lab-build-request@1', board: 'board.atmega328p-16mhz-v1',
      files: [{ name: 'main.ino', content: source(delay) }],
    }),
  });
  return { response, body: await response.json() };
}

async function terminal(base, claim) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const response = await fetch(`${base}/api/build/${claim.jobId}`, {
      headers: { Authorization: `Bearer ${claim.capability}` },
    });
    assert.equal(response.status, 200);
    const status = await response.json();
    if (['succeeded', 'failed', 'cancelled', 'timeout'].includes(status.status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('build did not terminate');
}

async function waitForReadiness(server, expectedStatus, expectedCompiler = undefined) {
  const { base } = server;
  let observed;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const response = await fetch(`${base}/readyz`);
    const body = await response.json();
    observed = { status: response.status, compiler: body.compiler };
    if (response.status === expectedStatus && (expectedCompiler === undefined || body.compiler === expectedCompiler)) {
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`readiness did not reach ${expectedStatus}${expectedCompiler ? `/${expectedCompiler}` : ''}; observed ${JSON.stringify(observed)}; server ${server.output.join('').trim()}`);
}

test('OPS-005/OPS-006 private staging restart, unavailable worker and bounded load recover cleanly', { timeout: 180_000 }, async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'intent-mcu-operations-'));
  let server;
  try {
    server = await startServer(18767);
    await waitForReadiness(server, 200, 'READY');
    const startedAt = Date.now();
    const claims = [];
    for (const delay of [151, 152, 153, 154]) {
      const submitted = await submit(server.base, delay);
      assert.equal(submitted.response.status, 202);
      claims.push(submitted.body);
    }
    const overflow = await submit(server.base, 155);
    assert.equal(overflow.response.status, 429);
    assert.equal(overflow.body.code, 'BUILD_QUEUE_FULL');
    const results = await Promise.all(claims.map((claim) => terminal(server.base, claim)));
    const latencyMs = Date.now() - startedAt;
    assert.ok(results.every((result) => result.status === 'succeeded'));
    assert.ok(latencyMs < 120_000, `bounded load took ${latencyMs} ms`);
    const logs = server.output.join('');
    assert.equal(logs.includes('void setup'), false);
    assert.equal(claims.some((claim) => logs.includes(claim.capability)), false);
    await stopServer(server);

    server = await startServer(18767);
    await waitForReadiness(server, 200, 'READY');
    assert.equal((await terminal(server.base, (await submit(server.base, 150)).body)).status, 'succeeded');
    await stopServer(server);

    const missingLock = path.join(temporary, 'missing-image-lock.json');
    await writeFile(missingLock, `${JSON.stringify({
      schema: 'teach-lab-compiler-image-lock@1', image: 'local/intent-mcu-missing:never',
      imageId: `sha256:${'1'.repeat(64)}`, runtimeImageIds: [],
      toolchainManifestSha256: '2'.repeat(64), toolchainFilesSha256: '3'.repeat(64),
      architecture: 'linux/amd64', distribution: 'test-only',
    }, null, 2)}\n`);
    server = await startServer(18768, missingLock);
    await waitForReadiness(server, 503, 'TOOLCHAIN_IMAGE_UNAVAILABLE');
    const unavailableResult = await terminal(server.base, (await submit(server.base, 150)).body);
    assert.equal(unavailableResult.status, 'failed');
    assert.equal(unavailableResult.error, 'BUILD_BROKER_FAILURE');
    await stopServer(server);

    server = await startServer(18768);
    await waitForReadiness(server, 200, 'READY');
    assert.equal((await terminal(server.base, (await submit(server.base, 150)).body)).status, 'succeeded');
    const { stdout } = await execFileAsync('docker', ['ps', '-aq', '--filter', 'label=com.intentforce.teach-lab.role=disposable-build-job']);
    assert.equal(stdout.trim(), '');
    process.stdout.write(`${JSON.stringify({ loadAccepted: 4, queueRejected: 1, latencyMs, restartRecovered: true, unavailableRecovered: true })}\n`);
  } finally {
    if (server?.child.exitCode === null) await stopServer(server);
    await rm(temporary, { recursive: true, force: true });
  }
});
