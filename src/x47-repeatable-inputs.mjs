// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { parseStrictJson } from './strict-json.mjs';
import {
  X47_AVR_PROFILE, X47_CLOCK_HERTZ, X47_MAX_END_CYCLES,
  captureX47PulseSource, createX47PulseContextFromSource,
} from './x47-avr-d2-pulse.mjs';
import { validateX47WorkerBinding } from './x47-runtime-transaction.mjs';

export const X47_REPEATABLE_SCHEMA = 'intent-mcu-x47-repeatable-input@1';
export const X47_REPEATABLE_APPLY_SCHEMA = 'intent-mcu-x47-repeatable-apply@1';
export const X47_REPEATABLE_FAMILIES = Object.freeze(['ramp', 'seeded-noise', 'recorded']);
export const X47_REPEATABLE_LIMITS = Object.freeze({ events: 64, textBytes: 16_384,
  minimumTemperatureC: -50, maximumTemperatureC: 150,
  maximumEndCycles: X47_MAX_END_CYCLES });

const HASH = /^[a-f0-9]{64}$/u;
const GRAPH_HASH = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const clone = structuredClone;
const reject = (code) => { throw Object.assign(new TypeError(code), { code }); };
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const stable = (value) => Array.isArray(value) ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value);
const endpoint = (value) => `${value.component}.${value.pin}`;
const integer = (value, minimum, maximum) => Number.isSafeInteger(value)
  && value >= minimum && value <= maximum;
const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

function exactNet(graph, first, second) {
  return graph.nets.some((net) => Array.isArray(net?.endpoints)
    && net.endpoints.length === 2
    && JSON.stringify(net.endpoints.map(endpoint).sort()) === JSON.stringify([first, second].sort()));
}

function groundNet(graph, boardId, sensorId) {
  return graph.nets.filter((net) => Array.isArray(net?.endpoints)
    && net.endpoints.some((item) => endpoint(item) === `${sensorId}.GND`)
    && net.endpoints.some((item) => item.component === boardId && /^GND[123]$/u.test(item.pin)));
}

export async function createX47RepeatableContext(profile, projectGeneration, sourceProjectRevision, graph) {
  const pulseSource = captureX47PulseSource(profile, projectGeneration, sourceProjectRevision, graph);
  const pulseContext = await createX47PulseContextFromSource(pulseSource);
  const boards = graph.components.filter((item) => item?.type === X47_AVR_PROFILE);
  const sensors = graph.components.filter((item) => item?.type === 'sensor.temperature-analogue-v1');
  if (boards.length !== 1 || sensors.length !== 1) reject('X47_REPEATABLE_GRAPH');
  const board = boards[0]; const sensor = sensors[0];
  if (sensor.id !== 'temperature-sensor-1'
      || !integer(sensor.controls?.temperatureC, -50, 150)
      || !exactNet(graph, `${board.id}.A1`, `${sensor.id}.AOUT`)
      || !exactNet(graph, `${board.id}.5V`, `${sensor.id}.VCC`)
      || groundNet(graph, board.id, sensor.id).length !== 1) reject('X47_REPEATABLE_A1_GRAPH');
  return deepFreeze({ profile, sourceProjectRevision, graphIdentity: pulseContext.graphIdentity,
    target: { componentId: sensor.id, componentType: sensor.type, boardPin: 'A1',
      inputEndpoint: `${board.id}.A1`, signalEndpoint: `${sensor.id}.AOUT`,
      units: 'degC', conversion: 'position=(temperatureC+50)/200' } });
}

function validateContext(value) {
  const keys = ['profile', 'sourceProjectRevision', 'graphIdentity', 'target'];
  const targetKeys = ['componentId', 'componentType', 'boardPin', 'inputEndpoint',
    'signalEndpoint', 'units', 'conversion'];
  if (!exact(value, keys) || value.profile !== X47_AVR_PROFILE
      || !integer(value.sourceProjectRevision, 0, Number.MAX_SAFE_INTEGER)
      || !GRAPH_HASH.test(value.graphIdentity ?? '') || !exact(value.target, targetKeys)
      || value.target.componentId !== 'temperature-sensor-1'
      || value.target.componentType !== 'sensor.temperature-analogue-v1'
      || value.target.boardPin !== 'A1' || value.target.units !== 'degC'
      || value.target.conversion !== 'position=(temperatureC+50)/200') reject('X47_REPEATABLE_CONTEXT');
  return deepFreeze(clone(value));
}

function validatePoints(points) {
  if (!Array.isArray(points) || points.length < 1 || points.length > X47_REPEATABLE_LIMITS.events) {
    reject('X47_REPEATABLE_EVENT_LIMIT');
  }
  let prior = 0;
  return points.map((point) => {
    if (!exact(point, ['offsetCycles', 'temperatureC'])
        || !integer(point.offsetCycles, 1, X47_REPEATABLE_LIMITS.maximumEndCycles)
        || point.offsetCycles <= prior
        || !integer(point.temperatureC, X47_REPEATABLE_LIMITS.minimumTemperatureC,
          X47_REPEATABLE_LIMITS.maximumTemperatureC)) reject('X47_REPEATABLE_POINT');
    prior = point.offsetCycles;
    return { offsetCycles: point.offsetCycles, temperatureC: point.temperatureC };
  });
}

function xorshift32(state) {
  let next = state >>> 0;
  next ^= next << 13; next ^= next >>> 17; next ^= next << 5;
  return next >>> 0;
}

function generated(parameters, family, seed) {
  if (family === 'recorded') {
    if (!exact(parameters, ['points'])) reject('X47_RECORDED_PARAMETERS');
    return validatePoints(parameters.points);
  }
  if (!exact(parameters, family === 'ramp'
    ? ['startTemperatureC', 'endTemperatureC', 'eventCount', 'startOffsetCycles', 'stepCycles']
    : ['centerTemperatureC', 'amplitudeC', 'eventCount', 'startOffsetCycles', 'stepCycles'])) {
    reject('X47_REPEATABLE_PARAMETERS');
  }
  if (!integer(parameters.eventCount, 2, X47_REPEATABLE_LIMITS.events)
      || !integer(parameters.startOffsetCycles, 1, X47_REPEATABLE_LIMITS.maximumEndCycles)
      || !integer(parameters.stepCycles, 1, X47_REPEATABLE_LIMITS.maximumEndCycles)
      || parameters.startOffsetCycles + parameters.stepCycles * (parameters.eventCount - 1)
        > X47_REPEATABLE_LIMITS.maximumEndCycles) reject('X47_REPEATABLE_HORIZON');
  if (family === 'ramp') {
    if (!integer(parameters.startTemperatureC, -50, 150)
        || !integer(parameters.endTemperatureC, -50, 150)) reject('X47_RAMP_RANGE');
    const delta = parameters.endTemperatureC - parameters.startTemperatureC;
    if (delta % (parameters.eventCount - 1) !== 0) reject('X47_RAMP_INTEGER_STEP');
    return Array.from({ length: parameters.eventCount }, (_, index) => ({
      offsetCycles: parameters.startOffsetCycles + index * parameters.stepCycles,
      temperatureC: parameters.startTemperatureC + index * delta / (parameters.eventCount - 1),
    }));
  }
  if (!integer(seed, 0, 0xffff_ffff) || !integer(parameters.centerTemperatureC, -50, 150)
      || !integer(parameters.amplitudeC, 1, 100)
      || parameters.centerTemperatureC - parameters.amplitudeC < -50
      || parameters.centerTemperatureC + parameters.amplitudeC > 150) reject('X47_NOISE_RANGE');
  let state = seed >>> 0;
  return Array.from({ length: parameters.eventCount }, (_, index) => {
    state = xorshift32(state || 0x6d2b79f5);
    return { offsetCycles: parameters.startOffsetCycles + index * parameters.stepCycles,
      temperatureC: parameters.centerTemperatureC
        + (state % (parameters.amplitudeC * 2 + 1)) - parameters.amplitudeC };
  });
}

export function createX47RepeatableRecord(family, parameters, contextValue, seed = null) {
  const context = validateContext(contextValue);
  if (!X47_REPEATABLE_FAMILIES.includes(family)) reject('X47_REPEATABLE_FAMILY');
  const normalizedSeed = family === 'seeded-noise' ? seed : null;
  const events = generated(clone(parameters), family, normalizedSeed);
  return validateX47RepeatableRecord({ schema: X47_REPEATABLE_SCHEMA, profile: X47_AVR_PROFILE,
    family, target: context.target, units: { value: 'degC', time: 'avr-native-cycle' },
    timeBasis: 'avr-native-cycle', clockHertz: X47_CLOCK_HERTZ, seed: normalizedSeed,
    parameters: clone(parameters), events, sourceProjectRevision: context.sourceProjectRevision,
    graphIdentity: context.graphIdentity }, context);
}

export function validateX47RepeatableRecord(value, contextValue = null) {
  const keys = ['schema', 'profile', 'family', 'target', 'units', 'timeBasis', 'clockHertz',
    'seed', 'parameters', 'events', 'sourceProjectRevision', 'graphIdentity'];
  if (!exact(value, keys) || value.schema !== X47_REPEATABLE_SCHEMA
      || value.profile !== X47_AVR_PROFILE || !X47_REPEATABLE_FAMILIES.includes(value.family)
      || !exact(value.units, ['value', 'time']) || value.units.value !== 'degC'
      || value.units.time !== 'avr-native-cycle' || value.timeBasis !== 'avr-native-cycle'
      || value.clockHertz !== X47_CLOCK_HERTZ
      || !integer(value.sourceProjectRevision, 0, Number.MAX_SAFE_INTEGER)
      || !GRAPH_HASH.test(value.graphIdentity ?? '')) reject('X47_REPEATABLE_RECORD');
  const context = contextValue ? validateContext(contextValue) : null;
  if (context && (stable(value.target) !== stable(context.target)
      || value.sourceProjectRevision !== context.sourceProjectRevision
      || value.graphIdentity !== context.graphIdentity)) reject('X47_REPEATABLE_STALE');
  if (value.family !== 'seeded-noise' && value.seed !== null) reject('X47_REPEATABLE_SEED');
  const expected = generated(value.parameters, value.family, value.seed);
  const events = validatePoints(value.events);
  if (stable(events) !== stable(expected)) reject('X47_REPEATABLE_SEQUENCE_MISMATCH');
  return deepFreeze({ ...clone(value), events });
}

export function canonicalX47RepeatableText(value, context = null) {
  return `${JSON.stringify(validateX47RepeatableRecord(value, context))}\n`;
}

export function parseX47RepeatableText(text, context = null) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > X47_REPEATABLE_LIMITS.textBytes) {
    reject('X47_REPEATABLE_TEXT_LIMIT');
  }
  return validateX47RepeatableRecord(parseStrictJson(text), context);
}

export function createX47RepeatableApplyRequest({ transactionId, canonicalScheduleSha256,
  binding, expectedBaseCycle, record }, authority, runtimeIdentity) {
  const validated = validateX47RepeatableRecord(record);
  const request = { schema: X47_REPEATABLE_APPLY_SCHEMA, transactionId,
    canonicalScheduleSha256, binding: clone(binding), expectedBaseCycle,
    schedule: validated.events.map((event) => ({ ...event,
      componentId: validated.target.componentId, key: 'position',
      positionNumerator: event.temperatureC + 50, positionDenominator: 200 })) };
  return validateX47RepeatableApplyRequest(request, authority, runtimeIdentity);
}

export function validateX47RepeatableApplyRequest(value, authority, runtimeIdentity) {
  if (!exact(value, ['schema', 'transactionId', 'canonicalScheduleSha256', 'binding',
    'expectedBaseCycle', 'schedule']) || value.schema !== X47_REPEATABLE_APPLY_SCHEMA
      || !ID.test(value.transactionId ?? '') || !HASH.test(value.canonicalScheduleSha256 ?? '')
      || !integer(value.expectedBaseCycle, 0, Number.MAX_SAFE_INTEGER)
      || !Array.isArray(value.schedule) || value.schedule.length < 1
      || value.schedule.length > X47_REPEATABLE_LIMITS.events) reject('X47_REPEATABLE_APPLY');
  const binding = validateX47WorkerBinding(value.binding, authority, runtimeIdentity);
  let prior = 0;
  const schedule = value.schedule.map((event) => {
    if (!exact(event, ['offsetCycles', 'temperatureC', 'componentId', 'key',
      'positionNumerator', 'positionDenominator'])
        || !integer(event.offsetCycles, 1, X47_REPEATABLE_LIMITS.maximumEndCycles)
        || event.offsetCycles <= prior || event.componentId !== 'temperature-sensor-1'
        || event.key !== 'position' || event.positionDenominator !== 200
        || event.positionNumerator !== event.temperatureC + 50
        || !integer(event.temperatureC, -50, 150)
        || value.expectedBaseCycle > Number.MAX_SAFE_INTEGER - event.offsetCycles) {
      reject('X47_REPEATABLE_APPLY_EVENT');
    }
    prior = event.offsetCycles;
    return clone(event);
  });
  return deepFreeze({ ...clone(value), binding, schedule });
}
