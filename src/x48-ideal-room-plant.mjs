// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';

export const X48_SCHEMA = 'intent-mcu-x48-ideal-room-plant@2';
export const X48_PLANT_ID = 'x48-avr-ideal-room-instruction-boundary-v1';
export const X48_PROFILE = 'board.atmega328p-16mhz-v1';
export const X48_NOMINAL_TICK_CYCLES = 2_560_000;
export const X48_TICK_COUNT = 32;
export const X48_MAX_BOUNDARY_LATENESS_CYCLES = 5;
export const X48_SLICE_INSTRUCTIONS = 50_000;
export const X48_INITIAL_MILLI_C = 20_000;
export const X48_AMBIENT_MILLI_C = 20_000;
export const X48_HEATER_OFFSET_MILLI_C = 20_000;
export const X48_UPDATE_DIVISOR = 16;
export const X48_MIN_MILLI_C = -50_000;
export const X48_MAX_MILLI_C = 150_000;

const HASH = /^[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && exactKeys(value, keys);

const BINDING_KEYS = Object.freeze([
  'schema', 'plantId', 'profile', 'inputIdentity', 'projectGeneration', 'runtimeGeneration',
  'artifactIdentity', 'modelImplementationSha256', 'modelExecutionContextSha256',
  'workerInitialization', 'workerInstanceNonce',
]);

export function validateX48Binding(value, runtimeIdentity = null) {
  if (!exact(value, BINDING_KEYS) || value.schema !== X48_SCHEMA
      || value.plantId !== X48_PLANT_ID || value.profile !== X48_PROFILE
      || !HASH.test(value.inputIdentity ?? '') || !HASH.test(value.artifactIdentity ?? '')
      || !HASH.test(value.modelImplementationSha256 ?? '')
      || !HASH.test(value.modelExecutionContextSha256 ?? '')
      || !Number.isSafeInteger(value.projectGeneration) || value.projectGeneration < 1
      || !Number.isSafeInteger(value.runtimeGeneration) || value.runtimeGeneration < 1
      || !Number.isSafeInteger(value.workerInitialization) || value.workerInitialization < 1
      || !NONCE.test(value.workerInstanceNonce ?? '')) reject('X48_BINDING_INVALID');
  if (runtimeIdentity) {
    for (const key of ['projectGeneration', 'runtimeGeneration', 'artifactIdentity',
      'modelImplementationSha256', 'modelExecutionContextSha256', 'workerInitialization',
      'workerInstanceNonce']) {
      if (value[key] !== runtimeIdentity[key]) reject('X48_BINDING_STALE');
    }
  }
  return Object.freeze(clone(value));
}

export function validateX48ThermostatGraph(graph) {
  if (!graph || graph.schema !== 'teach-lab-circuit@2'
      || !Array.isArray(graph.components) || !Array.isArray(graph.nets)) {
    reject('X48_GRAPH_INVALID');
  }
  const components = new Map(graph.components.map((item) => [item.id, item]));
  const temperature = graph.components.find((item) => item.id === 'temperature-sensor-1');
  const runtimeProjection = temperature?.type === 'potentiometer.linear-v1';
  const expected = new Map([
    ['board-1', 'board.atmega328p-16mhz-v1'],
    ['temperature-sensor-1', runtimeProjection
      ? 'potentiometer.linear-v1' : 'sensor.temperature-analogue-v1'],
    ['enable-button-1', 'button.momentary-v1'],
    ['heater-resistor-1', 'resistor.fixed-v1'],
    ['heater-led-1', 'led.basic-v1'],
  ]);
  if (components.size !== expected.size
      || [...expected].some(([id, type]) => components.get(id)?.type !== type)) {
    reject('X48_GRAPH_COMPONENTS_INVALID');
  }
  const netSignature = (net) => `${net.id}:${net.endpoints.map(
    (endpoint) => `${endpoint.component}.${endpoint.pin}`,
  ).sort().join(',')}`;
  const actualNets = graph.nets.map(netSignature).sort();
  const expectedNets = [
    `net-thermostat-5v:board-1.5V,temperature-sensor-1.${runtimeProjection ? 'HIGH' : 'VCC'}`,
    'net-thermostat-enable:board-1.D2,enable-button-1.A',
    `net-thermostat-ground:board-1.GND1,enable-button-1.B,heater-led-1.CATHODE,temperature-sensor-1.${runtimeProjection ? 'LOW' : 'GND'}`,
    'net-thermostat-heater-drive:board-1.D13,heater-resistor-1.A',
    'net-thermostat-heater-led:heater-led-1.ANODE,heater-resistor-1.B',
    `net-thermostat-temperature:board-1.A1,temperature-sensor-1.${runtimeProjection ? 'WIPER' : 'AOUT'}`,
  ].sort();
  if (JSON.stringify(actualNets) !== JSON.stringify(expectedNets)
      || components.get('heater-resistor-1').properties?.ohms !== 220) {
    reject('X48_GRAPH_NETS_INVALID');
  }
  return true;
}

export function x48TemperaturePosition(milliC) {
  if (!Number.isSafeInteger(milliC) || milliC < X48_MIN_MILLI_C
      || milliC > X48_MAX_MILLI_C) reject('X48_TEMPERATURE_INVALID');
  return (milliC + 50_000) / 200_000;
}

export function x48TruncTowardZero(value, divisor) {
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(divisor) || divisor <= 0) {
    reject('X48_INTEGER_STEP_INVALID');
  }
  return value < 0 ? Math.ceil(value / divisor) : Math.floor(value / divisor);
}

export function x48PlantStep(currentMilliC, pin) {
  if (!Number.isSafeInteger(currentMilliC) || currentMilliC < X48_MIN_MILLI_C
      || currentMilliC > X48_MAX_MILLI_C) reject('X48_TEMPERATURE_INVALID');
  if (!exact(pin, ['mode', 'level']) || pin.mode !== 'OUTPUT' || typeof pin.level !== 'boolean') {
    reject('X48_D13_INDETERMINATE');
  }
  const equilibrium = X48_AMBIENT_MILLI_C + (pin.level ? X48_HEATER_OFFSET_MILLI_C : 0);
  const nextMilliC = currentMilliC
    + x48TruncTowardZero(equilibrium - currentMilliC, X48_UPDATE_DIVISOR);
  if (nextMilliC < X48_MIN_MILLI_C || nextMilliC > X48_MAX_MILLI_C) {
    reject('X48_TEMPERATURE_OUT_OF_RANGE');
  }
  return Object.freeze({ currentMilliC, heaterOn: pin.level, equilibriumMilliC: equilibrium,
    nextMilliC });
}

export function x48FirmwareExpectation(inputMilliC) {
  if (!Number.isSafeInteger(inputMilliC) || inputMilliC < X48_MIN_MILLI_C
      || inputMilliC > X48_MAX_MILLI_C) reject('X48_TEMPERATURE_INVALID');
  const adc = Math.max(0, Math.min(1023, Math.floor(((inputMilliC + 50_000) * 16) / 3_125)));
  const firmwareTemperatureC = Math.floor((adc * 25) / 128) - 50;
  return Object.freeze({ adc, firmwareTemperatureC, expectedD13Level: firmwareTemperatureC < 30 });
}

export function createX48RunState(binding) {
  return {
    schema: X48_SCHEMA,
    plantId: X48_PLANT_ID,
    binding: clone(validateX48Binding(binding)),
    status: 'running',
    reason: null,
    currentMilliC: X48_INITIAL_MILLI_C,
    rows: [],
    mismatches: 0,
    retention: { inputDrops: 0, logicDrops: 0, serialDrops: 0, adcDrops: 0, unsupportedDrops: 0 },
  };
}

export function appendX48Observation(state, observation) {
  if (!state || state.schema !== X48_SCHEMA || state.status !== 'running'
      || !exact(observation, ['tick', 'nominalTargetCycle', 'actualSampleCycle', 'pin',
        'inputAppliedCycle', 'inputTargetCycle', 'retention'])) reject('X48_OBSERVATION_INVALID');
  const tick = state.rows.length + 1;
  const nominalTargetCycle = tick * X48_NOMINAL_TICK_CYCLES;
  const latenessCycles = observation.actualSampleCycle - nominalTargetCycle;
  if (observation.tick !== tick || observation.nominalTargetCycle !== nominalTargetCycle
      || !Number.isSafeInteger(observation.actualSampleCycle)
      || latenessCycles < 0 || latenessCycles > X48_MAX_BOUNDARY_LATENESS_CYCLES
      || (state.rows.length && observation.actualSampleCycle <= state.rows.at(-1).actualSampleCycle)
      || observation.inputTargetCycle !== observation.actualSampleCycle
      || observation.inputAppliedCycle !== observation.actualSampleCycle) {
    reject('X48_BOUNDARY_EVIDENCE_INVALID');
  }
  if (!exact(observation.retention,
    ['inputDrops', 'logicDrops', 'serialDrops', 'adcDrops', 'unsupportedDrops'])
      || Object.values(observation.retention).some((value) => value !== 0)) {
    reject('X48_RETENTION_INCOMPLETE');
  }
  const plant = x48PlantStep(state.currentMilliC, observation.pin);
  const expectation = x48FirmwareExpectation(state.currentMilliC);
  const matched = observation.pin.level === expectation.expectedD13Level;
  const row = Object.freeze({
    tick,
    nominalTargetCycle,
    actualSampleCycle: observation.actualSampleCycle,
    latenessCycles,
    inputMilliC: state.currentMilliC,
    expected: expectation,
    observedD13: clone(observation.pin),
    matched,
    nextMilliC: plant.nextMilliC,
    inputTargetCycle: observation.inputTargetCycle,
    inputAppliedCycle: observation.inputAppliedCycle,
    binding: clone(state.binding),
    retention: clone(observation.retention),
  });
  state.rows.push(row);
  state.currentMilliC = plant.nextMilliC;
  if (!matched) state.mismatches += 1;
  return clone(row);
}

export function finishX48Run(state) {
  if (!state || state.schema !== X48_SCHEMA || state.status !== 'running') reject('X48_STATE_INVALID');
  if (state.rows.length !== X48_TICK_COUNT) reject('X48_TRACE_INCOMPLETE');
  state.status = state.mismatches ? 'failed' : 'passed';
  state.reason = state.mismatches ? 'X48_EXECUTED_CONTROL_CONTRADICTION' : null;
  return Object.freeze(clone(state));
}

export function indeterminateX48Run(state, reason) {
  if (!state || state.schema !== X48_SCHEMA || !['running', 'indeterminate'].includes(state.status)
      || typeof reason !== 'string' || !/^X48_[A-Z0-9_]+$/u.test(reason)) reject('X48_REASON_INVALID');
  state.status = 'indeterminate';
  state.reason = reason;
  return Object.freeze(clone(state));
}
