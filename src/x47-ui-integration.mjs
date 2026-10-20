// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  X47_APPLY_REQUEST_SCHEMA,
  canonicalX47ApplyRequest,
  createX47CancelTimeout,
  createX47WorkerBinding,
  validateX47CancelReceipt,
  validateX47ExecutionReceipt,
  validateX47QueueReceipt,
  validateX47RuntimeAuthority,
} from './x47-runtime-transaction.mjs';

export const X47_UI_OWNER_SCHEMA = 'intent-mcu-x47-ui-owner@1';

const clone = (value) => structuredClone(value);
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const token = (value) => Number.isSafeInteger(value) && value >= 1;

function validatePreview(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !/^[a-f0-9]{64}$/u.test(value.canonicalPulseSha256 ?? '')
      || !Array.isArray(value.events) || value.events.length !== 2) fail('X47_UI_PREVIEW_INVALID');
  let prior = 0;
  for (const [index, event] of value.events.entries()) {
    if (!event || Object.keys(event).sort().join('|') !== 'level|offsetCycles|pin'
        || event.pin !== 2 || event.level !== (index === 1)
        || !Number.isSafeInteger(event.offsetCycles) || event.offsetCycles <= prior
        || event.offsetCycles > 1_600_000) fail('X47_UI_PREVIEW_INVALID');
    prior = event.offsetCycles;
  }
  return clone(value);
}

export function createX47UiOwner() {
  let state = {
    schema: X47_UI_OWNER_SCHEMA,
    phase: 'unavailable', reason: 'X47_RUNTIME_UNAVAILABLE', workerToken: null,
    authority: null, runtimeIdentity: null, binding: null, ran: false,
    pausedCycle: null, preview: null, request: null, queueReceipt: null,
    executionReceipt: null, cancelReceipt: null, cancelTimeout: null,
    disposeToken: null,
  };
  const snapshot = () => clone(state);
  const context = () => ({ authority: state.authority, runtimeIdentity: state.runtimeIdentity,
    request: state.request, queueReceipt: state.queueReceipt });
  const requireEpoch = (workerToken, runtimeIdentity) => {
    if (!token(workerToken) || workerToken !== state.workerToken
        || !same(runtimeIdentity, state.runtimeIdentity)) fail('X47_UI_WORKER_STALE');
  };
  return Object.freeze({
    bind({ authority, runtimeIdentity, workerToken }) {
      if (!token(workerToken)) fail('X47_UI_WORKER_TOKEN_INVALID');
      const acceptedAuthority = validateX47RuntimeAuthority(authority, runtimeIdentity);
      state = { ...state, phase: 'await-run', reason: 'Run, then explicitly Pause.', workerToken,
        authority: clone(acceptedAuthority), runtimeIdentity: clone(runtimeIdentity),
        binding: createX47WorkerBinding(acceptedAuthority, runtimeIdentity), ran: false,
        pausedCycle: null, preview: null, request: null, queueReceipt: null,
        executionReceipt: null, cancelReceipt: null, cancelTimeout: null, disposeToken: null };
      return snapshot();
    },
    noteRun({ workerToken, runtimeIdentity }) {
      requireEpoch(workerToken, runtimeIdentity);
      if (!['await-run', 'ready', 'resume-required'].includes(state.phase)) fail('X47_UI_RUN_INVALID');
      state = { ...state, phase: 'await-pause', reason: 'Explicitly Pause to bind the current cycle.',
        ran: true, pausedCycle: null, preview: null };
      return snapshot();
    },
    noteExplicitPause({ workerToken, runtimeIdentity, cycle, preview }) {
      requireEpoch(workerToken, runtimeIdentity);
      if (!state.ran || state.phase !== 'await-pause' || !Number.isSafeInteger(cycle) || cycle < 0) {
        fail('X47_UI_PAUSE_INVALID');
      }
      state = { ...state, phase: 'ready', reason: 'Paused binding ready.', pausedCycle: cycle,
        preview: validatePreview(preview) };
      return snapshot();
    },
    beginApply(transactionId) {
      if (state.phase !== 'ready' || typeof transactionId !== 'string') fail('X47_UI_APPLY_NOT_READY');
      const request = {
        schema: X47_APPLY_REQUEST_SCHEMA,
        transactionId,
        canonicalPulseSha256: state.preview.canonicalPulseSha256,
        binding: clone(state.binding),
        expectedBaseCycle: state.pausedCycle,
        events: clone(state.preview.events),
      };
      canonicalX47ApplyRequest(request);
      state = { ...state, phase: 'apply-pending', reason: 'Waiting for exact worker acceptance.',
        request: clone(request), queueReceipt: null, executionReceipt: null,
        cancelReceipt: null, cancelTimeout: null };
      return clone(request);
    },
    accept({ workerToken, runtimeIdentity, receipt, executionReceipt }) {
      requireEpoch(workerToken, runtimeIdentity);
      if (state.phase !== 'apply-pending' || !state.request) fail('X47_UI_ACCEPT_UNEXPECTED');
      const options = { authority: state.authority, runtimeIdentity: state.runtimeIdentity,
        request: state.request };
      const queueReceipt = validateX47QueueReceipt(receipt, options);
      const acceptedExecution = validateX47ExecutionReceipt(executionReceipt,
        { ...options, queueReceipt });
      state = { ...state, phase: 'resume-required', reason: 'Accepted. Resume explicitly to execute.',
        queueReceipt: clone(queueReceipt), executionReceipt: clone(acceptedExecution) };
      return snapshot();
    },
    observeExecution({ workerToken, runtimeIdentity, executionReceipt }) {
      requireEpoch(workerToken, runtimeIdentity);
      if (!state.request || !state.queueReceipt || ['cancelling', 'timeout', 'stopped', 'retired'].includes(state.phase)) {
        fail('X47_UI_EXECUTION_UNEXPECTED');
      }
      const accepted = validateX47ExecutionReceipt(executionReceipt, context());
      state = { ...state, executionReceipt: clone(accepted) };
      return snapshot();
    },
    resume({ workerToken, runtimeIdentity }) {
      requireEpoch(workerToken, runtimeIdentity);
      if (state.phase !== 'resume-required') fail('X47_UI_RESUME_INVALID');
      state = { ...state, phase: 'running', reason: 'Running after explicit Resume.' };
      return snapshot();
    },
    beginStop(disposeToken) {
      if (!state.request || !state.queueReceipt || typeof disposeToken !== 'string' || !disposeToken) {
        fail('X47_UI_STOP_INVALID');
      }
      state = { ...state, phase: 'cancelling', reason: 'Waiting for cancellation and Dispose acknowledgements.',
        disposeToken, cancelReceipt: null, cancelTimeout: null };
      return snapshot();
    },
    acceptCancellation({ workerToken, runtimeIdentity, disposeToken, receipt }) {
      requireEpoch(workerToken, runtimeIdentity);
      if (state.phase !== 'cancelling' || disposeToken !== state.disposeToken) fail('X47_UI_CANCEL_STALE');
      const accepted = validateX47CancelReceipt(receipt, context());
      if (accepted.reason !== 'DISPOSE') fail('X47_UI_CANCEL_REASON');
      state = { ...state, reason: accepted.evidenceComplete
        ? 'Cancellation evidence complete; waiting for disposed acknowledgement.'
        : 'Cancellation acknowledged with pending or retained uncertainty; waiting for disposed acknowledgement.',
      cancelReceipt: clone(accepted) };
      return snapshot();
    },
    acceptDisposed({ workerToken, runtimeIdentity, disposeToken }) {
      requireEpoch(workerToken, runtimeIdentity);
      if (state.phase !== 'cancelling' || disposeToken !== state.disposeToken || !state.cancelReceipt) {
        fail('X47_UI_DISPOSE_STALE');
      }
      state = { ...state, phase: 'stopped', reason: state.cancelReceipt.evidenceComplete
        ? 'Stopped with complete cancellation evidence.'
        : 'Stopped; cancellation evidence remains incomplete.',
      authority: null, runtimeIdentity: null, binding: null };
      return snapshot();
    },
    timeout(timeoutMilliseconds) {
      if (state.phase !== 'cancelling') fail('X47_UI_TIMEOUT_INVALID');
      const outcome = createX47CancelTimeout({ transactionId: state.request.transactionId,
        binding: state.binding, timeoutMilliseconds });
      state = { ...state, phase: 'timeout', reason: 'Stop acknowledgement timed out; authority revoked.',
        cancelTimeout: clone(outcome), authority: null, runtimeIdentity: null, binding: null };
      return snapshot();
    },
    retire(reason = 'X47_UI_RETIRED') {
      state = { ...state, phase: 'retired', reason, authority: null, runtimeIdentity: null,
        binding: null, ran: false, pausedCycle: null, preview: null };
      return snapshot();
    },
    snapshot,
  });
}
