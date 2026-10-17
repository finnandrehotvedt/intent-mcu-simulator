// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { VALIDATED_LED_CIRCUIT } from '../c3/gpio2-adapter.mjs';
import { LED_FORWARD_VOLTS, defaultProperties } from './component-catalog.mjs';
import { NamedSeriesLedCircuitEditor } from './named-series-led-circuit-editor.mjs';
import { exactKeys } from './strict-json.mjs';

export const ESP32C3_PUBLIC_CIRCUIT_SCHEMA = 'intent-mcu-esp32c3-public-circuit@1';
export const ESP32C3_PUBLIC_PROFILE = 'board.esp32-c3-devmodule-v1';
export const ESP32C3_NOMINAL_VOLTS = 3.3;
export const ESP32C3_LED_CURRENT_LIMIT_AMPS = 0.012;
export const ESP32C3_PIN_MAP = Object.freeze({
  GPIO2: Object.freeze({ signal: 'GPIO2', connector: 'J1', physicalPin: 4, voltage: 3.3, capability: 'digital-output' }),
  GND: Object.freeze({ signal: 'GND', connector: 'J1', physicalPin: 6, voltage: 0, capability: 'ground-reference' }),
});

const boardPin = (id, label, role, signals, x, y, constraints) => Object.freeze({
  id, label, role, signals: Object.freeze([...signals]), capabilities: Object.freeze([...signals]),
  constraints: Object.freeze({ ...constraints }), anchor: Object.freeze({ x, y }),
});

export const ESP32C3_BOARD_DEFINITION = Object.freeze({
  family: 'board.esp32-c3-learning-profile', variant: 'public-bounded-gpio2-3v3',
  type: ESP32C3_PUBLIC_PROFILE, version: 1,
  displayName: 'ESP32-C3 learning profile board', manufacturer: 'Intent Learning', partNumber: 'IL-ESP32C3-GPIO2-PROFILE',
  pins: Object.freeze([
    boardPin('GPIO2', 'GPIO2 · J1 physical pin 4', 'digital-io', ['digital.output'], 0.95, 0.25,
      { voltageMin: 0, voltageMax: 3.3, connector: 'J1', physicalPin: 4, strappingPin: true }),
    boardPin('GND', 'GND · J1 physical pin 6', 'ground', ['ground.reference'], 0.95, 0.75,
      { connector: 'J1', physicalPin: 6 }),
  ]),
  propertyKeys: Object.freeze([]), controlKeys: Object.freeze([]), propertySchema: Object.freeze({}),
  modelRef: 'model.esp32c3-gpio2-project-register-adapter-v1', internalTerminalGroups: Object.freeze([]), selectable: false,
  artwork: Object.freeze({
    provenance: 'Original project SVG assembled from basic geometry; no third-party simulator artwork or traced image.',
    license: 'Apache-2.0', renderer: 'board-esp32-c3-profile', thumbnail: 'board-esp32-c3-profile',
    viewBox: Object.freeze([0, 0, 160, 220]), cssWidth: 160, cssHeight: 220,
  }),
  catalog: Object.freeze({
    category: 'controllers', aliases: Object.freeze(['esp32 c3 learning profile', 'gpio2 j1 pin 4']),
    functions: Object.freeze(['bounded source execution', 'gpio2 project model']),
    interfaces: Object.freeze(['GPIO', 'UART']), supplyVolts: Object.freeze({ min: 3.3, max: 3.3 }), package: 'development board profile',
  }),
  support: Object.freeze({
    status: 'partial',
    limitations: Object.freeze([
      'Actual QEMU CPU/UART is separate from this executed-register-write GPIO2 project model.',
      'GPIO2 is a strapping pin; this bounded teaching path is not physical-board equivalence.',
    ]),
  }),
});

export const ESP32C3_PUBLIC_COMPONENT_CATALOG = Object.freeze({
  [ESP32C3_PUBLIC_PROFILE]: ESP32C3_BOARD_DEFINITION,
});

const ID = /^[a-z][a-z0-9-]{0,47}$/u;
const LABEL = /^[\p{L}\p{N} ._#()°Ω×+\-]{1,64}$/u;
const BOARD = ESP32C3_PUBLIC_PROFILE;
const RESISTOR = 'resistor.fixed-v1';
const LED = 'led.basic-v1';
const TYPE_PINS = Object.freeze({
  [BOARD]: new Set(['GPIO2', 'GND']),
  [RESISTOR]: new Set(['A', 'B']),
  [LED]: new Set(['ANODE', 'CATHODE']),
});
const clone = (value) => structuredClone(value);
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;
const failure = (code, details = {}) => ({ ok: false, code, details: clone(details), model: null });

function component(id, type, label, properties = {}) {
  return { id, type, label, properties: type === BOARD ? {} : { ...defaultProperties(type), ...properties }, controls: {} };
}

export function createEsp32C3CircuitDraft() {
  return {
    schema: ESP32C3_PUBLIC_CIRCUIT_SCHEMA,
    boardProfile: ESP32C3_PUBLIC_PROFILE,
    components: [
      component('c3-1', BOARD, 'ESP32-C3 GPIO2 profile'),
      component('resistor-1', RESISTOR, '220 Ω series resistor', { ohms: 220 }),
      component('led-1', LED, 'External red LED', { color: 'red' }),
    ],
    nets: [
      { id: 'net-gpio2', endpoints: [{ component: 'c3-1', pin: 'GPIO2' }, { component: 'resistor-1', pin: 'A' }] },
      { id: 'net-series', endpoints: [{ component: 'resistor-1', pin: 'B' }, { component: 'led-1', pin: 'ANODE' }] },
      { id: 'net-ground', endpoints: [{ component: 'led-1', pin: 'CATHODE' }, { component: 'c3-1', pin: 'GND' }] },
    ],
    layout: {
      positions: {
        'c3-1': { x: 0.2, y: 0.52, rotation: 0 },
        'resistor-1': { x: 0.52, y: 0.27, rotation: 0 },
        'led-1': { x: 0.8, y: 0.48, rotation: 0 },
      },
      wireStyles: { 'net-gpio2': '#f5c451', 'net-series': '#f04f5f', 'net-ground': '#303943' },
    },
  };
}

function normalizeComponent(value) {
  if (!exactKeys(value, ['id', 'type', 'label', 'properties', 'controls'])
      || typeof value.id !== 'string' || !ID.test(value.id)
      || !Object.hasOwn(TYPE_PINS, value.type)
      || typeof value.label !== 'string' || !LABEL.test(value.label)
      || !exactKeys(value.controls, [])) throw Object.assign(new Error('C3_CIRCUIT_COMPONENT_INVALID'), { code: 'C3_CIRCUIT_COMPONENT_INVALID' });
  if (value.type === BOARD && !exactKeys(value.properties, [])) throw Object.assign(new Error('C3_CIRCUIT_COMPONENT_INVALID'), { code: 'C3_CIRCUIT_COMPONENT_INVALID' });
  if (value.type === RESISTOR && (!exactKeys(value.properties, ['ohms']) || !Number.isFinite(value.properties.ohms)
      || value.properties.ohms < 1 || value.properties.ohms > 10_000_000)) {
    throw Object.assign(new Error('C3_CIRCUIT_RESISTOR_INVALID'), { code: 'C3_CIRCUIT_RESISTOR_INVALID' });
  }
  if (value.type === LED && (!exactKeys(value.properties, ['color']) || !Object.hasOwn(LED_FORWARD_VOLTS, value.properties.color))) {
    throw Object.assign(new Error('C3_CIRCUIT_LED_INVALID'), { code: 'C3_CIRCUIT_LED_INVALID' });
  }
  return clone(value);
}

function normalizePosition(value) {
  if (!exactKeys(value, ['x', 'y', 'rotation']) || !Number.isFinite(value.x) || value.x < 0 || value.x > 1
      || !Number.isFinite(value.y) || value.y < 0 || value.y > 1 || ![0, 90, 180, 270].includes(value.rotation)) {
    throw Object.assign(new Error('C3_CIRCUIT_LAYOUT_INVALID'), { code: 'C3_CIRCUIT_LAYOUT_INVALID' });
  }
  return clone(value);
}

export function normalizeEsp32C3CircuitDraft(value) {
  if (!exactKeys(value, ['schema', 'boardProfile', 'components', 'nets', 'layout'])
      || value.schema !== ESP32C3_PUBLIC_CIRCUIT_SCHEMA || value.boardProfile !== ESP32C3_PUBLIC_PROFILE
      || !Array.isArray(value.components) || !Array.isArray(value.nets)
      || value.components.length > 4 || value.nets.length > 4
      || !exactKeys(value.layout, ['positions', 'wireStyles'])
      || value.layout.positions === null || Array.isArray(value.layout.positions)
      || value.layout.wireStyles === null || Array.isArray(value.layout.wireStyles)) {
    throw Object.assign(new Error('C3_CIRCUIT_SHAPE'), { code: 'C3_CIRCUIT_SHAPE' });
  }
  const components = value.components.map(normalizeComponent).sort((a, b) => a.id.localeCompare(b.id));
  const componentIds = new Set();
  for (const item of components) {
    if (componentIds.has(item.id)) throw Object.assign(new Error('C3_CIRCUIT_COMPONENT_INVALID'), { code: 'C3_CIRCUIT_COMPONENT_INVALID' });
    componentIds.add(item.id);
  }
  const positionKeys = Object.keys(value.layout.positions).sort();
  if (positionKeys.length !== componentIds.size || positionKeys.some((id) => !componentIds.has(id))) {
    throw Object.assign(new Error('C3_CIRCUIT_LAYOUT_INVALID'), { code: 'C3_CIRCUIT_LAYOUT_INVALID' });
  }
  const positions = Object.fromEntries(positionKeys.map((id) => [id, normalizePosition(value.layout.positions[id])]));
  const netIds = new Set();
  const endpoints = new Set();
  const nets = value.nets.map((net) => {
    if (!exactKeys(net, ['id', 'endpoints']) || typeof net.id !== 'string' || !ID.test(net.id)
        || netIds.has(net.id) || !Array.isArray(net.endpoints) || net.endpoints.length !== 2) {
      throw Object.assign(new Error('C3_CIRCUIT_NET_INVALID'), { code: 'C3_CIRCUIT_NET_INVALID' });
    }
    netIds.add(net.id);
    const normalizedEndpoints = net.endpoints.map((endpoint) => {
      if (!exactKeys(endpoint, ['component', 'pin']) || !componentIds.has(endpoint.component)
          || typeof endpoint.pin !== 'string') {
        throw Object.assign(new Error('C3_CIRCUIT_ENDPOINT_INVALID'), { code: 'C3_CIRCUIT_ENDPOINT_INVALID' });
      }
      const item = components.find((candidate) => candidate.id === endpoint.component);
      if (item.type === BOARD && !TYPE_PINS[BOARD].has(endpoint.pin)) {
        throw Object.assign(new Error('C3_PIN_UNPROVEN'), { code: 'C3_PIN_UNPROVEN', pin: endpoint.pin });
      }
      if (!TYPE_PINS[item.type].has(endpoint.pin)) {
        throw Object.assign(new Error('C3_CIRCUIT_ENDPOINT_INVALID'), { code: 'C3_CIRCUIT_ENDPOINT_INVALID' });
      }
      const key = endpointKey(endpoint);
      if (endpoints.has(key)) throw Object.assign(new Error('C3_CIRCUIT_ENDPOINT_REUSED'), { code: 'C3_CIRCUIT_ENDPOINT_REUSED' });
      endpoints.add(key);
      return clone(endpoint);
    }).sort((a, b) => endpointKey(a).localeCompare(endpointKey(b)));
    return { id: net.id, endpoints: normalizedEndpoints };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const wireStyleKeys = Object.keys(value.layout.wireStyles).sort();
  if (wireStyleKeys.some((id) => !netIds.has(id) || typeof value.layout.wireStyles[id] !== 'string'
      || !/^#[0-9a-f]{6}$/iu.test(value.layout.wireStyles[id]))) {
    throw Object.assign(new Error('C3_CIRCUIT_LAYOUT_INVALID'), { code: 'C3_CIRCUIT_LAYOUT_INVALID' });
  }
  const wireStyles = Object.fromEntries(wireStyleKeys.map((id) => [id, value.layout.wireStyles[id].toLowerCase()]));
  return { schema: ESP32C3_PUBLIC_CIRCUIT_SCHEMA, boardProfile: ESP32C3_PUBLIC_PROFILE,
    components, nets, layout: { positions, wireStyles } };
}

function hasPair(net, left, right) {
  const keys = new Set(net.endpoints.map(endpointKey));
  return keys.has(left) && keys.has(right);
}

export function validateEsp32C3Circuit(value) {
  let draft;
  try { draft = normalizeEsp32C3CircuitDraft(value); }
  catch (error) { return failure(error.code ?? 'C3_CIRCUIT_INVALID', { pin: error.pin ?? null }); }
  const boards = draft.components.filter((item) => item.type === BOARD);
  if (boards.length !== 1) return failure('C3_BOARD_COUNT');
  const board = boards[0];
  const resistor = draft.components.find((item) => item.type === RESISTOR);
  const led = draft.components.find((item) => item.type === LED);
  if (!resistor) return failure('C3_SERIES_RESISTOR_REQUIRED');
  if (!led) return failure('C3_PATH_OPEN');
  const gpio = `${board.id}.GPIO2`;
  const ground = `${board.id}.GND`;
  const ledAnode = `${led.id}.ANODE`;
  const ledCathode = `${led.id}.CATHODE`;
  const endpointSet = new Set(draft.nets.flatMap((net) => net.endpoints.map(endpointKey)));
  if (!endpointSet.has(ground)) return failure('C3_GROUND_REQUIRED');
  if (!endpointSet.has(gpio)) return failure('C3_PATH_OPEN');
  const reverse = draft.nets.some((net) => hasPair(net, gpio, ledCathode)
    || hasPair(net, ground, ledAnode)
    || net.endpoints.some((endpoint) => endpointKey(endpoint) === ledCathode)
      && net.endpoints.some((endpoint) => endpoint.component === resistor.id));
  if (reverse) return failure('C3_LED_REVERSE_POLARITY');
  const orientations = [['A', 'B'], ['B', 'A']];
  const accepted = orientations.find(([sourceLead, ledLead]) =>
    draft.nets.some((net) => hasPair(net, gpio, `${resistor.id}.${sourceLead}`))
    && draft.nets.some((net) => hasPair(net, `${resistor.id}.${ledLead}`, ledAnode))
    && draft.nets.some((net) => hasPair(net, ledCathode, ground)));
  if (!accepted || draft.nets.length !== 3) return failure('C3_PATH_OPEN');
  const forwardVolts = LED_FORWARD_VOLTS[led.properties.color];
  const peakCurrentAmps = (ESP32C3_NOMINAL_VOLTS - forwardVolts) / resistor.properties.ohms;
  if (!Number.isFinite(peakCurrentAmps) || peakCurrentAmps <= 0
      || peakCurrentAmps > ESP32C3_LED_CURRENT_LIMIT_AMPS) {
    return failure('C3_LED_OVERCURRENT', { peakCurrentAmps, limitAmps: ESP32C3_LED_CURRENT_LIMIT_AMPS });
  }
  return { ok: true, code: 'OK', draft, model: {
    sourcePin: 'GPIO2', sourceAnchor: 'GPIO2', sourceConnector: 'J1', sourcePhysicalPin: 4,
    groundAnchor: 'GND', groundConnector: 'J1', groundPhysicalPin: 6,
    nominalVolts: ESP32C3_NOMINAL_VOLTS,
    resistorId: resistor.id, resistorOhms: resistor.properties.ohms,
    ledId: led.id, ledColor: led.properties.color, forwardVolts, peakCurrentAmps,
    qemuPinStateObserved: false,
  } };
}

export function esp32C3RuntimeCircuit(value) {
  const validation = validateEsp32C3Circuit(value);
  if (!validation.ok) return { ...clone(VALIDATED_LED_CIRCUIT), connections: [] };
  return {
    ...clone(VALIDATED_LED_CIRCUIT),
    resistorOhms: validation.model.resistorOhms,
    ledForwardVolts: validation.model.forwardVolts,
  };
}

export class Esp32C3CircuitEditor extends NamedSeriesLedCircuitEditor {
  constructor(draft = createEsp32C3CircuitDraft()) {
    super({ draft, normalize: normalizeEsp32C3CircuitDraft,
      validate: validateEsp32C3Circuit, createDefault: createEsp32C3CircuitDraft,
      fixedComponentType: BOARD, codePrefix: 'C3' });
  }
}
