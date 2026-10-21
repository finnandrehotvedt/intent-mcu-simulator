// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { createX49PrivateWorkerController } from '../src/x49-private.worker.mjs';
import { classifyX49PublicCase, createX49PublicRunner } from '../src/x49-public-runner.mjs';
import { captureX49PublicAuthority } from '../src/x49-public-run-contract.mjs';
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
  constructor({ fail = false, incomplete = false, dropped = false } = {}) {
    this.listeners = { message: new Set(), error: new Set() };
    this.terminated = false;
    this.controller = createX49PrivateWorkerController({
      emit: (data) => queueMicrotask(() => this.#emit('message', { data })),
      schedule: (callback) => queueMicrotask(callback),
      close: () => { this.terminated = true; },
      runtimeFactory: ({ caseId, probe }) => ({
        runSlice: () => {
          if (incomplete) return { state: 'incomplete', reason: 'infrastructure-failure', evidence: null };
          const observed = evidence(caseId, probe.artifactIdentity, fail);
          if (dropped) observed.retention.droppedTraceRows = 1;
          return { state: 'complete', reason: null, evidence: observed };
        },
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

async function runnerHarness({ failFirst = false, incompleteFirst = false, droppedFirst = false } = {}) {
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
    const worker = new MockWorker({ fail: failFirst && workers.length === 0,
      incomplete: incompleteFirst && workers.length === 0,
      dropped: droppedFirst && workers.length === 0 });
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

test('X49 public runner keeps incomplete and dropped evidence indeterminate', async () => {
  for (const option of [{ incompleteFirst: true }, { droppedFirst: true }]) {
    const harness = await runnerHarness(option);
    await assert.rejects(harness.runner.start(), { code: 'X49_PUBLIC_CASE_1_INDETERMINATE' });
    assert.equal(harness.workers.length, 1);
    assert.equal(harness.runner.snapshot().phase, 'indeterminate');
  }
});

test('X49 public case classification reserves failed for complete observed contradictions', () => {
  const expected = X49_CASES[0];
  const observed = evidence(expected.caseId, 'artifact');
  assert.equal(classifyX49PublicCase({ state: 'complete', reason: null, evidence: observed }, expected).status,
    'passed');
  observed.inputIdentity = 'stale-input';
  assert.equal(classifyX49PublicCase({ state: 'complete', reason: null, evidence: observed }, expected).status,
    'indeterminate');
  observed.inputIdentity = expected.inputIdentity; observed.adc.value += 1;
  assert.equal(classifyX49PublicCase({ state: 'complete', reason: null, evidence: observed }, expected).status,
    'failed');
});

test('X49 public runner claims an epoch before held authority capture and cannot resurrect', async () => {
  const state = x49PublicState(); const authority = await captureX49PublicAuthority(state);
  let release; const held = new Promise((resolve) => { release = resolve; });
  let fetches = 0; let workers = 0;
  const runner = createX49PublicRunner({ contextReader: () => state,
    captureAuthority: () => held,
    fetchImpl: async () => { fetches += 1; throw new Error('FETCH_MUST_NOT_RUN'); },
    workerFactory: () => { workers += 1; throw new Error('WORKER_MUST_NOT_RUN'); } });
  const running = runner.start();
  assert.equal(runner.active(), true);
  await assert.rejects(runner.start(), { code: 'X49_PUBLIC_OPERATION_ACTIVE' });
  await runner.cancel('X49_PUBLIC_USER_CANCELLED');
  release(authority);
  await assert.rejects(running, { code: 'X49_PUBLIC_OPERATION_RETIRED' });
  assert.equal(runner.snapshot().phase, 'cancelled');
  assert.deepEqual({ fetches, workers }, { fetches: 0, workers: 0 });
});

test('X49 public runner rechecks its token after a held authority digest', async () => {
  const state = x49PublicState(); const authority = await captureX49PublicAuthority(state);
  let release; const held = new Promise((resolve) => { release = resolve; });
  let fetches = 0;
  const runner = createX49PublicRunner({ contextReader: () => state,
    captureAuthority: async () => authority, authorityStillCurrent: () => held,
    fetchImpl: async () => { fetches += 1; throw new Error('FETCH_MUST_NOT_RUN'); },
    workerFactory: () => { throw new Error('WORKER_MUST_NOT_RUN'); } });
  const running = runner.start();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await runner.retire('X49_PUBLIC_SOURCE_EDITED');
  release(true);
  await assert.rejects(running, { code: 'X49_PUBLIC_OPERATION_RETIRED' });
  assert.equal(fetches, 0);
});

test('held authority digest cannot hide synchronous project drift before POST', async () => {
  const state = x49PublicState(); const authority = await captureX49PublicAuthority(state);
  let release; const held = new Promise((resolve) => { release = resolve; });
  let fetches = 0; let workers = 0;
  const runner = createX49PublicRunner({ contextReader: () => state,
    captureAuthority: async () => authority, authorityStillCurrent: () => held,
    fetchImpl: async () => { fetches += 1; throw new Error('FETCH_MUST_NOT_RUN'); },
    workerFactory: () => { workers += 1; throw new Error('WORKER_MUST_NOT_RUN'); } });
  const running = runner.start();
  await new Promise((resolve) => setTimeout(resolve, 0));
  state.revision += 1; state.buildState = 'dirty-programmatic-change';
  release(true);
  await assert.rejects(running, { code: 'X49_PUBLIC_AUTHORITY_RETIRED' });
  assert.deepEqual({ fetches, workers }, { fetches: 0, workers: 0 });
  assert.equal(runner.snapshot().phase, 'indeterminate');
});

test('authoring offset and revision are operation authority', async () => {
  const state = x49PublicState(); const authority = await captureX49PublicAuthority(state);
  const authored = { offsetC: 1, revision: 3 };
  let release; const held = new Promise((resolve) => { release = resolve; });
  let fetches = 0;
  const runner = createX49PublicRunner({ contextReader: () => state, authoringReader: () => authored,
    captureAuthority: async () => authority, authorityStillCurrent: () => held,
    fetchImpl: async () => { fetches += 1; throw new Error('FETCH_MUST_NOT_RUN'); },
    workerFactory: () => { throw new Error('WORKER_MUST_NOT_RUN'); } });
  const running = runner.start();
  await new Promise((resolve) => setTimeout(resolve, 0));
  authored.offsetC = 0; authored.revision += 1; release(true);
  await assert.rejects(running, { code: 'X49_PUBLIC_AUTHORING_RETIRED' });
  assert.equal(fetches, 0);

  const ineligible = createX49PublicRunner({ contextReader: () => state,
    authoringReader: () => ({ offsetC: 0, revision: 1 }),
    fetchImpl: async () => { fetches += 1; throw new Error('FETCH_MUST_NOT_RUN'); },
    workerFactory: () => { throw new Error('WORKER_MUST_NOT_RUN'); } });
  await assert.rejects(ineligible.start(), { code: 'X49_PUBLIC_AUTHORING_NOT_NATIVE' });
  assert.equal(fetches, 0);
});

test('async eligibility cannot enable from a stale authority hash', async () => {
  const state = x49PublicState(); const authority = await captureX49PublicAuthority(state);
  let release; const held = new Promise((resolve) => { release = resolve; });
  const runner = createX49PublicRunner({ contextReader: () => state,
    captureAuthority: () => held,
    fetchImpl: async () => { throw new Error('FETCH_MUST_NOT_RUN'); },
    workerFactory: () => { throw new Error('WORKER_MUST_NOT_RUN'); } });
  const checking = runner.eligibility();
  state.revision += 1; state.buildState = 'changed-during-eligibility';
  release(authority);
  assert.deepEqual(await checking, { eligible: false, code: 'X49_PUBLIC_AUTHORITY_RETIRED' });
});

test('X49 public runner deletes a late POST claim after cancellation', async () => {
  const state = x49PublicState(); const result = await x49BuildResult();
  let releasePost; let postStarted = false; const heldPost = new Promise((resolve) => { releasePost = resolve; });
  const requests = []; let workers = 0;
  const runner = createX49PublicRunner({ contextReader: () => state,
    fetchImpl: async (url, options = {}) => {
      requests.push(`${options.method ?? 'GET'} ${url}`);
      if (url === '/api/build') { postStarted = true; return heldPost; }
      if (url === '/api/build/late-claim' && options.method === 'DELETE') return response({ ok: true });
      throw new Error('UNEXPECTED_REQUEST');
    }, workerFactory: () => { workers += 1; throw new Error('WORKER_MUST_NOT_RUN'); } });
  const running = runner.start();
  while (!postStarted) await new Promise((resolve) => setTimeout(resolve, 1));
  await runner.cancel();
  releasePost(response({ jobId: 'late-claim', capability: 'late-capability',
    inputIdentity: result.inputIdentity }, 202));
  await assert.rejects(running, { code: 'X49_PUBLIC_OPERATION_RETIRED' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(requests, ['POST /api/build', 'DELETE /api/build/late-claim']);
  assert.equal(workers, 0);
});

test('X49 public runner validates init before worker creation and guards the await', async () => {
  const state = x49PublicState(); const result = await x49BuildResult();
  let releaseInit; let initStarted = false; const heldInit = new Promise((resolve) => { releaseInit = resolve; });
  let workers = 0;
  const runner = createX49PublicRunner({ contextReader: () => state,
    fetchImpl: async (url) => url === '/api/build'
      ? response({ jobId: 'job-init', capability: 'cap', inputIdentity: result.inputIdentity }, 202)
      : response({ status: 'succeeded', result }),
    validateWorkerInit: async (init) => { initStarted = true; await heldInit; return init; },
    workerFactory: () => { workers += 1; return new MockWorker(); },
    buildPollMilliseconds: 1, buildTimeoutMilliseconds: 100 });
  const running = runner.start();
  while (!initStarted) await new Promise((resolve) => setTimeout(resolve, 1));
  await runner.retire('X49_PUBLIC_PROJECT_CHANGED');
  releaseInit();
  await assert.rejects(running, { code: 'X49_PUBLIC_OPERATION_RETIRED' });
  assert.equal(workers, 0);
});

test('held DELETE cannot block or overwrite a new operation', async () => {
  const state = x49PublicState(); const result = await x49BuildResult();
  let job = 0; let releaseFirstStatus; let releaseSecondStatus; let releaseDelete;
  const firstStatus = new Promise((resolve) => { releaseFirstStatus = resolve; });
  const secondStatus = new Promise((resolve) => { releaseSecondStatus = resolve; });
  const heldDelete = new Promise((resolve) => { releaseDelete = resolve; });
  const fetchImpl = async (url, options = {}) => {
    if (url === '/api/build') {
      job += 1; return response({ jobId: `job-${job}`, capability: `cap-${job}`,
        inputIdentity: result.inputIdentity }, 202);
    }
    if (url === '/api/build/job-1' && options.method === 'DELETE') return heldDelete;
    if (url === '/api/build/job-1') return firstStatus;
    if (url === '/api/build/job-2' && options.method === 'DELETE') return response({ ok: true });
    if (url === '/api/build/job-2') return secondStatus;
    throw new Error('UNEXPECTED_REQUEST');
  };
  const runner = createX49PublicRunner({ contextReader: () => state, fetchImpl,
    workerFactory: () => { throw new Error('WORKER_MUST_NOT_RUN'); }, buildTimeoutMilliseconds: 10_000 });
  const first = runner.start();
  void first.catch(() => {});
  while (job < 1) await new Promise((resolve) => setTimeout(resolve, 1));
  await runner.cancel('X49_PUBLIC_FIRST_CANCELLED');
  const second = runner.start();
  void second.catch(() => {});
  while (job < 2) await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(runner.snapshot().generation, 2);
  releaseDelete(response({ ok: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(runner.snapshot().generation, 2);
  assert.equal(runner.active(), true);
  await runner.cancel('X49_PUBLIC_SECOND_CANCELLED');
  releaseFirstStatus(response({ status: 'cancelled' }));
  releaseSecondStatus(response({ status: 'cancelled' }));
  await assert.rejects(first);
  await assert.rejects(second);
  assert.equal(runner.snapshot().generation, 2);
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

test('accepted projection retires synchronously after programmatic authority drift', async () => {
  const harness = await runnerHarness();
  await harness.runner.start();
  assert.equal(harness.runner.snapshot().phase, 'passed');
  const requests = harness.requests.length; const workers = harness.workers.length;
  harness.state.project.project.source.files[0].content += '\n// programmatic drift';
  harness.state.revision += 1;
  assert.equal(harness.runner.snapshot().phase, 'retired');
  assert.equal(harness.runner.snapshot().projection, null);
  assert.deepEqual({ requests: harness.requests.length, workers: harness.workers.length },
    { requests, workers });
});
