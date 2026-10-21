// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { createThermostatExperiment } from '../src/thermostat-experiment.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { MODEL_RUNTIME_BINDING_SCHEMA } from '../src/runtime-identity.mjs';
import { X47_RUNTIME_AUTHORITY_SCHEMA, createX47WorkerBinding } from '../src/x47-runtime-transaction.mjs';
import {
  canonicalX47RepeatableText, createX47RepeatableApplyRequest,
  createX47RepeatableContext, createX47RepeatableRecord,
} from '../src/x47-repeatable-inputs.mjs';

const messages = [];
globalThis.crypto ??= webcrypto;
globalThis.self = globalThis;
globalThis.postMessage = (value) => messages.push(structuredClone(value));
globalThis.close = () => {};
await import(`../src/simulator.worker.mjs?x47-repeatable=${Date.now()}`);

async function send(data, accept) {
  const start = messages.length;
  globalThis.self.onmessage({ data });
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const found = messages.slice(start).find(accept);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('X47_REPEATABLE_WORKER_TIMEOUT');
}

test('paused worker accepts one bound A1 schedule; overlap, Reset and Dispose fail closed', async () => {
  const opened = openCandidateUiSession(createThermostatExperiment().text);
  assert.equal(opened.ok, true);
  const visual = opened.session.visualProject.circuit;
  const runtimeCircuit = opened.session.runtimeProject.circuit;
  const context = await createX47RepeatableContext('board.atmega328p-16mhz-v1', 2, 0, visual);
  const runtimeBinding = { schema: MODEL_RUNTIME_BINDING_SCHEMA, projectGeneration: 2,
    runtimeGeneration: 4, artifactIdentity: 'a'.repeat(64),
    modelImplementationSha256: CURRENT_MODEL_LIBRARY_LOCK.implementationSha256,
    modelExecutionContextSha256: 'b'.repeat(64) };
  const authority = { schema: X47_RUNTIME_AUTHORITY_SCHEMA,
    profile: 'board.atmega328p-16mhz-v1', projectGeneration: 2, buildGeneration: 3,
    sourceProjectRevision: 0, sourceSha256: 'c'.repeat(64), graphIdentity: context.graphIdentity,
    inputIdentitySha256: 'd'.repeat(64), artifactIdentity: runtimeBinding.artifactIdentity,
    runtimeGeneration: runtimeBinding.runtimeGeneration,
    modelImplementationSha256: runtimeBinding.modelImplementationSha256,
    modelExecutionContextSha256: runtimeBinding.modelExecutionContextSha256 };
  const ready = await send({ command: 'init', hex: ':00000001FF', circuit: runtimeCircuit,
    modelLibraryLock: CURRENT_MODEL_LIBRARY_LOCK,
    modelImplementationSha256: runtimeBinding.modelImplementationSha256,
    modelExecutionContextSha256: runtimeBinding.modelExecutionContextSha256,
    runtimeBinding, x47RuntimeAuthority: authority }, (value) => value.kind === 'ready');
  const binding = createX47WorkerBinding(authority, ready.runtimeIdentity);
  const record = createX47RepeatableRecord('ramp', { startTemperatureC: 20,
    endTemperatureC: 40, eventCount: 3, startOffsetCycles: 10, stepCycles: 10 }, context);
  const canonical = canonicalX47RepeatableText(record, context);
  const digest = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)))
    .toString('hex');
  const request = createX47RepeatableApplyRequest({ transactionId: 'x47-ramp-worker',
    canonicalScheduleSha256: digest, binding, expectedBaseCycle: 0, record }, authority,
  ready.runtimeIdentity);
  const wrongBase = { ...structuredClone(request), expectedBaseCycle: 1 };
  const rejectedBase = await send({ command: 'x47-repeatable-apply', request: wrongBase },
    (value) => value.kind === 'x47-repeatable-rejected');
  assert.equal(rejectedBase.reason, 'X47_REPEATABLE_PAUSED_BASE_REQUIRED');
  assert.equal(rejectedBase.paused, true);
  const accepted = await send({ command: 'x47-repeatable-apply', request },
    (value) => value.kind === 'x47-repeatable-accepted');
  assert.equal(accepted.retained, 3); assert.equal(accepted.dropped, 0);
  assert.deepEqual(accepted.events.map((item) => item.targetCycle), [10, 20, 30]);
  const overlap = await send({ command: 'x47-repeatable-apply', request },
    (value) => value.kind === 'x47-repeatable-rejected');
  assert.equal(overlap.reason, 'X47_REPEATABLE_OVERLAP');
  assert.equal(overlap.paused, true);
  assert.equal(overlap.transactionId, request.transactionId);
  assert.equal(overlap.canonicalScheduleSha256, request.canonicalScheduleSha256);
  await send({ command: 'reset' }, (value) => value.kind === 'reset');
  const stale = await send({ command: 'x47-repeatable-apply', request },
    (value) => value.kind === 'x47-repeatable-rejected');
  assert.equal(stale.reason, 'X47_REPEATABLE_RUNTIME_UNAVAILABLE');

  const readyAfterReset = await send({ command: 'init', hex: ':00000001FF', circuit: runtimeCircuit,
    modelLibraryLock: CURRENT_MODEL_LIBRARY_LOCK,
    modelImplementationSha256: runtimeBinding.modelImplementationSha256,
    modelExecutionContextSha256: runtimeBinding.modelExecutionContextSha256,
    runtimeBinding, x47RuntimeAuthority: authority }, (value) => value.kind === 'ready');
  const requestAfterReset = createX47RepeatableApplyRequest({ transactionId: 'x47-ramp-dispose',
    canonicalScheduleSha256: digest,
    binding: createX47WorkerBinding(authority, readyAfterReset.runtimeIdentity),
    expectedBaseCycle: 0, record }, authority, readyAfterReset.runtimeIdentity);
  await send({ command: 'x47-repeatable-apply', request: requestAfterReset },
    (value) => value.kind === 'x47-repeatable-accepted');
  await send({ command: 'dispose', disposeToken: 'x47-repeatable-dispose' },
    (value) => value.kind === 'disposed');
  const disposed = await send({ command: 'x47-repeatable-apply', request: requestAfterReset },
    (value) => value.kind === 'error');
  assert.equal(disposed.message, 'Worker is not initialized');
});
