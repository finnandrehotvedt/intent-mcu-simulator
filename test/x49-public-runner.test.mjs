// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { createX49PrivateWorkerController } from '../src/x49-private.worker.mjs';
import { createX49PublicRunner } from '../src/x49-public-runner.mjs';
import { X49_CASES, X49_FIXTURE_CLASS } from '../src/x49-sensor-offset.mjs';
import { X49_INSTRUMENTED_SOURCE_SHA256 } from '../src/x49-instrumented-fixture-contract.mjs';
import { x49BuildResult, x49PublicState } from './x49-public-fixtures.mjs';

function evidence(caseId, artifactIdentity, fail = false) {
  const expected = X49_CASES.find((item) => item.caseId === caseId);
  return {
    caseId, inputIdentity: expected.inputIdentity, inputAppliedCycle: 0,
    inputRetainedThroughCycle: 2_560_000,
    adc: { schema: 'intent-mcu-x49-adc-observation@1', channel: 1,
      value: expected.calculated.adcCount + (fail ? 1 : 0), startCycle: 2_500_000,
      completionCycle: 2_520_000 },
    firmwareTransaction: { schema: 'intent-mcu-x34-firmware-producer@1',
      fixtureClass: X49_FIXTURE_CLASS, sourceSha256: X49_INSTRUMENTED_SOURCE_SHA256,
      artifactIdentity, commit: 2, temperatureC: expected.calculated.firmwareIntegerC,
      d13Level: expected.calculated.d13Level ? 1 : 0, adcChannel: 1,
      adcValue: expected.calculated.adcCount + (fail ? 1 : 0), adcCompletionCycle: 2_520_000,
      beginCycle: 2_530_000, commitCycle: 2_540_000 },
    pin: { schema: 'intent-mcu-x49-pin-observation@1', pin: 'D13', mode: 'OUTPUT',
      level: expected.calculated.d13Level, observedCycle: 2_550_000 },
    time: { cpuCycles: 2_560_000, virtualMilliseconds: 160 },
    retention: { completeThroughCycle: 2_560_000, droppedTraceRows: 0,
      droppedAdcCompletions: 0, droppedMailboxTransactions: 0,
      retainedMailboxWrites: 5, mailboxWriteLimit: 8 },
  };
}

class MockWorker {
  constructor({ fail = false } = {}) {
    this.listeners = { message: new Set(), error: new Set() };
    this.terminated = false;
    this.controller = createX49PrivateWorkerController({
      emit: (data) => queueMicrotask(() => this.#emit('message', { data })),
      schedule: (callback) => queueMicrotask(callback),
      close: () => { this.terminated = true; },
      runtimeFactory: ({ caseId, probe }) => ({
        runSlice: () => ({ state: 'complete', reason: null,
          evidence: evidence(caseId, probe.artifactIdentity, fail) }),
        cancel: (reason) => ({ terminal: { state: 'incomplete', reason, evidence: null }, newlyTerminal: true }),
        dispose: () => ({ terminal: { state: 'incomplete', reason: 'cancelled', evidence: null }, newlyTerminal: true }),
      }),
    });
  }
  addEventListener(type, listener) { this.listeners[type].add(listener); }
  removeEventListener(type, listener) { this.listeners[type].delete(listener); }
  postMessage(value) { void this.controller.handle(value); }
  terminate() { this.terminated = true; }
  #emit(type, value) { for (const listener of this.listeners[type]) listener(value); }
}

function response(value, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => structuredClone(value) };
}

async function runnerHarness({ failFirst = false } = {}) {
  const state = x49PublicState(); const result = await x49BuildResult();
  const requests = []; const workers = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, method: options.method ?? 'GET' });
    if (url === '/api/build') return response({ jobId: 'job-1', capability: 'memory-only',
      inputIdentity: result.inputIdentity }, 202);
    if (url === '/api/build/job-1' && options.method === 'DELETE') return response({ ok: true });
    if (url === '/api/build/job-1') return response({ status: 'succeeded', result });
    return response({ code: 'NOT_FOUND' }, 404);
  };
  const workerFactory = () => {
    const worker = new MockWorker({ fail: failFirst && workers.length === 0 });
    workers.push(worker); return worker;
  };
  return { state, requests, workers,
    runner: createX49PublicRunner({ contextReader: () => state, fetchImpl, workerFactory,
      buildPollMilliseconds: 1, buildTimeoutMilliseconds: 100, workerTimeoutMilliseconds: 100 }) };
}

test('X49 public runner performs one build, two fresh workers and strict disposal', async () => {
  const harness = await runnerHarness();
  const first = harness.runner.start();
  await assert.rejects(harness.runner.start(), { code: 'X49_PUBLIC_OPERATION_ACTIVE' });
  const result = await first;
  assert.equal(result.phase, 'passed');
  assert.equal(result.projection.academicStatus, 'passed');
  assert.equal(result.projection.physicalStatus, 'absent');
  assert.deepEqual(harness.requests.map((item) => `${item.method} ${item.url}`),
    ['POST /api/build', 'GET /api/build/job-1']);
  assert.equal(harness.workers.length, 2);
  assert.equal(harness.workers.every((worker) => worker.terminated), true);
  assert.equal(harness.runner.active(), false);
});

test('X49 public runner stops before worker two on first-case drift', async () => {
  const harness = await runnerHarness({ failFirst: true });
  await assert.rejects(harness.runner.start(), { code: 'X49_PUBLIC_CASE_1_FAILED' });
  assert.equal(harness.workers.length, 1);
  assert.equal(harness.runner.snapshot().phase, 'failed');
});

test('X49 public runner retires programmatic drift and ignores late build completion', async () => {
  const state = x49PublicState(); const result = await x49BuildResult();
  let releaseStatus; let statusRequested = false;
  const statusGate = new Promise((resolve) => { releaseStatus = resolve; });
  const fetchImpl = async (url, options = {}) => {
    if (url === '/api/build') return response({ jobId: 'job-late', capability: 'memory-only',
      inputIdentity: result.inputIdentity }, 202);
    if (url === '/api/build/job-late' && options.method === 'DELETE') return response({ ok: true });
    if (url === '/api/build/job-late') { statusRequested = true; return statusGate; }
    return response({ code: 'NOT_FOUND' }, 404);
  };
  const runner = createX49PublicRunner({ contextReader: () => state, fetchImpl,
    workerFactory: () => { throw new Error('WORKER_MUST_NOT_START'); },
    buildPollMilliseconds: 1, buildTimeoutMilliseconds: 500, workerTimeoutMilliseconds: 100 });
  const running = runner.start();
  while (!statusRequested) await new Promise((resolve) => setTimeout(resolve, 1));
  state.revision += 1;
  await new Promise((resolve) => setTimeout(resolve, 75));
  assert.equal(runner.snapshot().phase, 'retired');
  releaseStatus(response({ status: 'succeeded', result }));
  await assert.rejects(running, { code: 'X49_PUBLIC_OPERATION_RETIRED' });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(runner.snapshot().phase, 'retired');
});
