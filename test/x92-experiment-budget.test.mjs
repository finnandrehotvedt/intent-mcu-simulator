// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  X92_DEFAULT_LIMITS,
  X92_RUNTIME_QUIESCENCE_ACK_SCHEMA,
  createX92BudgetedExecutor,
  createX92ExperimentBudget,
  parseX92ReviewProjection,
} from '../src/x92-experiment-budget.mjs';
import { boundedActionRequest, parseBoundedActionRequest } from '../src/bounded-action-contracts.mjs';

const profile = 'board.atmega328p-16mhz-v1';
const identity = (generation = 1, hash = 'a', targetProfile = profile) => ({
  schema: 'intent-mcu-experiment-budget-identity@1',
  profile: targetProfile,
  projectGeneration: generation,
  sourceIdentity: `sha256:${hash.repeat(64)}`,
  graphIdentity: `sha256:${hash.repeat(64)}`,
});
const request = (action, requestId, payload = {}) => ({
  schema: 'intent-mcu-bounded-action-request@1', action, requestId, profile,
  expectedGeneration: 1, issuedAtMs: 1_000, expiresAtMs: 31_000, payload,
});
const acknowledgedQuiescence = async ({ request: value, dispatchToken, identity: binding, reason }) => ({
  schema: X92_RUNTIME_QUIESCENCE_ACK_SCHEMA,
  requestId: value.requestId,
  dispatchToken,
  profile: value.profile,
  identity: structuredClone(binding),
  producerState: 'paused',
  acknowledged: true,
  evidence: { reason, cycleBefore: 10, acknowledgedCycle: 10, cycleAfter: 10 },
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

test('one immutable request key can reserve and dispatch only once while pending or terminal', async () => {
  const owner = budget(); owner.start(identity(), { humanInitiated: true });
  let dispatches = 0; let finish;
  const downstream = {
    execute: () => { dispatches += 1; return new Promise((resolve) => { finish = resolve; }); },
    cancel: () => ({ ok: true }),
  };
  const executor = createX92BudgetedExecutor({ budget: owner, downstream,
    currentIdentity: async () => identity(), now: () => 10,
    quiesceRuntime: acknowledgedQuiescence,
    schedule: () => 1, unschedule: () => {}, parseRequest: (source) => JSON.parse(source),
    measurementSource: 'test.monotonic-wall-clock' });
  const original = request('firmware.build', 'x92-idempotent-build-request');
  const source = JSON.stringify(original);
  const first = executor.execute(source); await new Promise((resolve) => setImmediate(resolve));
  const pendingDuplicate = await executor.execute(source);
  assert.equal(pendingDuplicate.code, 'X92_REQUEST_DUPLICATE_PENDING'); assert.equal(dispatches, 1);
  finish({ ok: true, code: 'ACTION_BUILD_SUCCEEDED', executed: true });
  const completed = await first; assert.equal(completed.ok, true);
  const usage = structuredClone(owner.snapshot().consumed);
  const terminalDuplicate = await executor.execute(source);
  assert.equal(terminalDuplicate.code, 'X92_REQUEST_DUPLICATE_TERMINAL'); assert.equal(dispatches, 1);
  assert.deepEqual(owner.snapshot().consumed, usage);

  const conflict = { ...original, expiresAtMs: original.expiresAtMs - 1 };
  const conflictingDuplicate = await executor.execute(JSON.stringify(conflict));
  assert.equal(conflictingDuplicate.code, 'X92_REQUEST_ID_CONFLICT'); assert.equal(dispatches, 1);
  const reference = owner.snapshot().terminal[0];
  const late = owner.finalize({ sessionId: owner.sessionId(), reservationId: reference.reservationId,
    requestId: reference.requestId }, { kind: 'success', authenticated: true,
    measuredWallClockMs: 1, measurementSource: 'test.monotonic-wall-clock' });
  assert.equal(late.code, 'X92_TERMINAL_DUPLICATE');
  assert.deepEqual(owner.snapshot().consumed, usage);
});

test('strict review rejects overlapping identities, duplicate request keys and action-incompatible costs', () => {
  const owner = budget(); owner.start(identity(), { humanInitiated: true });
  owner.reserve(request('firmware.build', 'x92-review-build-request'), identity());
  owner.reserve(request('runtime.run', 'x92-review-run-request'), identity());
  const review = owner.snapshot();

  const duplicateRequest = structuredClone(review);
  duplicateRequest.reservations[1].requestId = duplicateRequest.reservations[0].requestId;
  assert.throws(() => parseX92ReviewProjection(JSON.stringify(duplicateRequest)), /X92_REVIEW_RESERVATION/u);

  const incompatible = structuredClone(review);
  incompatible.reservations[0].cost.scenarios = 1; incompatible.reserved.scenarios = 1;
  incompatible.remaining.scenarios = incompatible.limits.scenarios - 1;
  assert.throws(() => parseX92ReviewProjection(JSON.stringify(incompatible)), /X92_REVIEW_RESERVATION_COST/u);

  const overlap = structuredClone(review); const row = overlap.reservations[0];
  overlap.terminal.push({ reservationId: row.reservationId, requestId: row.requestId, action: row.action,
    terminalKind: 'session-retired', outcome: 'indeterminate', charged: structuredClone(row.cost),
    measurement: { source: overlap.measurement.source, unit: 'wall-clock-ms', value: null,
      complete: false, chargedUpperBoundMs: row.cost.wallClockMs } });
  overlap.consumed = structuredClone(row.cost);
  for (const key of Object.keys(overlap.remaining)) {
    overlap.remaining[key] = overlap.limits[key] - overlap.consumed[key] - overlap.reserved[key];
  }
  assert.throws(() => parseX92ReviewProjection(JSON.stringify(overlap)), /X92_REVIEW_TERMINAL/u);

  const retiredPending = structuredClone(review); retiredPending.active = false;
  assert.throws(() => parseX92ReviewProjection(JSON.stringify(retiredPending)), /X92_REVIEW_RETIRED_RESERVATION/u);
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
    quiesceRuntime: acknowledgedQuiescence,
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
    quiesceRuntime: acknowledgedQuiescence,
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
    quiesceRuntime: acknowledgedQuiescence,
    measurementSource: 'test.monotonic-wall-clock' });
  assert.equal((await plain.execute(JSON.stringify(request('firmware.build', 'x92-manual-build-request')))).code,
    'MANUAL_UNCHANGED');
  assert.equal(calls, 1);
  assert.equal(inactive.snapshot(), null);

  const active = budget(); active.start(identity(), { humanInitiated: true });
  const crashing = createX92BudgetedExecutor({ budget: active,
    downstream: { execute: async () => { throw new Error('simulated worker loss'); }, cancel: downstream.cancel },
    currentIdentity: async () => identity(), parseRequest: (source) => JSON.parse(source),
    quiesceRuntime: acknowledgedQuiescence,
    now: () => 0, schedule: () => 1, unschedule: () => {},
    measurementSource: 'test.monotonic-wall-clock' });
  const result = await crashing.execute(JSON.stringify(request('firmware.build', 'x92-crash-build-request')));
  assert.equal(result.code, 'X92_DOWNSTREAM_CRASH');
  assert.equal(active.snapshot().consumed.wallClockMs, 30_000);
  assert.equal(active.snapshot().terminal[0].outcome, 'indeterminate');
});

test('runtime result stays reserved until delayed producer pause acknowledgement and then freezes', async () => {
  const owner = budget(); owner.start(identity(), { humanInitiated: true });
  let monotonic = 0; let resolveAcknowledgement; let quiescenceContext; let dispatches = 0;
  const producer = { running: true, cycle: 10 };
  const executor = createX92BudgetedExecutor({
    budget: owner,
    downstream: {
      execute: async () => { dispatches += 1; return { ok: true, code: 'ACTION_RUN_EVIDENCE_READY', executed: true }; },
      cancel: () => ({ ok: false, code: 'ACTION_NOT_ACTIVE' }),
    },
    currentIdentity: async () => identity(), now: () => monotonic,
    schedule: () => 1, unschedule: () => {}, parseRequest: (source) => JSON.parse(source),
    measurementSource: 'test.monotonic-wall-clock',
    quiesceRuntime: (context) => {
      quiescenceContext = context;
      return new Promise((resolve) => { resolveAcknowledgement = () => {
        producer.running = false;
        resolve({ schema: X92_RUNTIME_QUIESCENCE_ACK_SCHEMA,
          requestId: context.request.requestId, dispatchToken: context.dispatchToken,
          profile: context.request.profile,
          identity: context.identity, producerState: 'paused', acknowledged: true,
          evidence: { reason: context.reason, cycleBefore: 10,
            acknowledgedCycle: producer.cycle, cycleAfter: producer.cycle } });
      }; });
    },
  });
  const pending = executor.execute(JSON.stringify(request('runtime.run', 'x92-delayed-pause-run')));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(executor.runtimeBoundary().status, 'pending');
  assert.equal(owner.snapshot().reservations.length, 1);
  assert.equal(owner.snapshot().terminal.length, 0);
  producer.cycle = 25; monotonic = 250;
  const blocked = await executor.execute(JSON.stringify(request('runtime.run', 'x92-blocked-second-run')));
  assert.equal(blocked.code, 'X92_RUNTIME_BOUNDARY_BLOCKED');
  assert.equal(dispatches, 1);
  resolveAcknowledgement();
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.runtimeQuiescence.evidence.acknowledgedCycle, 25);
  assert.equal(result.experimentBudget.charged.wallClockMs, 250);
  assert.equal(owner.snapshot().reservations.length, 0);
  assert.equal(owner.snapshot().terminal.length, 1);
  if (producer.running) producer.cycle += 100;
  assert.equal(producer.cycle, 25, 'producer advanced after terminal accounting');
  assert.equal(quiescenceContext.reason, 'downstream-result');
  assert.equal(executor.runtimeBoundary().status, 'idle');
});

test('deadline with lost pause acknowledgement fully charges and blocks every later dispatch', async () => {
  const owner = budget({ limits: { builds: 1, runs: 1, scenarios: 4, wallClockMs: 30_000 } });
  owner.start(identity(), { humanInitiated: true });
  let deadline; let resolveQuiescence; let dispatches = 0; let cancelCount = 0;
  const executor = createX92BudgetedExecutor({
    budget: owner,
    downstream: {
      execute: () => { dispatches += 1; return new Promise(() => {}); },
      cancel: () => { cancelCount += 1; return { ok: true, code: 'ACTION_CANCEL_REQUESTED' }; },
    },
    currentIdentity: async () => identity(), now: () => 30_000,
    schedule: (callback) => { deadline = callback; return 1; }, unschedule: () => {},
    parseRequest: (source) => JSON.parse(source), measurementSource: 'test.monotonic-wall-clock',
    quiesceRuntime: () => new Promise((resolve) => { resolveQuiescence = resolve; }),
  });
  const pending = executor.execute(JSON.stringify(request('runtime.run', 'x92-lost-ack-run')));
  await Promise.resolve(); deadline();
  const result = await pending;
  assert.equal(result.code, 'X92_DEADLINE_EXCEEDED');
  assert.equal(result.experimentBudget.outcome, 'indeterminate');
  assert.equal(result.experimentBudget.charged.wallClockMs, 30_000);
  assert.equal(cancelCount, 1);
  assert.equal(executor.runtimeBoundary().status, 'pending');
  const blockedPending = await executor.execute(JSON.stringify(request('runtime.run', 'x92-after-lost-ack')));
  assert.equal(blockedPending.code, 'X92_RUNTIME_BOUNDARY_BLOCKED');
  resolveQuiescence({ acknowledged: false });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(executor.runtimeBoundary().status, 'blocked');
  const blockedTerminal = await executor.execute(JSON.stringify(request('runtime.run', 'x92-after-invalid-ack')));
  assert.equal(blockedTerminal.code, 'X92_RUNTIME_BOUNDARY_BLOCKED');
  assert.equal(dispatches, 1);
});

test('explicit cancellation waits for pause acknowledgement before terminal accounting', async () => {
  const owner = budget(); owner.start(identity(), { humanInitiated: true });
  let finish; let acknowledge; let context; let monotonic = 25;
  const executor = createX92BudgetedExecutor({
    budget: owner,
    downstream: {
      execute: () => new Promise((resolve) => { finish = resolve; }),
      cancel: () => { finish({ ok: false, code: 'ACTION_CANCELLED', executed: false });
        return { ok: true, code: 'ACTION_CANCEL_REQUESTED' }; },
    },
    currentIdentity: async () => identity(), now: () => monotonic,
    schedule: () => 1, unschedule: () => {}, parseRequest: (source) => JSON.parse(source),
    measurementSource: 'test.monotonic-wall-clock',
    quiesceRuntime: (value) => { context = value; return new Promise((resolve) => { acknowledge = resolve; }); },
  });
  const source = JSON.stringify(request('runtime.run', 'x92-explicit-cancel-run'));
  const pending = executor.execute(source); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(executor.cancel('x92-explicit-cancel-run').code, 'ACTION_CANCEL_REQUESTED');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(owner.snapshot().terminal.length, 0);
  assert.equal(executor.runtimeBoundary().status, 'pending');
  monotonic = 75;
  acknowledge({ schema: X92_RUNTIME_QUIESCENCE_ACK_SCHEMA,
    requestId: context.request.requestId, dispatchToken: context.dispatchToken,
    profile: context.request.profile,
    identity: context.identity, producerState: 'paused', acknowledged: true,
    evidence: { reason: context.reason, cycleBefore: 50, acknowledgedCycle: 55, cycleAfter: 55 } });
  const result = await pending;
  assert.equal(result.code, 'ACTION_CANCELLED');
  assert.equal(result.experimentBudget.terminalKind, 'cancelled');
  assert.equal(result.experimentBudget.outcome, 'complete');
  assert.equal(result.experimentBudget.charged.wallClockMs, 50);
  assert.equal(executor.runtimeBoundary().status, 'idle');
});

test('invalid quiescence acknowledgement is inert, fully charged and review-parseable', async () => {
  const owner = budget(); owner.start(identity(), { humanInitiated: true });
  let dispatches = 0;
  const executor = createX92BudgetedExecutor({
    budget: owner,
    downstream: {
      execute: async () => { dispatches += 1;
        return { ok: true, code: 'ACTION_RUN_EVIDENCE_READY', executed: true }; },
      cancel: () => ({ ok: false, code: 'ACTION_NOT_ACTIVE' }),
    },
    currentIdentity: async () => identity(), now: () => 10,
    schedule: () => 1, unschedule: () => {}, parseRequest: (source) => JSON.parse(source),
    measurementSource: 'test.monotonic-wall-clock',
    quiesceRuntime: async () => ({ acknowledged: true }),
  });
  const result = await executor.execute(JSON.stringify(request('runtime.run', 'x92-invalid-ack-run')));
  assert.equal(result.code, 'X92_RUNTIME_QUIESCENCE_UNCONFIRMED');
  assert.equal(result.experimentBudget.terminalKind, 'quiescence-failed');
  assert.equal(result.experimentBudget.outcome, 'indeterminate');
  assert.equal(result.experimentBudget.charged.wallClockMs, 30_000);
  assert.equal(executor.runtimeBoundary().status, 'blocked');
  assert.equal(parseX92ReviewProjection(owner.reviewText()).code, 'X92_REVIEW_INERT');
  const blocked = await executor.execute(JSON.stringify(request('firmware.build', 'x92-after-invalid-ack-build')));
  assert.equal(blocked.code, 'X92_RUNTIME_BOUNDARY_BLOCKED');
  assert.equal(dispatches, 1);
});

test('identity retirement during delayed pause keeps full charge and ignores late completion exactly once', async () => {
  const owner = budget(); owner.start(identity(), { humanInitiated: true });
  let current = identity(); let finish; let acknowledge; let context;
  const executor = createX92BudgetedExecutor({
    budget: owner,
    downstream: {
      execute: () => new Promise((resolve) => { finish = resolve; }),
      cancel: () => ({ ok: true, code: 'ACTION_CANCEL_REQUESTED' }),
    },
    currentIdentity: async () => current, now: () => 100,
    schedule: () => 1, unschedule: () => {}, parseRequest: (source) => JSON.parse(source),
    measurementSource: 'test.monotonic-wall-clock',
    quiesceRuntime: (value) => { context = value; return new Promise((resolve) => { acknowledge = resolve; }); },
  });
  const source = JSON.stringify(request('runtime.run', 'x92-retired-late-run'));
  const pending = executor.execute(source); await new Promise((resolve) => setImmediate(resolve));
  finish({ ok: true, code: 'ACTION_RUN_EVIDENCE_READY', executed: true });
  await new Promise((resolve) => setImmediate(resolve));
  current = identity(2, 'b');
  const rebound = owner.rebind(current, 'source-edited');
  assert.deepEqual(rebound.requestIds, ['x92-retired-late-run']);
  assert.equal(owner.snapshot().terminal[0].terminalKind, 'identity-change');
  assert.equal(owner.snapshot().terminal[0].outcome, 'indeterminate');
  acknowledge({ schema: X92_RUNTIME_QUIESCENCE_ACK_SCHEMA,
    requestId: context.request.requestId, dispatchToken: context.dispatchToken,
    profile: context.request.profile,
    identity: context.identity, producerState: 'paused', acknowledged: true,
    evidence: { reason: context.reason, cycleBefore: 12, acknowledgedCycle: 12, cycleAfter: 12 } });
  const result = await pending;
  assert.equal(result.experimentBudget.duplicate, true);
  assert.deepEqual(owner.snapshot().consumed, { builds: 0, runs: 1, scenarios: 0, wallClockMs: 30_000 });
  assert.equal(owner.snapshot().terminal.length, 1);
  assert.equal(executor.runtimeBoundary().status, 'idle');
  const duplicate = await executor.execute(source);
  assert.equal(duplicate.code, 'X92_REQUEST_DUPLICATE_TERMINAL');
  assert.equal(owner.snapshot().terminal.length, 1);
});

test('atomic gate admits at most one delayed-identity producer for run/run, run/build and build/run', async () => {
  for (const [firstAction, secondAction] of [
    ['runtime.run', 'runtime.run'],
    ['runtime.run', 'firmware.build'],
    ['firmware.build', 'runtime.run'],
  ]) {
    const owner = budget(); owner.start(identity(), { humanInitiated: true });
    let resolveIdentity; let identityCalls = 0; let dispatches = 0; let quiescenceCalls = 0;
    const executor = createX92BudgetedExecutor({
      budget: owner,
      downstream: {
        execute: async () => { dispatches += 1;
          return { ok: true, code: firstAction === 'runtime.run'
            ? 'ACTION_RUN_EVIDENCE_READY' : 'ACTION_BUILD_SUCCEEDED', executed: true }; },
        cancel: () => ({ ok: false, code: 'ACTION_NOT_ACTIVE' }),
      },
      currentIdentity: () => { identityCalls += 1;
        return new Promise((resolve) => { resolveIdentity = resolve; }); },
      now: () => 5, schedule: () => 1, unschedule: () => {},
      parseRequest: (source) => JSON.parse(source), measurementSource: 'test.monotonic-wall-clock',
      quiesceRuntime: async (context) => { quiescenceCalls += 1;
        return acknowledgedQuiescence(context); },
    });
    const firstId = `x92-gate-${firstAction.replace('.', '-')}-first`;
    const secondId = `x92-gate-${secondAction.replace('.', '-')}-second`;
    const pending = executor.execute(JSON.stringify(request(firstAction, firstId)));
    assert.equal(executor.dispatchGate().requestId, firstId);
    assert.equal(executor.dispatchGate().status, 'identity-check');
    const blocked = await executor.execute(JSON.stringify(request(secondAction, secondId)));
    assert.equal(blocked.code, 'X92_DISPATCH_GATE_BLOCKED');
    assert.equal(blocked.dispatchGate.requestId, firstId);
    assert.equal(identityCalls, 1);
    assert.equal(dispatches, 0);
    resolveIdentity(identity());
    const completed = await pending;
    assert.equal(completed.ok, true);
    assert.equal(dispatches, 1);
    assert.equal(quiescenceCalls, firstAction === 'runtime.run' ? 1 : 0);
    assert.equal(executor.dispatchGate().status, 'idle');
    assert.equal(executor.runtimeBoundary().status, 'idle');
  }
});

test('session or identity replacement during delayed lookup rejects before reservation and producer dispatch', async () => {
  for (const mutation of ['new-session', 'source-edit', 'session-retired']) {
    const owner = budget(); owner.start(identity(), { humanInitiated: true });
    let resolveIdentity; let dispatches = 0;
    const executor = createX92BudgetedExecutor({
      budget: owner,
      downstream: { execute: async () => { dispatches += 1; return { ok: true, executed: true }; },
        cancel: () => ({ ok: false }) },
      currentIdentity: () => new Promise((resolve) => { resolveIdentity = resolve; }),
      parseRequest: (source) => JSON.parse(source), quiesceRuntime: acknowledgedQuiescence,
      measurementSource: 'test.monotonic-wall-clock',
    });
    const pending = executor.execute(JSON.stringify(request('runtime.run', `x92-${mutation}-lookup`)));
    if (mutation === 'new-session') owner.start(identity(2, 'b'), { humanInitiated: true });
    else if (mutation === 'source-edit') owner.rebind(identity(2, 'b'), 'source-edited-during-lookup');
    else owner.retire('project-open-during-lookup');
    const blocked = await executor.execute(JSON.stringify(request('firmware.build', `x92-${mutation}-bypass`)));
    assert.equal(blocked.code, 'X92_DISPATCH_GATE_BLOCKED');
    resolveIdentity(identity());
    const result = await pending;
    assert.equal(result.code, 'X92_SESSION_CHANGED_BEFORE_DISPATCH');
    assert.equal(dispatches, 0);
    assert.equal(executor.dispatchGate().status, 'idle');
    assert.equal(executor.runtimeBoundary().status, 'idle');
  }
});

test('cancellation during delayed identity lookup prevents reservation and producer dispatch', async () => {
  const owner = budget(); owner.start(identity(), { humanInitiated: true });
  let resolveIdentity; let dispatches = 0;
  const executor = createX92BudgetedExecutor({
    budget: owner,
    downstream: { execute: async () => { dispatches += 1; return { ok: true, executed: true }; },
      cancel: () => ({ ok: false, code: 'ACTION_NOT_ACTIVE' }) },
    currentIdentity: () => new Promise((resolve) => { resolveIdentity = resolve; }),
    parseRequest: (source) => JSON.parse(source), quiesceRuntime: acknowledgedQuiescence,
    measurementSource: 'test.monotonic-wall-clock',
  });
  const requestId = 'x92-cancel-during-identity';
  const pending = executor.execute(JSON.stringify(request('runtime.run', requestId)));
  assert.equal(executor.cancel(requestId).code, 'ACTION_CANCEL_REQUESTED');
  assert.equal(executor.dispatchGate().status, 'cancellation-pending');
  resolveIdentity(identity());
  const cancelled = await pending;
  assert.equal(cancelled.code, 'X92_ACTION_CANCELLED_BEFORE_DISPATCH');
  assert.equal(dispatches, 0);
  assert.equal(owner.snapshot().reservations.length, 0);
  assert.equal(executor.dispatchGate().status, 'idle');
});

test('timed-out Build keeps its gate until the downstream cancellation completion arrives', async () => {
  const owner = budget({ limits: { builds: 1, runs: 1, scenarios: 4, wallClockMs: 30_000 } });
  owner.start(identity(), { humanInitiated: true });
  let deadline; let completeBuild; let dispatches = 0;
  const executor = createX92BudgetedExecutor({
    budget: owner,
    downstream: {
      execute: () => { dispatches += 1; return new Promise((resolve) => { completeBuild = resolve; }); },
      cancel: () => ({ ok: true, code: 'ACTION_CANCEL_REQUESTED' }),
    },
    currentIdentity: async () => identity(), now: () => 30_000,
    schedule: (callback) => { deadline = callback; return 1; }, unschedule: () => {},
    parseRequest: (source) => JSON.parse(source), quiesceRuntime: acknowledgedQuiescence,
    measurementSource: 'test.monotonic-wall-clock',
  });
  const pending = executor.execute(JSON.stringify(request('firmware.build', 'x92-build-cancel-ack')));
  await new Promise((resolve) => setImmediate(resolve)); deadline();
  const timeout = await pending;
  assert.equal(timeout.code, 'X92_DEADLINE_EXCEEDED');
  assert.equal(executor.dispatchGate().status, 'cancellation-pending');
  const blocked = await executor.execute(JSON.stringify(request('runtime.run', 'x92-run-before-build-ack')));
  assert.equal(blocked.code, 'X92_DISPATCH_GATE_BLOCKED');
  assert.equal(dispatches, 1);
  completeBuild({ ok: false, code: 'ACTION_CANCELLED', executed: false });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(executor.dispatchGate().status, 'idle');
});

test('late acknowledgement carrying an old owner token cannot release the current gate', async () => {
  const owner = budget(); owner.start(identity(), { humanInitiated: true });
  const tokens = []; let acknowledgeSecond;
  const executor = createX92BudgetedExecutor({
    budget: owner,
    downstream: { execute: async () => ({ ok: true, code: 'ACTION_RUN_EVIDENCE_READY', executed: true }),
      cancel: () => ({ ok: false }) },
    currentIdentity: async () => identity(), now: () => 10, schedule: () => 1, unschedule: () => {},
    parseRequest: (source) => JSON.parse(source), measurementSource: 'test.monotonic-wall-clock',
    quiesceRuntime: async (context) => {
      tokens.push(context.dispatchToken);
      if (tokens.length === 1) return acknowledgedQuiescence(context);
      return new Promise((resolve) => { acknowledgeSecond = () => resolve({
        ...(awaitableAck(context)), dispatchToken: tokens[0],
      }); });
    },
  });
  function awaitableAck(context) {
    return {
      schema: X92_RUNTIME_QUIESCENCE_ACK_SCHEMA,
      requestId: context.request.requestId,
      dispatchToken: context.dispatchToken,
      profile: context.request.profile,
      identity: structuredClone(context.identity),
      producerState: 'paused', acknowledged: true,
      evidence: { reason: context.reason, cycleBefore: 1, acknowledgedCycle: 1, cycleAfter: 1 },
    };
  }
  assert.equal((await executor.execute(JSON.stringify(request('runtime.run', 'x92-old-token-first')))).ok, true);
  const second = executor.execute(JSON.stringify(request('runtime.run', 'x92-old-token-second')));
  await new Promise((resolve) => setImmediate(resolve));
  assert.notEqual(tokens[0], tokens[1]);
  acknowledgeSecond();
  const rejected = await second;
  assert.equal(rejected.code, 'X92_RUNTIME_QUIESCENCE_UNCONFIRMED');
  assert.equal(executor.dispatchGate().requestId, 'x92-old-token-second');
  assert.equal(executor.dispatchGate().status, 'blocked');
  assert.equal(executor.runtimeBoundary().requestId, 'x92-old-token-second');
});

test('C3 and STM32 budgeted Run fail before identity or producer while inactive manual paths stay unchanged', async () => {
  for (const targetProfile of [
    'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1',
  ]) {
    const owner = budget(); owner.start(identity(1, 'a', targetProfile), { humanInitiated: true });
    let identityCalls = 0; let dispatches = 0;
    const downstream = { execute: async () => { dispatches += 1;
      return { ok: true, code: 'MANUAL_UNCHANGED', executed: true }; }, cancel: () => ({ ok: false }) };
    const executor = createX92BudgetedExecutor({ budget: owner, downstream,
      currentIdentity: async () => { identityCalls += 1; return identity(1, 'a', targetProfile); },
      parseRequest: (source) => JSON.parse(source), quiesceRuntime: acknowledgedQuiescence,
      measurementSource: 'test.monotonic-wall-clock' });
    const source = JSON.stringify({ ...request('runtime.run', `x92-unproven-${targetProfile}`),
      profile: targetProfile });
    const rejected = await executor.execute(source);
    assert.equal(rejected.code, 'X92_RUNTIME_QUIESCENCE_UNPROVEN_PROFILE');
    assert.equal(identityCalls, 0); assert.equal(dispatches, 0);

    const manualOwner = budget();
    const manual = createX92BudgetedExecutor({ budget: manualOwner, downstream,
      currentIdentity: async () => identity(1, 'a', targetProfile),
      parseRequest: (value) => JSON.parse(value), quiesceRuntime: acknowledgedQuiescence,
      measurementSource: 'test.monotonic-wall-clock' });
    assert.equal((await manual.execute(source)).code, 'MANUAL_UNCHANGED');
    assert.equal(dispatches, 1);
  }
});

test('Pico budgeted Run is admitted only through the exact owner quiescence gate', async () => {
  const targetProfile = 'board.rp2040-pico-v1';
  const owner = budget(); owner.start(identity(1, 'a', targetProfile), { humanInitiated: true });
  let identityCalls = 0; let dispatches = 0; let quiescence;
  const executor = createX92BudgetedExecutor({ budget: owner,
    downstream: { execute: async () => { dispatches += 1;
      return { ok: true, code: 'ACTION_RUN_EVIDENCE_READY', executed: true }; }, cancel: () => ({ ok: true }) },
    currentIdentity: async () => { identityCalls += 1; return identity(1, 'a', targetProfile); },
    parseRequest: (source) => JSON.parse(source),
    quiesceRuntime: async (context) => { quiescence = context; return acknowledgedQuiescence(context); },
    measurementSource: 'test.monotonic-wall-clock',
  });
  const source = JSON.stringify({ ...request('runtime.run', 'x92-pico-owner-run'), profile: targetProfile });
  const result = await executor.execute(source);
  assert.equal(result.ok, true);
  assert.equal(identityCalls, 1); assert.equal(dispatches, 1);
  assert.equal(quiescence.request.profile, targetProfile);
  assert(Number.isFinite(quiescence.deadlineAt));
  assert.equal(result.runtimeQuiescence.profile, targetProfile);
  assert.equal(executor.dispatchGate().status, 'idle');
  assert.equal(executor.runtimeBoundary().status, 'idle');
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
    quiesceRuntime: acknowledgedQuiescence,
    measurementSource: 'test.monotonic-wall-clock' });
  const result = await executor.execute(source);
  assert.equal(result.code, 'UNCHANGED');
  assert.equal(result.requestId, 'x92-compatible-validation-request');
});
