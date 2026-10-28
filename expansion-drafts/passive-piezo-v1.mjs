// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';
import { PASSIVE_PIEZO_CONTRACT, PASSIVE_PIEZO_TYPE } from './passive-piezo-contract-v1.mjs';

export { PASSIVE_PIEZO_TYPE };
export const PASSIVE_PIEZO_MODEL = 'model.passive-piezo-transition-observer-v1';
export const PASSIVE_PIEZO_RENDERER = 'output-passive-piezo';
export const PASSIVE_PIEZO_RUNTIME_ADAPTER = 'avr-gpio-transition-observer-v1';
export const AVR_PASSIVE_PIEZO_PINS = PASSIVE_PIEZO_CONTRACT.supportedSignalPins;

const BOARD_TYPE = 'board.atmega328p-16mhz-v1';
const GROUND_PIN = /^GND[123]$/u;
const SUPPORTED_PINS = new Set(AVR_PASSIVE_PIEZO_PINS);
const clone = (value) => structuredClone(value);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function pin(id, label, role, signals, x, constraints) {
  return { id, label, role, signals: [...signals], capabilities: [...signals],
    constraints: { ...constraints }, anchor: { x, y: 0.92 } };
}

export const PASSIVE_PIEZO_DEFINITION = deepFreeze({
  family: 'output.passive-piezo', variant: 'two-terminal-transition-observer',
  type: PASSIVE_PIEZO_TYPE, version: 1, displayName: 'Passive piezo buzzer',
  manufacturer: 'Intent Learning', partNumber: 'IL-PIEZO-PASSIVE',
  pins: [
    pin('SIGNAL', 'PWM / digital signal', 'digital-in', ['digital.output-observer', 'pwm.output-observer'], 0.34, { voltageMin: 0, voltageMax: 5 }),
    pin('GND', 'Ground', 'ground', ['ground.reference'], 0.68, { voltage: 0 }),
  ],
  propertyKeys: [], propertySchema: {}, controlKeys: [], modelRef: PASSIVE_PIEZO_MODEL,
  internalTerminalGroups: [], selectable: true,
  artwork: { renderer: PASSIVE_PIEZO_RENDERER, thumbnail: PASSIVE_PIEZO_RENDERER,
    viewBox: [0, 0, 120, 100], cssWidth: 120, cssHeight: 100,
    provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced package, photograph or third-party simulator artwork.',
    license: 'Apache-2.0' },
  catalog: { category: 'drivers', aliases: ['passive piezo', 'piezo buzzer', 'piezo transducer'],
    functions: ['visual GPIO transition observation'], interfaces: ['GPIO', 'PWM'],
    supplyVolts: { min: 0, max: 5 }, package: 'original virtual two-terminal piezo' },
  support: { status: 'partial', limitations: [
    'AVR-only direct SIGNAL connection to D3, D5, D6, D9, D10 or D11 and direct GND connection.',
    'The runtime displays rest, driven level and observed transition activity only; it produces no browser audio.',
    'No frequency calibration, loudness, sound pressure, resonance, capacitance, current, loading or physical piezo accuracy is modelled.',
  ] },
});

export function validatePassivePiezoDefinition(value = PASSIVE_PIEZO_DEFINITION) {
  return exactKeys(value, ['family', 'variant', 'type', 'version', 'displayName', 'manufacturer', 'partNumber',
    'pins', 'propertyKeys', 'propertySchema', 'controlKeys', 'modelRef', 'internalTerminalGroups',
    'selectable', 'artwork', 'catalog', 'support'])
    && JSON.stringify(value) === JSON.stringify(PASSIVE_PIEZO_DEFINITION);
}

export function createPassivePiezoComponent(id, label = PASSIVE_PIEZO_DEFINITION.displayName) {
  const component = { id, type: PASSIVE_PIEZO_TYPE, label, properties: {}, controls: {} };
  if (!validatePassivePiezoComponent(component)) throw new TypeError('PASSIVE_PIEZO_STATE');
  return component;
}

export function validatePassivePiezoComponent(component) {
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && component.type === PASSIVE_PIEZO_TYPE && exactKeys(component.properties, []) && exactKeys(component.controls, []);
}

const fail = (code, details = []) => ({ ok: false, code, details });
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;

export function projectPassivePiezos(value) {
  const graph = clone(value);
  const piezos = graph.components.filter((component) => component.type === PASSIVE_PIEZO_TYPE);
  if (!piezos.length) return { ok: true, runtimeGraph: graph, piezos: [] };
  const components = new Map(graph.components.map((component) => [component.id, component]));
  const nets = new Map(graph.nets.map((net) => [net.id, net]));
  const endpointToNet = new Map();
  for (const net of graph.nets) for (const endpoint of net.endpoints) endpointToNet.set(endpointKey(endpoint), net.id);
  const projections = [];
  for (const component of piezos) {
    if (!validatePassivePiezoComponent(component)) return fail('PASSIVE_PIEZO_STATE', [component.id]);
    const signalNet = endpointToNet.get(`${component.id}.SIGNAL`) ?? null;
    const groundNet = endpointToNet.get(`${component.id}.GND`) ?? null;
    if (!signalNet) return fail('PASSIVE_PIEZO_SIGNAL_DISCONNECTED', [component.id, 'SIGNAL']);
    if (!groundNet) return fail('PASSIVE_PIEZO_GND_DISCONNECTED', [component.id, 'GND']);
    if (signalNet === groundNet) return fail('PASSIVE_PIEZO_TERMINAL_SHORT', [component.id, signalNet]);
    const inspect = (netId) => (nets.get(netId)?.endpoints ?? []);
    const signalEndpoints = inspect(signalNet);
    const signalBoards = signalEndpoints.filter((endpoint) => components.get(endpoint.component)?.type === BOARD_TYPE);
    if (signalEndpoints.length !== 2 || signalBoards.length !== 1) return fail('PASSIVE_PIEZO_SIGNAL_UNSUPPORTED_TOPOLOGY', [component.id, signalNet]);
    const sourcePin = signalBoards[0].pin;
    if (!SUPPORTED_PINS.has(sourcePin)) return fail('PASSIVE_PIEZO_SIGNAL_REQUIRES_AVR_PWM_PIN', [component.id, sourcePin]);
    const groundEndpoints = inspect(groundNet);
    const groundBoards = groundEndpoints.filter((endpoint) => components.get(endpoint.component)?.type === BOARD_TYPE);
    if (groundBoards.length !== 1 || !GROUND_PIN.test(groundBoards[0].pin)
        || groundBoards.some((endpoint) => !GROUND_PIN.test(endpoint.pin))) {
      return fail('PASSIVE_PIEZO_GND_UNSUPPORTED_TOPOLOGY', [component.id, groundNet]);
    }
    projections.push({ componentId: component.id, signalNet, groundNet, sourcePin,
      observerId: `${component.id}-transition-observer-v1`,
      electricalModel: 'ideal-high-impedance-transition-observer-only',
      displayModel: 'visual-driven-rest-and-transition-activity-only' });
  }
  const ids = new Set(piezos.map((component) => component.id));
  graph.components = graph.components.filter((component) => !ids.has(component.id));
  graph.nets = graph.nets.map((net) => ({ id: net.id, endpoints: net.endpoints.filter((endpoint) => !ids.has(endpoint.component)) }))
    .filter((net) => net.endpoints.length >= 2);
  const netIds = new Set(graph.nets.map((net) => net.id));
  graph.junctions = graph.junctions.filter((junction) => netIds.has(junction.net));
  return { ok: true, runtimeGraph: graph, piezos: projections };
}
