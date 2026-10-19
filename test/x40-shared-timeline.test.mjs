// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { RUNTIME_BINDING_SCHEMA, WORKER_RUNTIME_IDENTITY_SCHEMA } from '../src/runtime-identity.mjs';
import {
  X40_CLASS_ORDER, X40_SHARED_TIMELINE_SCHEMA, X40_TIE_ORDER_LABEL,
  createX40SharedTimeline, validateX40SharedTimeline, x40TimelineRetainsForLifecycle,
} from '../src/x40-shared-timeline.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const artifactIdentity = 'a'.repeat(64);
const inputIdentity = 'b'.repeat(64);
const runtimeBinding = { schema: RUNTIME_BINDING_SCHEMA, projectGeneration: 2,
  runtimeGeneration: 4, artifactIdentity };
const runtimeIdentity = { schema: WORKER_RUNTIME_IDENTITY_SCHEMA, projectGeneration: 2,
  runtimeGeneration: 4, artifactIdentity, workerInitialization: 2,
  workerInstanceNonce: 'c'.repeat(32) };

function context() {
  const requested = [
    { sequence: 1, targetCycle: 0, type: 'control', componentId: 'temperature-sensor-1', key: 'position', value: 0.4 },
    { sequence: 2, targetCycle: 0, type: 'control', componentId: 'enable-button-1', key: 'pressed', value: true },
  ];
  const applied = requested.map((entry) => ({ ...entry, appliedCycle: 25 }));
  return {
    profile: 'board.atmega328p-16mhz-v1', projectGeneration: 2, runtimeBinding,
    reset: { kind: 'reset', cycle: 0, paused: true, runtimeIdentity },
    observation: { kind: 'paused', cycle: 3_200_000, paused: true, runtimeIdentity,
      eventLog: { pending: [], log: requested, applied, dropped: 0,
        retention: { limit: 10_000, requested: { retained: 2, dropped: 0 },
          applied: { retained: 2, dropped: 0 } } },
      instruments: {
        logic: { transitions: [{ pin: 'D13', cycle: 25, level: true }], dropped: 0 },
        serial: { records: [{ direction: 'tx', value: 72, text: 'H', cycle: 25 },
          { direction: 'tx', value: 10, text: '\n', cycle: 30 }], dropped: 0 },
      } },
    inputIdentity, artifactIdentity, scenarioId: 'THERM-SCENARIO-BELOW-ENABLED',
    result: { schema: 'intent-mcu-scenario-observation-result@1',
      scenarioId: 'THERM-SCENARIO-BELOW-ENABLED', status: 'passed',
      outcome: { academicStatus: 'passed', jobStatus: 'completed', evidenceStatus: 'complete' },
      virtualMilliseconds: 200,
      checks: { inputsComplete: true, pinObserved: true, primaryExecutedPin: true } },
  };
}

test('X40 creates one closed five-class native-cycle projection with deterministic tie order', async () => {
  const timeline = await createX40SharedTimeline(context());
  assert.equal(timeline.schema, X40_SHARED_TIMELINE_SCHEMA);
  assert.deepEqual([...new Set(timeline.rows.map((row) => row.class))], X40_CLASS_ORDER);
  assert.equal(timeline.nativeTimebase.tieOrderMeaning, X40_TIE_ORDER_LABEL);
  assert.deepEqual(timeline.rows.filter((row) => row.cycle === 25).map(
    (row) => [row.class, row.producerSequence, row.sameCycleSequence]), [
    ['input', 1, 1], ['input', 2, 2], ['gpio', 1, 3], ['serial', 1, 4],
  ]);
  assert.equal(timeline.rows.find((row) => row.class === 'input').value.targetCycle, 0);
  assert.equal(timeline.rows.find((row) => row.class === 'input').cycle, 25);
  assert.deepEqual(await validateX40SharedTimeline(timeline, context()), timeline);
});

test('X40 semantic hash is stable and mutation or extra authority rejects', async () => {
  const first = await createX40SharedTimeline(context());
  const second = await createX40SharedTimeline(context());
  assert.equal(first.semanticSha256, second.semanticSha256);
  for (const mutate of [
    (value) => { value.rows[0].cycle = 1; },
    (value) => { value.rows[0].extra = true; },
    (value) => { value.identity.workerInstanceNonce = 'd'.repeat(32); },
    (value) => { value.semanticSha256 = '0'.repeat(64); },
  ]) {
    const changed = structuredClone(first); mutate(changed);
    await assert.rejects(validateX40SharedTimeline(changed, context()));
  }
});

test('X40 rejects requested-as-actual, missing classes, stale identity, drops and incomplete result', async (suite) => {
  for (const [name, mutate] of [
    ['profile', (value) => { value.profile = 'board.rp2040-pico-v1'; }],
    ['reset UI state', (value) => { value.reset.kind = 'status'; }],
    ['requested as actual', (value) => { delete value.observation.eventLog.applied[0].appliedCycle; }],
    ['late before target', (value) => { value.observation.eventLog.applied[0].appliedCycle = -1; }],
    ['order', (value) => { value.observation.eventLog.applied.reverse(); }],
    ['input drops', (value) => { value.observation.eventLog.dropped = 1; }],
    ['applied drops', (value) => { value.observation.eventLog.retention.applied.dropped = 1; }],
    ['GPIO missing', (value) => { value.observation.instruments.logic.transitions = []; }],
    ['GPIO drops', (value) => { value.observation.instruments.logic.dropped = 1; }],
    ['Serial missing', (value) => { value.observation.instruments.serial.records = []; }],
    ['Serial drops', (value) => { value.observation.instruments.serial.dropped = 1; }],
    ['stale identity', (value) => { value.observation.runtimeIdentity.runtimeGeneration = 5; }],
    ['wrong artifact', (value) => { value.artifactIdentity = 'e'.repeat(64); }],
    ['missing observation cycle', (value) => { value.observation.cycle = null; }],
    ['expected time substitute', (value) => { value.result.virtualMilliseconds = 160; }],
    ['incomplete', (value) => { value.result.outcome.evidenceStatus = 'incomplete'; }],
    ['failed job', (value) => { value.result.outcome.jobStatus = 'timed-out'; }],
  ]) await suite.test(name, async () => {
    const value = context(); mutate(value);
    await assert.rejects(createX40SharedTimeline(value));
  });
});

test('X40 lifecycle retains only pure visual project edits', () => {
  assert.equal(x40TimelineRetainsForLifecycle({ type: 'project.edit', relevance: 'visual' }), true);
  for (const event of [
    { type: 'build', relevance: 'build' }, { type: 'runtime.reset', relevance: 'runtime' },
    { type: 'runtime.run', relevance: 'runtime' }, { type: 'project.edit', relevance: 'build' },
    { type: 'project.open', relevance: 'build' }, { type: 'project.new', relevance: 'build' },
    { type: 'profile.switch', relevance: 'build' }, { type: 'worker.retire', relevance: 'runtime' },
    { type: 'reload', relevance: 'runtime' }, { type: 'import', relevance: 'build' },
  ]) assert.equal(x40TimelineRetainsForLifecycle(event), false);
  assert.equal(x40TimelineRetainsForLifecycle({ type: 'project.edit', relevance: 'visual', extra: true }), false);
});

test('X40 UI wiring creates only from isolated authored evidence and invalidates runtime authority', async () => {
  const source = await readFile(new URL('../staging/main.mjs', import.meta.url), 'utf8');
  assert.match(source, /run\.authored && scenarios\.length === 1/u);
  assert.match(source, /createX40SharedTimeline\(context\)/u);
  assert.match(source, /function stopRuntime[\s\S]*?clearX40SharedTimeline/u);
  assert.match(source, /elements\.run\.addEventListener\('click',[\s\S]*?clearX40SharedTimeline/u);
  assert.match(source, /elements\.reset\.addEventListener\('click',[\s\S]*?clearX40SharedTimeline/u);
  assert.match(source, /x40TimelineRetainsForLifecycle\(\{ type: 'project\.edit', relevance \}\)/u);
  assert.match(source, /validateX40SharedTimeline\(x40SharedTimeline, context\)/u);
  assert.doesNotMatch(source, /persistProject\([^)]*x40|localStorage[^\n]*x40/iu);
});
