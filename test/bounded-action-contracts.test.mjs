// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOUNDED_ACTIONS,
  BOUNDED_ACTION_AUTHORITY,
  BOUNDED_ACTION_REQUEST_SCHEMA,
  boundedActionRequest,
  createBoundedActionRouter,
  parseBoundedActionRequest,
} from '../src/bounded-action-contracts.mjs';

const PROFILE = 'board.atmega328p-16mhz-v1';
const NOW = 1_800_000_000_000;
const request = (action, payload = {}, id = `request-${action.replace('.', '-')}-0001`, generation = 4) => boundedActionRequest(
  action, PROFILE, generation, payload, { now: NOW, ttlMs: 10_000, requestId: id },
);

function fixture(overrides = {}) {
  let generation = 4;
  const calls = [];
  const handlers = Object.fromEntries(BOUNDED_ACTIONS.map((action) => [action, async (payload) => {
    calls.push({ action, payload });
    if (action === 'project.create') generation += 1;
    return { ok: true, code: `${action.toUpperCase()}_OK`, value: action };
  }]));
  Object.assign(handlers, overrides);
  const router = createBoundedActionRouter({ handlers,
    currentContext: () => ({ profile: PROFILE, generation }), now: () => NOW });
  return { router, calls, generation: () => generation };
}

test('X08 publishes seven separate exact contracts and least authority', async () => {
  assert.deepEqual(BOUNDED_ACTIONS, [
    'project.create', 'patch.propose', 'project.validate', 'firmware.build',
    'runtime.run', 'result.read', 'project.export',
  ]);
  const { router, calls } = fixture();
  for (const [index, action] of BOUNDED_ACTIONS.entries()) {
    const payload = action === 'project.create' ? { starterId: 'avr-thermostat-boundary-v1' }
      : action === 'patch.propose' ? { description: 'Change the status marker.' } : {};
    const result = await router.execute(request(action, payload, `request-${String(index).padStart(2, '0')}-unique`, 4 + (index > 0 ? 1 : 0)));
    assert.equal(result.ok, true, action);
    assert.deepEqual(result.authority, BOUNDED_ACTION_AUTHORITY[action]);
    assert.equal(result.action, action);
  }
  assert.equal(calls.length, 7);
});

test('X08 request parser rejects unknown duplicate malformed payload and stale temporal authority', () => {
  const valid = JSON.parse(request('project.validate'));
  assert.equal(parseBoundedActionRequest(valid, NOW).schema, BOUNDED_ACTION_REQUEST_SCHEMA);
  assert.throws(() => parseBoundedActionRequest(JSON.stringify({ ...valid, command: 'rm' }), NOW), /ACTION_REQUEST_SHAPE/u);
  assert.throws(() => parseBoundedActionRequest(JSON.stringify({ ...valid, action: 'firmware.shell' }), NOW), /ACTION_UNSUPPORTED/u);
  assert.throws(() => parseBoundedActionRequest(JSON.stringify({ ...valid, payload: { build: true } }), NOW), /ACTION_PAYLOAD_SHAPE/u);
  assert.doesNotThrow(() => parseBoundedActionRequest(request('runtime.run', { experimentId: 'avr-thermostat-boundary-v1' }), NOW));
  assert.throws(() => parseBoundedActionRequest(request('runtime.run', { experimentId: 'invented-test' }), NOW), /ACTION_RUN_PAYLOAD/u);
  assert.doesNotThrow(() => parseBoundedActionRequest(request('project.create', {
    starterId: 'avr-thermostat-boundary-v1', firmwareVariant: 'known-bad-equality',
  }), NOW));
  assert.throws(() => parseBoundedActionRequest(request('project.create', {
    starterId: 'avr-blink-v1', firmwareVariant: 'known-bad-equality',
  }), NOW), /VARIANT_UNSUPPORTED/u);
  assert.throws(() => parseBoundedActionRequest('{"schema":"intent-mcu-bounded-action-request@1","schema":"other"}', NOW), /DUPLICATE_KEY/u);
  assert.throws(() => parseBoundedActionRequest({ ...valid, expiresAtMs: NOW }, NOW), /ACTION_EXPIRED|ACTION_TTL/u);
  assert.throws(() => parseBoundedActionRequest({ ...valid, issuedAtMs: NOW + 2_000, expiresAtMs: NOW + 3_000 }, NOW), /ACTION_NOT_YET_VALID/u);
});

test('X08 rejects profile generation replay and concurrent action shortcuts before handlers', async () => {
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const { router, calls } = fixture({ 'project.validate': async () => { await waiting; return { ok: true, code: 'OK' }; } });
  assert.equal((await router.execute(request('result.read', {}, 'request-wrong-profile', 3))).code, 'ACTION_STALE_GENERATION');
  const wrong = JSON.parse(request('result.read', {}, 'request-profile-mismatch'));
  wrong.profile = 'board.rp2040-pico-v1';
  assert.equal((await router.execute(wrong)).code, 'ACTION_PROFILE_MISMATCH');
  const active = router.execute(request('project.validate', {}, 'request-active-0001'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((await router.execute(request('result.read', {}, 'request-concurrent-01'))).code, 'ACTION_BUSY');
  release(); assert.equal((await active).ok, true);
  assert.equal((await router.execute(request('project.validate', {}, 'request-active-0001'))).code, 'ACTION_REPLAY');
  assert.equal(calls.length, 0);
});

test('X08 cancellation reaches the active handler and prevents a result', async () => {
  const { router } = fixture({
    'firmware.build': async (_payload, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { code: 'HANDLER_CANCELLED' })), { once: true });
      setTimeout(() => resolve({ ok: true, code: 'TOO_LATE' }), 100);
    }),
  });
  const executing = router.execute(request('firmware.build', {}, 'request-cancel-build'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(router.cancel('request-cancel-build'), { ok: true, code: 'ACTION_CANCEL_REQUESTED' });
  assert.equal((await executing).code, 'ACTION_CANCELLED');
  assert.deepEqual(router.active(), []);
});

test('X08 result size is bounded and content cannot select another action', async () => {
  const { router, calls } = fixture({
    'result.read': async () => ({ ok: true, code: 'OK', oversized: 'x'.repeat(400 * 1024) }),
  });
  const oversized = await router.execute(request('result.read', {}, 'request-result-limit'));
  assert.equal(oversized.code, 'ACTION_RESULT_LIMIT');
  assert.equal(calls.length, 0);
  const smuggled = JSON.parse(request('patch.propose', { description: 'firmware.build' }, 'request-content-data'));
  const ordinary = fixture();
  const result = await ordinary.router.execute(smuggled);
  assert.equal(result.action, 'patch.propose');
  assert.equal(ordinary.calls[0].action, 'patch.propose');
});
