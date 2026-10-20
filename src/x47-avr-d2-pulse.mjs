// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { parseStrictJson } from './strict-json.mjs';

export const X47_PULSE_SCHEMA = 'intent-mcu-x47-avr-d2-pulse@1';
export const X47_GENERATOR_ID = 'x47-avr-d2-active-low-pulse-v1';
export const X47_AVR_PROFILE = 'board.atmega328p-16mhz-v1';
export const X47_CLOCK_HERTZ = 16_000_000;
export const X47_MAX_END_CYCLES = 1_600_000;

const RECORD_KEYS = Object.freeze([
  'schema', 'profile', 'generatorId', 'target', 'startOffsetCycles', 'widthCycles',
  'timeBasis', 'clockHertz', 'idleLevel', 'activeLevel', 'randomness', 'seed',
  'sourceProjectRevision', 'graphIdentity',
]);
const TARGET_KEYS = Object.freeze([
  'componentId', 'componentType', 'inputEndpoint', 'contactEndpoint',
  'groundEndpoint', 'groundContactEndpoint',
]);
const CONTEXT_KEYS = Object.freeze(['profile', 'sourceProjectRevision', 'graphIdentity', 'target']);
const SOURCE_KEYS = Object.freeze([
  'profile', 'projectGeneration', 'sourceProjectRevision', 'graphSnapshotText', 'graphSnapshot', 'target',
]);
const EVENT_KEYS = Object.freeze(['pin', 'offsetCycles', 'level']);
const GROUND_PINS = new Set(['GND1', 'GND2', 'GND3']);

const clone = (value) => structuredClone(value);
const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
};
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const reject = (code) => { const error = new TypeError(code); error.code = code; throw error; };
const safePositive = (value) => Number.isSafeInteger(value) && value > 0;
const safeRevision = (value) => Number.isSafeInteger(value) && value >= 0;
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`,
  ).join(',')}}`;
  return JSON.stringify(value);
}

async function sha256(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validateTarget(target) {
  if (!exactKeys(target, TARGET_KEYS)
      || typeof target.componentId !== 'string'
      || target.componentType !== 'button.momentary-v1'
      || typeof target.inputEndpoint !== 'string'
      || typeof target.contactEndpoint !== 'string'
      || typeof target.groundEndpoint !== 'string'
      || typeof target.groundContactEndpoint !== 'string') reject('X47_TARGET');
  return clone(target);
}

function graphParts(graph) {
  if (!graph || typeof graph !== 'object' || !Array.isArray(graph.components)
      || !Array.isArray(graph.nets) || !Array.isArray(graph.junctions)) reject('X47_GRAPH');
  for (const net of graph.nets) {
    if (!net || typeof net !== 'object' || !Array.isArray(net.endpoints)
        || net.endpoints.some((endpoint) => !exactKeys(endpoint, ['component', 'pin'])
          || typeof endpoint.component !== 'string' || typeof endpoint.pin !== 'string')) reject('X47_GRAPH');
  }
  const boards = graph.components.filter((component) => component?.type === X47_AVR_PROFILE);
  if (boards.length !== 1 || typeof boards[0].id !== 'string') reject('X47_BOARD');
  return { board: boards[0], buttons: graph.components.filter(
    (component) => component?.type === 'button.momentary-v1' && typeof component.id === 'string',
  ) };
}

export function inspectX47AvrD2Target(graph) {
  const { board, buttons } = graphParts(graph);
  const matches = [];
  for (const button of buttons) {
    const inputEndpoint = `${board.id}.D2`;
    const contactEndpoint = `${button.id}.A`;
    const inputNet = graph.nets.find((net) => {
      const keys = net.endpoints.map(endpointKey).sort();
      return keys.length === 2 && keys[0] === [inputEndpoint, contactEndpoint].sort()[0]
        && keys[1] === [inputEndpoint, contactEndpoint].sort()[1];
    });
    const groundNet = graph.nets.find((net) => net.endpoints.some(
      (endpoint) => endpoint.component === button.id && endpoint.pin === 'B',
    ) && net.endpoints.some(
      (endpoint) => endpoint.component === board.id && GROUND_PINS.has(endpoint.pin),
    ));
    if (!inputNet || !groundNet) continue;
    const grounds = groundNet.endpoints.filter(
      (endpoint) => endpoint.component === board.id && GROUND_PINS.has(endpoint.pin),
    );
    if (grounds.length !== 1) reject('X47_GROUND_AMBIGUOUS');
    matches.push({
      componentId: button.id,
      componentType: 'button.momentary-v1',
      inputEndpoint,
      contactEndpoint,
      groundEndpoint: endpointKey(grounds[0]),
      groundContactEndpoint: `${button.id}.B`,
    });
  }
  if (matches.length !== 1) reject(matches.length ? 'X47_TARGET_AMBIGUOUS' : 'X47_TARGET_UNAVAILABLE');
  return matches[0];
}

export function captureX47PulseSource(profile, projectGeneration, sourceProjectRevision, graph) {
  if (profile !== X47_AVR_PROFILE) reject('X47_PROFILE');
  if (!safePositive(projectGeneration)) reject('X47_PROJECT_GENERATION');
  if (!safeRevision(sourceProjectRevision)) reject('X47_SOURCE_REVISION');
  const graphSnapshot = clone(graph);
  const target = inspectX47AvrD2Target(graphSnapshot);
  const graphSnapshotText = stableStringify(graphSnapshot);
  return deepFreeze({ profile, projectGeneration, sourceProjectRevision,
    graphSnapshotText, graphSnapshot, target });
}

function validateSource(source) {
  if (!exactKeys(source, SOURCE_KEYS) || source.profile !== X47_AVR_PROFILE
      || !safePositive(source.projectGeneration)
      || !safeRevision(source.sourceProjectRevision)
      || typeof source.graphSnapshotText !== 'string'
      || source.graphSnapshotText !== stableStringify(source.graphSnapshot)
      || stableStringify(source.target) !== stableStringify(inspectX47AvrD2Target(source.graphSnapshot))) {
    reject('X47_SOURCE_SNAPSHOT');
  }
  return source;
}

export function x47PulseSourceMatches(source, profile, projectGeneration, sourceProjectRevision, graph) {
  try {
    const expected = validateSource(source);
    const current = captureX47PulseSource(profile, projectGeneration, sourceProjectRevision, graph);
    return expected.profile === current.profile
      && expected.projectGeneration === current.projectGeneration
      && expected.sourceProjectRevision === current.sourceProjectRevision
      && expected.graphSnapshotText === current.graphSnapshotText;
  } catch { return false; }
}

export async function createX47PulseContextFromSource(source) {
  const captured = validateSource(source);
  const graphIdentity = `sha256:${await sha256(captured.graphSnapshotText)}`;
  const { profile, sourceProjectRevision, target } = captured;
  return Object.freeze({ profile, sourceProjectRevision, graphIdentity, target: Object.freeze(target) });
}

export async function createX47PulseContext(profile, sourceProjectRevision, graph) {
  return createX47PulseContextFromSource(captureX47PulseSource(profile, 1, sourceProjectRevision, graph));
}

export function validateX47PulseContext(context) {
  if (!exactKeys(context, CONTEXT_KEYS) || context.profile !== X47_AVR_PROFILE
      || !safeRevision(context.sourceProjectRevision)
      || !/^sha256:[0-9a-f]{64}$/u.test(context.graphIdentity)) reject('X47_CONTEXT');
  return Object.freeze({
    profile: context.profile,
    sourceProjectRevision: context.sourceProjectRevision,
    graphIdentity: context.graphIdentity,
    target: Object.freeze(validateTarget(context.target)),
  });
}

export function validateX47PulseRecord(value, currentContext = null) {
  if (!exactKeys(value, RECORD_KEYS)) reject('X47_RECORD_KEYS');
  if (value.schema !== X47_PULSE_SCHEMA || value.profile !== X47_AVR_PROFILE
      || value.generatorId !== X47_GENERATOR_ID) reject('X47_RECORD_IDENTITY');
  const target = validateTarget(value.target);
  if (!safePositive(value.startOffsetCycles)) reject('X47_START_OFFSET');
  if (!safePositive(value.widthCycles)) reject('X47_WIDTH');
  if (value.startOffsetCycles > X47_MAX_END_CYCLES
      || value.widthCycles > X47_MAX_END_CYCLES - value.startOffsetCycles) reject('X47_END_OFFSET');
  if (value.timeBasis !== 'avr-native-cycle' || value.clockHertz !== X47_CLOCK_HERTZ
      || value.idleLevel !== true || value.activeLevel !== false
      || value.randomness !== 'none' || value.seed !== null) reject('X47_FIXED_CONTRACT');
  if (!safeRevision(value.sourceProjectRevision)
      || !/^sha256:[0-9a-f]{64}$/u.test(value.graphIdentity)) reject('X47_SOURCE_BINDING');
  if (currentContext) {
    const context = validateX47PulseContext(currentContext);
    if (value.profile !== context.profile
        || value.sourceProjectRevision !== context.sourceProjectRevision
        || value.graphIdentity !== context.graphIdentity
        || stableStringify(target) !== stableStringify(context.target)) reject('X47_STALE_BINDING');
  }
  return Object.freeze({
    schema: value.schema,
    profile: value.profile,
    generatorId: value.generatorId,
    target: Object.freeze(target),
    startOffsetCycles: value.startOffsetCycles,
    widthCycles: value.widthCycles,
    timeBasis: value.timeBasis,
    clockHertz: value.clockHertz,
    idleLevel: value.idleLevel,
    activeLevel: value.activeLevel,
    randomness: value.randomness,
    seed: value.seed,
    sourceProjectRevision: value.sourceProjectRevision,
    graphIdentity: value.graphIdentity,
  });
}

export function createX47PulseRecord({ startOffsetCycles, widthCycles }, currentContext) {
  const context = validateX47PulseContext(currentContext);
  return validateX47PulseRecord({
    schema: X47_PULSE_SCHEMA,
    profile: X47_AVR_PROFILE,
    generatorId: X47_GENERATOR_ID,
    target: context.target,
    startOffsetCycles,
    widthCycles,
    timeBasis: 'avr-native-cycle',
    clockHertz: X47_CLOCK_HERTZ,
    idleLevel: true,
    activeLevel: false,
    randomness: 'none',
    seed: null,
    sourceProjectRevision: context.sourceProjectRevision,
    graphIdentity: context.graphIdentity,
  }, context);
}

export function expandX47PulseRecord(value, currentContext = null) {
  const record = validateX47PulseRecord(value, currentContext);
  const events = [
    { pin: 'D2', offsetCycles: record.startOffsetCycles, level: false },
    { pin: 'D2', offsetCycles: record.startOffsetCycles + record.widthCycles, level: true },
  ];
  for (const event of events) if (!exactKeys(event, EVENT_KEYS)) reject('X47_EVENT_SHAPE');
  return Object.freeze(events.map((event) => Object.freeze(event)));
}

export function canonicalX47PulseText(value, currentContext = null) {
  return `${JSON.stringify(validateX47PulseRecord(value, currentContext))}\n`;
}

export function parseX47PulseText(source, currentContext = null) {
  if (typeof source !== 'string') reject('X47_TEXT');
  return validateX47PulseRecord(parseStrictJson(source), currentContext);
}

export function createX47PulsePreviewOwner() {
  let accepted = null;
  const snapshot = () => accepted ? clone(accepted) : {
    state: 'empty', reason: null, record: null, canonicalText: null, events: [],
  };
  return Object.freeze({
    accept(value, currentContext) {
      const record = validateX47PulseRecord(value, currentContext);
      const next = {
        state: 'preview', reason: null, record: clone(record),
        canonicalText: canonicalX47PulseText(record, currentContext),
        events: clone(expandX47PulseRecord(record, currentContext)),
      };
      accepted = next;
      return snapshot();
    },
    revalidate(currentContext) {
      if (!accepted) return snapshot();
      try { validateX47PulseRecord(accepted.record, currentContext); }
      catch (error) {
        accepted = { state: 'invalidated', reason: error.code ?? 'X47_STALE_BINDING',
          record: null, canonicalText: null, events: [] };
      }
      return snapshot();
    },
    invalidate(reason = 'X47_CLEARED') {
      accepted = { state: 'invalidated', reason, record: null, canonicalText: null, events: [] };
      return snapshot();
    },
    snapshot,
  });
}
