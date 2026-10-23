// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { parseBoundedActionRequest } from './bounded-action-contracts.mjs';
import { exactKeys } from './strict-json.mjs';

export const X92_STM32_BINDING_SCHEMA = 'intent-mcu-x92-stm32-execution-binding@1';
export const X92_STM32_COMPLETION_SCHEMA = 'intent-mcu-x92-stm32-completion@1';
export const X92_STM32_RESULT_SCHEMA = 'intent-mcu-x92-stm32-private-result@1';
const PROFILE = 'board.stm32f429zi-nucleo144-v1';
const HASH = /^sha256:[a-f0-9]{64}$/u;
const NONCE = /^[A-Za-z0-9_-]{16,64}$/u;
const clone = (value) => structuredClone(value);

function fail(code) { throw Object.assign(new Error(code), { code }); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function hash(value) { return typeof value === 'string' && HASH.test(value); }

export function normalizeX92Stm32Binding(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, ['schema', 'profile', 'requestNonce', 'projectGeneration',
        'sourceIdentity', 'graphIdentity', 'elfIdentity', 'modelIdentity', 'compiler', 'runtime'])
      || value.schema !== X92_STM32_BINDING_SCHEMA || value.profile !== PROFILE
      || !NONCE.test(value.requestNonce ?? '')
      || !Number.isSafeInteger(value.projectGeneration) || value.projectGeneration < 1
      || !hash(value.sourceIdentity) || !hash(value.graphIdentity) || !hash(value.elfIdentity)
      || !hash(value.modelIdentity)
      || !value.compiler || !exactKeys(value.compiler, ['imageIdentity', 'toolchainIdentity'])
      || !hash(value.compiler.imageIdentity) || !hash(value.compiler.toolchainIdentity)
      || !value.runtime || !exactKeys(value.runtime, ['imageIdentity', 'binaryIdentity'])
      || !hash(value.runtime.imageIdentity) || !hash(value.runtime.binaryIdentity)) {
    fail('X92_STM32_BINDING_INVALID');
  }
  return Object.freeze(clone(value));
}

export function x92IdentityFromStm32Binding(value) {
  const binding = normalizeX92Stm32Binding(value);
  return Object.freeze({ schema: 'intent-mcu-experiment-budget-identity@1', profile: binding.profile,
    projectGeneration: binding.projectGeneration, sourceIdentity: binding.sourceIdentity,
    graphIdentity: binding.graphIdentity });
}

export function normalizeX92Stm32Completion(value, expectedBinding) {
  const binding = normalizeX92Stm32Binding(expectedBinding);
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, ['schema', 'operationId', 'binding', 'state', 'processExited',
        'daemonContainerAbsent', 'artifactPreserved', 'completedNaturally', 'signature'])
      || value.schema !== X92_STM32_COMPLETION_SCHEMA
      || !/^stm32-operation-[1-9][0-9]*$/u.test(value.operationId ?? '')
      || !same(normalizeX92Stm32Binding(value.binding), binding)
      || value.state !== 'quiescent' || value.processExited !== true
      || value.daemonContainerAbsent !== true || value.artifactPreserved !== true
      || value.completedNaturally !== true
      || typeof value.signature !== 'string' || !/^[a-f0-9]{64}$/u.test(value.signature)) {
    fail('X92_STM32_COMPLETION_INVALID');
  }
  return Object.freeze(clone(value));
}

function validResult(value, binding) {
  try {
    return value && typeof value === 'object' && !Array.isArray(value)
      && exactKeys(value, ['schema', 'ok', 'code', 'executed', 'executionIdentity',
        'runtime', 'completion'])
      && value.schema === X92_STM32_RESULT_SCHEMA && value.ok === true && value.executed === true
      && same(normalizeX92Stm32Binding(value.executionIdentity), binding)
      && value.runtime?.engine?.id === 'renode' && value.runtime.engine.actualExecution === true
      && same(normalizeX92Stm32Completion(value.completion, binding), value.completion);
  } catch { return false; }
}

export function createX92Stm32BudgetIntegration({ budget, currentBinding,
  retireCurrentOwner, executeBudgetProducer, executeManualProducer, cancelBudgetProducer,
  now = () => performance.now(), schedule = setTimeout, unschedule = clearTimeout,
  parseRequest = parseBoundedActionRequest, measurementSource = 'browser.performance.now' } = {}) {
  if (!budget || typeof budget.reserve !== 'function' || typeof budget.finalize !== 'function'
      || typeof currentBinding !== 'function' || typeof retireCurrentOwner !== 'function'
      || typeof executeBudgetProducer !== 'function' || typeof executeManualProducer !== 'function'
      || typeof cancelBudgetProducer !== 'function') fail('X92_STM32_INTEGRATION_CONFIGURATION');
  let gate = null;
  let tombstone = null;
  let sequence = 0;
  const permits = new WeakMap();
  const projection = () => Object.freeze({
    gate: gate ? { owner: gate.owner, requestId: gate.requestId, phase: gate.phase } : null,
    tombstone: tombstone ? clone(tombstone) : null,
  });
  const block = (code, extra = {}) => ({ ok: false, code, executed: false, ...extra,
    integration: projection() });
  function claim(owner, requestId, action) {
    if (gate || tombstone) return null;
    const permit = Object.freeze({});
    gate = { owner, requestId, action, phase: 'claimed',
      token: `x92-stm32-dispatch-${++sequence}`, permit };
    permits.set(permit, { token: gate.token, action, binding: null });
    return gate;
  }
  function release(owner) { if (gate === owner) gate = null; }
  function poison(owner, code) {
    tombstone = Object.freeze({ requestId: owner.requestId, token: owner.token, code });
    owner.phase = 'blocked';
  }
  function authorize(owner, binding) {
    const record = permits.get(owner.permit);
    if (!record || record.token !== owner.token) fail('X92_STM32_PERMIT_OWNER_INVALID');
    record.binding = binding;
    owner.phase = 'authorized';
  }
  function advancingBoundary(permit, binding = null, action = 'runtime.run') {
    const record = permits.get(permit);
    if (!gate || gate.permit !== permit || gate.phase !== 'authorized' || !record
        || record.token !== gate.token || record.action !== action) {
      return block('X92_STM32_SHARED_GATE_BLOCKED');
    }
    if (action === 'firmware.build' && binding === null && record.binding === null) {
      return { ok: true, code: 'X92_STM32_PRIVATE_PERMIT_ACCEPTED', token: record.token };
    }
    try {
      if (!record.binding || !same(record.binding, normalizeX92Stm32Binding(binding))) {
        return block('X92_STM32_PERMIT_BINDING_MISMATCH');
      }
    } catch { return block('X92_STM32_PERMIT_BINDING_MISMATCH'); }
    return { ok: true, code: 'X92_STM32_PRIVATE_PERMIT_ACCEPTED', token: record.token };
  }
  const finalize = (reference, kind, elapsed = null) => budget.finalize(reference, {
    kind, authenticated: Number.isSafeInteger(elapsed),
    measuredWallClockMs: Number.isSafeInteger(elapsed) ? elapsed : null,
    measurementSource: Number.isSafeInteger(elapsed) ? measurementSource : null,
  });

  async function executeBudgeted(source, { unresolvedProblems = [] } = {}) {
    let request;
    try { request = parseRequest(source); } catch (error) { return block(error?.code ?? 'ACTION_REQUEST_INVALID'); }
    if (request.action !== 'runtime.run' || request.profile !== PROFILE) return block('X92_STM32_PRIVATE_SCOPE');
    if (!budget.active()) return block('X92_SESSION_INACTIVE');
    const owner = claim('budget', request.requestId, request.action);
    if (!owner) return block(tombstone ? 'X92_STM32_RETIREMENT_TOMBSTONE' : 'X92_STM32_SHARED_GATE_BLOCKED');
    let reference = null; let reservation = null; let started = null; let timer = null; let settled = false;
    let resolveDeadline;
    const deadline = new Promise((resolve) => { resolveDeadline = resolve; });
    const finish = (kind, elapsed = null) => {
      if (settled || !reference) return null;
      settled = true;
      return finalize(reference, kind, elapsed);
    };
    const expire = (code) => {
      try { cancelBudgetProducer(request.requestId); } catch { /* full charge */ }
      poison(owner, code);
      const accounting = finish('timeout');
      return block('X92_DEADLINE_EXCEEDED', { executed: true,
        experimentBudget: accounting?.terminal ?? null });
    };
    try {
      const binding = normalizeX92Stm32Binding(await currentBinding(request));
      if (binding.projectGeneration !== request.expectedGeneration) return block('ACTION_STALE_GENERATION');
      reservation = budget.reserve(request, x92IdentityFromStm32Binding(binding), { unresolvedProblems });
      if (!reservation.ok || !reservation.budgeted) return reservation;
      reference = reservation.reservation;
      started = now();
      if (!Number.isFinite(started)) fail('X92_STM32_MONOTONIC_CLOCK_INVALID');
      timer = schedule(() => {
        try { cancelBudgetProducer(request.requestId); } catch { /* full charge */ }
        resolveDeadline({ deadline: true });
      }, reservation.deadlineAfterMs);
      authorize(owner, binding);
      const result = await Promise.race([
        Promise.resolve().then(() => executeBudgetProducer(source, owner.permit, clone(binding))), deadline,
      ]);
      if (result?.deadline === true || !Number.isFinite(now())
          || now() >= started + reservation.deadlineAfterMs) return expire('X92_STM32_DEADLINE_UNCONFIRMED');
      if (!validResult(result, binding)) {
        poison(owner, 'X92_STM32_RESULT_OR_COMPLETION_INVALID');
        const accounting = finish('quiescence-failed');
        return block('X92_STM32_COMPLETION_UNPROVEN', { executed: true,
          experimentBudget: accounting?.terminal ?? null });
      }
      owner.phase = 'verifying-completion';
      const acknowledged = await Promise.race([
        Promise.resolve().then(() => retireCurrentOwner({ request: clone(request),
          binding: clone(binding), completion: clone(result.completion), dispatchToken: owner.token,
          deadlineAt: started + reservation.deadlineAfterMs })), deadline,
      ]);
      if (acknowledged?.deadline === true || !Number.isFinite(now())
          || now() >= started + reservation.deadlineAfterMs) return expire('X92_STM32_QUIESCENCE_DEADLINE');
      try { normalizeX92Stm32Completion(acknowledged, binding); } catch {
        poison(owner, 'X92_STM32_QUIESCENCE_ACK_INVALID');
        const accounting = finish('quiescence-failed');
        return block('X92_STM32_QUIESCENCE_UNPROVEN', { executed: true,
          experimentBudget: accounting?.terminal ?? null });
      }
      const elapsed = Math.max(0, Math.ceil(now() - started));
      if (!Number.isSafeInteger(elapsed) || elapsed >= reservation.deadlineAfterMs) {
        return expire('X92_STM32_ACCOUNTING_DEADLINE');
      }
      const accounting = finish('success', elapsed);
      owner.phase = 'retired';
      release(owner);
      return { ...clone(result), experimentBudget: accounting?.terminal ?? null,
        privatePermitAccepted: true, integration: projection() };
    } catch (error) {
      const accounting = reference ? finish('crash') : null;
      poison(owner, error?.code ?? 'X92_STM32_INTEGRATION_CRASH');
      return block('X92_STM32_INTEGRATION_CRASH', { executed: Boolean(reference),
        details: [error?.code ?? error?.message ?? 'unknown'],
        ...(accounting?.terminal ? { experimentBudget: accounting.terminal } : {}) });
    } finally {
      if (timer !== null) unschedule(timer);
      if (!tombstone) release(owner);
    }
  }

  async function executeManual(task, { action = 'runtime.run', requestId = `manual-${action}` } = {}) {
    if (typeof task !== 'function' || !['firmware.build', 'runtime.run'].includes(action)) {
      fail('X92_STM32_MANUAL_ACTION');
    }
    const owner = claim('manual', requestId, action);
    if (!owner) return block(tombstone ? 'X92_STM32_RETIREMENT_TOMBSTONE' : 'X92_STM32_SHARED_GATE_BLOCKED');
    try {
      const binding = action === 'runtime.run' ? normalizeX92Stm32Binding(await currentBinding()) : null;
      authorize(owner, binding);
      return await executeManualProducer(task, owner.permit, binding ? clone(binding) : null, action);
    } finally { release(owner); }
  }

  return Object.freeze({ executeBudgeted, executeManual, advancingBoundary, status: projection,
    cancel: (requestId) => {
      if (!gate || gate.owner !== 'budget' || gate.requestId !== requestId) {
        return { ok: false, code: 'ACTION_NOT_ACTIVE' };
      }
      try { cancelBudgetProducer(requestId); } catch { /* gate remains owned */ }
      return { ok: true, code: 'ACTION_CANCEL_REQUESTED' };
    } });
}
