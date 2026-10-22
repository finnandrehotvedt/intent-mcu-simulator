// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys, parseStrictJson } from './strict-json.mjs';
import { parseBoundedActionRequest } from './bounded-action-contracts.mjs';

export const X92_BUDGET_SCHEMA = 'intent-mcu-experiment-budget@1';
export const X92_REVIEW_SCHEMA = 'intent-mcu-experiment-budget-review@1';
export const X92_RESULT_SCHEMA = 'intent-mcu-experiment-budget-result@1';
export const X92_RUNTIME_QUIESCENCE_ACK_SCHEMA = 'intent-mcu-x92-runtime-quiescence-ack@1';
export const X92_REVIEW_LIMIT = 64 * 1024;
export const X92_DEFAULT_LIMITS = Object.freeze({
  builds: 2,
  runs: 4,
  scenarios: 8,
  wallClockMs: 120_000,
});
export const X92_ACTION_WALL_LIMITS = Object.freeze({
  'firmware.build': 30_000,
  'runtime.run': 30_000,
});
export const X92_NO_AUTHORITY = Object.freeze({
  apply: false,
  build: false,
  run: false,
  retry: false,
  replay: false,
  verdict: false,
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const PROFILE = /^board\.[a-z0-9.-]+-v[0-9]+$/u;
const SESSION_ID = /^x92-session-[A-Za-z0-9-]{8,96}$/u;
const RESERVATION_ID = /^x92-reservation-[A-Za-z0-9-]{8,96}$/u;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$/u;
const TERMINAL_KINDS = new Set(['success', 'failure', 'cancelled', 'timeout', 'crash',
  'quiescence-failed', 'identity-change', 'session-retired']);
const clone = (value) => structuredClone(value);
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
};
const requestFingerprint = (request) => JSON.stringify(canonical(request));

function error(code, details = []) {
  throw Object.assign(new Error(code), { code, details });
}

function integer(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) error(code);
  return value;
}

function normalizeLimits(value = X92_DEFAULT_LIMITS) {
  if (!exactKeys(value, ['builds', 'runs', 'scenarios', 'wallClockMs'])) error('X92_LIMITS_SHAPE');
  const limits = {
    builds: integer(value.builds, 'X92_LIMIT_BUILDS'),
    runs: integer(value.runs, 'X92_LIMIT_RUNS'),
    scenarios: integer(value.scenarios, 'X92_LIMIT_SCENARIOS'),
    wallClockMs: integer(value.wallClockMs, 'X92_LIMIT_WALL_CLOCK'),
  };
  if (Object.values(limits).some((item) => item === 0)) error('X92_LIMIT_ZERO');
  return Object.freeze(limits);
}

export function normalizeX92Identity(value) {
  if (!exactKeys(value, ['schema', 'profile', 'projectGeneration', 'sourceIdentity', 'graphIdentity'])
      || value.schema !== 'intent-mcu-experiment-budget-identity@1'
      || !PROFILE.test(value.profile ?? '')
      || !Number.isSafeInteger(value.projectGeneration) || value.projectGeneration < 1
      || !HASH.test(value.sourceIdentity ?? '') || !HASH.test(value.graphIdentity ?? '')) {
    error('X92_IDENTITY_SHAPE');
  }
  return Object.freeze(clone(value));
}

function identityEqual(left, right) {
  return left.schema === right.schema && left.profile === right.profile
    && left.projectGeneration === right.projectGeneration
    && left.sourceIdentity === right.sourceIdentity && left.graphIdentity === right.graphIdentity;
}

function normalizeUnresolved(value = []) {
  if (!Array.isArray(value) || value.length > 32) error('X92_UNRESOLVED_SHAPE');
  const seen = new Set();
  return value.map((item) => {
    if (typeof item !== 'string' || item !== item.trim() || !item
        || new TextEncoder().encode(item).byteLength > 160 || seen.has(item)) {
      error('X92_UNRESOLVED_ITEM');
    }
    seen.add(item); return item;
  });
}

function actionCost(request) {
  if (request.action === 'firmware.build') {
    return { builds: 1, runs: 0, scenarios: 0, wallClockMs: X92_ACTION_WALL_LIMITS['firmware.build'] };
  }
  if (request.action === 'runtime.run') {
    return { builds: 0, runs: 1,
      scenarios: request.payload?.experimentId === 'avr-thermostat-boundary-v1' ? 4 : 0,
      wallClockMs: X92_ACTION_WALL_LIMITS['runtime.run'] };
  }
  return null;
}

function emptyUsage() {
  return { builds: 0, runs: 0, scenarios: 0, wallClockMs: 0 };
}

function addUsage(target, source) {
  for (const key of ['builds', 'runs', 'scenarios', 'wallClockMs']) {
    const next = target[key] + source[key];
    if (!Number.isSafeInteger(next)) error('X92_USAGE_OVERFLOW');
    target[key] = next;
  }
}

function reservationUsage(reservations) {
  const usage = emptyUsage();
  for (const item of reservations.values()) addUsage(usage, item.cost);
  return usage;
}

function remaining(limits, consumed, reserved) {
  const output = {};
  for (const key of ['builds', 'runs', 'scenarios', 'wallClockMs']) {
    output[key] = limits[key] - consumed[key] - reserved[key];
    if (!Number.isSafeInteger(output[key])) error('X92_REMAINING_OVERFLOW');
  }
  return output;
}

function terminalSnapshot(item, duplicate = false) {
  return Object.freeze({
    reservationId: item.reservationId,
    requestId: item.requestId,
    action: item.action,
    terminalKind: item.terminalKind,
    outcome: item.outcome,
    charged: clone(item.charged),
    measurement: clone(item.measurement),
    duplicate,
  });
}

function reviewProjection(session) {
  const reserved = reservationUsage(session.reservations);
  return {
    schema: X92_REVIEW_SCHEMA,
    dataOnly: true,
    active: session.active,
    sessionId: session.sessionId,
    identity: clone(session.identity),
    limits: clone(session.limits),
    consumed: clone(session.consumed),
    reserved,
    remaining: remaining(session.limits, session.consumed, reserved),
    reservations: [...session.reservations.values()].map((item) => ({
      reservationId: item.reservationId,
      requestId: item.requestId,
      action: item.action,
      cost: clone(item.cost),
      deadlineAfterMs: item.cost.wallClockMs,
    })),
    terminal: [...session.terminal.values()].map((item) => ({
      reservationId: item.reservationId,
      requestId: item.requestId,
      action: item.action,
      terminalKind: item.terminalKind,
      outcome: item.outcome,
      charged: clone(item.charged),
      measurement: clone(item.measurement),
    })),
    unresolvedProblems: [...session.unresolvedProblems],
    measurement: { source: session.measurementSource, unit: 'wall-clock-ms',
      virtualTimeNormalization: false, crossControllerNormalization: false },
    authority: clone(X92_NO_AUTHORITY),
    restores: { activeSession: false, runtime: false, reservation: false,
      permission: false, executable: false, verdict: false, limits: false, consumption: false },
  };
}

function validateUsage(value, code) {
  if (!exactKeys(value, ['builds', 'runs', 'scenarios', 'wallClockMs'])) error(code);
  return {
    builds: integer(value.builds, code), runs: integer(value.runs, code),
    scenarios: integer(value.scenarios, code), wallClockMs: integer(value.wallClockMs, code),
  };
}

function actionCompatibleUsage(action, usage, { terminal = false, indeterminate = false } = {}) {
  const countCompatible = action === 'firmware.build'
    ? usage.builds === 1 && usage.runs === 0 && usage.scenarios === 0
    : action === 'runtime.run' && usage.builds === 0 && usage.runs === 1
      && [0, 4].includes(usage.scenarios);
  const wallCompatible = terminal
    ? usage.wallClockMs <= X92_ACTION_WALL_LIMITS[action]
      && (!indeterminate || usage.wallClockMs === X92_ACTION_WALL_LIMITS[action])
    : usage.wallClockMs === X92_ACTION_WALL_LIMITS[action];
  return countCompatible && wallCompatible;
}

export function parseX92ReviewProjection(source) {
  const value = typeof source === 'string' ? parseStrictJson(source, X92_REVIEW_LIMIT)
    : parseStrictJson(JSON.stringify(source), X92_REVIEW_LIMIT);
  const keys = ['schema', 'dataOnly', 'active', 'sessionId', 'identity', 'limits', 'consumed',
    'reserved', 'remaining', 'reservations', 'terminal', 'unresolvedProblems', 'measurement',
    'authority', 'restores'];
  if (!exactKeys(value, keys) || value.schema !== X92_REVIEW_SCHEMA || value.dataOnly !== true
      || typeof value.active !== 'boolean' || !SESSION_ID.test(value.sessionId ?? '')) error('X92_REVIEW_SHAPE');
  const identity = normalizeX92Identity(value.identity);
  const limits = normalizeLimits(value.limits);
  if (Object.keys(X92_DEFAULT_LIMITS).some((key) => limits[key] !== X92_DEFAULT_LIMITS[key])) {
    error('X92_REVIEW_LIMITS_NOT_FIXED');
  }
  const consumed = validateUsage(value.consumed, 'X92_REVIEW_CONSUMED');
  const reserved = validateUsage(value.reserved, 'X92_REVIEW_RESERVED');
  const reportedRemaining = validateUsage(value.remaining, 'X92_REVIEW_REMAINING');
  const computed = remaining(limits, consumed, reserved);
  if (Object.keys(computed).some((key) => computed[key] < 0 || computed[key] !== reportedRemaining[key])) {
    error('X92_REVIEW_TOTALS');
  }
  if (!Array.isArray(value.reservations) || value.reservations.length > 16
      || !Array.isArray(value.terminal) || value.terminal.length > 64) error('X92_REVIEW_ROWS');
  const unresolvedProblems = normalizeUnresolved(value.unresolvedProblems);
  if (!exactKeys(value.measurement, ['source', 'unit', 'virtualTimeNormalization', 'crossControllerNormalization'])
      || typeof value.measurement.source !== 'string' || !value.measurement.source
      || value.measurement.unit !== 'wall-clock-ms' || value.measurement.virtualTimeNormalization !== false
      || value.measurement.crossControllerNormalization !== false
      || !exactKeys(value.authority, Object.keys(X92_NO_AUTHORITY))
      || Object.values(value.authority).some((item) => item !== false)
      || !exactKeys(value.restores, ['activeSession', 'runtime', 'reservation', 'permission',
        'executable', 'verdict', 'limits', 'consumption'])
      || Object.values(value.restores).some((item) => item !== false)) error('X92_REVIEW_AUTHORITY');
  const reservationIds = new Set(); const requestIds = new Set(); const reservationTotals = emptyUsage();
  for (const row of value.reservations) {
    if (!exactKeys(row, ['reservationId', 'requestId', 'action', 'cost', 'deadlineAfterMs'])
        || !RESERVATION_ID.test(row.reservationId ?? '') || !REQUEST_ID.test(row.requestId ?? '')
        || !['firmware.build', 'runtime.run'].includes(row.action)
        || row.deadlineAfterMs !== row.cost?.wallClockMs || reservationIds.has(row.reservationId)
        || requestIds.has(row.requestId)) {
      error('X92_REVIEW_RESERVATION');
    }
    reservationIds.add(row.reservationId); requestIds.add(row.requestId);
    const cost = validateUsage(row.cost, 'X92_REVIEW_RESERVATION_COST');
    if (!actionCompatibleUsage(row.action, cost)) error('X92_REVIEW_RESERVATION_COST');
    addUsage(reservationTotals, cost);
  }
  if (!value.active && value.reservations.length) error('X92_REVIEW_RETIRED_RESERVATION');
  if (Object.keys(reserved).some((key) => reserved[key] !== reservationTotals[key])) error('X92_REVIEW_RESERVED_TOTALS');
  const terminalIds = new Set(); const terminalTotals = emptyUsage();
  for (const row of value.terminal) {
    if (!exactKeys(row, ['reservationId', 'requestId', 'action', 'terminalKind', 'outcome', 'charged', 'measurement'])
        || !RESERVATION_ID.test(row.reservationId ?? '') || !TERMINAL_KINDS.has(row.terminalKind)
        || !REQUEST_ID.test(row.requestId ?? '') || !['firmware.build', 'runtime.run'].includes(row.action)
        || !['complete', 'indeterminate'].includes(row.outcome) || terminalIds.has(row.reservationId)
        || reservationIds.has(row.reservationId) || requestIds.has(row.requestId)) {
      error('X92_REVIEW_TERMINAL');
    }
    terminalIds.add(row.reservationId); requestIds.add(row.requestId);
    const charged = validateUsage(row.charged, 'X92_REVIEW_TERMINAL_CHARGE');
    if (!actionCompatibleUsage(row.action, charged,
      { terminal: true, indeterminate: row.outcome === 'indeterminate' })) error('X92_REVIEW_TERMINAL_CHARGE');
    addUsage(terminalTotals, charged);
    const complete = row.outcome === 'complete';
    const measurementKeys = complete ? ['source', 'unit', 'value', 'complete']
      : ['source', 'unit', 'value', 'complete', 'chargedUpperBoundMs'];
    if (!exactKeys(row.measurement, measurementKeys)
        || row.measurement.source !== value.measurement.source || row.measurement.unit !== 'wall-clock-ms'
        || row.measurement.complete !== complete
        || (complete && (!Number.isSafeInteger(row.measurement.value) || row.measurement.value < 0
          || row.measurement.value !== charged.wallClockMs))
        || (!complete && (row.measurement.value !== null
          || row.measurement.chargedUpperBoundMs !== charged.wallClockMs))) error('X92_REVIEW_TERMINAL_MEASUREMENT');
  }
  if (Object.keys(consumed).some((key) => consumed[key] !== terminalTotals[key])) error('X92_REVIEW_CONSUMED_TOTALS');
  return Object.freeze({ ok: true, code: 'X92_REVIEW_INERT', review: Object.freeze({
    ...clone(value), identity, limits, consumed, reserved, remaining: computed, unresolvedProblems,
    activeAuthorityRestored: false,
  }) });
}

export function createX92ExperimentBudget({
  limits = X92_DEFAULT_LIMITS,
  measurementSource = 'browser.performance.now',
  randomId = () => crypto.randomUUID(),
} = {}) {
  const fixedLimits = normalizeLimits(limits);
  if (typeof measurementSource !== 'string' || !measurementSource
      || new TextEncoder().encode(measurementSource).byteLength > 80) error('X92_MEASUREMENT_SOURCE');
  let session = null;
  let reservationSequence = 0;

  function snapshot() {
    return session ? Object.freeze(reviewProjection(session)) : null;
  }

  function start(identity, { humanInitiated = false } = {}) {
    if (humanInitiated !== true) return { ok: false, code: 'X92_HUMAN_ACTION_REQUIRED' };
    if (session?.active) retire('explicit-new-session');
    const suffix = String(randomId()).replace(/[^A-Za-z0-9-]/gu, '').slice(0, 96);
    if (suffix.length < 8) error('X92_RANDOM_ID');
    session = {
      schema: X92_BUDGET_SCHEMA,
      active: true,
      sessionId: `x92-session-${suffix}`,
      identity: normalizeX92Identity(identity),
      limits: fixedLimits,
      consumed: emptyUsage(),
      reservations: new Map(),
      terminal: new Map(),
      requests: new Map(),
      unresolvedProblems: [],
      measurementSource,
      retiredReason: null,
    };
    reservationSequence = 0;
    return { ok: true, code: 'X92_SESSION_STARTED', review: snapshot() };
  }

  function reserve(request, identity, { unresolvedProblems = [] } = {}) {
    if (!session?.active) return { ok: true, code: 'X92_INACTIVE', budgeted: false };
    const current = normalizeX92Identity(identity);
    if (!identityEqual(current, session.identity)) return { ok: false, code: 'X92_IDENTITY_STALE', budgeted: false };
    const cost = actionCost(request);
    if (!cost) return { ok: true, code: 'X92_NO_RESOURCE_COST', budgeted: false };
    if (!REQUEST_ID.test(request.requestId ?? '')) error('X92_REQUEST_ID');
    const fingerprint = requestFingerprint(request);
    const priorRequest = session.requests.get(request.requestId);
    if (priorRequest) {
      if (priorRequest.fingerprint !== fingerprint) {
        return { ok: false, budgeted: true, code: 'X92_REQUEST_ID_CONFLICT', executed: false,
          authority: clone(X92_NO_AUTHORITY), review: snapshot() };
      }
      const priorTerminal = session.terminal.get(priorRequest.reservationId);
      return { ok: false, budgeted: true,
        code: priorRequest.status === 'pending' ? 'X92_REQUEST_DUPLICATE_PENDING' : 'X92_REQUEST_DUPLICATE_TERMINAL',
        executed: false, authority: clone(X92_NO_AUTHORITY),
        ...(priorTerminal ? { terminal: terminalSnapshot(priorTerminal, true) } : {}), review: snapshot() };
    }
    const unresolved = normalizeUnresolved(unresolvedProblems);
    session.unresolvedProblems = unresolved;
    const reserved = reservationUsage(session.reservations);
    const available = remaining(session.limits, session.consumed, reserved);
    const exhaustedDimensions = Object.keys(cost).filter((key) => cost[key] > available[key]);
    if (exhaustedDimensions.length) {
      return {
        ok: false, budgeted: true, code: 'budget_exhausted', schema: X92_RESULT_SCHEMA,
        exhaustedDimensions, unresolvedProblems: [...unresolved], review: snapshot(),
        authority: clone(X92_NO_AUTHORITY), executed: false,
      };
    }
    reservationSequence += 1;
    const suffix = `${session.sessionId.slice('x92-session-'.length)}-${reservationSequence}`;
    const reservationId = `x92-reservation-${suffix}`;
    const reservation = {
      reservationId, sessionId: session.sessionId, requestId: request.requestId,
      action: request.action, cost: clone(cost), binding: clone(session.identity),
    };
    session.reservations.set(reservationId, reservation);
    session.requests.set(request.requestId, { fingerprint, reservationId, status: 'pending' });
    return { ok: true, code: 'X92_RESERVED', budgeted: true,
      reservation: Object.freeze(clone(reservation)), deadlineAfterMs: cost.wallClockMs, review: snapshot() };
  }

  function finalize(reference, terminal) {
    if (!reference || typeof reference !== 'object') error('X92_RESERVATION_REFERENCE');
    if (!session || reference.sessionId !== session.sessionId) {
      return { ok: false, code: 'X92_RETIRED_CALLBACK_IGNORED', duplicate: false };
    }
    const prior = session.terminal.get(reference.reservationId);
    if (prior) return { ok: true, code: 'X92_TERMINAL_DUPLICATE', terminal: terminalSnapshot(prior, true) };
    const reservation = session.reservations.get(reference.reservationId);
    if (!reservation || reservation.requestId !== reference.requestId) {
      return { ok: false, code: 'X92_RESERVATION_NOT_ACTIVE', duplicate: false };
    }
    if (!terminal || !TERMINAL_KINDS.has(terminal.kind)) error('X92_TERMINAL_KIND');
    const authenticated = terminal.authenticated === true
      && terminal.measurementSource === session.measurementSource
      && Number.isSafeInteger(terminal.measuredWallClockMs)
      && terminal.measuredWallClockMs >= 0
      && terminal.measuredWallClockMs <= reservation.cost.wallClockMs
      && !['crash', 'identity-change', 'session-retired'].includes(terminal.kind);
    const charged = clone(reservation.cost);
    charged.wallClockMs = authenticated ? terminal.measuredWallClockMs : reservation.cost.wallClockMs;
    addUsage(session.consumed, charged);
    session.reservations.delete(reference.reservationId);
    const item = {
      reservationId: reference.reservationId,
      requestId: reference.requestId,
      action: reservation.action,
      terminalKind: terminal.kind,
      outcome: authenticated ? 'complete' : 'indeterminate',
      charged,
      measurement: authenticated
        ? { source: session.measurementSource, unit: 'wall-clock-ms', value: terminal.measuredWallClockMs, complete: true }
        : { source: session.measurementSource, unit: 'wall-clock-ms', value: null, complete: false,
          chargedUpperBoundMs: reservation.cost.wallClockMs },
    };
    session.terminal.set(reference.reservationId, item);
    const requestRecord = session.requests.get(reference.requestId);
    if (requestRecord?.reservationId === reference.reservationId) requestRecord.status = 'terminal';
    if (session.terminal.size > 64) session.terminal.delete(session.terminal.keys().next().value);
    return { ok: true, code: authenticated ? 'X92_TERMINAL_ACCOUNTED' : 'X92_TERMINAL_INDETERMINATE',
      terminal: terminalSnapshot(item), review: snapshot() };
  }

  function chargeInflight(kind) {
    const references = [...session.reservations.values()].map((item) => ({
      reservationId: item.reservationId, sessionId: item.sessionId, requestId: item.requestId,
    }));
    const requestIds = references.map((item) => item.requestId);
    for (const reference of references) finalize(reference, { kind, authenticated: false,
      measuredWallClockMs: null, measurementSource: null });
    return requestIds;
  }

  function rebind(identity, reason = 'identity-change') {
    if (!session?.active) return { ok: false, code: 'X92_SESSION_INACTIVE', requestIds: [] };
    const next = normalizeX92Identity(identity);
    if (identityEqual(next, session.identity)) return { ok: true, code: 'X92_IDENTITY_UNCHANGED', requestIds: [] };
    const requestIds = chargeInflight('identity-change');
    session.identity = next;
    session.unresolvedProblems = [...session.unresolvedProblems,
      `Identity changed: ${reason}`].slice(-32);
    return { ok: true, code: 'X92_IDENTITY_REBOUND', requestIds, review: snapshot() };
  }

  function retire(reason = 'session-retired') {
    if (!session?.active) return { ok: false, code: 'X92_SESSION_INACTIVE', requestIds: [] };
    const requestIds = chargeInflight('session-retired');
    session.active = false;
    session.retiredReason = reason;
    return { ok: true, code: 'X92_SESSION_RETIRED', requestIds, review: snapshot() };
  }

  return Object.freeze({
    schema: X92_BUDGET_SCHEMA,
    limits: fixedLimits,
    active: () => Boolean(session?.active),
    sessionId: () => session?.sessionId ?? null,
    start,
    reserve,
    finalize,
    rebind,
    retire,
    snapshot,
    reviewText: () => session ? `${JSON.stringify(reviewProjection(session), null, 2)}\n` : null,
    parseReview: parseX92ReviewProjection,
  });
}

export function createX92BudgetedExecutor({
  budget,
  downstream,
  currentIdentity,
  quiesceRuntime,
  now = () => performance.now(),
  schedule = setTimeout,
  unschedule = clearTimeout,
  parseRequest = (source) => parseBoundedActionRequest(source),
  measurementSource = 'browser.performance.now',
} = {}) {
  if (!budget || typeof budget.reserve !== 'function' || !downstream
      || typeof downstream.execute !== 'function' || typeof downstream.cancel !== 'function'
      || typeof currentIdentity !== 'function' || typeof quiesceRuntime !== 'function') {
    error('X92_EXECUTOR_CONFIGURATION');
  }

  let runtimeBoundary = null;
  let dispatchGate = null;
  let dispatchSequence = 0;
  const boundaryProjection = () => runtimeBoundary ? Object.freeze({
    status: runtimeBoundary.status,
    requestId: runtimeBoundary.requestId,
    reason: runtimeBoundary.reason,
    code: runtimeBoundary.code,
  }) : Object.freeze({ status: 'idle', requestId: null, reason: null, code: 'X92_RUNTIME_QUIESCENT' });
  const gateProjection = () => dispatchGate ? Object.freeze({
    status: dispatchGate.status,
    requestId: dispatchGate.requestId,
    action: dispatchGate.action,
    code: dispatchGate.code,
  }) : Object.freeze({ status: 'idle', requestId: null, action: null, code: 'X92_DISPATCH_IDLE' });

  function claimDispatchGate(request) {
    if (dispatchGate) return null;
    dispatchSequence += 1;
    const gate = {
      token: `x92-dispatch-${dispatchSequence}`,
      requestId: request.requestId,
      action: request.action,
      fingerprint: requestFingerprint(request),
      cancelRequested: false,
      status: 'identity-check',
      code: 'X92_DISPATCH_IDENTITY_CHECK',
      sessionId: budget.sessionId(),
    };
    dispatchGate = gate;
    return gate;
  }

  function releaseDispatchGate(gate) {
    if (dispatchGate !== gate) return false;
    dispatchGate = null;
    return true;
  }

  function validQuiescenceAck(value, request, binding, reason, gate) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || !exactKeys(value, ['schema', 'requestId', 'dispatchToken', 'profile', 'identity',
          'producerState', 'acknowledged', 'evidence'])
        || value.schema !== X92_RUNTIME_QUIESCENCE_ACK_SCHEMA
        || value.requestId !== request.requestId || value.dispatchToken !== gate.token
        || value.profile !== request.profile
        || value.acknowledged !== true || !['paused', 'retired'].includes(value.producerState)
        || !value.evidence || typeof value.evidence !== 'object' || Array.isArray(value.evidence)
        || value.evidence.reason !== reason) return false;
    try { return identityEqual(normalizeX92Identity(value.identity), normalizeX92Identity(binding)); }
    catch { return false; }
  }

  function beginRuntimeQuiescence(request, reference, reason, gate) {
    if (request.action !== 'runtime.run') return null;
    if (runtimeBoundary?.owner === gate && runtimeBoundary.status !== 'running') {
      return runtimeBoundary;
    }
    if (runtimeBoundary && runtimeBoundary.owner !== gate) return null;
    const boundary = runtimeBoundary?.owner === gate ? runtimeBoundary : {
      owner: gate, requestId: request.requestId, promise: null, ack: null,
    };
    boundary.status = 'pending'; boundary.reason = reason;
    boundary.code = 'X92_RUNTIME_QUIESCENCE_PENDING';
    runtimeBoundary = boundary;
    boundary.promise = Promise.resolve().then(() => quiesceRuntime({
      request: clone(request), dispatchToken: gate.token, reservation: clone(reference),
      identity: clone(reference.binding), reason, deadlineAt: gate.deadlineAt,
    })).then((ack) => {
      if (!validQuiescenceAck(ack, request, reference.binding, reason, gate)) {
        boundary.status = 'blocked'; boundary.code = 'X92_RUNTIME_QUIESCENCE_ACK_INVALID';
        gate.status = 'blocked'; gate.code = boundary.code;
        return { ok: false, code: boundary.code, ack: null };
      }
      boundary.status = 'quiescent'; boundary.code = 'X92_RUNTIME_QUIESCENT'; boundary.ack = clone(ack);
      if (runtimeBoundary === boundary) runtimeBoundary = null;
      releaseDispatchGate(gate);
      return { ok: true, code: 'X92_RUNTIME_QUIESCENT', ack: clone(ack) };
    }).catch((caught) => {
      boundary.status = 'blocked'; boundary.code = 'X92_RUNTIME_QUIESCENCE_ACK_MISSING';
      gate.status = 'blocked'; gate.code = boundary.code;
      return { ok: false, code: boundary.code, ack: null,
        detail: caught?.code ?? caught?.message ?? 'unknown' };
    });
    return boundary;
  }

  async function execute(source, { unresolvedProblems = [] } = {}) {
    if (runtimeBoundary) {
      return { ok: false, schema: X92_RESULT_SCHEMA, code: 'X92_RUNTIME_BOUNDARY_BLOCKED',
        executed: false, authority: clone(X92_NO_AUTHORITY), runtimeBoundary: boundaryProjection() };
    }
    let request;
    try { request = parseRequest(source); }
    catch {
      if (dispatchGate) {
        return { ok: false, schema: X92_RESULT_SCHEMA, code: 'X92_DISPATCH_GATE_BLOCKED',
          executed: false, authority: clone(X92_NO_AUTHORITY), dispatchGate: gateProjection() };
      }
      return downstream.execute(source);
    }
    if (dispatchGate) {
      if (dispatchGate.requestId === request.requestId) {
        return { ok: false, schema: X92_RESULT_SCHEMA,
          code: dispatchGate.fingerprint === requestFingerprint(request)
            ? 'X92_REQUEST_DUPLICATE_PENDING' : 'X92_REQUEST_ID_CONFLICT',
          executed: false, authority: clone(X92_NO_AUTHORITY), dispatchGate: gateProjection() };
      }
      return { ok: false, schema: X92_RESULT_SCHEMA, code: 'X92_DISPATCH_GATE_BLOCKED',
        executed: false, authority: clone(X92_NO_AUTHORITY), dispatchGate: gateProjection() };
    }
    if (!budget.active()) return downstream.execute(source);
    if (!['firmware.build', 'runtime.run'].includes(request.action)) return downstream.execute(source);
    if (request.action === 'runtime.run' && !['board.atmega328p-16mhz-v1', 'board.rp2040-pico-v1'].includes(request.profile)) {
      return { ok: false, schema: X92_RESULT_SCHEMA, code: 'X92_RUNTIME_QUIESCENCE_UNPROVEN_PROFILE',
        executed: false, authority: clone(X92_NO_AUTHORITY), profile: request.profile };
    }
    const gate = claimDispatchGate(request);
    if (!gate) error('X92_DISPATCH_GATE_CLAIM');
    let releaseGateOnExit = true;
    let reference = null;
    let downstreamPromise = null;
    let deadlineTriggered = false;
    let started = null;
    let resolveDeadline;
    const deadline = new Promise((resolve) => { resolveDeadline = resolve; });
    let timer = null;
    try {
      const identity = await currentIdentity();
      const currentReview = budget.snapshot();
      if (dispatchGate !== gate || !budget.active() || budget.sessionId() !== gate.sessionId
          || !currentReview || !identityEqual(normalizeX92Identity(identity), currentReview.identity)) {
        return { ok: false, schema: X92_RESULT_SCHEMA, code: 'X92_SESSION_CHANGED_BEFORE_DISPATCH',
          executed: false, authority: clone(X92_NO_AUTHORITY), dispatchGate: gateProjection() };
      }
      if (gate.cancelRequested) {
        return { ok: false, schema: X92_RESULT_SCHEMA, code: 'X92_ACTION_CANCELLED_BEFORE_DISPATCH',
          executed: false, authority: clone(X92_NO_AUTHORITY) };
      }
      const reserved = budget.reserve(request, identity, { unresolvedProblems });
      if (!reserved.ok || !reserved.budgeted) {
        if (!reserved.ok) return reserved;
        return { ok: false, schema: X92_RESULT_SCHEMA, code: 'X92_DISPATCH_NOT_BUDGETED',
          executed: false, authority: clone(X92_NO_AUTHORITY) };
      }
      reference = reserved.reservation;
      gate.status = 'reserved'; gate.code = 'X92_DISPATCH_RESERVED';
      if (request.action === 'runtime.run') {
        runtimeBoundary = { owner: gate, status: 'running', requestId: request.requestId,
          reason: 'producer-active', code: 'X92_RUNTIME_ACTIVE', promise: null, ack: null };
      }
      gate.status = 'producer-active'; gate.code = 'X92_DISPATCH_ACTIVE';
      started = now();
      gate.deadlineAt = started + reserved.deadlineAfterMs;
      downstreamPromise = Promise.resolve().then(() => downstream.execute(source));
      timer = schedule(() => {
      deadlineTriggered = true;
      resolveDeadline({ x92Deadline: true });
      try { downstream.cancel(request.requestId); } catch { /* terminal accounting is already fail-closed */ }
      }, reserved.deadlineAfterMs);
      const result = await Promise.race([downstreamPromise, deadline]);
      if (result?.x92Deadline === true) {
        releaseGateOnExit = false;
        gate.status = 'cancellation-pending'; gate.code = 'X92_DISPATCH_CANCELLATION_PENDING';
        const boundary = beginRuntimeQuiescence(request, reference, 'deadline', gate);
        if (!boundary) {
          downstreamPromise.then(() => releaseDispatchGate(gate), () => releaseDispatchGate(gate));
        }
        const accounting = budget.finalize(reference, { kind: 'timeout', authenticated: false,
          measuredWallClockMs: null, measurementSource: null });
        return { ok: false, schema: X92_RESULT_SCHEMA, code: 'X92_DEADLINE_EXCEEDED',
          executed: true, authority: clone(X92_NO_AUTHORITY), experimentBudget: accounting.terminal ?? null,
          ...(boundary ? { runtimeBoundary: boundaryProjection() } : {}) };
      }
      let runtimeQuiescence = null;
      if (request.action === 'runtime.run') {
        const boundary = beginRuntimeQuiescence(request, reference, 'downstream-result', gate);
        if (!boundary) throw Object.assign(new Error('X92_RUNTIME_BOUNDARY_OWNER_CONFLICT'),
          { code: 'X92_RUNTIME_BOUNDARY_OWNER_CONFLICT' });
        const quiescence = await Promise.race([boundary.promise, deadline]);
        if (quiescence?.x92Deadline === true) {
          releaseGateOnExit = false;
          gate.status = 'cancellation-pending'; gate.code = 'X92_DISPATCH_CANCELLATION_PENDING';
          const accounting = budget.finalize(reference, { kind: 'timeout', authenticated: false,
            measuredWallClockMs: null, measurementSource: null });
          return { ok: false, schema: X92_RESULT_SCHEMA, code: 'X92_DEADLINE_EXCEEDED',
            executed: true, authority: clone(X92_NO_AUTHORITY), experimentBudget: accounting.terminal ?? null,
            runtimeBoundary: boundaryProjection() };
        }
        if (!quiescence?.ok) {
          releaseGateOnExit = false;
          const accounting = budget.finalize(reference, { kind: 'quiescence-failed', authenticated: false,
            measuredWallClockMs: null, measurementSource: null });
          return { ok: false, schema: X92_RESULT_SCHEMA, code: 'X92_RUNTIME_QUIESCENCE_UNCONFIRMED',
            executed: true, authority: clone(X92_NO_AUTHORITY), experimentBudget: accounting.terminal ?? null,
            runtimeBoundary: boundaryProjection() };
        }
        runtimeQuiescence = quiescence.ack;
      }
      const elapsed = Math.max(0, Math.ceil(now() - started));
      const authenticated = Number.isSafeInteger(elapsed) && elapsed <= reserved.deadlineAfterMs
        && result && typeof result === 'object'
        && (result.executed === true || ['ACTION_CANCELLED', 'ACTION_TIMEOUT', 'ACTION_BUSY',
          'ACTION_REPLAY', 'ACTION_PROFILE_MISMATCH', 'ACTION_STALE_GENERATION'].includes(result.code));
      const terminalKind = deadlineTriggered || result?.code === 'ACTION_TIMEOUT' ? 'timeout'
        : result?.code === 'ACTION_CANCELLED' ? 'cancelled'
        : result?.ok === false ? 'failure' : 'success';
      const accounting = budget.finalize(reference, { kind: terminalKind, authenticated,
        measuredWallClockMs: authenticated ? elapsed : null,
        measurementSource: authenticated ? measurementSource : null });
      return { ...result, experimentBudget: accounting.terminal ?? null,
        ...(runtimeQuiescence ? { runtimeQuiescence } : {}) };
    } catch (caught) {
      if (request.action === 'runtime.run' && reference && downstreamPromise) {
        const boundary = beginRuntimeQuiescence(request, reference, 'downstream-crash', gate);
        if (boundary) {
          const quiescence = await Promise.race([boundary.promise, deadline]);
          if (!quiescence?.ok) releaseGateOnExit = false;
        }
      }
      if (reference) budget.finalize(reference, { kind: 'crash', authenticated: false,
        measuredWallClockMs: null, measurementSource: null });
      return { ok: false, schema: X92_RESULT_SCHEMA, code: 'X92_DOWNSTREAM_CRASH',
        executed: false, authority: clone(X92_NO_AUTHORITY), details: [caught?.code ?? caught?.message ?? 'unknown'] };
    } finally {
      if (timer !== null) unschedule(timer);
      if (releaseGateOnExit) releaseDispatchGate(gate);
    }
  }

  return Object.freeze({
    execute,
    cancel: (requestId) => {
      if (dispatchGate?.requestId === requestId
          && ['identity-check', 'reserved'].includes(dispatchGate.status)) {
        dispatchGate.cancelRequested = true;
        dispatchGate.status = 'cancellation-pending';
        dispatchGate.code = 'X92_DISPATCH_CANCELLATION_PENDING';
        return { ok: true, code: 'ACTION_CANCEL_REQUESTED' };
      }
      return downstream.cancel(requestId);
    },
    runtimeBoundary: boundaryProjection,
    dispatchGate: gateProjection,
  });
}
