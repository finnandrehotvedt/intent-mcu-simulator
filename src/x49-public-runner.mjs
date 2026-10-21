// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import trustedManifest from './x49-private-runtime-manifest.json' with { type: 'json' };
import { validateX49PrivateInit } from './x49-private-runtime-contract.mjs';
import { X49_CASES } from './x49-sensor-offset.mjs';
import {
  acceptX49PublicArtifact,
  captureX49PublicAuthority,
  createX49PublicWorkerInit,
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
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      rejectPromise(Object.assign(new Error('X49_PUBLIC_CANCELLED'), { code: 'X49_PUBLIC_CANCELLED' }));
    }, { once: true });
  });
}

function caseIsExact(terminal, expected) {
  const evidence = terminal?.evidence;
  return terminal?.state === 'complete'
    && evidence?.caseId === expected.caseId
    && evidence?.inputIdentity === expected.inputIdentity
    && evidence?.inputAppliedCycle === 0
    && evidence?.adc?.value === expected.calculated.adcCount
    && evidence?.firmwareTransaction?.temperatureC === expected.calculated.firmwareIntegerC
    && evidence?.pin?.level === expected.calculated.d13Level
    && evidence?.time?.cpuCycles === 2_560_000
    && evidence?.retention?.retainedMailboxWrites === 5
    && evidence?.retention?.droppedTraceRows === 0
    && evidence?.retention?.droppedAdcCompletions === 0
    && evidence?.retention?.droppedMailboxTransactions === 0;
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
} = {}) {
  if (typeof contextReader !== 'function' || typeof fetchImpl !== 'function'
      || typeof workerFactory !== 'function') reject('X49_PUBLIC_RUNNER_HOST_INVALID');
  let operation = null;
  let starting = false;
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
  const publish = (phase, message, projection = null) => {
    state = { ...state, phase, generation: operation?.generation ?? state.generation,
      message, projection: projection ? clone(projection) : null, physicalStatus: 'absent' };
    for (const listener of listeners) listener(clone(state));
    return clone(state);
  };
  const guard = async (active) => {
    if (operation !== active || active.controller.signal.aborted) reject('X49_PUBLIC_OPERATION_RETIRED');
    if (!await x49PublicAuthorityStillCurrent(active.authority, contextReader(), cryptoImpl)) {
      reject('X49_PUBLIC_AUTHORITY_RETIRED');
    }
  };
  const cancelBuild = async (active) => {
    if (!active.job) return;
    const job = active.job; active.job = null;
    try {
      await fetchImpl(`/api/build/${encodeURIComponent(job.jobId)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${job.capability}` }, cache: 'no-store',
      });
    } catch { /* retirement is still enforced locally */ }
  };
  const disposeWorker = async (record, reason = 'cancelled') => {
    if (!record || record.disposed) return;
    record.disposed = true;
    try {
      if (record.receiptNonce) record.worker.postMessage({ command: 'cancel', receiptNonce: record.receiptNonce });
      record.worker.postMessage({ command: 'dispose', disposeToken: `x49-${record.generation}-${reason}` });
    } catch { /* termination below is the hard lifecycle boundary */ }
    record.worker.terminate();
  };
  const retireActive = async (reason, phase = 'retired') => {
    const active = operation;
    if (!active) return clone(state);
    operation = null;
    clearInterval(active.monitor);
    active.controller.abort(reason);
    await cancelBuild(active);
    await Promise.all(active.workers.map((item) => disposeWorker(item, reason)));
    active.workers.length = 0;
    active.capability = null;
    active.artifact = null;
    return publish(phase, reason);
  };

  const readResponse = async (response, code) => {
    let value;
    try { value = await response.json(); } catch { reject(code); }
    if (!response.ok) reject(value?.code ?? code);
    return value;
  };

  const compile = async (active, request) => {
    const response = await fetchImpl('/api/build', {
      method: 'POST', signal: active.controller.signal, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Teach-Lab-Build': '1' },
      body: JSON.stringify(request),
    });
    const claim = validateX49BuildClaim(await readResponse(response, 'X49_PUBLIC_BUILD_SUBMISSION_FAILED'));
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
        return acceptX49PublicArtifact({ claim, result: status.result,
          authority: active.authority, manifest }, cryptoImpl);
      }
      if (['failed', 'cancelled', 'timeout'].includes(status.status)) {
        reject(`X49_PUBLIC_BUILD_${status.status.toUpperCase()}`);
      }
      if (status.status !== 'building') reject('X49_PUBLIC_BUILD_STATUS_INVALID');
      await wait(buildPollMilliseconds, active.controller.signal);
    }
    reject('X49_PUBLIC_BUILD_TIMEOUT');
  };

  const workerMessage = (record, predicate, timeout, signal) => new Promise((resolve, rejectPromise) => {
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
    const worker = workerFactory(workerUrl, { type: 'module', name: `x49-offset-${index + 1}` });
    const record = { worker, generation: active.generation * 10 + index + 1,
      receiptNonce: nonce(cryptoImpl), disposed: false };
    active.workers.push(record);
    const init = createX49PublicWorkerInit({ acceptedArtifact, manifest, caseId,
      runtimeGeneration: record.generation, receiptNonce: record.receiptNonce });
    const acceptedInit = await validateX49PrivateInit(init, cryptoImpl, manifest);
    const readyPromise = workerMessage(record, (value) => value?.kind === 'ready'
      && value.receiptNonce === record.receiptNonce && value.caseId === caseId,
    workerTimeoutMilliseconds, active.controller.signal);
    worker.postMessage(init);
    await readyPromise;
    await guard(active);
    const terminalPromise = workerMessage(record, (value) => value?.kind === 'terminal',
      workerTimeoutMilliseconds, active.controller.signal);
    worker.postMessage({ command: 'observe-first', receiptNonce: record.receiptNonce });
    const { terminal } = await terminalPromise;
    await guard(active);
    if (!caseIsExact(terminal, X49_CASES[index])) reject(`X49_PUBLIC_CASE_${index + 1}_FAILED`);
    await disposeWorker(record, 'complete');
    return { acceptedInit, terminal };
  };

  const api = {
    subscribe(listener) {
      if (typeof listener !== 'function') reject('X49_PUBLIC_LISTENER_INVALID');
      listeners.add(listener); listener(clone(state));
      return () => listeners.delete(listener);
    },
    snapshot: () => clone(state),
    active: () => Boolean(starting || (operation && !terminalPhase(state.phase))),
    previewOnly(message = 'Calculated preview only; no firmware was started.') {
      if (!operation) publish('preview-only', message);
      return clone(state);
    },
    async start() {
      if (operation || starting) reject('X49_PUBLIC_OPERATION_ACTIVE');
      starting = true;
      let authority;
      try { authority = await captureX49PublicAuthority(contextReader(), cryptoImpl); }
      finally { starting = false; }
      const active = { generation: ++serial, authority, controller: new AbortController(),
        workers: [], job: null, capability: null, artifact: null, monitor: null };
      operation = active;
      active.monitor = setInterval(() => {
        if (operation !== active) return;
        void x49PublicAuthorityStillCurrent(active.authority, contextReader(), cryptoImpl).then((current) => {
          if (!current && operation === active) void retireActive('X49_PUBLIC_AUTHORITY_RETIRED', 'retired');
        });
      }, 50);
      publish('building', 'Building one in-memory instrumented copy in the same-origin isolated compiler.');
      try {
        const request = await prepareX49PublicBuild(authority, cryptoImpl);
        await guard(active);
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
        operation = null;
        return publish('passed', 'Academic browser-native evidence passed. Physical evidence remains absent.',
          sealed.projection);
      } catch (error) {
        if (operation === active) {
          const code = error.code ?? error.message ?? 'X49_PUBLIC_FAILED';
          const phase = active.controller.signal.aborted || code.includes('CANCEL') ? 'cancelled'
            : code.includes('TIMEOUT') || code.includes('RETIRED') || code.includes('AUTHORITY')
              ? 'indeterminate' : 'failed';
          await retireActive(code, phase);
        }
        throw error;
      }
    },
    cancel: (reason = 'X49_PUBLIC_CANCELLED') => retireActive(reason, 'cancelled'),
    retire: (reason = 'X49_PUBLIC_RETIRED') => retireActive(reason, 'retired'),
  };
  return Object.freeze(api);
}
