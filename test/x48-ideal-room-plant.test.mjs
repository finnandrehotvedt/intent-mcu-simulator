// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { RuntimeKernel } from '../src/runtime-kernel.mjs';
import { Atmega328PAdapter } from '../src/atmega328p-adapter.mjs';
import { createThermostatExperiment, openThermostatExperiment } from '../src/thermostat-experiment.mjs';
import {
  X48_MAX_BOUNDARY_LATENESS_CYCLES,
  X48_NOMINAL_TICK_CYCLES,
  X48_PLANT_CONTRACT_IDENTITY,
  X48_PLANT_ID,
  X48_PROFILE,
  X48_SCHEMA,
  X48_TICK_COUNT,
  appendX48Observation,
  createX48OperationEpochOwner,
  createX48RunState,
  finishX48Run,
  indeterminateX48Run,
  parseX48ResultText,
  validateX48Result,
  validateX48ThermostatGraph,
  x48FirmwareExpectation,
  x48PlantStep,
  x48TemperaturePosition,
} from '../src/x48-ideal-room-plant.mjs';

const binding = Object.freeze({
  schema: X48_SCHEMA, plantId: X48_PLANT_ID,
  plantContractIdentity: X48_PLANT_CONTRACT_IDENTITY, profile: X48_PROFILE,
  inputIdentity: '1'.repeat(64), sourceIdentity: '6'.repeat(64),
  graphIdentity: `sha256:${'7'.repeat(64)}`, projectGeneration: 2, buildGeneration: 3,
  sourceProjectRevision: 8, runtimeGeneration: 4,
  artifactIdentity: '2'.repeat(64), modelImplementationSha256: '3'.repeat(64),
  modelExecutionContextSha256: '4'.repeat(64), operationNonce: '8'.repeat(32), workerInitialization: 1,
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

test('X48 boundary ceiling is source-backed by one instruction then one pinned interrupt tick', async () => {
  const avrEntry = import.meta.resolve('avr8js');
  const [instruction, cpu, interrupt, adapter, worker] = await Promise.all([
    readFile(new URL('./cpu/instruction.js', avrEntry), 'utf8'),
    readFile(new URL('./cpu/cpu.js', avrEntry), 'utf8'),
    readFile(new URL('./cpu/interrupt.js', avrEntry), 'utf8'),
    readFile(new URL('../src/atmega328p-adapter.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/simulator.worker.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(instruction, /cpu\.cycles \+= pc22Bits \? 4 : 3/u);
  assert.match(instruction, /cpu\.cycles\+\+;/u);
  assert.match(cpu, /this\.pc22Bits = this\.progBytes\.length > 0x20000/u);
  assert.match(interrupt, /cpu\.cycles \+= 2/u);
  assert.match(adapter, /new CPU\(this\.program, 0x800\)/u);
  assert.match(adapter, /avrInstruction\(this\.cpu\);[\s\S]*this\.cpu\.tick\(\);/u);
  assert.match(worker, /completed\.cycles < 1 \|\| completed\.cycles > 6/u);
  assert.match(worker, /const sampled = kernel\.sample\(\);[\s\S]*pin === 'D13'/u);
});

test('X48 known-bad equality is a completed contradiction, not an assumption about phase coverage', () => {
  const state = createX48RunState(binding);
  for (let tick = 1; tick <= X48_TICK_COUNT; tick += 1) {
    const expected = x48FirmwareExpectation(state.currentMilliC);
    observation(state, tick, tick === 12 ? true : expected.expectedD13Level, 0);
  }
  const result = finishX48Run(state);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'X48_EXECUTED_CONTROL_CONTRADICTION');
  assert.equal(result.rows[11].expected.firmwareTemperatureC, 30);
  assert.equal(result.rows[11].observedD13.level, true);
});

test('X48 completed report parser strictly recomputes every row and rejects tampering', () => {
  const state = createX48RunState(binding);
  for (let tick = 1; tick <= X48_TICK_COUNT; tick += 1) {
    observation(state, tick, x48FirmwareExpectation(state.currentMilliC).expectedD13Level, tick % 6);
  }
  const result = finishX48Run(state);
  assert.equal(parseX48ResultText(JSON.stringify(result), binding).status, 'passed');
  for (const mutate of [
    (value) => { value.rows[4].actualSampleCycle += 1; },
    (value) => { value.rows[7].nextMilliC += 1; },
    (value) => { value.rows[9].expected.adc += 1; },
    (value) => { value.rows[11].binding.sourceIdentity = '9'.repeat(64); },
    (value) => { value.rows[13].retention.serialDrops = 1; },
    (value) => { delete value.rows[15].inputAppliedCycle; },
  ]) {
    const changed = structuredClone(result); mutate(changed);
    assert.throws(() => validateX48Result(changed, binding), /X48_/u);
  }
  const duplicate = JSON.stringify(result).replace('"tick":1', '"tick":1,"tick":1');
  assert.throws(() => parseX48ResultText(duplicate, binding), /DUPLICATE_KEY/u);
});

test('X48 strict validator admits an incomplete running progress snapshot only as running', () => {
  const state = createX48RunState(binding);
  assert.equal(validateX48Result(state, state.binding).status, 'running');
  const forged = structuredClone(state); forged.status = 'passed';
  assert.throws(() => validateX48Result(forged, state.binding), /X48_RESULT_INCOMPLETE/u);
});

test('X48 never calls one-phase completion a closed-loop pass', () => {
  const state = createX48RunState(binding);
  for (let tick = 1; tick <= X48_TICK_COUNT; tick += 1) observation(state, tick, true, 0);
  const result = finishX48Run(state);
  assert.notEqual(result.status, 'passed');
  assert.equal(result.status, 'failed');
});

test('X48 UI epoch owner rejects late old progress and terminal after retirement or replacement', () => {
  const owner = createX48OperationEpochOwner();
  const first = owner.begin(binding);
  assert.equal(owner.accepts(first, binding), true);
  owner.retire();
  assert.equal(owner.accepts(first, binding), false);
  const nextBinding = { ...binding, operationNonce: '9'.repeat(32) };
  const second = owner.begin(nextBinding);
  assert.equal(owner.accepts(first, binding), false);
  assert.equal(owner.complete(first, binding), false);
  assert.deepEqual(owner.active(), second);
  assert.equal(owner.complete(second, nextBinding), true);
  assert.equal(owner.active(), null);
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
  const duplicate = structuredClone(runtimeGraph);
  duplicate.components.push(structuredClone(duplicate.components[0]));
  assert.throws(() => validateX48ThermostatGraph(duplicate), /X48_GRAPH_DUPLICATE_OR_EXTRA/u);
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
