// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys, parseStrictJson } from './strict-json.mjs';

export const BOUNDED_ACTION_ROUTER_SCHEMA = 'intent-mcu-bounded-action-router@1';
export const BOUNDED_ACTION_REQUEST_SCHEMA = 'intent-mcu-bounded-action-request@1';
export const BOUNDED_ACTION_RESULT_SCHEMA = 'intent-mcu-bounded-action-result@1';
export const BOUNDED_ACTION_TTL_MAX_MS = 30_000;
export const BOUNDED_ACTION_REQUEST_LIMIT = 48 * 1024;
export const BOUNDED_ACTION_RESULT_LIMIT = 384 * 1024;

export const BOUNDED_ACTIONS = Object.freeze([
  'project.create',
  'patch.propose',
  'project.validate',
  'firmware.build',
  'runtime.run',
  'result.read',
  'project.export',
]);

export const BOUNDED_ACTION_AUTHORITY = Object.freeze({
  'project.create': Object.freeze({ mutation: true, build: false, run: false, export: false }),
  'patch.propose': Object.freeze({ mutation: false, build: false, run: false, export: false }),
  'project.validate': Object.freeze({ mutation: false, build: false, run: false, export: false }),
  'firmware.build': Object.freeze({ mutation: false, build: true, run: false, export: false }),
  'runtime.run': Object.freeze({ mutation: false, build: false, run: true, export: false }),
  'result.read': Object.freeze({ mutation: false, build: false, run: false, export: false }),
  'project.export': Object.freeze({ mutation: false, build: false, run: false, export: true }),
});

const REQUEST_KEYS = Object.freeze([
  'schema', 'action', 'requestId', 'profile', 'expectedGeneration',
  'issuedAtMs', 'expiresAtMs', 'payload',
]);
const EMPTY_PAYLOAD_ACTIONS = new Set([
  'project.validate', 'firmware.build', 'result.read', 'project.export',
]);
const clone = (value) => structuredClone(value);

function fail(code, details = []) {
  return {
    ok: false,
    schema: BOUNDED_ACTION_RESULT_SCHEMA,
    router: BOUNDED_ACTION_ROUTER_SCHEMA,
    code,
    details,
    executed: false,
  };
}

function actionError(code, details = []) {
  throw Object.assign(new Error(code), { code, details });
}

function parsePayload(action, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) actionError('ACTION_PAYLOAD_SHAPE');
  if (action === 'project.create') {
    const keysValid = exactKeys(payload, ['starterId'])
      || exactKeys(payload, ['starterId', 'firmwareVariant']);
    if (!keysValid || typeof payload.starterId !== 'string'
        || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(payload.starterId)) actionError('ACTION_CREATE_PAYLOAD');
    if (Object.hasOwn(payload, 'firmwareVariant')
        && (payload.starterId !== 'avr-thermostat-boundary-v1'
          || !['correct', 'known-bad-equality'].includes(payload.firmwareVariant))) {
      actionError('ACTION_CREATE_VARIANT_UNSUPPORTED');
    }
  } else if (action === 'patch.propose') {
    if (!exactKeys(payload, ['description']) || typeof payload.description !== 'string'
        || !payload.description.trim() || payload.description.length > 2_000) actionError('ACTION_PATCH_PAYLOAD');
  } else if (action === 'runtime.run') {
    if (!exactKeys(payload, [])
        && (!exactKeys(payload, ['experimentId'])
          || payload.experimentId !== 'avr-thermostat-boundary-v1')) {
      actionError('ACTION_RUN_PAYLOAD');
    }
  } else if (!EMPTY_PAYLOAD_ACTIONS.has(action) || !exactKeys(payload, [])) {
    actionError('ACTION_PAYLOAD_SHAPE');
  }
  return clone(payload);
}

export function parseBoundedActionRequest(source, now = Date.now()) {
  const value = typeof source === 'string' ? parseStrictJson(source, BOUNDED_ACTION_REQUEST_LIMIT)
    : parseStrictJson(JSON.stringify(source), BOUNDED_ACTION_REQUEST_LIMIT);
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, REQUEST_KEYS) || value.schema !== BOUNDED_ACTION_REQUEST_SCHEMA) {
    actionError('ACTION_REQUEST_SHAPE');
  }
  if (!BOUNDED_ACTIONS.includes(value.action)) actionError('ACTION_UNSUPPORTED');
  if (typeof value.requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$/u.test(value.requestId)) {
    actionError('ACTION_REQUEST_ID');
  }
  if (typeof value.profile !== 'string' || !/^board\.[a-z0-9.-]+-v[0-9]+$/u.test(value.profile)) {
    actionError('ACTION_PROFILE');
  }
  if (!Number.isInteger(value.expectedGeneration) || value.expectedGeneration < 1) actionError('ACTION_GENERATION');
  if (!Number.isSafeInteger(value.issuedAtMs) || !Number.isSafeInteger(value.expiresAtMs)
      || value.expiresAtMs <= value.issuedAtMs
      || value.expiresAtMs - value.issuedAtMs > BOUNDED_ACTION_TTL_MAX_MS) actionError('ACTION_TTL');
  if (value.issuedAtMs > now + 1_000) actionError('ACTION_NOT_YET_VALID');
  if (value.expiresAtMs <= now) actionError('ACTION_EXPIRED');
  return Object.freeze({ ...value, payload: parsePayload(value.action, value.payload) });
}

export function boundedActionRequest(action, profile, expectedGeneration, payload = {}, {
  now = Date.now(), ttlMs = 15_000, requestId = `action-${crypto.randomUUID()}`,
} = {}) {
  if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > BOUNDED_ACTION_TTL_MAX_MS) throw new TypeError('ACTION_TTL');
  return JSON.stringify({
    schema: BOUNDED_ACTION_REQUEST_SCHEMA,
    action,
    requestId,
    profile,
    expectedGeneration,
    issuedAtMs: now,
    expiresAtMs: now + ttlMs,
    payload,
  });
}

export function createBoundedActionRouter({ handlers, currentContext, now = () => Date.now() } = {}) {
  if (!handlers || typeof handlers !== 'object' || typeof currentContext !== 'function'
      || BOUNDED_ACTIONS.some((action) => typeof handlers[action] !== 'function')) {
    throw new TypeError('ACTION_ROUTER_CONFIGURATION');
  }
  const active = new Map();
  const completed = new Set();

  function remember(requestId) {
    completed.add(requestId);
    if (completed.size > 64) completed.delete(completed.values().next().value);
  }

  async function execute(source) {
    let request;
    try { request = parseBoundedActionRequest(source, now()); }
    catch (error) { return fail(error.code ?? error.message, error.details ?? []); }
    if (active.size) return fail('ACTION_BUSY');
    if (completed.has(request.requestId)) return fail('ACTION_REPLAY');
    const before = currentContext();
    if (!before || before.profile !== request.profile) return fail('ACTION_PROFILE_MISMATCH');
    if (before.generation !== request.expectedGeneration) return fail('ACTION_STALE_GENERATION');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('ACTION_TIMEOUT'), Math.max(1, request.expiresAtMs - now()));
    active.set(request.requestId, controller);
    try {
      const result = await handlers[request.action](clone(request.payload), {
        signal: controller.signal,
        request: clone(request),
        context: clone(before),
      });
      if (controller.signal.aborted || request.expiresAtMs <= now()) {
        return fail(controller.signal.reason === 'ACTION_TIMEOUT' || request.expiresAtMs <= now()
          ? 'ACTION_TIMEOUT' : 'ACTION_CANCELLED');
      }
      if (!result || typeof result !== 'object' || Array.isArray(result)) return fail('ACTION_RESULT_SHAPE');
      const encoded = JSON.stringify(result);
      if (new TextEncoder().encode(encoded).byteLength > BOUNDED_ACTION_RESULT_LIMIT) return fail('ACTION_RESULT_LIMIT');
      const after = currentContext();
      if (!after || after.profile !== request.profile) return fail('ACTION_PROFILE_CHANGED');
      return {
        ok: result.ok !== false,
        schema: BOUNDED_ACTION_RESULT_SCHEMA,
        router: BOUNDED_ACTION_ROUTER_SCHEMA,
        code: result.code ?? (result.ok === false ? 'ACTION_REJECTED' : 'ACTION_COMPLETED'),
        action: request.action,
        requestId: request.requestId,
        profile: request.profile,
        generationBefore: before.generation,
        generationAfter: after.generation,
        authority: clone(BOUNDED_ACTION_AUTHORITY[request.action]),
        durableServerProject: false,
        result: clone(result),
        executed: true,
      };
    } catch (error) {
      if (controller.signal.aborted) {
        return fail(controller.signal.reason === 'ACTION_TIMEOUT' ? 'ACTION_TIMEOUT' : 'ACTION_CANCELLED');
      }
      return fail(error.code ?? error.message ?? 'ACTION_FAILED');
    } finally {
      clearTimeout(timeout);
      active.delete(request.requestId);
      remember(request.requestId);
    }
  }

  function cancel(requestId) {
    const controller = active.get(requestId);
    if (!controller) return { ok: false, code: 'ACTION_NOT_ACTIVE' };
    controller.abort('ACTION_CANCELLED');
    return { ok: true, code: 'ACTION_CANCEL_REQUESTED' };
  }

  return Object.freeze({
    schema: BOUNDED_ACTION_ROUTER_SCHEMA,
    actions: BOUNDED_ACTIONS,
    authority: BOUNDED_ACTION_AUTHORITY,
    execute,
    cancel,
    active: () => Object.freeze([...active.keys()]),
  });
}
