// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';

export const ACTIVE_BUZZER_TYPE = 'output.active-buzzer-module-v1';
export const ACTIVE_BUZZER_MODEL = 'model.active-buzzer-logical-enable-v1';
export const ACTIVE_BUZZER_RENDERER = 'output-active-buzzer-module';
export const ACTIVE_BUZZER_RUNTIME_ADAPTER = 'avr-gpio-logical-output-observer-v1';
export const AVR_ACTIVE_BUZZER_PINS = Object.freeze(
  Array.from({ length: 12 }, (_, index) => `D${index + 2}`),
);

const BOARD_TYPE = 'board.atmega328p-16mhz-v1';
const GROUND_PIN = /^GND[123]$/u;
const DIGITAL_PIN = /^D(?:[2-9]|1[0-3])$/u;
const clone = (value) => structuredClone(value);
const SUPPORTED_PINS = new Set(AVR_ACTIVE_BUZZER_PINS);

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

export const ACTIVE_BUZZER_DEFINITION = deepFreeze({
  family: 'output.active-buzzer-module',
  variant: 'ideal-high-active-three-terminal',
  type: ACTIVE_BUZZER_TYPE,
  version: 1,
  displayName: 'Active buzzer module',
  manufacturer: 'Intent Learning',
  partNumber: 'IL-BUZZER-ACTIVE-5V',
  pins: [
    pin('VCC', '5 V supply', 'power-in', ['power.5v-reference'], 0.2, { voltage: 5 }),
    pin('GND', 'Ground', 'ground', ['ground.reference'], 0.5, { voltage: 0 }),
    pin('EN', 'Enable · HIGH active', 'digital-in', ['digital.high-active-enable'], 0.8, { voltageMin: 0, voltageMax: 5, activeLevel: 'HIGH' }),
  ],
  propertyKeys: [],
  propertySchema: {},
  controlKeys: [],
  modelRef: ACTIVE_BUZZER_MODEL,
  internalTerminalGroups: [],
  selectable: true,
  artwork: {
    renderer: ACTIVE_BUZZER_RENDERER,
    thumbnail: ACTIVE_BUZZER_RENDERER,
    viewBox: [0, 0, 120, 100], cssWidth: 120, cssHeight: 100,
    provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced package, photograph or third-party simulator artwork.',
    license: 'Apache-2.0',
  },
  catalog: {
    category: 'drivers',
    aliases: ['active buzzer', 'digital buzzer', 'alarm indicator', 'beeper module'],
    functions: ['logical alarm output', 'digital output indicator'],
    interfaces: ['GPIO'],
    supplyVolts: { min: 5, max: 5 },
    package: 'original virtual three-terminal module',
  },
  support: {
    status: 'partial',
    limitations: [
      'Ideal 5 V active-buzzer module with a high-active, high-impedance EN input on one direct AVR D2–D13 GPIO output.',
      'The existing runtime GPIO state drives a silent visual enabled/disabled indicator; no browser audio is produced.',
      'No oscillator, waveform, frequency, duty-to-tone, sound pressure, supply current, GPIO current, loading, tolerance, resonance, thermal or physical acoustic accuracy is modelled.',
    ],
  },
});

export function validateActiveBuzzerDefinition(definition = ACTIVE_BUZZER_DEFINITION) {
  return exactKeys(definition, [
    'family', 'variant', 'type', 'version', 'displayName', 'manufacturer', 'partNumber',
    'pins', 'propertyKeys', 'propertySchema', 'controlKeys', 'modelRef',
    'internalTerminalGroups', 'selectable', 'artwork', 'catalog', 'support',
  ]) && JSON.stringify(definition) === JSON.stringify(ACTIVE_BUZZER_DEFINITION);
}

export function createActiveBuzzerComponent(id, label = 'Active buzzer module') {
  const component = {
    id,
    type: ACTIVE_BUZZER_TYPE,
    label,
    properties: {},
    controls: {},
  };
  if (!validateActiveBuzzerComponent(component)) throw new TypeError('ACTIVE_BUZZER_STATE');
  return component;
}

export function validateActiveBuzzerComponent(component) {
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && component.type === ACTIVE_BUZZER_TYPE
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

function inspectPower(index, component, pinId, netId) {
  if (!netId) return fail(`ACTIVE_BUZZER_${pinId}_DISCONNECTED`, [component.id, pinId]);
  const boards = boardEndpoints(index, netId);
  if (pinId === 'VCC') {
    if (!boards.some((endpoint) => endpoint.pin === '5V')) {
      return fail('ACTIVE_BUZZER_VCC_REQUIRES_5V', [component.id, netId]);
    }
    if (boards.some((endpoint) => endpoint.pin !== '5V')) {
      return fail('ACTIVE_BUZZER_VCC_UNSUPPORTED_TOPOLOGY', [component.id, netId]);
    }
  } else {
    if (!boards.some((endpoint) => GROUND_PIN.test(endpoint.pin))) {
      return fail('ACTIVE_BUZZER_GND_REQUIRED', [component.id, netId]);
    }
    if (boards.some((endpoint) => !GROUND_PIN.test(endpoint.pin))) {
      return fail('ACTIVE_BUZZER_GND_UNSUPPORTED_TOPOLOGY', [component.id, netId]);
    }
  }
  return { ok: true };
}

function inspectEnable(index, component, netId) {
  if (!netId) return fail('ACTIVE_BUZZER_EN_DISCONNECTED', [component.id, 'EN']);
  const endpoints = index.nets.get(netId)?.endpoints ?? [];
  const boards = boardEndpoints(index, netId);
  if (endpoints.length !== 2 || boards.length !== 1) {
    return fail('ACTIVE_BUZZER_EN_UNSUPPORTED_TOPOLOGY', [component.id, netId]);
  }
  const sourcePin = boards[0].pin;
  if (sourcePin === '5V' || GROUND_PIN.test(sourcePin)) {
    return fail('ACTIVE_BUZZER_EN_REQUIRES_DIGITAL_OUTPUT', [component.id, sourcePin]);
  }
  if (!DIGITAL_PIN.test(sourcePin) || !SUPPORTED_PINS.has(sourcePin)) {
    return fail('ACTIVE_BUZZER_EN_UNSUPPORTED_DRIVE', [component.id, sourcePin]);
  }
  return { ok: true, sourceNet: netId, sourcePin };
}

export function projectActiveBuzzerModules(value) {
  const graph = clone(value);
  const components = graph.components.filter((component) => component.type === ACTIVE_BUZZER_TYPE);
  if (!components.length) return { ok: true, runtimeGraph: graph, buzzers: [] };
  const index = indexes(graph);
  const buzzers = [];
  for (const component of components) {
    if (!validateActiveBuzzerComponent(component)) return fail('ACTIVE_BUZZER_STATE', [component.id]);
    const vccNet = index.endpointToNet.get(`${component.id}.VCC`) ?? null;
    const groundNet = index.endpointToNet.get(`${component.id}.GND`) ?? null;
    const enableNet = index.endpointToNet.get(`${component.id}.EN`) ?? null;
    const distinct = [vccNet, groundNet, enableNet].filter(Boolean);
    if (new Set(distinct).size !== distinct.length) {
      return fail('ACTIVE_BUZZER_TERMINAL_SHORT', [component.id, ...distinct]);
    }
    const vcc = inspectPower(index, component, 'VCC', vccNet);
    if (!vcc.ok) return vcc;
    const ground = inspectPower(index, component, 'GND', groundNet);
    if (!ground.ok) return ground;
    const enable = inspectEnable(index, component, enableNet);
    if (!enable.ok) return enable;
    buzzers.push({
      componentId: component.id,
      vccNet,
      groundNet,
      enableNet,
      sourcePin: enable.sourcePin,
      activeLevel: 'HIGH',
      electricalModel: 'ideal-high-impedance-enable-input-only',
      displayModel: 'silent-logical-on-off-indicator-only',
    });
  }

  const ids = new Set(components.map((component) => component.id));
  graph.components = graph.components.filter((component) => !ids.has(component.id));
  graph.nets = graph.nets.map((net) => ({
    id: net.id,
    endpoints: net.endpoints.filter((endpoint) => !ids.has(endpoint.component)),
  })).filter((net) => net.endpoints.length >= 2);
  const netIds = new Set(graph.nets.map((net) => net.id));
  graph.junctions = graph.junctions.filter((junction) => netIds.has(junction.net));
  return { ok: true, runtimeGraph: graph, buzzers };
}
