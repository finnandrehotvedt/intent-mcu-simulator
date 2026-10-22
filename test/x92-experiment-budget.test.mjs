// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  X92_DEFAULT_LIMITS,
  createX92BudgetedExecutor,
  createX92ExperimentBudget,
  parseX92ReviewProjection,
} from '../src/x92-experiment-budget.mjs';
import { boundedActionRequest, parseBoundedActionRequest } from '../src/bounded-action-contracts.mjs';

const profile = 'board.atmega328p-16mhz-v1';
const identity = (generation = 1, hash = 'a') => ({
  schema: 'intent-mcu-experiment-budget-identity@1',
  profile,
  projectGeneration: generation,
  sourceIdentity: `sha256:${hash.repeat(64)}`,
  graphIdentity: `sha256:${hash.repeat(64)}`,
});
const request = (action, requestId, payload = {}) => ({
  schema: 'intent-mcu-bounded-action-request@1', action, requestId, profile,
  expectedGeneration: 1, issuedAtMs: 1_000, expiresAtMs: 31_000, payload,
});

function budget(options = {}) {
  let sequence = 0;
  return createX92ExperimentBudget({ measurementSource: 'test.monotonic-wall-clock',
    randomId: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    ...options });
}

test('X92 requires explicit human start and exports only strict inert review data', () => {
  const owner = budget();
  assert.equal(owner.start(identity()).code, 'X92_HUMAN_ACTION_REQUIRED');
  assert.equal(owner.active(), false);
  assert.equal(owner.start(identity(), { humanInitiated: true }).code, 'X92_SESSION_STARTED');
  const review = owner.snapshot();
  assert.deepEqual(review.limits, X92_DEFAULT_LIMITS);
  assert.deepEqual(review.authority, { apply: false, build: false, run: false,
    retry: false, replay: false, verdict: false });
  assert(Object.values(review.restores).every((value) => value === false));
  const parsed = parseX92ReviewProjection(JSON.stringify(review));
  assert.equal(parsed.code, 'X92_REVIEW_INERT');
  assert.equal(parsed.review.activeAuthorityRestored, false);
  assert.equal(owner.active(), true, 'reading imported review changed active authority');

  const unknown = { ...structuredClone(review), executable: true };
  assert.throws(() => parseX92ReviewProjection(JSON.stringify(unknown)), /X92_REVIEW_SHAPE/u);
  const raised = structuredClone(review); raised.limits.builds = 99;
  assert.throws(() => parseX92ReviewProjection(JSON.stringify(raised)), /X92_REVIEW_LIMITS_NOT_FIXED/u);
  const forgedConsumption = structuredClone(review); forgedConsumption.consumed.builds = 1;
  forgedConsumption.remaining.builds = 1;
  assert.throws(() => parseX92ReviewProjection(JSON.stringify(forgedConsumption)), /X92_REVIEW_CONSUMED_TOTALS/u);
  const authority = structuredClone(review); authority.authority.build = true;
  assert.throws(() => parseX92ReviewProjection(JSON.stringify(authority)), /X92_REVIEW_AUTHORITY/u);
  assert.throws(() => parseX92ReviewProjection(
    JSON.stringify(review).replace('"schema":', '"schema":"forged","schema":')),
  /DUPLICATE_KEY/u);
});

test('atomic reservation rejects the second build and returns unresolved work in stable order', () => {
  const owner = budget({ limits: { builds: 1, runs: 1, scenarios: 4, wallClockMs: 30_000 } });
  owner.start(identity(), { humanInitiated: true });
  const first = owner.reserve(request('firmware.build', 'x92-first-build-request'), identity(), {
    unresolvedProblems: ['Compile candidate', 'Inspect failing test'],
  });
  assert.equal(first.code, 'X92_RESERVED');
  const second = owner.reserve(request('firmware.build', 'x92-second-build-request'), identity(), {
    unresolvedProblems: ['Compile candidate', 'Inspect failing test'],
  });
  assert.equal(second.code, 'budget_exhausted');
  assert.deepEqual(second.exhaustedDimensions.sort(), ['builds', 'wallClockMs']);
  assert.deepEqual(second.unresolvedProblems, ['Compile candidate', 'Inspect failing test']);
  assert.equal(second.executed, false);
  assert(Object.values(second.authority).every((value) => value === false));
});

test('terminal accounting is exact-once and duplicate or late callbacks cannot change capacity', () => {
  const owner = budget(); owner.start(identity(), { humanInitiated: true });
  const reserved = owner.reserve(request('runtime.run', 'x92-run-terminal-request'), identity());
  const reference = reserved.reservation;
  const first = owner.finalize(reference, { kind: 'success', authenticated: true,
    measuredWallClockMs: 125, measurementSource: 'test.monotonic-wall-clock' });
  assert.equal(first.code, 'X92_TERMINAL_ACCOUNTED');
  assert.equal(first.terminal.charged.runs, 1);
  assert.equal(first.terminal.charged.wallClockMs, 125);
  const reviewWithTerminal = owner.snapshot();
  const nestedUnknown = structuredClone(reviewWithTerminal); nestedUnknown.terminal[0].measurement.virtualMs = 125;
  assert.throws(() => parseX92ReviewProjection(JSON.stringify(nestedUnknown)), /X92_REVIEW_TERMINAL_MEASUREMENT/u);
  const before = owner.snapshot();
  const duplicate = owner.finalize(reference, { kind: 'success', authenticated: true,
    measuredWallClockMs: 999, measurementSource: 'test.monotonic-wall-clock' });
  assert.equal(duplicate.code, 'X92_TERMINAL_DUPLICATE');
  assert.equal(duplicate.terminal.duplicate, true);
  assert.deepEqual(owner.snapshot().consumed, before.consumed);

  const oldSession = owner.sessionId();
  owner.start(identity(2, 'b'), { humanInitiated: true });
  assert.notEqual(owner.sessionId(), oldSession);
  const late = owner.finalize(reference, { kind: 'failure', authenticated: true,
    measuredWallClockMs: 1, measurementSource: 'test.monotonic-wall-clock' });
  assert.equal(late.code, 'X92_RETIRED_CALLBACK_IGNORED');
  assert.deepEqual(owner.snapshot().consumed, { builds: 0, runs: 0, scenarios: 0, wallClockMs: 0 });
});

test('identity changes and retirement fully charge inflight work without replenishing consumption', () => {
  const owner = budget(); owner.start(identity(), { humanInitiated: true });
  const build = owner.reserve(request('firmware.build', 'x92-inflight-build-request'), identity());
  const rebound = owner.rebind(identity(2, 'b'), 'source-edited');
  assert.deepEqual(rebound.requestIds, ['x92-inflight-build-request']);
  let review = owner.snapshot();
  assert.deepEqual(review.consumed, { builds: 1, runs: 0, scenarios: 0, wallClockMs: 30_000 });
  assert.equal(review.terminal[0].outcome, 'indeterminate');
  assert.equal(review.terminal[0].measurement.value, null);
  assert.equal(review.remaining.builds, 1);
  const late = owner.finalize(build.reservation, { kind: 'success', authenticated: true,
    measuredWallClockMs: 10, measurementSource: 'test.monotonic-wall-clock' });
  assert.equal(late.code, 'X92_TERMINAL_DUPLICATE');
  assert.deepEqual(owner.snapshot().consumed, review.consumed);

  const run = owner.reserve(request('runtime.run', 'x92-inflight-run-request'), identity(2, 'b'));
  const retired = owner.retire('project-open');
  assert.deepEqual(retired.requestIds, ['x92-inflight-run-request']);
  review = owner.snapshot();
  assert.equal(review.active, false);
  assert.equal(review.consumed.runs, 1);
  assert.equal(review.consumed.wallClockMs, 60_000);
  assert.equal(owner.finalize(run.reservation, { kind: 'cancelled', authenticated: true,
    measuredWallClockMs: 20, measurementSource: 'test.monotonic-wall-clock' }).code,
  'X92_TERMINAL_DUPLICATE');
});

test('missing, cross-source and virtual-time measurements fail closed at the full reserved bound', () => {
  for (const [label, terminal] of [
    ['missing', { kind: 'crash', authenticated: false, measuredWallClockMs: null, measurementSource: null }],
    ['wrong-source', { kind: 'failure', authenticated: true, measuredWallClockMs: 5, measurementSource: 'cpu.virtual-ms' }],
    ['oversized', { kind: 'timeout', authenticated: true, measuredWallClockMs: 30_001,
      measurementSource: 'test.monotonic-wall-clock' }],
  ]) {
    const owner = budget(); owner.start(identity(), { humanInitiated: true });
    const reserved = owner.reserve(request('runtime.run', `x92-${label}-run-request`), identity());
    const result = owner.finalize(reserved.reservation, terminal);
    assert.equal(result.code, 'X92_TERMINAL_INDETERMINATE', label);
    assert.equal(result.terminal.outcome, 'indeterminate', label);
    assert.equal(result.terminal.charged.wallClockMs, 30_000, label);
    assert.equal(result.terminal.measurement.value, null, label);
  }
});

test('budgeted executor enforces a deadline, accounts cancellation once and never calls another producer', async () => {
  const owner = budget({ limits: { builds: 1, runs: 1, scenarios: 4, wallClockMs: 30_000 } });
  owner.start(identity(), { humanInitiated: true });
  let monotonic = 0; let deadline = null; let cancelCount = 0; let resolve;
  const downstream = {
    execute: () => new Promise((accept) => { resolve = accept; }),
    cancel: () => { cancelCount += 1; resolve({ ok: false, code: 'ACTION_CANCELLED', executed: false });
      return { ok: true, code: 'ACTION_CANCEL_REQUESTED' }; },
  };
  const executor = createX92BudgetedExecutor({ budget: owner, downstream,
    currentIdentity: async () => identity(), now: () => monotonic,
    schedule: (callback, delay) => { deadline = { callback, delay }; return 1; }, unschedule: () => {},
    parseRequest: (source) => parseBoundedActionRequest(source, 1_000),
    measurementSource: 'test.monotonic-wall-clock' });
  const source = JSON.stringify(request('runtime.run', 'x92-deadline-run-request'));
  const pending = executor.execute(source, { unresolvedProblems: ['Run timed test'] });
  await Promise.resolve();
  assert.equal(deadline.delay, 30_000);
  monotonic = 30_000; deadline.callback();
  const result = await pending;
  assert.equal(cancelCount, 1);
  assert.equal(result.code, 'X92_DEADLINE_EXCEEDED');
  assert.equal(result.experimentBudget.terminalKind, 'timeout');
  assert.equal(result.experimentBudget.outcome, 'indeterminate');
  assert.equal(result.experimentBudget.charged.wallClockMs, 30_000);
  assert.equal(owner.snapshot().terminal.length, 1);
});

test('deadline returns with full accounting even when producer cancellation is never confirmed', async () => {
  const owner = budget({ limits: { builds: 1, runs: 1, scenarios: 4, wallClockMs: 30_000 } });
  owner.start(identity(), { humanInitiated: true });
  let deadline; let cancelCount = 0;
  const executor = createX92BudgetedExecutor({ budget: owner,
    downstream: { execute: () => new Promise(() => {}), cancel: () => { cancelCount += 1; return { ok: false }; } },
    currentIdentity: async () => identity(), now: () => 30_000,
    schedule: (callback) => { deadline = callback; return 1; }, unschedule: () => {},
    parseRequest: (source) => JSON.parse(source), measurementSource: 'test.monotonic-wall-clock' });
  const pending = executor.execute(JSON.stringify(request('firmware.build', 'x92-unconfirmed-cancel-request')));
  await Promise.resolve(); deadline();
  const result = await pending;
  assert.equal(result.code, 'X92_DEADLINE_EXCEEDED'); assert.equal(cancelCount, 1);
  assert.equal(result.experimentBudget.outcome, 'indeterminate');
  assert.equal(owner.snapshot().remaining.builds, 0);
});

test('downstream crash consumes the full reservation while inactive budget preserves manual workflow', async () => {
  let calls = 0;
  const downstream = {
    execute: async () => { calls += 1; return { ok: true, code: 'MANUAL_UNCHANGED', executed: true }; },
    cancel: () => ({ ok: false, code: 'ACTION_NOT_ACTIVE' }),
  };
  const inactive = budget();
  const plain = createX92BudgetedExecutor({ budget: inactive, downstream,
    currentIdentity: async () => identity(), parseRequest: (source) => JSON.parse(source),
    measurementSource: 'test.monotonic-wall-clock' });
  assert.equal((await plain.execute(JSON.stringify(request('firmware.build', 'x92-manual-build-request')))).code,
    'MANUAL_UNCHANGED');
  assert.equal(calls, 1);
  assert.equal(inactive.snapshot(), null);

  const active = budget(); active.start(identity(), { humanInitiated: true });
  const crashing = createX92BudgetedExecutor({ budget: active,
    downstream: { execute: async () => { throw new Error('simulated worker loss'); }, cancel: downstream.cancel },
    currentIdentity: async () => identity(), parseRequest: (source) => JSON.parse(source),
    now: () => 0, schedule: () => 1, unschedule: () => {},
    measurementSource: 'test.monotonic-wall-clock' });
  const result = await crashing.execute(JSON.stringify(request('firmware.build', 'x92-crash-build-request')));
  assert.equal(result.code, 'X92_DOWNSTREAM_CRASH');
  assert.equal(active.snapshot().consumed.wallClockMs, 30_000);
  assert.equal(active.snapshot().terminal[0].outcome, 'indeterminate');
});

test('thermostat experiment reserves four scenarios and cannot normalize virtual controller time', () => {
  const owner = budget(); owner.start(identity(), { humanInitiated: true });
  const reserved = owner.reserve(request('runtime.run', 'x92-scenario-run-request', {
    experimentId: 'avr-thermostat-boundary-v1',
  }), identity());
  assert.equal(reserved.reservation.cost.runs, 1);
  assert.equal(reserved.reservation.cost.scenarios, 4);
  const review = owner.snapshot();
  assert.equal(review.measurement.unit, 'wall-clock-ms');
  assert.equal(review.measurement.virtualTimeNormalization, false);
  assert.equal(review.measurement.crossControllerNormalization, false);
});

test('existing bounded request builder remains compatible with inactive X92', async () => {
  const epoch = Date.now();
  const source = boundedActionRequest('project.validate', profile, 1, {}, {
    now: epoch, requestId: 'x92-compatible-validation-request',
  });
  const owner = budget();
  const downstream = { execute: async (value) => ({ ok: true, code: 'UNCHANGED', executed: true,
    requestId: parseBoundedActionRequest(value, epoch).requestId }), cancel: () => ({ ok: false }) };
  const executor = createX92BudgetedExecutor({ budget: owner, downstream,
    currentIdentity: async () => identity(), parseRequest: (value) => parseBoundedActionRequest(value, epoch),
    measurementSource: 'test.monotonic-wall-clock' });
  const result = await executor.execute(source);
  assert.equal(result.code, 'UNCHANGED');
  assert.equal(result.requestId, 'x92-compatible-validation-request');
});
