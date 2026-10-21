// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { RuntimeKernel } from '../src/runtime-kernel.mjs';
import { Atmega328PAdapter } from '../src/atmega328p-adapter.mjs';
import { createThermostatExperiment, openThermostatExperiment } from '../src/thermostat-experiment.mjs';
import {
  X48_MAX_BOUNDARY_LATENESS_CYCLES,
  X48_NOMINAL_TICK_CYCLES,
  X48_PLANT_ID,
  X48_PROFILE,
  X48_SCHEMA,
  X48_TICK_COUNT,
  appendX48Observation,
  createX48RunState,
  finishX48Run,
  indeterminateX48Run,
  validateX48ThermostatGraph,
  x48FirmwareExpectation,
  x48PlantStep,
  x48TemperaturePosition,
} from '../src/x48-ideal-room-plant.mjs';

const binding = Object.freeze({
  schema: X48_SCHEMA, plantId: X48_PLANT_ID, profile: X48_PROFILE,
  inputIdentity: '1'.repeat(64), projectGeneration: 2, runtimeGeneration: 4,
  artifactIdentity: '2'.repeat(64), modelImplementationSha256: '3'.repeat(64),
  modelExecutionContextSha256: '4'.repeat(64), workerInitialization: 1,
  workerInstanceNonce: '5'.repeat(32),
});
const noDrops = Object.freeze({ inputDrops: 0, logicDrops: 0, serialDrops: 0,
  adcDrops: 0, unsupportedDrops: 0 });

function observation(state, tick, level, lateness = tick % 6) {
  const nominalTargetCycle = tick * X48_NOMINAL_TICK_CYCLES;
  const actualSampleCycle = nominalTargetCycle + lateness;
  return appendX48Observation(state, { tick, nominalTargetCycle, actualSampleCycle,
    pin: { mode: 'OUTPUT', level }, inputTargetCycle: actualSampleCycle,
    inputAppliedCycle: actualSampleCycle, retention: noDrops });
}

test('X48 fixed integer model has 32 exact vectors and separates nominal from actual cycles', () => {
  const expectedTemperatures = [21250, 22421, 23519, 24549, 25514, 26419, 27267, 28062,
    28808, 29507, 30162, 29527, 30181, 29545, 30198, 29561, 30213, 29575, 30226,
    29587, 30237, 29598, 30248, 29608, 30257, 29616, 30265, 29624, 30272, 29630,
    30278, 29636];
  const state = createX48RunState(binding);
  for (let tick = 1; tick <= X48_TICK_COUNT; tick += 1) {
    const expected = x48FirmwareExpectation(state.currentMilliC);
    const row = observation(state, tick, expected.expectedD13Level);
    assert.equal(row.nextMilliC, expectedTemperatures[tick - 1]);
    assert.equal(row.actualSampleCycle - row.nominalTargetCycle, tick % 6);
    assert.equal(row.inputAppliedCycle, row.actualSampleCycle);
  }
  const result = finishX48Run(state);
  assert.equal(result.status, 'passed');
  assert.equal(result.rows.length, 32);
  assert.equal(result.rows.every((row) => row.binding.workerInstanceNonce === binding.workerInstanceNonce), true);
});

test('pinned AVR producer completes a spanning instruction and exposes bounded lateness', () => {
  const adapter = new Atmega328PAdapter(':02000000FFCF30\n:00000001FF');
  const snapshot = adapter.runUntilCycle(1, 2);
  assert.deepEqual({ requested: 1, actual: snapshot.cycle, lateness: snapshot.cycle - 1 },
    { requested: 1, actual: 2, lateness: 1 });
  assert.ok(snapshot.cycle - 1 <= X48_MAX_BOUNDARY_LATENESS_CYCLES);
});

test('X48 known-bad equality is a completed contradiction, not an assumption about phase coverage', () => {
  const state = createX48RunState(binding); state.currentMilliC = 31_000;
  observation(state, 1, true, 0);
  for (let tick = 2; tick <= X48_TICK_COUNT; tick += 1) {
    observation(state, tick, x48FirmwareExpectation(state.currentMilliC).expectedD13Level, 0);
  }
  const result = finishX48Run(state);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'X48_EXECUTED_CONTROL_CONTRADICTION');
  assert.equal(result.rows[0].expected.firmwareTemperatureC, 30);
  assert.equal(result.rows[0].observedD13.level, true);
});

test('X48 rejects invented LOW, late boundaries, drops and incomplete traces as indeterminate', () => {
  assert.throws(() => x48PlantStep(20_000, { mode: 'INPUT', level: false }),
    { message: 'X48_D13_INDETERMINATE' });
  const late = createX48RunState(binding);
  assert.throws(() => observation(late, 1, true, X48_MAX_BOUNDARY_LATENESS_CYCLES + 1),
    { message: 'X48_BOUNDARY_EVIDENCE_INVALID' });
  const dropped = createX48RunState(binding);
  assert.throws(() => appendX48Observation(dropped, { tick: 1,
    nominalTargetCycle: X48_NOMINAL_TICK_CYCLES, actualSampleCycle: X48_NOMINAL_TICK_CYCLES,
    pin: { mode: 'OUTPUT', level: true }, inputTargetCycle: X48_NOMINAL_TICK_CYCLES,
    inputAppliedCycle: X48_NOMINAL_TICK_CYCLES,
    retention: { ...noDrops, adcDrops: 1 } }), { message: 'X48_RETENTION_INCOMPLETE' });
  assert.equal(indeterminateX48Run(createX48RunState(binding), 'X48_USER_CANCELLED').status,
    'indeterminate');
  assert.throws(() => finishX48Run(createX48RunState(binding)), { message: 'X48_TRACE_INCOMPLETE' });
});

test('X48 validates exact authored/runtime thermostat graphs and applies existing input owner without CPU advance', () => {
  const experiment = createThermostatExperiment();
  validateX48ThermostatGraph(experiment.project.candidateCircuit);
  const opened = openThermostatExperiment(experiment.text);
  assert.equal(opened.ok, true);
  const runtimeGraph = opened.session.runtimeProject.circuit;
  validateX48ThermostatGraph(runtimeGraph);
  const runtime = new RuntimeKernel(':00000001FF', runtimeGraph, {
    modelLibraryLock: CURRENT_MODEL_LIBRARY_LOCK,
  });
  const queued = runtime.queueControlAtCycle('temperature-sensor-1', 'position',
    x48TemperaturePosition(20_000), 0);
  const snapshot = runtime.snapshot();
  const applied = snapshot.eventLog.applied.find((item) => item.sequence === queued.sequence);
  assert.equal(snapshot.cycle, 0);
  assert.deepEqual([applied.targetCycle, applied.appliedCycle], [0, 0]);
  assert.equal(snapshot.circuit.controls['temperature-sensor-1'].position, 0.35);
});
