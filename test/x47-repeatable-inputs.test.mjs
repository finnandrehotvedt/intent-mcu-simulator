// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { createThermostatExperiment } from '../src/thermostat-experiment.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import {
  X47_RUNTIME_AUTHORITY_SCHEMA, createX47WorkerBinding,
} from '../src/x47-runtime-transaction.mjs';
import {
  canonicalX47RepeatableText, createX47RepeatableApplyRequest,
  createX47RepeatableContext, createX47RepeatableRecord, parseX47RepeatableText,
  validateX47RepeatableApplyRequest, validateX47RepeatableRecord,
} from '../src/x47-repeatable-inputs.mjs';

const hash = (value) => value.repeat(64);
const identity = { schema: 'intent-mcu-worker-runtime-identity@2', projectGeneration: 2,
  runtimeGeneration: 4, artifactIdentity: hash('a'),
  modelImplementationSha256: CURRENT_MODEL_LIBRARY_LOCK.implementationSha256,
  modelExecutionContextSha256: hash('b'), workerInitialization: 1,
  workerInstanceNonce: '1'.repeat(32) };
const authority = { schema: X47_RUNTIME_AUTHORITY_SCHEMA,
  profile: 'board.atmega328p-16mhz-v1', projectGeneration: 2, buildGeneration: 3,
  sourceProjectRevision: 0, sourceSha256: hash('c'), graphIdentity: null,
  inputIdentitySha256: hash('d'), artifactIdentity: hash('a'), runtimeGeneration: 4,
  modelImplementationSha256: identity.modelImplementationSha256,
  modelExecutionContextSha256: identity.modelExecutionContextSha256 };

async function fixture() {
  const opened = openCandidateUiSession(createThermostatExperiment().text);
  assert.equal(opened.ok, true);
  const graph = opened.session.visualProject.circuit;
  const context = await createX47RepeatableContext('board.atmega328p-16mhz-v1', 2, 0, graph);
  return { graph, context };
}

test('exact thermostat graph binds the ideal A1 module and existing D2 button', async () => {
  const { graph, context } = await fixture();
  assert.equal(context.target.boardPin, 'A1');
  assert.equal(context.target.units, 'degC');
  for (const mutate of [
    (value) => { value.nets = value.nets.filter((net) => !net.endpoints.some(
      (item) => item.component === 'temperature-sensor-1' && item.pin === 'AOUT')); },
    (value) => { value.components.find((item) => item.id === 'temperature-sensor-1').id = 'other'; },
    (value) => { value.nets = value.nets.filter((net) => !net.endpoints.some(
      (item) => item.component === 'enable-button-1' && item.pin === 'A')); },
  ]) {
    const changed = structuredClone(graph); mutate(changed);
    await assert.rejects(createX47RepeatableContext('board.atmega328p-16mhz-v1', 2, 0, changed));
  }
});

test('integer ramp is finite, unit-declared and canonical across export/import', async () => {
  const { context } = await fixture();
  const record = createX47RepeatableRecord('ramp', { startTemperatureC: 20,
    endTemperatureC: 40, eventCount: 5, startOffsetCycles: 16_000,
    stepCycles: 16_000 }, context);
  assert.deepEqual(record.events.map((item) => item.temperatureC), [20, 25, 30, 35, 40]);
  assert.equal(record.events.at(-1).offsetCycles, 80_000);
  assert.equal(record.units.value, 'degC');
  const text = canonicalX47RepeatableText(record, context);
  assert.deepEqual(parseX47RepeatableText(text, context), record);
  assert.deepEqual(parseX47RepeatableText(text, context).events, record.events);
});

test('seeded noise reproduces exact schedules and a changed seed changes data', async () => {
  const { context } = await fixture();
  const parameters = { centerTemperatureC: 30, amplitudeC: 4, eventCount: 8,
    startOffsetCycles: 8_000, stepCycles: 8_000 };
  const first = createX47RepeatableRecord('seeded-noise', parameters, context, 305419896);
  const again = createX47RepeatableRecord('seeded-noise', parameters, context, 305419896);
  const changed = createX47RepeatableRecord('seeded-noise', parameters, context, 305419897);
  assert.deepEqual(first.events, again.events);
  assert.notDeepEqual(first.events, changed.events);
  assert(first.events.every((item) => item.temperatureC >= 26 && item.temperatureC <= 34));
});

test('recorded points are strict bounded JSON and preserve stable event order', async () => {
  const { context } = await fixture();
  const points = [{ offsetCycles: 1, temperatureC: -50 },
    { offsetCycles: 20_000, temperatureC: 30 },
    { offsetCycles: 40_000, temperatureC: 150 }];
  const record = createX47RepeatableRecord('recorded', { points }, context);
  assert.deepEqual(record.events, points);
  const text = canonicalX47RepeatableText(record, context);
  for (const mutate of [
    (value) => { value.extra = true; },
    (value) => { value.events[1].offsetCycles = 1; },
    (value) => { value.events[0].temperatureC = 151; },
    (value) => { value.parameters.points[0].temperatureC += 1; },
  ]) {
    const changed = JSON.parse(text); mutate(changed);
    assert.throws(() => parseX47RepeatableText(JSON.stringify(changed), context));
  }
  assert.throws(() => parseX47RepeatableText('{"schema":', context));
  assert.throws(() => parseX47RepeatableText(' '.repeat(16_385), context), /X47_REPEATABLE_TEXT_LIMIT/u);
});

test('limits reject fractional conversion, range, horizon and oversized sequences', async () => {
  const { context } = await fixture();
  assert.throws(() => createX47RepeatableRecord('ramp', { startTemperatureC: 20,
    endTemperatureC: 21, eventCount: 3, startOffsetCycles: 1, stepCycles: 1 }, context),
  /X47_RAMP_INTEGER_STEP/u);
  assert.throws(() => createX47RepeatableRecord('seeded-noise', { centerTemperatureC: 149,
    amplitudeC: 2, eventCount: 2, startOffsetCycles: 1, stepCycles: 1 }, context, 1),
  /X47_NOISE_RANGE/u);
  assert.throws(() => createX47RepeatableRecord('recorded', { points: Array.from(
    { length: 65 }, (_, index) => ({ offsetCycles: index + 1, temperatureC: 20 })) }, context),
  /X47_REPEATABLE_EVENT_LIMIT/u);
});

test('apply request binds schedule to current paused-worker identity and exact conversion', async () => {
  const { context } = await fixture();
  const boundAuthority = { ...authority, graphIdentity: context.graphIdentity };
  const binding = createX47WorkerBinding(boundAuthority, identity);
  const record = createX47RepeatableRecord('ramp', { startTemperatureC: -50,
    endTemperatureC: 150, eventCount: 3, startOffsetCycles: 10, stepCycles: 10 }, context);
  const request = createX47RepeatableApplyRequest({ transactionId: 'x47-ramp-one',
    canonicalScheduleSha256: hash('e'), binding, expectedBaseCycle: 100, record },
  boundAuthority, identity);
  assert.deepEqual(request.schedule.map((item) => item.positionNumerator), [0, 100, 200]);
  assert(request.schedule.every((item) => item.positionDenominator === 200));
  assert.deepEqual(validateX47RepeatableApplyRequest(request, boundAuthority, identity), request);
  assert.throws(() => validateX47RepeatableApplyRequest({ ...request,
    expectedBaseCycle: Number.MAX_SAFE_INTEGER }, boundAuthority, identity));
  const stale = structuredClone(request); stale.binding.workerInstanceNonce = '2'.repeat(32);
  assert.throws(() => validateX47RepeatableApplyRequest(stale, boundAuthority, identity));
});

test('record mutation cannot be self-authorized by changing generated events', async () => {
  const { context } = await fixture();
  const record = createX47RepeatableRecord('seeded-noise', { centerTemperatureC: 30,
    amplitudeC: 3, eventCount: 4, startOffsetCycles: 1, stepCycles: 2 }, context, 7);
  const changed = structuredClone(record); changed.events[0].temperatureC += 1;
  assert.throws(() => validateX47RepeatableRecord(changed, context), /X47_REPEATABLE_SEQUENCE_MISMATCH/u);
});
