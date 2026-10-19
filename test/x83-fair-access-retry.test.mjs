// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http from 'node:http';
import test from 'node:test';

import { C3_LIMITS, createC3PublicService } from '../c3/public-service.mjs';
import {
  COMMAND_SCHEMA as C3_COMMAND_SCHEMA, FQBN as C3_FQBN, PROFILE as C3_PROFILE,
} from '../c3/protocol.mjs';
import { BuildCoordinator } from '../compiler/build-coordinator.mjs';
import { BuildProtocolError } from '../compiler/build-protocol.mjs';
import { createRequestHandler } from '../compiler/http-gateway.mjs';
import { externalClientResult } from '../src/external-client-results.mjs';
import {
  RETRYABLE_CAPACITY_CODES, retryFields, retryGuidanceFromResponse, retryHeaders,
} from '../src/retry-guidance.mjs';
import { STM32_LIMITS, createStm32PublicService } from '../stm32/public-service.mjs';
import {
  STM32_BUILD_SCHEMA, STM32_PROFILE, STM32_RUN_SCHEMA, sourceForStm32,
} from '../stm32/protocol.mjs';

const imageLock = Object.freeze({ image: 'local/not-used:1', imageId: `sha256:${'a'.repeat(64)}`,
  runtimeImageIds: [], toolchainManifestSha256: 'b'.repeat(64) });

async function serve(handler, run) {
  const server = http.createServer((request, response) => { void handler(request, response); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

function assertRetry(response, value, expectedCode) {
  assert.equal(response.status, 429);
  assert.equal(value.code, expectedCode);
  assert.match(response.headers.get('retry-after'), /^[1-9][0-9]{0,2}$/u);
  assert.equal(value.retryAfterSeconds, Number(response.headers.get('retry-after')));
  assert.equal(value.retryAdvisory, true);
  assert.equal(value.retryReservesCapacity, false);
  assert.equal(value.requiresNewRequestId, true);
  const projected = externalClientResult({ ok: false, executed: false, ...value }, {
    requestId: `x83-${expectedCode.toLowerCase()}-01`, action: 'runtime.run',
    profile: 'synthetic-capacity-profile', expectedGeneration: 1,
  });
  assert.equal(projected.category, 'temporarily-busy');
  assert.deepEqual(projected.retry, {
    recommended: true, afterMs: value.retryAfterSeconds * 1000,
    afterSeconds: value.retryAfterSeconds, advisory: true, reservesCapacity: false,
    requiresNewRequestId: true,
  });
}

test('X83 defines positive bounded matching HTTP and JSON guidance for every current 429 code', () => {
  assert.deepEqual(new Set(RETRYABLE_CAPACITY_CODES), new Set([
    'ORIGIN_RATE_LIMIT', 'JOB_CAPACITY', 'BUILD_QUEUE_FULL', 'SESSION_LIMIT',
    'BUILD_CONCURRENCY_LIMIT', 'RUNTIME_CONCURRENCY_LIMIT', 'RATE_LIMIT',
  ]));
  for (const code of RETRYABLE_CAPACITY_CODES) {
    const fields = retryFields(code);
    const headers = retryHeaders(code);
    assert.equal(fields.retryAfterSeconds, Number(headers['Retry-After']));
    assert.ok(fields.retryAfterSeconds >= 1 && fields.retryAfterSeconds <= 300);
    assert.deepEqual(retryGuidanceFromResponse(headers['Retry-After'], fields), {
      afterSeconds: fields.retryAfterSeconds, afterMs: fields.retryAfterSeconds * 1000,
      advisory: true, reservesCapacity: false, requiresNewRequestId: true,
    });
  }
});

test('X83 rejects malformed, missing or mismatched retry guidance without inventing a delay', () => {
  const body = retryFields('BUILD_QUEUE_FULL');
  for (const [header, value] of [[null, body], ['0', body], ['301', body], ['3.5', body],
    ['3', { ...body, retryAfterSeconds: 4 }], ['3', { ...body, retryAdvisory: false }]]) {
    assert.equal(retryGuidanceFromResponse(header, value), null);
  }
  const association = { requestId: 'x83-retry-request-01', action: 'runtime.run',
    profile: 'board.atmega328p-16mhz-v1', expectedGeneration: 1 };
  const missing = externalClientResult({ ok: false, code: 'ACTION_BUSY', executed: false }, association);
  assert.deepEqual(missing.retry, { recommended: false, afterMs: null, afterSeconds: null,
    advisory: true, reservesCapacity: false, requiresNewRequestId: true });
  const valid = externalClientResult({ ok: false, code: 'BUILD_QUEUE_FULL', executed: false,
    ...retryFields('BUILD_QUEUE_FULL', 7) }, association);
  assert.deepEqual(valid.retry, { recommended: true, afterMs: 7000, afterSeconds: 7,
    advisory: true, reservesCapacity: false, requiresNewRequestId: true });
});

test('X83 rate timing derives from the oldest event and rejection starts no additional producer', () => {
  let now = 1_000;
  let producers = 0;
  const coordinator = new BuildCoordinator({ broker: { compile() { producers += 1; } }, imageLock,
    rateLimit: 1, now: () => now });
  coordinator.enforceRate('visitor');
  now += 1_250;
  assert.throws(() => coordinator.enforceRate('visitor'), (error) => {
    assert.equal(error.code, 'ORIGIN_RATE_LIMIT');
    assert.equal(error.retryAfterSeconds, 59);
    return true;
  });
  assert.equal(producers, 0);
});

test('X83 AVR/Pico gateway sends matching retry header and strict body for every coordinator 429', async () => {
  for (const code of ['ORIGIN_RATE_LIMIT', 'JOB_CAPACITY', 'BUILD_QUEUE_FULL']) {
    const coordinator = { submit() { throw new BuildProtocolError(code, code, 429,
      code === 'ORIGIN_RATE_LIMIT' ? 17 : null); } };
    await serve(createRequestHandler({ coordinator, root: new URL('../dist', import.meta.url).pathname }),
      async (base) => {
        const response = await fetch(`${base}/api/build`, { method: 'POST', headers: {
          'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1', Origin: base,
        }, body: '{}' });
        assertRetry(response, await response.json(), code);
      });
  }
});

test('X83 C3 session/build/runtime saturation rejects before a producer and returns coherent guidance', async () => {
  let buildProducerCalls = 0;
  let runtimeProducerCalls = 0;
  const limits = { ...C3_LIMITS, sessions: 2, sessionsPerOrigin: 1,
    concurrentBuilds: 0, concurrentRuntimes: 0 };
  const service = createC3PublicService({ builderImageLock: imageLock, runtimeImageLock: imageLock,
    testMode: true, limits, builder: async () => { buildProducerCalls += 1; },
    runtime: async () => { runtimeProducerCalls += 1; } });
  await serve(service.handle, async (base) => {
    const headers = { 'Content-Type': 'application/json', 'X-Intent-MCU-C3': '1', Origin: base };
    const createdResponse = await fetch(`${base}/api/c3/session`, { method: 'POST', headers, body: '{}' });
    const created = await createdResponse.json();
    const sessionLimit = await fetch(`${base}/api/c3/session`, { method: 'POST', headers, body: '{}' });
    assertRetry(sessionLimit, await sessionLimit.json(), 'SESSION_LIMIT');
    const buildLimit = await fetch(`${base}/api/c3/session/${created.sessionId}/build`, {
      method: 'POST', headers: { ...headers, Authorization: `Bearer ${created.capability}` }, body: '{}',
    });
    assertRetry(buildLimit, await buildLimit.json(), 'BUILD_CONCURRENCY_LIMIT');
    const runtimeLimit = await fetch(`${base}/api/c3/session/${created.sessionId}/command`, {
      method: 'POST', headers: { ...headers, Authorization: `Bearer ${created.capability}` },
      body: JSON.stringify({ schema: C3_COMMAND_SCHEMA, command: 'run', generation: 0,
        profile: C3_PROFILE, fqbn: C3_FQBN, sourceSha256: null, artifactSha256: null,
        circuit: null }),
    });
    assertRetry(runtimeLimit, await runtimeLimit.json(), 'RUNTIME_CONCURRENCY_LIMIT');
  });
  await service.close();
  assert.equal(buildProducerCalls, 0);
  assert.equal(runtimeProducerCalls, 0);
});

test('X83 STM32 build/runtime saturation rejects on HTTP before either producer', async () => {
  let buildProducerCalls = 0;
  let runtimeProducerCalls = 0;
  const source = sourceForStm32('X83 CAPACITY', true);
  const sourceSha256 = createHash('sha256').update(source).digest('hex');
  const service = createStm32PublicService({
    builderImageLock: imageLock, runtimeImageLock: imageLock, testMode: true,
    limits: { ...STM32_LIMITS, concurrentBuilds: 0, concurrentRuntimes: 0 },
    builder: async () => { buildProducerCalls += 1; },
    runtime: async () => { runtimeProducerCalls += 1; },
  });
  await serve(service.handle, async (base) => {
    const headers = { 'Content-Type': 'application/json', 'X-Intent-MCU-STM32': '1', Origin: base };
    const buildLimit = await fetch(`${base}/api/stm32/build`, { method: 'POST', headers,
      body: JSON.stringify({ schema: STM32_BUILD_SCHEMA, profile: STM32_PROFILE,
        sourceRevision: 1, source }) });
    assertRetry(buildLimit, await buildLimit.json(), 'BUILD_CONCURRENCY_LIMIT');
    const runtimeLimit = await fetch(`${base}/api/stm32/run`, { method: 'POST', headers,
      body: JSON.stringify({ schema: STM32_RUN_SCHEMA, profile: STM32_PROFILE,
        sourceRevision: 1, source, sourceSha256, artifact: {} }) });
    assertRetry(runtimeLimit, await runtimeLimit.json(), 'RUNTIME_CONCURRENCY_LIMIT');
  });
  assert.deepEqual(service.metrics(), { builds: 0, runs: 0, failures: 2,
    cancelled: 0, buildInFlight: 0, runtimeInFlight: 0, retainedServerBytes: 0 });
  await service.close();
  assert.equal(buildProducerCalls, 0);
  assert.equal(runtimeProducerCalls, 0);
});

test('X83 STM32 rate window returns exact remaining seconds before producer validation', async () => {
  let now = 10_000;
  let producerCalls = 0;
  const service = createStm32PublicService({ builderImageLock: imageLock, runtimeImageLock: imageLock,
    testMode: true, now: () => now, limits: { ...STM32_LIMITS, rateLimit: 1 },
    builder: async () => { producerCalls += 1; } });
  await serve(service.handle, async (base) => {
    const headers = { 'Content-Type': 'application/json', 'X-Intent-MCU-STM32': '1', Origin: base };
    const first = await fetch(`${base}/api/stm32/build`, { method: 'POST', headers, body: '{}' });
    assert.equal(first.status, 400);
    now += 12_001;
    const limited = await fetch(`${base}/api/stm32/build`, { method: 'POST', headers, body: '{}' });
    const value = await limited.json();
    assertRetry(limited, value, 'RATE_LIMIT');
    assert.equal(value.retryAfterSeconds, 48);
  });
  await service.close();
  assert.equal(producerCalls, 0);
});
