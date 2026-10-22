// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { createX92ExperimentBudget } from '../src/x92-experiment-budget.mjs';
import {
  X92_C3_BINDING_SCHEMA, X92_C3_RESULT_SCHEMA, X92_C3_QUIESCENCE_SCHEMA,
  createX92C3BudgetIntegration, x92IdentityFromC3Binding,
} from '../src/x92-c3-budget-integration.mjs';

const profile = 'board.esp32-c3-devmodule-v1';
const h = (value) => `sha256:${value.repeat(64)}`;
const binding = Object.freeze({
  schema: X92_C3_BINDING_SCHEMA, profile, sessionId: 'C3SessionMock001', generation: 3,
  projectGeneration: 7, sourceIdentity: h('a'), graphIdentity: h('b'), flashIdentity: h('c'),
  compiler: { imageIdentity: h('d'), toolchainIdentity: h('e') },
  runtime: { imageIdentity: h('f'), binaryIdentity: h('1') },
});
const quiescence = (overrides = {}) => ({
  schema: X92_C3_QUIESCENCE_SCHEMA, sessionId: binding.sessionId, generation: binding.generation,
  sourceSha256: binding.sourceIdentity.slice(7), artifactSha256: binding.flashIdentity.slice(7),
  operationId: 'c3-operation-1', state: 'quiescent', retainedBytes: 4 * 1024 * 1024,
  artifactPreserved: true, processExited: true, operationRetired: true, ...overrides,
});
const result = (overrides = {}) => ({
  schema: X92_C3_RESULT_SCHEMA, ok: true, code: 'C3_SYNTHETIC_COMPLETE', executed: true,
  executionIdentity: structuredClone(binding),
  uart: { exactText: 'INTENT-C3-BUDGET:4E6F\n', finalLf: true }, quiescence: quiescence(), ...overrides,
});
const request = (requestId = 'x92-c3-budget-run-001') => JSON.stringify({
  schema: 'intent-mcu-bounded-action-request@1', action: 'runtime.run', requestId, profile,
  expectedGeneration: binding.projectGeneration, issuedAtMs: 1_000, expiresAtMs: 31_000, payload: {},
});
function owner() {
  const budget = createX92ExperimentBudget({ measurementSource: 'test.monotonic-wall-clock',
    randomId: () => '00000000-0000-4000-8000-000000000001' });
  budget.start(x92IdentityFromC3Binding(binding), { humanInitiated: true });
  return budget;
}
function integration(overrides = {}) {
  const budget = overrides.budget ?? owner();
  let clock = 10;
  let instance;
  const configured = createX92C3BudgetIntegration({ budget,
    currentBinding: async () => binding,
    retireCurrentOwner: async () => quiescence(),
    executeBudgetProducer: async (source, permit, exactBinding) => {
      assert.equal(instance.advancingBoundary(permit, exactBinding).ok, true);
      clock = 31;
      return result();
    },
    executeManualProducer: async (task, permit, exactBinding) => {
      assert.equal(instance.advancingBoundary(permit, exactBinding).ok, true);
      return task();
    },
    cancelBudgetProducer: () => ({ ok: true }), now: () => clock,
    schedule: () => 1, unschedule: () => {}, parseRequest: JSON.parse,
    measurementSource: 'test.monotonic-wall-clock', ...overrides,
  });
  instance = configured;
  return { budget, integration: configured };
}

test('private C3 slice binds retirement, six identity layers, permit, UART LF and exact accounting', async () => {
  const { budget, integration: subject } = integration();
  const output = await subject.executeBudgeted(request());
  assert.equal(output.ok, true);
  assert.equal(output.privatePermitAccepted, true);
  assert.equal(output.uart.exactText.at(-1), '\n');
  assert.equal(output.experimentBudget.charged.runs, 1);
  assert.equal(output.experimentBudget.charged.wallClockMs, 21);
  assert.deepEqual(subject.status(), { gate: null, tombstone: null });
  assert.deepEqual(budget.snapshot().consumed, { builds: 0, runs: 1, scenarios: 0, wallClockMs: 21 });
});

test('manual and budget paths share one gate and an opaque permit cannot cross bindings', async () => {
  let releaseRetirement;
  const heldRetirement = new Promise((resolve) => { releaseRetirement = resolve; });
  const { integration: subject } = integration({ retireCurrentOwner: () => heldRetirement });
  const pending = subject.executeBudgeted(request('x92-c3-held-gate-001'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await subject.executeManual(async () => ({ ok: true }))).code, 'X92_C3_SHARED_GATE_BLOCKED');
  assert.equal(subject.advancingBoundary({}, binding).code, 'X92_C3_SHARED_GATE_BLOCKED');
  releaseRetirement(quiescence());
  assert.equal((await pending).ok, true);
  assert.equal((await subject.executeManual(async () => ({ ok: true, code: 'MANUAL_COMPLETE' }))).code,
    'MANUAL_COMPLETE');
});

test('malformed or wrong-owner retirement creates a persistent full-charge tombstone', async () => {
  const budget = owner();
  const { integration: subject } = integration({ budget,
    retireCurrentOwner: async () => quiescence({ generation: binding.generation + 1 }) });
  const first = await subject.executeBudgeted(request('x92-c3-wrong-ack-001'));
  assert.equal(first.code, 'X92_C3_RETIREMENT_UNPROVEN');
  assert.equal(first.experimentBudget.charged.wallClockMs, 30_000);
  const usage = structuredClone(budget.snapshot().consumed);
  assert.equal((await subject.executeBudgeted(request('x92-c3-after-tombstone'))).code,
    'X92_C3_RETIREMENT_TOMBSTONE');
  assert.equal((await subject.executeManual(async () => ({ ok: true }))).code,
    'X92_C3_RETIREMENT_TOMBSTONE');
  assert.deepEqual(budget.snapshot().consumed, usage);
});

test('deadline covers retirement and charges once even when late owner acknowledgement arrives', async () => {
  let fireDeadline; let releaseRetirement; let cancelCalls = 0;
  const budget = owner();
  const held = new Promise((resolve) => { releaseRetirement = resolve; });
  const { integration: subject } = integration({ budget, retireCurrentOwner: () => held,
    cancelBudgetProducer: () => { cancelCalls += 1; return { ok: true }; },
    schedule: (callback) => { fireDeadline = callback; return 9; }, unschedule: () => {} });
  const pending = subject.executeBudgeted(request('x92-c3-deadline-001'));
  await new Promise((resolve) => setImmediate(resolve)); fireDeadline();
  const output = await pending;
  assert.equal(output.code, 'X92_DEADLINE_EXCEEDED');
  assert.equal(output.experimentBudget.charged.wallClockMs, 30_000);
  assert.equal(cancelCalls, 1);
  const usage = structuredClone(budget.snapshot().consumed);
  releaseRetirement(quiescence()); await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(budget.snapshot().consumed, usage);
  assert.equal((await subject.executeBudgeted(request('x92-c3-deadline-later'))).code,
    'X92_C3_RETIREMENT_TOMBSTONE');
});

test('absolute deadline blocks delayed retirement continuation even when the timer callback never fires', async () => {
  let clock = 0; let releaseRetirement; let prepareCalls = 0; let producerCalls = 0; let cancelCalls = 0;
  const held = new Promise((resolve) => { releaseRetirement = resolve; });
  const budget = owner();
  const { integration: subject } = integration({ budget, now: () => clock,
    retireCurrentOwner: () => held,
    prepareBudgetProducer: async ({ retiredBinding }) => { prepareCalls += 1; return retiredBinding; },
    executeBudgetProducer: async () => { producerCalls += 1; return result(); },
    cancelBudgetProducer: () => { cancelCalls += 1; return { ok: true }; },
    schedule: () => 17, unschedule: () => {} });
  const pending = subject.executeBudgeted(request('x92-c3-absolute-deadline'));
  await new Promise((resolve) => setImmediate(resolve));
  clock = 30_000;
  releaseRetirement(quiescence());
  const output = await pending;
  assert.equal(output.code, 'X92_DEADLINE_EXCEEDED');
  assert.equal(output.experimentBudget.charged.wallClockMs, 30_000);
  assert.equal(prepareCalls, 0); assert.equal(producerCalls, 0); assert.equal(cancelCalls, 1);
  assert.equal(subject.status().tombstone.code, 'X92_C3_DEADLINE_AFTER_RETIREMENT');
  assert.deepEqual(budget.snapshot().consumed, { builds: 0, runs: 1, scenarios: 0, wallClockMs: 30_000 });
});

test('absolute deadline blocks permit and producer after delayed preparation without a timer callback', async () => {
  let clock = 0; let releasePreparation; let producerCalls = 0;
  const held = new Promise((resolve) => { releasePreparation = resolve; });
  const budget = owner();
  const { integration: subject } = integration({ budget, now: () => clock,
    prepareBudgetProducer: () => held,
    executeBudgetProducer: async () => { producerCalls += 1; return result(); },
    schedule: () => 18, unschedule: () => {} });
  const pending = subject.executeBudgeted(request('x92-c3-delayed-preparation'));
  await new Promise((resolve) => setImmediate(resolve));
  clock = 30_001; releasePreparation(binding);
  const output = await pending;
  assert.equal(output.code, 'X92_DEADLINE_EXCEEDED'); assert.equal(producerCalls, 0);
  assert.equal(output.experimentBudget.charged.wallClockMs, 30_000);
  assert.equal(subject.status().tombstone.code, 'X92_C3_DEADLINE_AFTER_PREPARATION');
});

test('absolute deadline rejects a late producer result before validation or successful settlement', async () => {
  let clock = 0; let releaseProducer; let producerCalls = 0;
  const held = new Promise((resolve) => { releaseProducer = resolve; });
  const budget = owner();
  const { integration: subject } = integration({ budget, now: () => clock,
    executeBudgetProducer: async () => { producerCalls += 1; return held; },
    schedule: () => 19, unschedule: () => {} });
  const pending = subject.executeBudgeted(request('x92-c3-delayed-result'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(producerCalls, 1);
  clock = 30_000; releaseProducer(result());
  const output = await pending;
  assert.equal(output.code, 'X92_DEADLINE_EXCEEDED');
  assert.equal(output.experimentBudget.charged.wallClockMs, 30_000);
  assert.equal(subject.status().tombstone.code, 'X92_C3_DEADLINE_AFTER_PRODUCER');
  assert.equal(budget.snapshot().terminal.length, 1);
});

test('swapped result identity or missing final LF is unproven and permanently blocks dispatch', async () => {
  let instance;
  const budget = owner();
  instance = createX92C3BudgetIntegration({ budget, currentBinding: async () => binding,
    retireCurrentOwner: async () => quiescence(),
    executeBudgetProducer: async (source, permit, exactBinding) => {
      assert.equal(instance.advancingBoundary(permit, exactBinding).ok, true);
      return result({ uart: { exactText: 'NO-LF', finalLf: false } });
    },
    executeManualProducer: async () => ({ ok: true }), cancelBudgetProducer: () => ({ ok: true }),
    now: () => 5, schedule: () => 1, unschedule: () => {}, parseRequest: JSON.parse,
    measurementSource: 'test.monotonic-wall-clock' });
  const output = await instance.executeBudgeted(request('x92-c3-invalid-result'));
  assert.equal(output.code, 'X92_C3_RESULT_UNPROVEN');
  assert.equal(output.experimentBudget.charged.wallClockMs, 30_000);
  assert.equal(instance.status().tombstone.code, 'X92_C3_RESULT_OR_RETIREMENT_INVALID');
});
