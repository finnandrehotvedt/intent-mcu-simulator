// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createX49PrivateWorkerController } from '../src/x49-private.worker.mjs';
import { x49PrivateExecutionContext } from '../src/x49-private-runtime-contract.mjs';
import { X49_EXPERIMENT_BINDING_SCHEMA, X49_FIXTURE_CLASS, X49_PROFILE } from '../src/x49-sensor-offset.mjs';
import {
  X49_INSTRUMENTED_FIXTURE_ID, X49_INSTRUMENTED_SOURCE_SHA256,
  X49_PROBE_SYMBOL, X49_RUNTIME_PROBE_SCHEMA,
} from '../src/x49-instrumented-fixture-contract.mjs';

const manifest = JSON.parse(await readFile(new URL('../src/x49-private-runtime-manifest.json', import.meta.url)));
const artifactIdentity = '2'.repeat(64); const receiptNonce = 'a'.repeat(32);
const hexSha256 = '8ff380455776389e7f113d525a23d5b7b449afc859b07b25ca23a8b9c3c13d89';
const cryptoImpl = { subtle: crypto.subtle,
  getRandomValues(value) { value.fill(7); return value; } };
const stable = (value) => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const sha256 = (value) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

async function init() {
  const probe = { schema: X49_RUNTIME_PROBE_SCHEMA, fixtureId: X49_INSTRUMENTED_FIXTURE_ID,
    sourceSha256: X49_INSTRUMENTED_SOURCE_SHA256, artifactIdentity,
    symbol: { symbol: X49_PROBE_SYMBOL, dataAddress: 0x100, size: 4,
      elfSha256: '6'.repeat(64), binding: 'global', type: 'object' } };
  const experimentBinding = { schema: X49_EXPERIMENT_BINDING_SCHEMA, profile: X49_PROFILE,
    projectGeneration: 9, graphIdentity: `sha256:${'5'.repeat(64)}`,
    sourceSha256: probe.sourceSha256, artifactIdentity,
    modelImplementationSha256: manifest.implementationSha256,
    modelExecutionContextSha256: '0'.repeat(64), fixtureClass: X49_FIXTURE_CLASS,
    componentId: 'temperature-sensor-1', boardPin: 'A1' };
  const context = await x49PrivateExecutionContext({ manifest, probe, experimentBinding,
    hexSha256 }, cryptoImpl);
  experimentBinding.modelExecutionContextSha256 = context;
  return { command: 'init', manifest, hex: ':00000001FF', hexSha256, probe,
    caseId: 'baseline-offset-0', experimentBinding,
    runtimeBinding: { schema: 'intent-mcu-runtime-binding@2', projectGeneration: 9,
      runtimeGeneration: 10, artifactIdentity,
      modelImplementationSha256: manifest.implementationSha256,
      modelExecutionContextSha256: context }, receiptNonce };
}

class FakeRuntime {
  constructor() { this.calls = 0; this.terminal = null; this.disposed = false; }
  runSlice() { this.calls += 1; this.terminal ??= { state: 'complete', reason: null,
    evidence: { sampleCycle: 2_560_000 } }; return this.terminal; }
  cancel(reason) { const first = !this.terminal; this.terminal ??= { state: 'incomplete', reason, evidence: null };
    return { terminal: this.terminal, newlyTerminal: first }; }
  dispose() { const result = this.cancel('cancelled'); this.disposed = true; return result; }
}

function harness(selectedCrypto = cryptoImpl) {
  const emitted = []; const scheduled = []; let closed = 0; let runtime;
  const controller = createX49PrivateWorkerController({ emit: (value) => emitted.push(value),
    schedule: (callback) => scheduled.push(callback), close: () => { closed += 1; },
    cryptoImpl: selectedCrypto,
    runtimeFactory: () => (runtime = new FakeRuntime()) });
  return { controller, emitted, scheduled, closed: () => closed, runtime: () => runtime };
}

test('private worker emits one terminal and cancel-after-terminal is idempotent', async () => {
  const value = harness(); await value.controller.handle(await init());
  await value.controller.handle({ command: 'observe-first', receiptNonce });
  assert.equal(value.scheduled.length, 1); value.scheduled.shift()();
  assert.equal(value.emitted.filter((item) => item.kind === 'terminal').length, 1);
  assert.equal(value.emitted.find((item) => item.kind === 'terminal')
    .terminal.experimentBinding.graphIdentity, `sha256:${'5'.repeat(64)}`);
  await value.controller.handle({ command: 'cancel', receiptNonce });
  assert.equal(value.emitted.filter((item) => item.kind === 'terminal').length, 1);
  assert.equal(value.emitted.at(-1).kind, 'cancel-ack');
  assert.equal(value.emitted.at(-1).terminalAlready, true);
});

test('worker rejects a self-consistent manifest that differs from its loaded trust anchor', async () => {
  const request = await init(); request.manifest = structuredClone(request.manifest);
  request.manifest.runtimeMembers[0].sha256 = '9'.repeat(64);
  request.manifest.implementationSha256 = sha256({ runtimeMembers: request.manifest.runtimeMembers,
    externalContracts: request.manifest.externalContracts });
  const semantic = structuredClone(request.manifest); delete semantic.semanticSha256;
  request.manifest.semanticSha256 = sha256(semantic);
  const value = harness(); await value.controller.handle(request);
  assert.equal(value.emitted.at(-1).code, 'X49_PRIVATE_MANIFEST_TRUST_INVALID');
  assert.equal(value.controller.snapshot().initialized, false);
});

test('cancel retires held slice and dispose cleans up without a second terminal', async () => {
  const value = harness(); await value.controller.handle(await init());
  await value.controller.handle({ command: 'observe-first', receiptNonce });
  await value.controller.handle({ command: 'cancel', receiptNonce });
  value.scheduled.shift()();
  assert.equal(value.runtime().calls, 0);
  assert.equal(value.emitted.filter((item) => item.kind === 'terminal').length, 1);
  await value.controller.handle({ command: 'dispose', disposeToken: 'dispose-1' });
  assert.equal(value.runtime().disposed, true);
  assert.equal(value.emitted.filter((item) => item.kind === 'terminal').length, 1);
  assert.equal(value.closed(), 1);
  await value.controller.handle({ command: 'dispose', disposeToken: 'dispose-1' });
  assert.equal(value.emitted.at(-1).kind, 'disposed');
  assert.equal(value.emitted.at(-1).idempotent, true);
  assert.equal(value.emitted.at(-1).runtimeIdentity.workerInstanceNonce, '07'.repeat(16));
  assert.equal(value.closed(), 1);
});

function heldCrypto() {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  return { release, value: { getRandomValues: cryptoImpl.getRandomValues,
    subtle: { async digest(...args) { await held; return crypto.subtle.digest(...args); } } } };
}

test('pending digest rejects duplicate init and cancel retires it without late resurrection', async () => {
  const digest = heldCrypto(); const value = harness(digest.value); const request = await init();
  const pending = value.controller.handle(request);
  assert.equal(value.controller.snapshot().initializing, true);
  await value.controller.handle(structuredClone(request));
  assert.equal(value.emitted.at(-1).code, 'X49_PRIVATE_ALREADY_INITIALIZED');
  await value.controller.handle({ command: 'cancel', receiptNonce });
  assert.equal(value.emitted.at(-1).initializationRetired, true);
  digest.release(); await pending;
  assert.equal(value.controller.snapshot().initialized, false);
  assert.equal(value.emitted.some((item) => item.kind === 'ready'), false);
  assert.equal(value.runtime(), undefined);
});

test('dispose retires pending digest and remains finite after late validation completion', async () => {
  const digest = heldCrypto(); const value = harness(digest.value); const pending = value.controller.handle(await init());
  await value.controller.handle({ command: 'dispose', disposeToken: 'pending-dispose' });
  assert.equal(value.closed(), 1);
  digest.release(); await pending;
  assert.equal(value.controller.snapshot().initialized, false);
  assert.equal(value.emitted.some((item) => item.kind === 'ready'), false);
  await value.controller.handle({ command: 'dispose', disposeToken: 'pending-dispose' });
  assert.equal(value.emitted.at(-1).idempotent, true);
  assert.equal(value.closed(), 1);
});
