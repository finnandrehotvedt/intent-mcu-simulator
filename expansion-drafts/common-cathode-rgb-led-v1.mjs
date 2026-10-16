// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';

export const COMMON_CATHODE_RGB_LED_TYPE = 'output.rgb-led-common-cathode-v1';
export const COMMON_CATHODE_RGB_LED_MODEL = 'model.rgb-led-common-cathode-ideal-v1';
export const COMMON_CATHODE_RGB_LED_RENDERER = 'output-rgb-led-common-cathode';
export const COMMON_CATHODE_RGB_LED_RUNTIME_TYPE = 'led.basic-v1';
export const AVR_PWM_PINS = Object.freeze(['D3', 'D5', 'D6', 'D9', 'D10', 'D11']);
export const RGB_CHANNELS = Object.freeze([
  Object.freeze({ pin: 'R', name: 'red', color: 'red' }),
  Object.freeze({ pin: 'G', name: 'green', color: 'green' }),
  Object.freeze({ pin: 'B', name: 'blue', color: 'blue' }),
]);

const clone = (value) => structuredClone(value);
const PWM_PINS = new Set(AVR_PWM_PINS);
const BOARD_TYPE = 'board.atmega328p-16mhz-v1';
const GROUND_PIN = /^GND[123]$/u;
const DIGITAL_PIN = /^D(?:[0-9]|1[0-3])$/u;
const INTERNAL_ID = /^[a-z][a-z0-9-]{0,47}$/u;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function pin(id, label, role, signals, x, constraints) {
  return {
    id, label, role, signals: [...signals], capabilities: [...signals],
    constraints: { ...constraints }, anchor: { x, y: 0.92 },
  };
}

export const COMMON_CATHODE_RGB_LED_DEFINITION = deepFreeze({
  family: 'indicator.rgb-led',
  variant: 'ideal-common-cathode-four-terminal',
  type: COMMON_CATHODE_RGB_LED_TYPE,
  version: 1,
  displayName: 'Common-cathode RGB LED',
  manufacturer: 'Intent Learning',
  partNumber: 'IL-RGB-LED-CC-4',
  pins: [
    pin('R', 'Red anode · external resistor required', 'passive', ['passive.current-limited-led-channel'], 0.15, { polarity: 'anode', channel: 'red', requiresSeriesResistor: true }),
    pin('G', 'Green anode · external resistor required', 'passive', ['passive.current-limited-led-channel'], 46 / 120, { polarity: 'anode', channel: 'green', requiresSeriesResistor: true }),
    pin('B', 'Blue anode · external resistor required', 'passive', ['passive.current-limited-led-channel'], 74 / 120, { polarity: 'anode', channel: 'blue', requiresSeriesResistor: true }),
    pin('COM', 'Common cathode · ground', 'ground', ['ground.reference'], 0.85, { polarity: 'cathode', commonCathode: true }),
  ],
  propertyKeys: [],
  propertySchema: {},
  controlKeys: [],
  modelRef: COMMON_CATHODE_RGB_LED_MODEL,
  internalTerminalGroups: [],
  selectable: true,
  artwork: {
    renderer: COMMON_CATHODE_RGB_LED_RENDERER,
    thumbnail: COMMON_CATHODE_RGB_LED_RENDERER,
    viewBox: [0, 0, 120, 100], cssWidth: 120, cssHeight: 100,
    provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced package, photograph or third-party simulator artwork.',
    license: 'Apache-2.0',
  },
  catalog: {
    category: 'displays',
    aliases: ['rgb led', 'three colour led', 'common cathode led', 'pwm colour indicator'],
    functions: ['multicolour indicator', 'pwm output'],
    interfaces: ['GPIO', 'PWM'],
    supplyVolts: { min: 0, max: 5 },
    package: 'original virtual four-terminal indicator',
  },
  support: {
    status: 'simulated',
    limitations: [
      'Ideal common-cathode teaching model projected through three independently validated existing LED channels.',
      'R, G and B each require one dedicated external series resistor and one supported AVR PWM output: D3, D5, D6, D9, D10 or D11; COM must connect to ground.',
      'Displayed colour is only the commanded relative PWM mix. No wavelength, luminous intensity, optical mixing, current matching, tolerance, thermal or physical colour accuracy is claimed.',
    ],
  },
});

export function validateCommonCathodeRgbLedDefinition(
  definition = COMMON_CATHODE_RGB_LED_DEFINITION,
) {
  return exactKeys(definition, [
    'family', 'variant', 'type', 'version', 'displayName', 'manufacturer', 'partNumber',
    'pins', 'propertyKeys', 'propertySchema', 'controlKeys', 'modelRef',
    'internalTerminalGroups', 'selectable', 'artwork', 'catalog', 'support',
  ]) && JSON.stringify(definition) === JSON.stringify(COMMON_CATHODE_RGB_LED_DEFINITION);
}

export function createCommonCathodeRgbLedComponent(
  id,
  label = 'Common-cathode RGB LED',
) {
  const component = {
    id,
    type: COMMON_CATHODE_RGB_LED_TYPE,
    label,
    properties: {},
    controls: {},
  };
  if (!validateCommonCathodeRgbLedComponent(component)) throw new TypeError('RGB_LED_STATE');
  return component;
}

export function validateCommonCathodeRgbLedComponent(component) {
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && component.type === COMMON_CATHODE_RGB_LED_TYPE
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

function runtimeId(base, suffix, ordinal, used) {
  const preferred = `${base}-${suffix}`;
  if (INTERNAL_ID.test(preferred) && !used.has(preferred)) {
    used.add(preferred);
    return preferred;
  }
  for (let attempt = 1; attempt < 1_000; attempt += 1) {
    const candidate = `rgb-${ordinal}-${suffix}-${attempt}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  throw new Error('RGB_LED_RUNTIME_ID_LIMIT');
}

function inspectChannel(graph, index, component, channel, commonNet) {
  const code = `RGB_LED_${channel.pin}`;
  const channelNet = index.endpointToNet.get(`${component.id}.${channel.pin}`) ?? null;
  if (!channelNet) return fail(`${code}_DISCONNECTED`, [component.id, channel.pin]);
  if (channelNet === commonNet) return fail('RGB_LED_CHANNEL_SHORT', [component.id, channel.pin, channelNet]);
  const channelBoard = boardEndpoints(index, channelNet);
  if (channelBoard.some((endpoint) => GROUND_PIN.test(endpoint.pin))) {
    return fail('RGB_LED_REVERSE_POLARITY', [component.id, channel.pin, channelNet]);
  }
  if (channelBoard.length) return fail(`${code}_CURRENT_LIMIT_REQUIRED`, [component.id, channel.pin, channelNet]);
  const channelEndpoints = index.nets.get(channelNet)?.endpoints ?? [];
  if (channelEndpoints.length !== 2) return fail(`${code}_UNSUPPORTED_TOPOLOGY`, [component.id, channelNet]);
  const resistorEndpoint = channelEndpoints.find((endpoint) => endpoint.component !== component.id);
  const resistor = resistorEndpoint ? index.components.get(resistorEndpoint.component) : null;
  if (!resistor || resistor.type !== 'resistor.fixed-v1' || !['A', 'B'].includes(resistorEndpoint.pin)) {
    return fail(`${code}_CURRENT_LIMIT_REQUIRED`, [component.id, channel.pin, channelNet]);
  }
  const sourceTerminal = resistorEndpoint.pin === 'A' ? 'B' : 'A';
  const sourceNet = index.endpointToNet.get(`${resistor.id}.${sourceTerminal}`) ?? null;
  if (!sourceNet) return fail(`${code}_REQUIRES_PWM`, [component.id, channel.pin, resistor.id]);
  const sourceEndpoints = index.nets.get(sourceNet)?.endpoints ?? [];
  const sourceBoards = boardEndpoints(index, sourceNet);
  if (sourceEndpoints.length !== 2 || sourceBoards.length !== 1) {
    return fail(`${code}_UNSUPPORTED_DRIVE`, [component.id, channel.pin, sourceNet]);
  }
  const sourcePin = sourceBoards[0].pin;
  if (!DIGITAL_PIN.test(sourcePin) || !PWM_PINS.has(sourcePin)) {
    return fail(`${code}_REQUIRES_PWM`, [component.id, channel.pin, sourcePin]);
  }
  return {
    ok: true,
    channel: channel.pin,
    color: channel.color,
    channelNet,
    sourceNet,
    sourcePin,
    resistorId: resistor.id,
    resistorOhms: resistor.properties.ohms,
  };
}

export function projectCommonCathodeRgbLeds(value) {
  const graph = clone(value);
  const rgbComponents = graph.components.filter(
    (component) => component.type === COMMON_CATHODE_RGB_LED_TYPE,
  );
  if (!rgbComponents.length) {
    return { ok: true, runtimeGraph: graph, leds: [], runtimePositionSources: {} };
  }
  const index = indexes(graph);
  const inspections = [];
  for (const component of rgbComponents) {
    if (!validateCommonCathodeRgbLedComponent(component)) {
      return fail('RGB_LED_STATE', [component.id]);
    }
    const commonNet = index.endpointToNet.get(`${component.id}.COM`) ?? null;
    if (!commonNet) return fail('RGB_LED_COMMON_DISCONNECTED', [component.id, 'COM']);
    const commonBoards = boardEndpoints(index, commonNet);
    if (commonBoards.some((endpoint) => endpoint.pin === '5V' || DIGITAL_PIN.test(endpoint.pin))) {
      return fail('RGB_LED_REVERSE_POLARITY', [component.id, 'COM', commonNet]);
    }
    if (!commonBoards.some((endpoint) => GROUND_PIN.test(endpoint.pin))) {
      return fail('RGB_LED_COMMON_REQUIRES_GROUND', [component.id, commonNet]);
    }
    if (commonBoards.some((endpoint) => !GROUND_PIN.test(endpoint.pin))) {
      return fail('RGB_LED_REVERSE_POLARITY', [component.id, 'COM', commonNet]);
    }
    const channels = [];
    for (const channel of RGB_CHANNELS) {
      const inspected = inspectChannel(graph, index, component, channel, commonNet);
      if (!inspected.ok) return inspected;
      channels.push(inspected);
    }
    if (new Set(channels.map((channel) => channel.channelNet)).size !== RGB_CHANNELS.length) {
      return fail('RGB_LED_CHANNEL_SHORT', [component.id]);
    }
    if (new Set(channels.map((channel) => channel.resistorId)).size !== RGB_CHANNELS.length) {
      return fail('RGB_LED_INDEPENDENT_RESISTORS_REQUIRED', [component.id]);
    }
    if (new Set(channels.map((channel) => channel.sourcePin)).size !== RGB_CHANNELS.length) {
      return fail('RGB_LED_INDEPENDENT_PWM_REQUIRED', [component.id]);
    }
    inspections.push({ component, commonNet, channels });
  }

  const usedIds = new Set(graph.components.map((component) => component.id));
  const mapping = new Map();
  const runtimePositionSources = {};
  inspections.forEach((inspection, indexValue) => {
    const ids = {
      R: inspection.component.id,
      G: runtimeId(inspection.component.id, 'green', indexValue + 1, usedIds),
      B: runtimeId(inspection.component.id, 'blue', indexValue + 1, usedIds),
    };
    const channels = Object.fromEntries(inspection.channels.map((channel) => [channel.channel, {
      ...channel,
      runtimeComponentId: ids[channel.channel],
    }]));
    mapping.set(inspection.component.id, { ids, channels });
    for (const runtimeComponentId of Object.values(ids)) {
      runtimePositionSources[runtimeComponentId] = inspection.component.id;
    }
  });

  graph.components = graph.components.flatMap((component) => {
    const item = mapping.get(component.id);
    if (!item) return [component];
    return RGB_CHANNELS.map((channel) => ({
      id: item.ids[channel.pin],
      type: COMMON_CATHODE_RGB_LED_RUNTIME_TYPE,
      label: `${component.label} (${channel.name})`,
      properties: { color: channel.color },
      controls: {},
    }));
  });
  graph.nets = graph.nets.map((net) => ({
    id: net.id,
    endpoints: net.endpoints.flatMap((endpoint) => {
      const item = mapping.get(endpoint.component);
      if (!item) return [endpoint];
      if (endpoint.pin === 'COM') {
        return RGB_CHANNELS.map((channel) => ({
          component: item.ids[channel.pin], pin: 'CATHODE',
        }));
      }
      return [{ component: item.ids[endpoint.pin], pin: 'ANODE' }];
    }),
  }));
  return {
    ok: true,
    runtimeGraph: graph,
    leds: inspections.map((inspection) => ({
      componentId: inspection.component.id,
      commonNet: inspection.commonNet,
      commonPolarity: 'cathode',
      channels: clone(mapping.get(inspection.component.id).channels),
      displayModel: 'relative-commanded-pwm-mix-only',
    })),
    runtimePositionSources,
  };
}
