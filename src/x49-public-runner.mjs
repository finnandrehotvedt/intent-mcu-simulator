// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import trustedManifest from './x49-private-runtime-manifest.json' with { type: 'json' };
import { validateX49PrivateInit } from './x49-private-runtime-contract.mjs';
import { X49_CASES } from './x49-sensor-offset.mjs';
import {
  acceptX49PublicArtifact,
  captureX49PublicAuthority,
  createX49PublicWorkerInit,
  expectedX49BuildInputIdentity,
  prepareX49PublicBuild,
  sealX49PublicNativeResult,
  validateX49BuildClaim,
  x49PublicAuthorityStillCurrent,
} from './x49-public-run-contract.mjs';

export const X49_PUBLIC_RUNNER_SCHEMA = 'intent-mcu-x49-public-runner@1';
export const X49_PUBLIC_PHASES = Object.freeze([
  'ready', 'preview-only', 'author-invalid', 'building', 'prepared', 'running-case-1',
  'running-case-2', 'validating', 'passed', 'failed', 'indeterminate', 'cancelled', 'retired',
]);

const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };
const terminalPhase = (phase) => ['passed', 'failed', 'indeterminate', 'cancelled', 'retired'].includes(phase);
const nonce = (cryptoImpl) => [...cryptoImpl.getRandomValues(new Uint8Array(16))]
  .map((part) => part.toString(16).padStart(2, '0')).join('');

function wait(milliseconds, signal) {
  return new Promise((resolve, rejectPromise) => {
    if (signal.aborted) {
      rejectPromise(Object.assign(new Error('X49_PUBLIC_CANCELLED'), { code: 'X49_PUBLIC_CANCELLED' }));
      return;
    }
    const aborted = () => {
      clearTimeout(timer);
      rejectPromise(Object.assign(new Error('X49_PUBLIC_CANCELLED'), { code: 'X49_PUBLIC_CANCELLED' }));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', aborted);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', aborted, { once: true });
  });
}

export function classifyX49PublicCase(terminal, expected) {
  const evidence = terminal?.evidence;
  if (terminal?.state !== 'complete' || terminal.reason != null) {
    return Object.freeze({ status: 'indeterminate' });
  }
  if (!evidence || typeof evidence !== 'object'
      || typeof evidence.caseId !== 'string' || typeof evidence.inputIdentity !== 'string'
      || !Number.isSafeInteger(evidence.inputAppliedCycle)
      || !Number.isSafeInteger(evidence.adc?.value)
      || !Number.isSafeInteger(evidence.firmwareTransaction?.temperatureC)
      || typeof evidence.pin?.level !== 'boolean'
      || !Number.isSafeInteger(evidence.time?.cpuCycles)
      || !Number.isSafeInteger(evidence.retention?.retainedMailboxWrites)
      || !Number.isSafeInteger(evidence.retention?.droppedTraceRows)
      || !Number.isSafeInteger(evidence.retention?.droppedAdcCompletions)
      || !Number.isSafeInteger(evidence.retention?.droppedMailboxTransactions)) {
    return Object.freeze({ status: 'indeterminate' });
  }
  if (evidence.retention.droppedTraceRows !== 0
      || evidence.retention.droppedAdcCompletions !== 0
      || evidence.retention.droppedMailboxTransactions !== 0) {
    return Object.freeze({ status: 'indeterminate' });
  }
  if (evidence.caseId !== expected.caseId
      || evidence.inputIdentity !== expected.inputIdentity
      || evidence.inputAppliedCycle !== 0
      || evidence.time.cpuCycles !== 2_560_000
      || evidence.retention.retainedMailboxWrites !== 5) {
    return Object.freeze({ status: 'indeterminate' });
  }
  const exact = evidence?.adc?.value === expected.calculated.adcCount
    && evidence?.firmwareTransaction?.temperatureC === expected.calculated.firmwareIntegerC
    && evidence?.pin?.level === expected.calculated.d13Level;
  return Object.freeze({ status: exact ? 'passed' : 'failed' });
}

export function createX49PublicRunner({
  contextReader,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  workerFactory = (url, options) => new Worker(url, options),
  workerUrl = './x49-offset.worker.js',
  cryptoImpl = globalThis.crypto,
  manifest = trustedManifest,
  buildPollMilliseconds = 50,
  buildTimeoutMilliseconds = 12_000,
  workerTimeoutMilliseconds = 30_000,
  deleteTimeoutMilliseconds = 1_000,
  captureAuthority = captureX49PublicAuthority,
  authorityStillCurrent = x49PublicAuthorityStillCurrent,
  prepareBuild = prepareX49PublicBuild,
  validateWorkerInit = validateX49PrivateInit,
} = {}) {
  if (typeof contextReader !== 'function' || typeof fetchImpl !== 'function'
      || typeof workerFactory !== 'function') reject('X49_PUBLIC_RUNNER_HOST_INVALID');
  let operation = null;
  let epoch = 0;
  let serial = 0;
  let state = {
    schema: X49_PUBLIC_RUNNER_SCHEMA,
    phase: 'ready',
    generation: 0,
    message: 'Verified native run is available only for the exact +1 °C comparison.',
    projection: null,
    physicalStatus: 'absent',
  };
  const listeners = new Set();
  const publish = (phase, message, projection = null, generation = operation?.generation ?? state.generation) => {
    state = { ...state, phase, generation,
      message, projection: projection ? clone(projection) : null, physicalStatus: 'absent' };
    for (const listener of listeners) listener(clone(state));
    return clone(state);
  };
  const assertCurrent = (active) => {
    if (operation !== active || active.epoch !== epoch || active.controller.signal.aborted) {
      reject('X49_PUBLIC_OPERATION_RETIRED');
    }
  };
  const guard = async (active) => {
    assertCurrent(active);
    const current = await authorityStillCurrent(active.authority, contextReader(), cryptoImpl);
    assertCurrent(active);
    if (!current) {
      reject('X49_PUBLIC_AUTHORITY_RETIRED');
    }
  };
  const cancelBuild = async (job) => {
    if (!job) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('X49_PUBLIC_DELETE_TIMEOUT'), deleteTimeoutMilliseconds);
    try {
      await fetchImpl(`/api/build/${encodeURIComponent(job.jobId)}`, {
        method: 'DELETE', signal: controller.signal,
        headers: { Authorization: `Bearer ${job.capability}` }, cache: 'no-store',
      });
    } catch { /* retirement is still enforced locally */ }
    finally { clearTimeout(timer); }
  };
  const disposeWorker = (record, reason = 'cancelled') => {
    if (!record || record.disposed) return;
    record.disposed = true;
    try {
      if (record.receiptNonce) record.worker.postMessage({ command: 'cancel', receiptNonce: record.receiptNonce });
      record.worker.postMessage({ command: 'dispose', disposeToken: `x49-${record.generation}-${reason}` });
    } catch { /* termination below is the hard lifecycle boundary */ }
    record.worker.terminate();
  };
  const retireActive = (active, reason, phase = 'retired') => {
    if (!active) return clone(state);
    if (operation !== active) return clone(state);
    operation = null;
    epoch += 1;
    clearInterval(active.monitor);
    active.controller.abort(reason);
    const job = active.job;
    active.job = null;
    active.workers.forEach((item) => disposeWorker(item, reason));
    active.workers.length = 0;
    active.capability = null;
    active.artifact = null;
    const terminal = publish(phase, reason, null, active.generation);
    void cancelBuild(job);
    return terminal;
  };

  const readResponse = async (response, code) => {
    let value;
    try { value = await response.json(); } catch { reject(code); }
    if (!response.ok) reject(value?.code ?? code);
    return value;
  };

  const compile = async (active, request) => {
    const expectedInputIdentity = await expectedX49BuildInputIdentity(request, cryptoImpl);
    await guard(active);
    const response = await fetchImpl('/api/build', {
      method: 'POST', signal: active.controller.signal, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1' },
      body: JSON.stringify(request),
    });
    const claim = validateX49BuildClaim(await readResponse(response, 'X49_PUBLIC_BUILD_SUBMISSION_FAILED'));
    if (operation !== active || active.epoch !== epoch || active.controller.signal.aborted) {
      void cancelBuild(claim);
      reject('X49_PUBLIC_OPERATION_RETIRED');
    }
    if (claim.inputIdentity !== expectedInputIdentity) {
      void cancelBuild(claim);
      reject('X49_PUBLIC_BUILD_INPUT_IDENTITY_INVALID');
    }
    active.capability = claim.capability;
    active.job = claim;
    await guard(active);
    const started = Date.now();
    while (Date.now() - started < buildTimeoutMilliseconds) {
      const statusResponse = await fetchImpl(`/api/build/${encodeURIComponent(claim.jobId)}`, {
        signal: active.controller.signal, cache: 'no-store',
        headers: { Authorization: `Bearer ${claim.capability}` },
      });
      const status = await readResponse(statusResponse, 'X49_PUBLIC_BUILD_STATUS_FAILED');
      await guard(active);
      if (status.status === 'succeeded') {
        active.job = null; active.capability = null;
        const accepted = await acceptX49PublicArtifact({ claim, result: status.result, request,
          authority: active.authority, manifest }, cryptoImpl);
        await guard(active);
        return accepted;
      }
      if (['failed', 'cancelled', 'timeout'].includes(status.status)) {
        reject(`X49_PUBLIC_BUILD_${status.status.toUpperCase()}`);
      }
      if (status.status !== 'building') reject('X49_PUBLIC_BUILD_STATUS_INVALID');
      await wait(buildPollMilliseconds, active.controller.signal);
      await guard(active);
    }
    reject('X49_PUBLIC_BUILD_TIMEOUT');
  };

  const workerMessage = (record, predicate, timeout, signal) => new Promise((resolve, rejectPromise) => {
    if (signal.aborted) {
      rejectPromise(Object.assign(new Error('X49_PUBLIC_CANCELLED'), { code: 'X49_PUBLIC_CANCELLED' }));
      return;
    }
    const cleanup = () => {
      clearTimeout(timer); signal.removeEventListener('abort', aborted);
      record.worker.removeEventListener('message', message);
      record.worker.removeEventListener('error', failed);
    };
    const finish = (error, value) => { cleanup(); error ? rejectPromise(error) : resolve(value); };
    const message = ({ data }) => {
      if (data?.kind === 'error') finish(Object.assign(new Error(data.code), { code: data.code }));
      else if (predicate(data)) finish(null, data);
    };
    const failed = (event) => finish(Object.assign(new Error(event.message || 'X49_PUBLIC_WORKER_ERROR'),
      { code: 'X49_PUBLIC_WORKER_ERROR' }));
    const aborted = () => finish(Object.assign(new Error('X49_PUBLIC_CANCELLED'), { code: 'X49_PUBLIC_CANCELLED' }));
    const timer = setTimeout(() => finish(Object.assign(new Error('X49_PUBLIC_WORKER_TIMEOUT'),
      { code: 'X49_PUBLIC_WORKER_TIMEOUT' })), timeout);
    record.worker.addEventListener('message', message);
    record.worker.addEventListener('error', failed);
    signal.addEventListener('abort', aborted, { once: true });
  });

  const runCase = async (active, acceptedArtifact, caseId, index) => {
    await guard(active);
    publish(index === 0 ? 'running-case-1' : 'running-case-2',
      `Running fresh worker ${index + 1} of 2 for ${caseId}.`);
    const record = { worker: null, generation: active.generation * 10 + index + 1,
      receiptNonce: nonce(cryptoImpl), disposed: false };
    const init = createX49PublicWorkerInit({ acceptedArtifact, manifest, caseId,
      runtimeGeneration: record.generation, receiptNonce: record.receiptNonce });
    const acceptedInit = await validateWorkerInit(init, cryptoImpl, manifest);
    await guard(active);
    record.worker = workerFactory(workerUrl, { type: 'module', name: `x49-offset-${index + 1}` });
    active.workers.push(record);
    const readyPromise = workerMessage(record, (value) => value?.kind === 'ready'
      && value.receiptNonce === record.receiptNonce && value.caseId === caseId,
    workerTimeoutMilliseconds, active.controller.signal);
    record.worker.postMessage(init);
    await readyPromise;
    await guard(active);
    const terminalPromise = workerMessage(record, (value) => value?.kind === 'terminal',
      workerTimeoutMilliseconds, active.controller.signal);
    record.worker.postMessage({ command: 'observe-first', receiptNonce: record.receiptNonce });
    const { terminal } = await terminalPromise;
    await guard(active);
    const classification = classifyX49PublicCase(terminal, X49_CASES[index]);
    if (classification.status !== 'passed') {
      const error = new Error(`X49_PUBLIC_CASE_${index + 1}_${classification.status.toUpperCase()}`);
      error.code = error.message; error.classification = classification.status; throw error;
    }
    disposeWorker(record, 'complete');
    return { acceptedInit, terminal };
  };

  const api = {
    subscribe(listener) {
      if (typeof listener !== 'function') reject('X49_PUBLIC_LISTENER_INVALID');
      listeners.add(listener); listener(clone(state));
      return () => listeners.delete(listener);
    },
    snapshot: () => clone(state),
    active: () => Boolean(operation && !terminalPhase(state.phase)),
    previewOnly(message = 'Calculated preview only; no firmware was started.') {
      if (!operation) publish('preview-only', message);
      return clone(state);
    },
    async start() {
      if (operation) reject('X49_PUBLIC_OPERATION_ACTIVE');
      const active = { generation: ++serial, epoch: ++epoch, authority: null,
        frozenState: clone(contextReader()), controller: new AbortController(),
        workers: [], job: null, capability: null, artifact: null, monitor: null };
      operation = active;
      publish('building', 'Checking exact source, graph and compiler authority.', null, active.generation);
      try {
        active.authority = await captureAuthority(active.frozenState, cryptoImpl);
        assertCurrent(active);
        await guard(active);
        active.monitor = setInterval(() => {
          if (operation !== active) return;
          void authorityStillCurrent(active.authority, contextReader(), cryptoImpl).then((current) => {
            if (operation === active && active.epoch === epoch && !current) {
              retireActive(active, 'X49_PUBLIC_AUTHORITY_RETIRED', 'retired');
            }
          });
        }, 50);
        const request = await prepareBuild(active.authority, cryptoImpl);
        await guard(active);
        publish('building', 'Building one in-memory instrumented copy in the same-origin isolated compiler.');
        const acceptedArtifact = await compile(active, request);
        active.artifact = acceptedArtifact;
        await guard(active);
        publish('prepared', 'Build identity, toolchain, HEX, ELF and the single four-byte probe are verified.');
        const first = await runCase(active, acceptedArtifact, X49_CASES[0].caseId, 0);
        const second = await runCase(active, acceptedArtifact, X49_CASES[1].caseId, 1);
        await guard(active);
        publish('validating', 'Validating common binding, timing, writes, drops and fresh-worker identity.');
        const sealed = await sealX49PublicNativeResult({ acceptedArtifact,
          acceptedInits: [first.acceptedInit, second.acceptedInit],
          terminals: [first.terminal, second.terminal] }, cryptoImpl);
        await guard(active);
        active.artifact = null;
        active.capability = null;
        clearInterval(active.monitor);
        operation = null; epoch += 1;
        return publish('passed', 'Academic browser-native evidence passed. Physical evidence remains absent.',
          sealed.projection, active.generation);
      } catch (error) {
        if (operation === active) {
          const code = error.code ?? error.message ?? 'X49_PUBLIC_FAILED';
          const indeterminate = ['TIMEOUT', 'RETIRED', 'AUTHORITY', 'UNAVAILABLE', 'INFRASTRUCTURE',
            'STALE', 'WORKER_ERROR', 'BUILD_FAILED'].some((part) => code.includes(part));
          const phase = error.classification === 'indeterminate' ? 'indeterminate'
            : active.controller.signal.aborted || code.includes('CANCEL') ? 'cancelled'
              : indeterminate ? 'indeterminate' : 'failed';
          retireActive(active, code, phase);
        }
        throw error;
      }
    },
    cancel: (reason = 'X49_PUBLIC_CANCELLED') => Promise.resolve(retireActive(operation, reason, 'cancelled')),
    retire: (reason = 'X49_PUBLIC_RETIRED') => Promise.resolve(retireActive(operation, reason, 'retired')),
  };
  return Object.freeze(api);
}
