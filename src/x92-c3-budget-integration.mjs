// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { parseBoundedActionRequest } from './bounded-action-contracts.mjs';
import { exactKeys } from './strict-json.mjs';

export const X92_C3_BINDING_SCHEMA = 'intent-mcu-x92-c3-execution-binding@1';
export const X92_C3_RESULT_SCHEMA = 'intent-mcu-x92-c3-private-result@1';
export const X92_C3_QUIESCENCE_SCHEMA = 'intent-mcu-c3-quiescence@1';
const PROFILE = 'board.esp32-c3-devmodule-v1';
const HASH = /^sha256:[a-f0-9]{64}$/u;
const RAW_HASH = /^[a-f0-9]{64}$/u;
const SESSION = /^[A-Za-z0-9_-]{16}$/u;
const clone = (value) => structuredClone(value);

function fail(code) { throw Object.assign(new Error(code), { code }); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function hash(value) { return typeof value === 'string' && HASH.test(value); }

export function normalizeX92C3Binding(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, ['schema', 'profile', 'sessionId', 'generation', 'projectGeneration',
        'sourceIdentity', 'graphIdentity', 'flashIdentity', 'compiler', 'runtime'])
      || value.schema !== X92_C3_BINDING_SCHEMA || value.profile !== PROFILE
      || !SESSION.test(value.sessionId ?? '')
      || !Number.isSafeInteger(value.generation) || value.generation < 1
      || !Number.isSafeInteger(value.projectGeneration) || value.projectGeneration < 1
      || !hash(value.sourceIdentity) || !hash(value.graphIdentity) || !hash(value.flashIdentity)
      || !value.compiler || !exactKeys(value.compiler, ['imageIdentity', 'toolchainIdentity'])
      || !hash(value.compiler.imageIdentity) || !hash(value.compiler.toolchainIdentity)
      || !value.runtime || !exactKeys(value.runtime, ['imageIdentity', 'binaryIdentity'])
      || !hash(value.runtime.imageIdentity) || !hash(value.runtime.binaryIdentity)) fail('X92_C3_BINDING_INVALID');
  return Object.freeze(clone(value));
}

export function x92IdentityFromC3Binding(value) {
  const binding = normalizeX92C3Binding(value);
  return Object.freeze({ schema: 'intent-mcu-experiment-budget-identity@1', profile: binding.profile,
    projectGeneration: binding.projectGeneration, sourceIdentity: binding.sourceIdentity,
    graphIdentity: binding.graphIdentity });
}

function validQuiescence(value, binding) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && exactKeys(value, ['schema', 'sessionId', 'generation', 'sourceSha256', 'artifactSha256',
      'operationId', 'state', 'retainedBytes', 'artifactPreserved', 'processExited', 'operationRetired'])
    && value.schema === X92_C3_QUIESCENCE_SCHEMA && value.sessionId === binding.sessionId
    && value.generation === binding.generation
    && value.sourceSha256 === binding.sourceIdentity.slice(7)
    && value.artifactSha256 === binding.flashIdentity.slice(7)
    && RAW_HASH.test(value.sourceSha256) && RAW_HASH.test(value.artifactSha256)
    && /^c3-operation-[1-9][0-9]*$/u.test(value.operationId ?? '')
    && value.state === 'quiescent' && Number.isSafeInteger(value.retainedBytes) && value.retainedBytes > 0
    && value.artifactPreserved === true
    && value.processExited === true && value.operationRetired === true;
}

export function normalizeX92C3Uart(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !exactKeys(value, ['exactApplicationText', 'markerCount', 'serialBytes', 'sha256',
      'bootEpochs', 'finalLf'])
    || typeof value.exactApplicationText !== 'string'
    || !/^[A-Z0-9][A-Z0-9:_-]{2,63}$/u.test(value.exactApplicationText)
    || value.markerCount !== 2 || !Number.isSafeInteger(value.serialBytes) || value.serialBytes < 2
    || !RAW_HASH.test(value.sha256) || value.finalLf !== true
    || !Array.isArray(value.bootEpochs) || value.bootEpochs.length !== value.markerCount
    || value.bootEpochs.some((epoch) => !epoch || typeof epoch !== 'object'
      || epoch.marker !== value.exactApplicationText)) fail('X92_C3_UART_INVALID');
  return Object.freeze(clone(value));
}

function validResult(value, binding) {
  try {
    return value && typeof value === 'object' && !Array.isArray(value)
    && exactKeys(value, ['schema', 'ok', 'code', 'executed', 'executionIdentity', 'uart', 'quiescence'])
    && value.schema === X92_C3_RESULT_SCHEMA && value.ok === true && value.executed === true
    && typeof value.code === 'string' && same(normalizeX92C3Binding(value.executionIdentity), binding)
    && same(normalizeX92C3Uart(value.uart), value.uart)
    && validQuiescence(value.quiescence, binding);
  } catch { return false; }
}

export function createX92C3BudgetIntegration({ budget, currentBinding, retireCurrentOwner,
  prepareBudgetProducer = async ({ retiredBinding }) => retiredBinding,
  executeBudgetProducer, executeManualProducer, cancelBudgetProducer,
  now = () => performance.now(), schedule = setTimeout, unschedule = clearTimeout,
  parseRequest = parseBoundedActionRequest, measurementSource = 'browser.performance.now' } = {}) {
  if (!budget || typeof budget.reserve !== 'function' || typeof budget.finalize !== 'function'
      || typeof currentBinding !== 'function' || typeof retireCurrentOwner !== 'function'
      || typeof prepareBudgetProducer !== 'function'
      || typeof executeBudgetProducer !== 'function' || typeof executeManualProducer !== 'function'
      || typeof cancelBudgetProducer !== 'function') fail('X92_C3_INTEGRATION_CONFIGURATION');
  let gate = null;
  let tombstone = null;
  let sequence = 0;
  const permits = new WeakMap();

  const projection = () => Object.freeze({
    gate: gate ? { owner: gate.owner, requestId: gate.requestId, phase: gate.phase } : null,
    tombstone: tombstone ? clone(tombstone) : null,
  });
  function block(code, extra = {}) {
    return { ok: false, code, executed: false, ...extra, integration: projection() };
  }
  function claim(owner, requestId, action = 'runtime.run') {
    if (tombstone) return null;
    if (gate) return null;
    sequence += 1;
    const permit = Object.freeze({});
    gate = { owner, requestId, action, phase: 'claimed', token: `x92-c3-dispatch-${sequence}`, permit };
    permits.set(permit, { owner, requestId, action, token: gate.token, binding: null });
    return gate;
  }
  function release(owner) { if (gate === owner) gate = null; }
  function markTombstone(owner, code) {
    tombstone = Object.freeze({ code, requestId: owner.requestId, token: owner.token });
    owner.phase = 'blocked';
  }
  function authorize(owner, binding) {
    const record = permits.get(owner.permit);
    if (!record || record.token !== owner.token) fail('X92_C3_PERMIT_OWNER_INVALID');
    record.binding = binding;
    owner.phase = 'authorized';
  }
  function advancingBoundary(permit, binding = null, action = 'runtime.run') {
    const record = permits.get(permit);
    if (!gate || permit !== gate.permit || !record || record.token !== gate.token
        || gate.phase !== 'authorized' || record.action !== action) return block('X92_C3_SHARED_GATE_BLOCKED');
    if (action === 'firmware.build' && binding === null && record.binding === null) {
      return { ok: true, code: 'X92_C3_PRIVATE_PERMIT_ACCEPTED', token: record.token };
    }
    if (!record.binding) return block('X92_C3_SHARED_GATE_BLOCKED');
    try {
      if (!same(record.binding, normalizeX92C3Binding(binding))) return block('X92_C3_PERMIT_BINDING_MISMATCH');
    } catch { return block('X92_C3_PERMIT_BINDING_MISMATCH'); }
    return { ok: true, code: 'X92_C3_PRIVATE_PERMIT_ACCEPTED', token: record.token };
  }
  function terminal(reference, kind, elapsed = null) {
    return budget.finalize(reference, { kind, authenticated: Number.isSafeInteger(elapsed),
      measuredWallClockMs: Number.isSafeInteger(elapsed) ? elapsed : null,
      measurementSource: Number.isSafeInteger(elapsed) ? measurementSource : null });
  }

  async function executeBudgeted(source, { unresolvedProblems = [] } = {}) {
    let request;
    try { request = parseRequest(source); } catch (caught) { return block(caught?.code ?? 'ACTION_REQUEST_INVALID'); }
    if (request.action !== 'runtime.run' || request.profile !== PROFILE) return block('X92_C3_PRIVATE_SCOPE');
    if (!budget.active()) return block('X92_SESSION_INACTIVE');
    if (tombstone) return block('X92_C3_RETIREMENT_TOMBSTONE');
    const owner = claim('budget', request.requestId, request.action);
    if (!owner) return block(tombstone ? 'X92_C3_RETIREMENT_TOMBSTONE' : 'X92_C3_SHARED_GATE_BLOCKED');
    let reference = null;
    let reserved = null;
    let started = null;
    let timer = null;
    let settled = false;
    let cancelRequested = false;
    let resolveDeadline;
    const deadline = new Promise((resolve) => { resolveDeadline = resolve; });
    const finish = (kind, elapsed = null) => {
      if (settled || !reference) return null;
      settled = true;
      return terminal(reference, kind, elapsed);
    };
    const deadlineReached = () => {
      const value = now();
      return !Number.isFinite(value) || value >= started + reserved.deadlineAfterMs;
    };
    const requestCancel = () => {
      if (cancelRequested) return;
      cancelRequested = true;
      try { cancelBudgetProducer(request.requestId); } catch { /* fail closed */ }
    };
    const expire = (code) => {
      requestCancel();
      markTombstone(owner, code);
      const accounting = finish('timeout');
      return block('X92_DEADLINE_EXCEEDED', { executed: true,
        experimentBudget: accounting?.terminal ?? null });
    };
    try {
      const binding = normalizeX92C3Binding(await currentBinding());
      if (binding.projectGeneration !== request.expectedGeneration) return block('ACTION_STALE_GENERATION');
      reserved = budget.reserve(request, x92IdentityFromC3Binding(binding), { unresolvedProblems });
      if (!reserved.ok || !reserved.budgeted) return reserved;
      reference = reserved.reservation;
      started = now();
      if (!Number.isFinite(started)) fail('X92_C3_MONOTONIC_CLOCK_INVALID');
      timer = schedule(() => {
        resolveDeadline({ deadline: true });
        requestCancel();
      }, reserved.deadlineAfterMs);
      owner.phase = 'retiring-current-owner';
      const retirement = await Promise.race([
        Promise.resolve().then(() => retireCurrentOwner({ request: clone(request), binding: clone(binding),
          dispatchToken: owner.token, deadlineAt: started + reserved.deadlineAfterMs })), deadline,
      ]);
      if (retirement?.deadline === true) {
        return expire('X92_C3_DEADLINE_RETIREMENT_UNPROVEN');
      }
      if (deadlineReached()) return expire('X92_C3_DEADLINE_AFTER_RETIREMENT');
      if (!validQuiescence(retirement, binding)) {
        markTombstone(owner, 'X92_C3_RETIREMENT_ACK_INVALID');
        const accounting = finish('quiescence-failed');
        return block('X92_C3_RETIREMENT_UNPROVEN', { experimentBudget: accounting?.terminal ?? null });
      }
      owner.phase = 'preparing-private-producer';
      const prepared = await Promise.race([
        Promise.resolve().then(() => prepareBudgetProducer({ request: clone(request),
          retiredBinding: clone(binding), dispatchToken: owner.token,
          deadlineAt: started + reserved.deadlineAfterMs })), deadline,
      ]);
      if (prepared?.deadline === true) {
        return expire('X92_C3_DEADLINE_PREPARATION_UNPROVEN');
      }
      if (deadlineReached()) return expire('X92_C3_DEADLINE_AFTER_PREPARATION');
      const candidate = normalizeX92C3Binding(prepared);
      for (const key of ['profile', 'projectGeneration', 'sourceIdentity', 'graphIdentity', 'flashIdentity']) {
        if (candidate[key] !== binding[key]) fail('X92_C3_PREPARED_IDENTITY_MISMATCH');
      }
      if (!same(candidate.compiler, binding.compiler) || !same(candidate.runtime, binding.runtime)) {
        fail('X92_C3_PREPARED_IDENTITY_MISMATCH');
      }
      if (deadlineReached()) return expire('X92_C3_DEADLINE_BEFORE_PERMIT');
      authorize(owner, candidate);
      if (deadlineReached()) return expire('X92_C3_DEADLINE_BEFORE_DISPATCH');
      const result = await Promise.race([
        Promise.resolve().then(() => executeBudgetProducer(source, owner.permit, clone(candidate))), deadline,
      ]);
      if (result?.deadline === true) {
        return expire('X92_C3_DEADLINE_PRODUCER_UNPROVEN');
      }
      if (deadlineReached()) return expire('X92_C3_DEADLINE_AFTER_PRODUCER');
      if (!validResult(result, candidate)) {
        markTombstone(owner, 'X92_C3_RESULT_OR_RETIREMENT_INVALID');
        const accounting = finish('quiescence-failed');
        return block('X92_C3_RESULT_UNPROVEN', { executed: true, experimentBudget: accounting?.terminal ?? null });
      }
      const elapsed = Math.max(0, Math.ceil(now() - started));
      if (!Number.isSafeInteger(elapsed) || elapsed >= reserved.deadlineAfterMs) {
        markTombstone(owner, 'X92_C3_DEADLINE_ACCOUNTING_INVALID');
        const accounting = finish('timeout');
        return block('X92_DEADLINE_EXCEEDED', { executed: true, experimentBudget: accounting?.terminal ?? null });
      }
      const accounting = finish('success', elapsed);
      owner.phase = 'retired';
      release(owner);
      return { ...clone(result), experimentBudget: accounting?.terminal ?? null,
        privatePermitAccepted: true, integration: projection() };
    } catch (caught) {
      const accounting = reference ? finish('crash') : null;
      markTombstone(owner, caught?.code ?? 'X92_C3_INTEGRATION_CRASH');
      return block('X92_C3_INTEGRATION_CRASH', { details: [caught?.code ?? caught?.message ?? 'unknown'],
        ...(accounting?.terminal ? { experimentBudget: accounting.terminal } : {}) });
    } finally {
      if (timer !== null) unschedule(timer);
      if (!tombstone) release(owner);
    }
  }

  async function executeManual(task, { action = 'runtime.run', requestId = `manual-${action}` } = {}) {
    if (typeof task !== 'function') fail('X92_C3_MANUAL_TASK');
    if (!['firmware.build', 'runtime.run'].includes(action)) fail('X92_C3_MANUAL_ACTION');
    if (tombstone) return block('X92_C3_RETIREMENT_TOMBSTONE');
    const owner = claim('manual', requestId, action);
    if (!owner) return block('X92_C3_SHARED_GATE_BLOCKED');
    try {
      const binding = action === 'runtime.run' ? normalizeX92C3Binding(await currentBinding()) : null;
      authorize(owner, binding);
      return await executeManualProducer(task, owner.permit, binding ? clone(binding) : null, action);
    } finally { release(owner); }
  }

  return Object.freeze({ executeBudgeted, executeManual, advancingBoundary, status: projection,
    cancel: (requestId) => {
      if (!gate || gate.owner !== 'budget' || gate.requestId !== requestId) {
        return { ok: false, code: 'ACTION_NOT_ACTIVE' };
      }
      try { cancelBudgetProducer(requestId); } catch { /* active owner remains fail-closed */ }
      return { ok: true, code: 'ACTION_CANCEL_REQUESTED' };
    },
  });
}
