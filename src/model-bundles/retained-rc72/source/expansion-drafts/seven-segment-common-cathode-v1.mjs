// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';

export const SEVEN_SEGMENT_TYPE = 'output.seven-segment-common-cathode-v1';
export const SEVEN_SEGMENT_MODEL = 'model.seven-segment-common-cathode-ideal-v1';
export const SEVEN_SEGMENT_RENDERER = 'output-seven-segment-common-cathode';
export const SEVEN_SEGMENT_RUNTIME_TYPE = 'led.basic-v1';
export const AVR_SEVEN_SEGMENT_PINS = Object.freeze(
  Array.from({ length: 12 }, (_, index) => `D${index + 2}`),
);
export const SEVEN_SEGMENT_CHANNELS = Object.freeze(
  ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((pin) => Object.freeze({ pin })),
);
export const SEVEN_SEGMENT_DIGITS = Object.freeze({
  0: Object.freeze(['a', 'b', 'c', 'd', 'e', 'f']),
  1: Object.freeze(['b', 'c']),
  2: Object.freeze(['a', 'b', 'd', 'e', 'g']),
  3: Object.freeze(['a', 'b', 'c', 'd', 'g']),
  4: Object.freeze(['b', 'c', 'f', 'g']),
  5: Object.freeze(['a', 'c', 'd', 'f', 'g']),
  6: Object.freeze(['a', 'c', 'd', 'e', 'f', 'g']),
  7: Object.freeze(['a', 'b', 'c']),
  8: Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'g']),
  9: Object.freeze(['a', 'b', 'c', 'd', 'f', 'g']),
});

const clone = (value) => structuredClone(value);
const BOARD_TYPE = 'board.atmega328p-16mhz-v1';
const GROUND_PIN = /^GND[123]$/u;
const DIGITAL_PIN = /^D(?:[0-9]|1[0-3])$/u;
const SUPPORTED_PINS = new Set(AVR_SEVEN_SEGMENT_PINS);
const INTERNAL_ID = /^[a-z][a-z0-9-]{0,47}$/u;
const TERMINAL_X = Object.freeze({
  a: 0.075, b: 0.196, c: 0.318, d: 0.439,
  e: 0.561, f: 0.682, g: 0.804, COM: 0.925,
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function pin(id, label, role, signals, constraints) {
  return {
    id, label, role, signals: [...signals], capabilities: [...signals],
    constraints: { ...constraints }, anchor: { x: TERMINAL_X[id], y: 29 / 30 },
  };
}

export const SEVEN_SEGMENT_DEFINITION = deepFreeze({
  family: 'display.seven-segment',
  variant: 'ideal-single-digit-common-cathode-eight-terminal',
  type: SEVEN_SEGMENT_TYPE,
  version: 1,
  displayName: 'Single-digit seven-segment display',
  manufacturer: 'Intent Learning',
  partNumber: 'IL-7SEG-CC-1D',
  pins: [
    ...SEVEN_SEGMENT_CHANNELS.map(({ pin: segment }) => pin(
      segment,
      `Segment ${segment} anode · external resistor required`,
      'passive',
      ['passive.current-limited-led-segment'],
      { polarity: 'anode', segment, requiresSeriesResistor: true },
    )),
    pin('COM', 'Common cathode · ground', 'ground', ['ground.reference'], {
      polarity: 'cathode', commonCathode: true,
    }),
  ],
  propertyKeys: [],
  propertySchema: {},
  controlKeys: [],
  modelRef: SEVEN_SEGMENT_MODEL,
  internalTerminalGroups: [],
  selectable: true,
  artwork: {
    renderer: SEVEN_SEGMENT_RENDERER,
    thumbnail: SEVEN_SEGMENT_RENDERER,
    viewBox: [0, 0, 160, 120], cssWidth: 160, cssHeight: 120,
    provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced package, photograph or third-party simulator artwork.',
    license: 'Apache-2.0',
  },
  catalog: {
    category: 'displays',
    aliases: ['seven segment', '7 segment', 'single digit display', 'common cathode display'],
    functions: ['numeric display', 'digital output indicator'],
    interfaces: ['GPIO'],
    supplyVolts: { min: 0, max: 5 },
    package: 'original virtual single-digit eight-terminal display',
  },
  support: {
    status: 'simulated',
    limitations: [
      'Ideal single-digit common-cathode teaching model projected through seven independently validated existing LED channels.',
      'Segments a through g each require one dedicated external series resistor and one unique AVR D2–D13 digital output; COM must connect to ground.',
      'Only commanded segment on/off state is shown. No decimal point, multiplexing, driver IC, brightness, optical, package-current, tolerance, thermal or physical display accuracy is modelled.',
    ],
  },
});

export function validateSevenSegmentDefinition(definition = SEVEN_SEGMENT_DEFINITION) {
  return exactKeys(definition, [
    'family', 'variant', 'type', 'version', 'displayName', 'manufacturer', 'partNumber',
    'pins', 'propertyKeys', 'propertySchema', 'controlKeys', 'modelRef',
    'internalTerminalGroups', 'selectable', 'artwork', 'catalog', 'support',
  ]) && JSON.stringify(definition) === JSON.stringify(SEVEN_SEGMENT_DEFINITION);
}

export function createSevenSegmentComponent(
  id,
  label = 'Single-digit seven-segment display',
) {
  const component = {
    id,
    type: SEVEN_SEGMENT_TYPE,
    label,
    properties: {},
    controls: {},
  };
  if (!validateSevenSegmentComponent(component)) throw new TypeError('SEVEN_SEGMENT_STATE');
  return component;
}

export function validateSevenSegmentComponent(component) {
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && component.type === SEVEN_SEGMENT_TYPE
    && exactKeys(component.properties, [])
    && exactKeys(component.controls, []);
}

function fail(code, details = []) { return { ok: false, code, details }; }
function endpointKey(endpoint) { return `${endpoint.component}.${endpoint.pin}`; }

function indexes(graph) {
  const components = new Map(graph.components.map((component) => [component.id, component]));
  const nets = new Map(graph.nets.map((net) => [net.id, net]));
  const endpointToNet = new Map();
  for (const net of graph.nets) {
    for (const endpoint of net.endpoints) endpointToNet.set(endpointKey(endpoint), net.id);
  }
  return { components, nets, endpointToNet };
}

function boardEndpoints(index, netId) {
  return (index.nets.get(netId)?.endpoints ?? []).filter(
    (endpoint) => index.components.get(endpoint.component)?.type === BOARD_TYPE,
  );
}

function runtimeId(base, segment, ordinal, used) {
  const preferred = `${base}-seg-${segment}`;
  if (INTERNAL_ID.test(preferred) && !used.has(preferred)) {
    used.add(preferred);
    return preferred;
  }
  for (let attempt = 1; attempt < 1_000; attempt += 1) {
    const candidate = `seven-${ordinal}-${segment}-${attempt}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  throw new Error('SEVEN_SEGMENT_RUNTIME_ID_LIMIT');
}

function inspectSegment(graph, index, component, segment, commonNet) {
  const upper = segment.toUpperCase();
  const code = `SEVEN_SEGMENT_${upper}`;
  const segmentNet = index.endpointToNet.get(`${component.id}.${segment}`) ?? null;
  if (!segmentNet) return fail(`${code}_DISCONNECTED`, [component.id, segment]);
  if (segmentNet === commonNet) {
    return fail('SEVEN_SEGMENT_SEGMENT_SHORT', [component.id, segment, segmentNet]);
  }
  const segmentBoards = boardEndpoints(index, segmentNet);
  if (segmentBoards.some((endpoint) => GROUND_PIN.test(endpoint.pin))) {
    return fail('SEVEN_SEGMENT_REVERSE_POLARITY', [component.id, segment, segmentNet]);
  }
  if (segmentBoards.length) {
    return fail(`${code}_CURRENT_LIMIT_REQUIRED`, [component.id, segment, segmentNet]);
  }
  const endpoints = index.nets.get(segmentNet)?.endpoints ?? [];
  if (endpoints.length !== 2) {
    return fail(`${code}_UNSUPPORTED_TOPOLOGY`, [component.id, segment, segmentNet]);
  }
  const resistorEndpoint = endpoints.find((endpoint) => endpoint.component !== component.id);
  const resistor = resistorEndpoint ? index.components.get(resistorEndpoint.component) : null;
  if (!resistor || resistor.type !== 'resistor.fixed-v1'
      || !['A', 'B'].includes(resistorEndpoint.pin)) {
    return fail(`${code}_CURRENT_LIMIT_REQUIRED`, [component.id, segment, segmentNet]);
  }
  const sourceTerminal = resistorEndpoint.pin === 'A' ? 'B' : 'A';
  const sourceNet = index.endpointToNet.get(`${resistor.id}.${sourceTerminal}`) ?? null;
  if (!sourceNet) return fail(`${code}_OUTPUT_DISCONNECTED`, [component.id, segment, resistor.id]);
  const sourceEndpoints = index.nets.get(sourceNet)?.endpoints ?? [];
  const sources = boardEndpoints(index, sourceNet);
  if (sourceEndpoints.length !== 2 || sources.length !== 1) {
    return fail(`${code}_UNSUPPORTED_TOPOLOGY`, [component.id, segment, sourceNet]);
  }
  const sourcePin = sources[0].pin;
  if (GROUND_PIN.test(sourcePin)) {
    return fail('SEVEN_SEGMENT_REVERSE_POLARITY', [component.id, segment, sourcePin]);
  }
  if (!DIGITAL_PIN.test(sourcePin) || !SUPPORTED_PINS.has(sourcePin)) {
    return fail(`${code}_UNSUPPORTED_OUTPUT`, [component.id, segment, sourcePin]);
  }
  return {
    ok: true,
    segment,
    segmentNet,
    sourceNet,
    sourcePin,
    resistorId: resistor.id,
    resistorOhms: resistor.properties.ohms,
  };
}

export function projectSevenSegmentDisplays(value) {
  const graph = clone(value);
  const displays = graph.components.filter((component) => component.type === SEVEN_SEGMENT_TYPE);
  if (!displays.length) {
    return { ok: true, runtimeGraph: graph, displays: [], runtimePositionSources: {} };
  }
  const index = indexes(graph);
  const inspections = [];
  for (const component of displays) {
    if (!validateSevenSegmentComponent(component)) {
      return fail('SEVEN_SEGMENT_STATE', [component.id]);
    }
    const commonNet = index.endpointToNet.get(`${component.id}.COM`) ?? null;
    if (!commonNet) return fail('SEVEN_SEGMENT_COMMON_DISCONNECTED', [component.id, 'COM']);
    const commonBoards = boardEndpoints(index, commonNet);
    if (commonBoards.some((endpoint) => endpoint.pin === '5V' || DIGITAL_PIN.test(endpoint.pin))) {
      return fail('SEVEN_SEGMENT_REVERSE_POLARITY', [component.id, 'COM', commonNet]);
    }
    if (!commonBoards.some((endpoint) => GROUND_PIN.test(endpoint.pin))) {
      return fail('SEVEN_SEGMENT_COMMON_REQUIRES_GROUND', [component.id, commonNet]);
    }
    if (commonBoards.some((endpoint) => !GROUND_PIN.test(endpoint.pin))) {
      return fail('SEVEN_SEGMENT_REVERSE_POLARITY', [component.id, 'COM', commonNet]);
    }
    const segments = [];
    for (const { pin: segment } of SEVEN_SEGMENT_CHANNELS) {
      const inspected = inspectSegment(graph, index, component, segment, commonNet);
      if (!inspected.ok) return inspected;
      segments.push(inspected);
    }
    if (new Set(segments.map((segment) => segment.segmentNet)).size !== SEVEN_SEGMENT_CHANNELS.length) {
      return fail('SEVEN_SEGMENT_SEGMENT_SHORT', [component.id]);
    }
    if (new Set(segments.map((segment) => segment.resistorId)).size !== SEVEN_SEGMENT_CHANNELS.length) {
      return fail('SEVEN_SEGMENT_INDEPENDENT_RESISTORS_REQUIRED', [component.id]);
    }
    if (new Set(segments.map((segment) => segment.sourcePin)).size !== SEVEN_SEGMENT_CHANNELS.length) {
      return fail('SEVEN_SEGMENT_INDEPENDENT_OUTPUTS_REQUIRED', [component.id]);
    }
    inspections.push({ component, commonNet, segments });
  }

  const usedIds = new Set(graph.components.map((component) => component.id));
  const mapping = new Map();
  const runtimePositionSources = {};
  inspections.forEach((inspection, indexValue) => {
    const ids = Object.fromEntries(SEVEN_SEGMENT_CHANNELS.map(({ pin: segment }) => [
      segment,
      segment === 'a'
        ? inspection.component.id
        : runtimeId(inspection.component.id, segment, indexValue + 1, usedIds),
    ]));
    const segments = Object.fromEntries(inspection.segments.map((segment) => [segment.segment, {
      ...segment,
      runtimeComponentId: ids[segment.segment],
    }]));
    mapping.set(inspection.component.id, { ids, segments });
    for (const runtimeComponentId of Object.values(ids)) {
      runtimePositionSources[runtimeComponentId] = inspection.component.id;
    }
  });

  graph.components = graph.components.flatMap((component) => {
    const item = mapping.get(component.id);
    if (!item) return [component];
    return SEVEN_SEGMENT_CHANNELS.map(({ pin: segment }) => ({
      id: item.ids[segment],
      type: SEVEN_SEGMENT_RUNTIME_TYPE,
      label: `${component.label} (segment ${segment})`,
      properties: { color: 'red' },
      controls: {},
    }));
  });
  graph.nets = graph.nets.map((net) => ({
    id: net.id,
    endpoints: net.endpoints.flatMap((endpoint) => {
      const item = mapping.get(endpoint.component);
      if (!item) return [endpoint];
      if (endpoint.pin === 'COM') {
        return SEVEN_SEGMENT_CHANNELS.map(({ pin: segment }) => ({
          component: item.ids[segment], pin: 'CATHODE',
        }));
      }
      return [{ component: item.ids[endpoint.pin], pin: 'ANODE' }];
    }),
  }));
  return {
    ok: true,
    runtimeGraph: graph,
    displays: inspections.map((inspection) => ({
      componentId: inspection.component.id,
      commonNet: inspection.commonNet,
      commonPolarity: 'cathode',
      segments: clone(mapping.get(inspection.component.id).segments),
      electricalModel: 'seven-independent-current-limited-led-channels',
      displayModel: 'ideal-commanded-seven-segment-pattern-only',
    })),
    runtimePositionSources,
  };
}
