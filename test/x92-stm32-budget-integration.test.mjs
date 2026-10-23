// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createX92ExperimentBudget } from '../src/x92-experiment-budget.mjs';
import {
  X92_STM32_BINDING_SCHEMA, X92_STM32_COMPLETION_SCHEMA, X92_STM32_RESULT_SCHEMA,
  createX92Stm32BudgetIntegration, normalizeX92Stm32Binding,
  x92IdentityFromStm32Binding,
} from '../src/x92-stm32-budget-integration.mjs';
import { STM32_EXECUTION_IDENTITIES } from '../src/stm32-execution-identities.mjs';

const profile = 'board.stm32f429zi-nucleo144-v1';
const h = (value) => `sha256:${value.repeat(64)}`;
const binding = Object.freeze({ schema: X92_STM32_BINDING_SCHEMA, profile,
  requestNonce: 'Stm32Request0001', projectGeneration: 9,
  sourceIdentity: h('a'), graphIdentity: h('b'), elfIdentity: h('c'), modelIdentity: h('d'),
  compiler: { imageIdentity: h('e'), toolchainIdentity: h('f') },
  runtime: { imageIdentity: h('1'), binaryIdentity: h('2') } });
const completion = (overrides = {}) => ({ schema: X92_STM32_COMPLETION_SCHEMA,
  operationId: 'stm32-operation-1', binding: structuredClone(binding), state: 'quiescent',
  processExited: true, daemonContainerAbsent: true, artifactPreserved: true,
  completedNaturally: true, signature: '3'.repeat(64), ...overrides });
const runtime = { engine: { id: 'renode', version: '1.17.0', actualExecution: true },
  observed: { pb0: true, uartText: 'STM32 PUBLIC\n' } };
const result = (overrides = {}) => ({ schema: X92_STM32_RESULT_SCHEMA, ok: true,
  code: 'STM32_MOCK_COMPLETE', executed: true, executionIdentity: structuredClone(binding),
  runtime: structuredClone(runtime), completion: completion(), ...overrides });
const request = (requestId = 'x92-stm32-run-001', generation = binding.projectGeneration) => JSON.stringify({
  schema: 'intent-mcu-bounded-action-request@1', action: 'runtime.run', requestId, profile,
  expectedGeneration: generation, issuedAtMs: 1_000, expiresAtMs: 31_000, payload: {},
});
function owner() {
  const budget = createX92ExperimentBudget({ measurementSource: 'test.monotonic-wall-clock',
    randomId: () => '00000000-0000-4000-8000-000000000002' });
  budget.start(x92IdentityFromStm32Binding(binding), { humanInitiated: true });
  return budget;
}
function subject(overrides = {}) {
  const budget = overrides.budget ?? owner();
  let clock = 10; let instance;
  instance = createX92Stm32BudgetIntegration({ budget,
    currentBinding: async () => binding,
    executeBudgetProducer: async (_source, permit, exact) => {
      assert.equal(instance.advancingBoundary(permit, exact).ok, true);
      clock = 42; return result();
    },
    retireCurrentOwner: async ({ completion: receipt }) => receipt,
    executeManualProducer: async (task, permit, exact) => {
      assert.equal(instance.advancingBoundary(permit, exact).ok, true);
      return task(permit, exact);
    },
    cancelBudgetProducer: () => ({ ok: true }), now: () => clock,
    schedule: () => 1, unschedule: () => {}, parseRequest: JSON.parse,
    measurementSource: 'test.monotonic-wall-clock', ...overrides });
  return { budget, integration: instance, setClock: (value) => { clock = value; } };
}

test('strict binding rejects stale or incomplete identity', () => {
  assert.deepEqual(normalizeX92Stm32Binding(binding), binding);
  assert.throws(() => normalizeX92Stm32Binding({ ...binding, elfIdentity: h('f'), extra: true }),
    /X92_STM32_BINDING_INVALID/u);
});

test('browser identity projection is pinned to the owning compiler/runtime locks and Renode asset', () => {
  const compiler = JSON.parse(readFileSync(new URL('../stm32/builder-image-lock.json', import.meta.url)));
  const runtimeLock = JSON.parse(readFileSync(new URL('../stm32/runtime-image-lock.json', import.meta.url)));
  const runtimeSource = readFileSync(new URL('../stm32/runtime-result.mjs', import.meta.url), 'utf8');
  assert.equal(STM32_EXECUTION_IDENTITIES.compilerImageIdentity, compiler.imageId);
  assert.equal(STM32_EXECUTION_IDENTITIES.compilerToolchainIdentity,
    `sha256:${compiler.toolchainManifestSha256}`);
  assert.equal(STM32_EXECUTION_IDENTITIES.runtimeImageIdentity, runtimeLock.imageId);
  assert.match(runtimeSource,
    new RegExp(STM32_EXECUTION_IDENTITIES.runtimeBinaryIdentity.slice(7), 'u'));
});

test('successful source/mock run waits for exact authenticated completion then releases gate', async () => {
  const { budget, integration } = subject();
  const output = await integration.executeBudgeted(request());
  assert.equal(output.ok, true);
  assert.equal(output.privatePermitAccepted, true);
  assert.equal(output.completion.processExited, true);
  assert.equal(output.completion.daemonContainerAbsent, true);
  assert.equal(output.experimentBudget.charged.runs, 1);
  assert.equal(output.experimentBudget.charged.wallClockMs, 32);
  assert.deepEqual(integration.status(), { gate: null, tombstone: null });
  assert.deepEqual(budget.snapshot().consumed, { builds: 0, runs: 1, scenarios: 0, wallClockMs: 32 });
});

test('stale identity rejects before producer dispatch', async () => {
  let dispatched = 0;
  const { integration } = subject({ executeBudgetProducer: async () => { dispatched += 1; return result(); } });
  const output = await integration.executeBudgeted(request('x92-stm32-stale', 10));
  assert.equal(output.code, 'ACTION_STALE_GENERATION');
  assert.equal(dispatched, 0);
});

test('unconfirmed daemon absence and disconnect fully charge and poison the shared gate', async () => {
  for (const mode of ['absence', 'disconnect']) {
    const options = mode === 'absence'
      ? { executeBudgetProducer: async () => result({ completion: completion({ daemonContainerAbsent: false }) }) }
      : { executeBudgetProducer: async () => { throw new TypeError('fetch failed'); } };
    const { budget, integration } = subject(options);
    const output = await integration.executeBudgeted(request(`x92-stm32-${mode}`));
    assert.equal(output.ok, false);
    assert.equal(budget.snapshot().consumed.wallClockMs, 30000);
    assert(integration.status().tombstone);
  }
});

test('manual and budget paths share one gate', async () => {
  let release; let producerCalls = 0;
  const held = new Promise((resolve) => { release = resolve; });
  const { integration } = subject({ executeBudgetProducer: async (_source, permit, exact) => {
    producerCalls += 1;
    assert.equal(integration.advancingBoundary(permit, exact).ok, true);
    await held; return result();
  } });
  const pending = integration.executeBudgeted(request('x92-stm32-overlap'));
  await Promise.resolve(); await Promise.resolve();
  const blocked = await integration.executeManual(async () => ({ ok: true }));
  assert.equal(blocked.code, 'X92_STM32_SHARED_GATE_BLOCKED');
  release();
  assert.equal((await pending).ok, true);
  assert.equal(producerCalls, 1);
});

test('deadline requests cancellation but never treats abort as completion proof', async () => {
  let cancelCalls = 0; let trigger;
  const { budget, integration } = subject({
    executeBudgetProducer: () => new Promise(() => {}),
    cancelBudgetProducer: () => { cancelCalls += 1; return { ok: true, code: 'CANCEL_REQUESTED' }; },
    schedule: (callback) => { trigger = callback; return 7; }, unschedule: () => {},
  });
  const pending = integration.executeBudgeted(request('x92-stm32-deadline'));
  await Promise.resolve(); await Promise.resolve(); trigger();
  const output = await pending;
  assert.equal(output.code, 'X92_DEADLINE_EXCEEDED');
  assert.equal(cancelCalls >= 1, true);
  assert.equal(budget.snapshot().consumed.wallClockMs, 30000);
});
