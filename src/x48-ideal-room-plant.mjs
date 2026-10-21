// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys, parseStrictJson } from './strict-json.mjs';

export const X48_SCHEMA = 'intent-mcu-x48-ideal-room-plant@2';
export const X48_AUTHORITY_SCHEMA = 'intent-mcu-x48-runtime-authority@1';
export const X48_PLANT_ID = 'x48-avr-ideal-room-instruction-boundary-v1';
export const X48_PLANT_CONTRACT_IDENTITY =
  'sha256:9b2ebe37aaa6d55fc90a69f20047c63d53d056f688d834e25b303e817f630be1';
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
const GRAPH_HASH = /^sha256:[a-f0-9]{64}$/u;
const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };
const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && exactKeys(value, keys);

const AUTHORITY_KEYS = Object.freeze([
  'schema', 'plantId', 'plantContractIdentity', 'profile', 'inputIdentity', 'sourceIdentity',
  'graphIdentity', 'projectGeneration', 'buildGeneration', 'sourceProjectRevision', 'runtimeGeneration',
  'artifactIdentity', 'modelImplementationSha256', 'modelExecutionContextSha256',
]);
const BINDING_KEYS = Object.freeze([
  ...AUTHORITY_KEYS, 'operationNonce',
  'workerInitialization', 'workerInstanceNonce',
]);
const RETENTION_KEYS = Object.freeze([
  'inputDrops', 'logicDrops', 'serialDrops', 'adcDrops', 'unsupportedDrops',
]);
const RESULT_KEYS = Object.freeze([
  'schema', 'plantId', 'binding', 'status', 'reason', 'currentMilliC', 'rows',
  'mismatches', 'retention',
]);
const ROW_KEYS = Object.freeze([
  'tick', 'nominalTargetCycle', 'actualSampleCycle', 'latenessCycles', 'inputMilliC',
  'expected', 'observedD13', 'matched', 'nextMilliC', 'inputTargetCycle',
  'inputAppliedCycle', 'binding', 'retention',
]);

function authorityShape(value, schema, keys) {
  if (!exact(value, keys) || value.schema !== schema || value.plantId !== X48_PLANT_ID
      || value.plantContractIdentity !== X48_PLANT_CONTRACT_IDENTITY
      || value.profile !== X48_PROFILE || !HASH.test(value.inputIdentity ?? '')
      || !HASH.test(value.sourceIdentity ?? '') || !GRAPH_HASH.test(value.graphIdentity ?? '')
      || !HASH.test(value.artifactIdentity ?? '') || !HASH.test(value.modelImplementationSha256 ?? '')
      || !HASH.test(value.modelExecutionContextSha256 ?? '')
      || !Number.isSafeInteger(value.projectGeneration) || value.projectGeneration < 1
      || !Number.isSafeInteger(value.buildGeneration) || value.buildGeneration < 1
      || !Number.isSafeInteger(value.sourceProjectRevision) || value.sourceProjectRevision < 0
      || !Number.isSafeInteger(value.runtimeGeneration) || value.runtimeGeneration < 1) {
    reject('X48_AUTHORITY_INVALID');
  }
  return value;
}

export function validateX48Authority(value, runtimeIdentity = null) {
  const authority = authorityShape(value, X48_AUTHORITY_SCHEMA, AUTHORITY_KEYS);
  if (runtimeIdentity) {
    for (const key of ['projectGeneration', 'runtimeGeneration', 'artifactIdentity',
      'modelImplementationSha256', 'modelExecutionContextSha256']) {
      if (authority[key] !== runtimeIdentity[key]) reject('X48_AUTHORITY_STALE');
    }
  }
  return Object.freeze(clone(authority));
}

export function createX48Binding(authorityValue, runtimeIdentity, operationNonce) {
  const authority = validateX48Authority(authorityValue, runtimeIdentity);
  if (!NONCE.test(operationNonce ?? '') || !Number.isSafeInteger(runtimeIdentity?.workerInitialization)
      || runtimeIdentity.workerInitialization < 1 || !NONCE.test(runtimeIdentity?.workerInstanceNonce ?? '')) {
    reject('X48_BINDING_INVALID');
  }
  return Object.freeze({ ...clone(authority), schema: X48_SCHEMA, operationNonce,
    workerInitialization: runtimeIdentity.workerInitialization,
    workerInstanceNonce: runtimeIdentity.workerInstanceNonce });
}

export function validateX48Binding(value, runtimeIdentity = null, authorityValue = null) {
  authorityShape(value, X48_SCHEMA, BINDING_KEYS);
  if (!NONCE.test(value.operationNonce ?? '')
      || !Number.isSafeInteger(value.workerInitialization) || value.workerInitialization < 1
      || !NONCE.test(value.workerInstanceNonce ?? '')) reject('X48_BINDING_INVALID');
  if (runtimeIdentity || authorityValue) {
    const expected = createX48Binding(authorityValue, runtimeIdentity, value.operationNonce);
    if (stableStringify(value) !== stableStringify(expected)) reject('X48_BINDING_STALE');
  }
  return Object.freeze(clone(value));
}

export function validateX48ThermostatGraph(graph) {
  if (!exact(graph, ['schema', 'components', 'nets', 'junctions'])
      || graph.schema !== 'teach-lab-circuit@2'
      || !Array.isArray(graph.components) || !Array.isArray(graph.nets)) {
    reject('X48_GRAPH_INVALID');
  }
  const components = new Map(graph.components.map((item) => [item.id, item]));
  if (components.size !== graph.components.length
      || new Set(graph.nets.map((item) => item.id)).size !== graph.nets.length
      || graph.nets.some((net) => !exact(net, ['id', 'endpoints']) || typeof net.id !== 'string'
        || !Array.isArray(net.endpoints) || net.endpoints.some(
          (endpoint) => !exact(endpoint, ['component', 'pin'])
            || typeof endpoint.component !== 'string' || typeof endpoint.pin !== 'string'))) {
    reject('X48_GRAPH_DUPLICATE_OR_EXTRA');
  }
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
  const phases = new Set(state.rows.map((row) => row.observedD13.level));
  state.status = state.mismatches ? 'failed' : phases.size === 2 ? 'passed' : 'indeterminate';
  state.reason = state.mismatches ? 'X48_EXECUTED_CONTROL_CONTRADICTION'
    : phases.size === 2 ? null : 'X48_PHASE_COVERAGE_INCOMPLETE';
  return validateX48Result(state);
}

export function indeterminateX48Run(state, reason) {
  if (!state || state.schema !== X48_SCHEMA || !['running', 'indeterminate'].includes(state.status)
      || typeof reason !== 'string' || !/^X48_[A-Z0-9_]+$/u.test(reason)) reject('X48_REASON_INVALID');
  state.status = 'indeterminate';
  state.reason = reason;
  return Object.freeze(clone(state));
}

function validateRetention(value) {
  if (!exact(value, RETENTION_KEYS) || Object.values(value).some(
    (entry) => !Number.isSafeInteger(entry) || entry !== 0)) reject('X48_RETENTION_INCOMPLETE');
  return true;
}

export function validateX48Result(value, expectedBinding = null) {
  if (!exact(value, RESULT_KEYS) || value.schema !== X48_SCHEMA || value.plantId !== X48_PLANT_ID
      || !['running', 'passed', 'failed', 'indeterminate'].includes(value.status)
      || (value.reason !== null && (typeof value.reason !== 'string'
        || !/^X48_[A-Z0-9_]+$/u.test(value.reason)))
      || !Number.isSafeInteger(value.currentMilliC) || !Number.isSafeInteger(value.mismatches)
      || !Array.isArray(value.rows) || value.rows.length > X48_TICK_COUNT) {
    reject('X48_RESULT_INVALID');
  }
  const binding = validateX48Binding(value.binding);
  if (expectedBinding && stableStringify(binding) !== stableStringify(validateX48Binding(expectedBinding))) {
    reject('X48_RESULT_BINDING_STALE');
  }
  validateRetention(value.retention);
  let currentMilliC = X48_INITIAL_MILLI_C;
  let mismatches = 0;
  const phases = new Set();
  for (const [index, row] of value.rows.entries()) {
    const tick = index + 1;
    if (!exact(row, ROW_KEYS) || row.tick !== tick
        || stableStringify(row.binding) !== stableStringify(binding)
        || !exact(row.expected, ['adc', 'firmwareTemperatureC', 'expectedD13Level'])
        || !exact(row.observedD13, ['mode', 'level']) || row.observedD13.mode !== 'OUTPUT'
        || typeof row.observedD13.level !== 'boolean' || typeof row.matched !== 'boolean') {
      reject('X48_RESULT_ROW_INVALID');
    }
    validateRetention(row.retention);
    const nominal = tick * X48_NOMINAL_TICK_CYCLES;
    const expected = x48FirmwareExpectation(currentMilliC);
    const plant = x48PlantStep(currentMilliC, row.observedD13);
    const lateness = row.actualSampleCycle - nominal;
    const matched = row.observedD13.level === expected.expectedD13Level;
    if (row.nominalTargetCycle !== nominal || !Number.isSafeInteger(row.actualSampleCycle)
        || row.latenessCycles !== lateness || lateness < 0
        || lateness > X48_MAX_BOUNDARY_LATENESS_CYCLES
        || row.inputMilliC !== currentMilliC || stableStringify(row.expected) !== stableStringify(expected)
        || row.matched !== matched || row.nextMilliC !== plant.nextMilliC
        || row.inputTargetCycle !== row.actualSampleCycle
        || row.inputAppliedCycle !== row.actualSampleCycle
        || (index > 0 && row.actualSampleCycle <= value.rows[index - 1].actualSampleCycle)) {
      reject('X48_RESULT_RECOMPUTE_MISMATCH');
    }
    if (!matched) mismatches += 1;
    phases.add(row.observedD13.level);
    currentMilliC = plant.nextMilliC;
  }
  if (value.currentMilliC !== currentMilliC || value.mismatches !== mismatches) {
    reject('X48_RESULT_AGGREGATE_MISMATCH');
  }
  if (['passed', 'failed'].includes(value.status) && value.rows.length !== X48_TICK_COUNT) {
    reject('X48_RESULT_INCOMPLETE');
  }
  if (value.status === 'passed' && (mismatches !== 0 || phases.size !== 2 || value.reason !== null)) {
    reject('X48_RESULT_PASS_INVALID');
  }
  if (value.status === 'failed' && (mismatches === 0
      || value.reason !== 'X48_EXECUTED_CONTROL_CONTRADICTION')) reject('X48_RESULT_FAIL_INVALID');
  if (value.status === 'indeterminate' && value.reason === null) reject('X48_RESULT_INDETERMINATE_INVALID');
  if (value.status === 'running' && value.reason !== null) reject('X48_RESULT_RUNNING_INVALID');
  return Object.freeze(clone(value));
}

export function parseX48ResultText(source, expectedBinding = null) {
  return validateX48Result(parseStrictJson(source, 512 * 1024), expectedBinding);
}

export function createX48OperationEpochOwner() {
  let epoch = 0;
  let active = null;
  const matches = (ticket, binding) => active && ticket?.epoch === active.epoch
    && ticket.operationNonce === active.operationNonce
    && binding?.operationNonce === active.operationNonce;
  return Object.freeze({
    begin(bindingValue) {
      const binding = validateX48Binding(bindingValue);
      active = { epoch: ++epoch, operationNonce: binding.operationNonce };
      return Object.freeze(clone(active));
    },
    accepts(ticket, binding) { return Boolean(matches(ticket, binding)); },
    complete(ticket, binding) {
      if (!matches(ticket, binding)) return false;
      active = null; epoch += 1; return true;
    },
    retire() { const prior = active ? clone(active) : null; active = null; epoch += 1; return prior; },
    active: () => active ? clone(active) : null,
  });
}
