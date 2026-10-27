// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';

export const FOUR_DIGIT_SEVEN_SEGMENT_TYPE = 'output.seven-segment-four-digit-common-cathode-v1';
export const FOUR_DIGIT_SEVEN_SEGMENT_MODEL = 'model.seven-segment-four-digit-multiplex-ideal-v1';
export const FOUR_DIGIT_SEVEN_SEGMENT_RENDERER = 'output-seven-segment-four-digit-common-cathode';
export const FOUR_DIGIT_SEVEN_SEGMENT_RUNTIME_TYPE = 'led.basic-v1';
export const FOUR_DIGIT_SEVEN_SEGMENT_CHANNELS = Object.freeze(
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'].map((pin) => Object.freeze({ pin })),
);
export const FOUR_DIGIT_SEVEN_SEGMENT_DIGITS = Object.freeze(
  ['DIG1', 'DIG2', 'DIG3', 'DIG4'].map((pin, index) => Object.freeze({ pin, index })),
);
export const AVR_FOUR_DIGIT_SEVEN_SEGMENT_PINS = Object.freeze(
  Array.from({ length: 12 }, (_, index) => `D${index + 2}`),
);

const clone = (value) => structuredClone(value);
const BOARD_TYPE = 'board.atmega328p-16mhz-v1';
const GROUND_PIN = /^GND[123]$/u;
const DIGITAL_PIN = /^D(?:[0-9]|1[0-3])$/u;
const SUPPORTED_PINS = new Set(AVR_FOUR_DIGIT_SEVEN_SEGMENT_PINS);
const INTERNAL_ID = /^[a-z][a-z0-9-]{0,47}$/u;
const PIN_ORDER = Object.freeze([
  ...FOUR_DIGIT_SEVEN_SEGMENT_CHANNELS.map(({ pin }) => pin),
  ...FOUR_DIGIT_SEVEN_SEGMENT_DIGITS.map(({ pin }) => pin),
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function pin(id, label, constraints) {
  const segment = FOUR_DIGIT_SEVEN_SEGMENT_CHANNELS.some(({ pin: value }) => value === id);
  return {
    id,
    label,
    role: 'passive',
    signals: [segment ? 'passive.current-limited-led-segment' : 'passive.active-low-digit-select'],
    capabilities: [segment ? 'passive.current-limited-led-segment' : 'passive.active-low-digit-select'],
    constraints: { ...constraints },
    anchor: { x: (PIN_ORDER.indexOf(id) + 0.5) / PIN_ORDER.length, y: 0.96 },
  };
}

export const FOUR_DIGIT_SEVEN_SEGMENT_DEFINITION = deepFreeze({
  family: 'display.seven-segment',
  variant: 'ideal-four-digit-common-cathode-multiplex-twelve-terminal',
  type: FOUR_DIGIT_SEVEN_SEGMENT_TYPE,
  version: 1,
  displayName: 'Four-digit seven-segment display',
  manufacturer: 'Intent Learning',
  partNumber: 'IL-7SEG-CC-4D',
  pins: [
    ...FOUR_DIGIT_SEVEN_SEGMENT_CHANNELS.map(({ pin: segment }) => pin(
      segment,
      `${segment === 'dp' ? 'Decimal point' : `Segment ${segment}`} shared anode · external resistor required`,
      { polarity: 'anode', segment, sharedAcrossDigits: true, requiresSeriesResistor: true },
    )),
    ...FOUR_DIGIT_SEVEN_SEGMENT_DIGITS.map(({ pin: digit, index }) => pin(
      digit,
      `Digit ${index + 1} common cathode · active LOW select`,
      { polarity: 'cathode', digit: index + 1, commonCathode: true, activeLow: true },
    )),
  ],
  propertyKeys: [],
  propertySchema: {},
  controlKeys: [],
  modelRef: FOUR_DIGIT_SEVEN_SEGMENT_MODEL,
  internalTerminalGroups: [],
  selectable: true,
  artwork: {
    renderer: FOUR_DIGIT_SEVEN_SEGMENT_RENDERER,
    thumbnail: FOUR_DIGIT_SEVEN_SEGMENT_RENDERER,
    viewBox: [0, 0, 260, 140], cssWidth: 260, cssHeight: 140,
    provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced package, photograph or third-party simulator artwork.',
    license: 'Apache-2.0',
  },
  catalog: {
    category: 'displays',
    aliases: ['four digit seven segment', '4 digit 7 segment', 'multiplexed numeric display'],
    functions: ['four-digit numeric display', 'multiplexed digital output indicator'],
    interfaces: ['GPIO multiplex'],
    supplyVolts: { min: 0, max: 5 },
    package: 'original virtual four-digit twelve-terminal common-cathode display',
  },
  support: {
    status: 'simulated',
    limitations: [
      'Ideal AVR-only four-digit common-cathode teaching model with eight shared current-limited segment lines and four observed active-low digit selects.',
      'Segments a through g and dp each require one dedicated external series resistor; DIG1 through DIG4 and all segment lines require twelve unique AVR D2–D13 outputs.',
      'Only sampled commanded multiplex state is retained for visible teaching feedback. No transistor driver, package current, refresh-rate fidelity, ghosting, brightness, optics, timing compliance, thermal or physical display accuracy is modelled.',
    ],
  },
});

export function validateFourDigitSevenSegmentDefinition(
  definition = FOUR_DIGIT_SEVEN_SEGMENT_DEFINITION,
) {
  return exactKeys(definition, [
    'family', 'variant', 'type', 'version', 'displayName', 'manufacturer', 'partNumber',
    'pins', 'propertyKeys', 'propertySchema', 'controlKeys', 'modelRef',
    'internalTerminalGroups', 'selectable', 'artwork', 'catalog', 'support',
  ]) && JSON.stringify(definition) === JSON.stringify(FOUR_DIGIT_SEVEN_SEGMENT_DEFINITION);
}

export function createFourDigitSevenSegmentComponent(
  id,
  label = 'Four-digit seven-segment display',
) {
  const component = {
    id,
    type: FOUR_DIGIT_SEVEN_SEGMENT_TYPE,
    label,
    properties: {},
    controls: {},
  };
  if (!validateFourDigitSevenSegmentComponent(component)) {
    throw new TypeError('FOUR_DIGIT_SEVEN_SEGMENT_STATE');
  }
  return component;
}

export function validateFourDigitSevenSegmentComponent(component) {
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && component.type === FOUR_DIGIT_SEVEN_SEGMENT_TYPE
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
  const preferred = `${base}-${segment}`;
  if (INTERNAL_ID.test(preferred) && !used.has(preferred)) {
    used.add(preferred);
    return preferred;
  }
  for (let attempt = 1; attempt < 1_000; attempt += 1) {
    const candidate = `four-seven-${ordinal}-${segment}-${attempt}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  throw new Error('FOUR_DIGIT_SEVEN_SEGMENT_RUNTIME_ID_LIMIT');
}

function inspectSegment(index, component, segment) {
  const upper = segment.toUpperCase();
  const code = `FOUR_DIGIT_SEVEN_SEGMENT_${upper}`;
  const segmentNet = index.endpointToNet.get(`${component.id}.${segment}`) ?? null;
  if (!segmentNet) return fail(`${code}_DISCONNECTED`, [component.id, segment]);
  const endpoints = index.nets.get(segmentNet)?.endpoints ?? [];
  if (endpoints.length !== 2 || boardEndpoints(index, segmentNet).length) {
    return fail(`${code}_CURRENT_LIMIT_REQUIRED`, [component.id, segment, segmentNet]);
  }
  const resistorEndpoint = endpoints.find((endpoint) => endpoint.component !== component.id);
  const resistor = resistorEndpoint ? index.components.get(resistorEndpoint.component) : null;
  if (!resistor || resistor.type !== 'resistor.fixed-v1' || !['A', 'B'].includes(resistorEndpoint.pin)) {
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
  if (!DIGITAL_PIN.test(sourcePin) || !SUPPORTED_PINS.has(sourcePin)) {
    return fail(`${code}_UNSUPPORTED_OUTPUT`, [component.id, segment, sourcePin]);
  }
  return {
    ok: true, segment, segmentNet, sourceNet, sourcePin,
    resistorId: resistor.id, resistorOhms: resistor.properties.ohms,
  };
}

function inspectDigit(index, component, digit) {
  const digitNet = index.endpointToNet.get(`${component.id}.${digit}`) ?? null;
  if (!digitNet) return fail(`FOUR_DIGIT_SEVEN_SEGMENT_${digit}_DISCONNECTED`, [component.id, digit]);
  const endpoints = index.nets.get(digitNet)?.endpoints ?? [];
  const sources = boardEndpoints(index, digitNet);
  if (endpoints.length !== 2 || sources.length !== 1) {
    return fail(`FOUR_DIGIT_SEVEN_SEGMENT_${digit}_UNSUPPORTED_TOPOLOGY`, [component.id, digit, digitNet]);
  }
  const sourcePin = sources[0].pin;
  if (!DIGITAL_PIN.test(sourcePin) || !SUPPORTED_PINS.has(sourcePin)) {
    return fail(`FOUR_DIGIT_SEVEN_SEGMENT_${digit}_UNSUPPORTED_OUTPUT`, [component.id, digit, sourcePin]);
  }
  return { ok: true, digit, digitNet, sourcePin, activeLevel: 'LOW' };
}

export function projectFourDigitSevenSegmentDisplays(value) {
  const graph = clone(value);
  const displays = graph.components.filter(
    (component) => component.type === FOUR_DIGIT_SEVEN_SEGMENT_TYPE,
  );
  if (!displays.length) {
    return { ok: true, runtimeGraph: graph, displays: [], runtimePositionSources: {} };
  }
  const index = indexes(graph);
  const groundNets = graph.nets.filter((net) => boardEndpoints(index, net.id).some(
    (endpoint) => GROUND_PIN.test(endpoint.pin),
  )).sort((left, right) => left.id.localeCompare(right.id));
  if (!groundNets.length) return fail('FOUR_DIGIT_SEVEN_SEGMENT_GROUND_REQUIRED');

  const inspections = [];
  for (const component of displays) {
    if (!validateFourDigitSevenSegmentComponent(component)) {
      return fail('FOUR_DIGIT_SEVEN_SEGMENT_STATE', [component.id]);
    }
    const segments = [];
    for (const { pin: segment } of FOUR_DIGIT_SEVEN_SEGMENT_CHANNELS) {
      const inspected = inspectSegment(index, component, segment);
      if (!inspected.ok) return inspected;
      segments.push(inspected);
    }
    const digits = [];
    for (const { pin: digit } of FOUR_DIGIT_SEVEN_SEGMENT_DIGITS) {
      const inspected = inspectDigit(index, component, digit);
      if (!inspected.ok) return inspected;
      digits.push(inspected);
    }
    if (new Set(segments.map(({ resistorId }) => resistorId)).size !== segments.length) {
      return fail('FOUR_DIGIT_SEVEN_SEGMENT_INDEPENDENT_RESISTORS_REQUIRED', [component.id]);
    }
    const sourcePins = [...segments, ...digits].map(({ sourcePin }) => sourcePin);
    if (new Set(sourcePins).size !== sourcePins.length) {
      return fail('FOUR_DIGIT_SEVEN_SEGMENT_INDEPENDENT_OUTPUTS_REQUIRED', [component.id]);
    }
    inspections.push({ component, segments, digits, groundNet: groundNets[0].id });
  }

  const usedIds = new Set(graph.components.map(({ id }) => id));
  const mappings = new Map();
  const digitNets = new Set();
  const runtimePositionSources = {};
  inspections.forEach((inspection, indexValue) => {
    const ids = Object.fromEntries(FOUR_DIGIT_SEVEN_SEGMENT_CHANNELS.map(({ pin: segment }) => [
      segment,
      segment === 'a'
        ? inspection.component.id
        : runtimeId(inspection.component.id, segment, indexValue + 1, usedIds),
    ]));
    const segments = Object.fromEntries(inspection.segments.map((segment) => [segment.segment, {
      ...segment,
      runtimeComponentId: ids[segment.segment],
    }]));
    const digits = Object.fromEntries(inspection.digits.map((digit) => [digit.digit, { ...digit }]));
    mappings.set(inspection.component.id, { ids, segments, digits, groundNet: inspection.groundNet });
    inspection.digits.forEach(({ digitNet }) => digitNets.add(digitNet));
    Object.values(ids).forEach((runtimeComponentId) => {
      runtimePositionSources[runtimeComponentId] = inspection.component.id;
    });
  });

  graph.components = graph.components.flatMap((component) => {
    const mapping = mappings.get(component.id);
    if (!mapping) return [component];
    return FOUR_DIGIT_SEVEN_SEGMENT_CHANNELS.map(({ pin: segment }) => ({
      id: mapping.ids[segment],
      type: FOUR_DIGIT_SEVEN_SEGMENT_RUNTIME_TYPE,
      label: `${component.label} (${segment})`,
      properties: { color: 'red' },
      controls: {},
    }));
  });
  graph.nets = graph.nets.flatMap((net) => {
    if (digitNets.has(net.id)) return [];
    const endpoints = net.endpoints.flatMap((endpoint) => {
      const mapping = mappings.get(endpoint.component);
      if (!mapping) return [endpoint];
      return [{ component: mapping.ids[endpoint.pin], pin: 'ANODE' }];
    });
    for (const mapping of mappings.values()) {
      if (mapping.groundNet === net.id) {
        endpoints.push(...Object.values(mapping.ids).map((id) => ({ component: id, pin: 'CATHODE' })));
      }
    }
    return [{ id: net.id, endpoints }];
  });

  return {
    ok: true,
    runtimeGraph: graph,
    displays: inspections.map((inspection) => {
      const mapping = mappings.get(inspection.component.id);
      return {
        componentId: inspection.component.id,
        commonPolarity: 'cathode',
        selectionPolarity: 'active-low',
        segments: clone(mapping.segments),
        digits: clone(mapping.digits),
        electricalModel: 'eight-shared-current-limited-led-channels-plus-four-observed-digit-selects',
        displayModel: 'sampled-commanded-four-digit-multiplex-state-only',
      };
    }),
    runtimePositionSources,
  };
}
