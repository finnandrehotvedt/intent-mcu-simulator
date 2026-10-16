// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { CIRCUIT_LIMITS } from '../src/component-catalog.mjs';
import { CIRCUIT_SCHEMA, validateCircuit } from '../src/circuit-engine.mjs';
import { exactKeys, parseStrictJson } from '../src/strict-json.mjs';

export const GROUND_REFERENCE_TYPE = 'reference.ground-v1';
export const GROUND_REFERENCE_MODEL = 'model.ground-reference-v1';
export const GROUND_REFERENCE_RENDERER = 'ground-reference-symbol';

const ID = /^[a-z][a-z0-9-]{0,47}$/u;
const LABEL = /^[\p{L}\p{N} ._#()°Ω×+\-]{1,64}$/u;
const BOARD_TYPE = 'board.atmega328p-16mhz-v1';
const BOARD_GROUND_PINS = Object.freeze(['GND1', 'GND2', 'GND3']);
const clone = (value) => structuredClone(value);
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const GROUND_REFERENCE_DEFINITION = deepFreeze({
  family: 'reference.ground',
  variant: 'signal-zero-volt',
  type: GROUND_REFERENCE_TYPE,
  version: 1,
  displayName: '0 V circuit reference',
  manufacturer: 'Intent Learning',
  partNumber: 'IL-REF-GND-0V',
  pins: [{
    id: 'REF', label: '0 V reference', role: 'ground',
    signals: ['ground.reference'], capabilities: ['ground.reference'],
    constraints: { voltage: 0 }, anchor: { x: 0.5, y: 0.08 },
  }],
  propertyKeys: ['potentialVolts'],
  propertySchema: {
    potentialVolts: { kind: 'number', minimum: 0, maximum: 0, default: 0, unit: 'V' },
  },
  controlKeys: [],
  modelRef: GROUND_REFERENCE_MODEL,
  internalTerminalGroups: [],
  selectable: true,
  artwork: {
    renderer: GROUND_REFERENCE_RENDERER,
    thumbnail: GROUND_REFERENCE_RENDERER,
    viewBox: [0, 0, 72, 72], cssWidth: 72, cssHeight: 72,
    provenance: 'Original IntentForce SVG assembled from basic geometric lines and circles; no traced or third-party simulator artwork.',
    license: 'Apache-2.0',
  },
  catalog: {
    category: 'power',
    aliases: ['0 v reference', 'circuit common', 'signal ground'],
    functions: ['electrical reference', 'return reference'],
    interfaces: ['ground reference'],
    supplyVolts: { min: 0, max: 0 },
    package: 'virtual schematic reference',
  },
  support: {
    status: 'simulated',
    limitations: [
      'Bounded to one-controller 5 V AVR teaching circuits with at most three independent reference nets.',
      'Represents circuit 0 V only; it is not earth, chassis or protective ground.',
      'Does not source voltage or current and does not model ground loops or multiple reference domains.',
    ],
  },
});

function sameJson(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

export function validateGroundReferenceDefinition(definition = GROUND_REFERENCE_DEFINITION) {
  try {
    return exactKeys(definition, [
      'family', 'variant', 'type', 'version', 'displayName', 'manufacturer', 'partNumber',
      'pins', 'propertyKeys', 'propertySchema', 'controlKeys', 'modelRef',
      'internalTerminalGroups', 'selectable', 'artwork', 'catalog', 'support',
    ])
      && sameJson(definition, GROUND_REFERENCE_DEFINITION)
      && definition.type === GROUND_REFERENCE_TYPE
      && definition.modelRef === GROUND_REFERENCE_MODEL
      && definition.selectable === true
      && definition.support?.status === 'simulated'
      && sameJson(definition.pins, GROUND_REFERENCE_DEFINITION.pins)
      && sameJson(definition.propertyKeys, ['potentialVolts'])
      && sameJson(definition.propertySchema, GROUND_REFERENCE_DEFINITION.propertySchema)
      && sameJson(definition.controlKeys, [])
      && sameJson(definition.internalTerminalGroups, [])
      && definition.artwork?.renderer === GROUND_REFERENCE_RENDERER
      && definition.artwork?.thumbnail === GROUND_REFERENCE_RENDERER
      && definition.artwork?.license === 'Apache-2.0'
      && definition.catalog?.category === 'power'
      && definition.catalog?.supplyVolts?.min === 0
      && definition.catalog?.supplyVolts?.max === 0
      && Array.isArray(definition.support.limitations)
      && definition.support.limitations.length === 3;
  } catch {
    return false;
  }
}

export function createGroundReferenceComponent(id, label = '0 V circuit reference') {
  return {
    id,
    type: GROUND_REFERENCE_TYPE,
    label,
    properties: { potentialVolts: 0 },
    controls: {},
  };
}

class GroundReferenceError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'GroundReferenceError';
    this.code = code;
    this.diagnostic = {
      code, severity: 'block', componentId: details.componentId ?? null,
      netId: details.netId ?? null, message: details.message ?? code,
    };
  }
}

function fail(code, details) { throw new GroundReferenceError(code, details); }

function normalizeCandidate(value) {
  if (!exactKeys(value, ['schema', 'components', 'nets', 'junctions'])) fail('CIRCUIT_SHAPE');
  if (value.schema !== CIRCUIT_SCHEMA) fail('UNKNOWN_CIRCUIT_SCHEMA');
  if (!Array.isArray(value.components) || !Array.isArray(value.nets) || !Array.isArray(value.junctions)) fail('CIRCUIT_SHAPE');
  const endpointCount = value.nets.reduce((count, net) => count + (Array.isArray(net?.endpoints) ? net.endpoints.length : 0), 0);
  if (value.components.length > CIRCUIT_LIMITS.components) fail('COMPONENT_LIMIT');
  if (value.nets.length > CIRCUIT_LIMITS.nets) fail('NET_LIMIT');
  if (endpointCount > CIRCUIT_LIMITS.endpoints) fail('ENDPOINT_LIMIT');

  const componentIds = new Set();
  const groundIds = new Set();
  const components = value.components.map((component) => {
    if (!exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
        || typeof component.id !== 'string' || !ID.test(component.id) || componentIds.has(component.id)
        || typeof component.type !== 'string' || typeof component.label !== 'string' || !LABEL.test(component.label)) {
      fail('INVALID_COMPONENT', { componentId: component?.id });
    }
    componentIds.add(component.id);
    if (component.type === GROUND_REFERENCE_TYPE) {
      groundIds.add(component.id);
      if (!exactKeys(component.properties, ['potentialVolts']) || !exactKeys(component.controls, [])) {
        fail('GROUND_REFERENCE_SHAPE', { componentId: component.id });
      }
      if (component.properties.potentialVolts !== 0) fail('GROUND_REFERENCE_FIXED_0V', { componentId: component.id });
    }
    return clone(component);
  }).sort((left, right) => `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`));

  const usedEndpoints = new Set();
  const connectedGrounds = new Set();
  const netIds = new Set();
  const nets = value.nets.map((net) => {
    if (!exactKeys(net, ['id', 'endpoints']) || typeof net.id !== 'string' || !ID.test(net.id)
        || netIds.has(net.id) || !Array.isArray(net.endpoints) || net.endpoints.length < 2) {
      fail('INVALID_NET', { netId: net?.id });
    }
    netIds.add(net.id);
    const endpoints = net.endpoints.map((endpoint) => {
      if (!exactKeys(endpoint, ['component', 'pin']) || typeof endpoint.component !== 'string'
          || typeof endpoint.pin !== 'string' || !componentIds.has(endpoint.component)) {
        fail('INVALID_ENDPOINT', { componentId: endpoint?.component, netId: net.id });
      }
      if (groundIds.has(endpoint.component)) {
        if (endpoint.pin !== 'REF') fail('GROUND_REFERENCE_PIN', { componentId: endpoint.component, netId: net.id });
        connectedGrounds.add(endpoint.component);
      }
      const key = endpointKey(endpoint);
      if (usedEndpoints.has(key)) fail('REUSED_ENDPOINT', { componentId: endpoint.component, netId: net.id });
      usedEndpoints.add(key);
      return clone(endpoint);
    }).sort((left, right) => endpointKey(left).localeCompare(endpointKey(right)));
    return { id: net.id, endpoints };
  }).sort((left, right) => left.id.localeCompare(right.id));

  for (const groundId of groundIds) {
    if (!connectedGrounds.has(groundId)) fail('GROUND_REFERENCE_UNCONNECTED', { componentId: groundId });
  }
  return {
    graph: { schema: CIRCUIT_SCHEMA, components, nets, junctions: clone(value.junctions) },
    groundIds,
  };
}

function projectCandidate(graph, groundIds) {
  const board = graph.components.find((component) => component.type === BOARD_TYPE);
  if (!board) return { runtimeGraph: { ...clone(graph), components: graph.components.filter((component) => !groundIds.has(component.id)) }, referenceNets: [] };
  const reservedPins = new Set(graph.nets.flatMap((net) => net.endpoints)
    .filter((endpoint) => endpoint.component === board.id && BOARD_GROUND_PINS.includes(endpoint.pin))
    .map((endpoint) => endpoint.pin));
  const availablePins = BOARD_GROUND_PINS.filter((pin) => !reservedPins.has(pin));
  const referenceNets = [];
  const nets = graph.nets.map((net) => {
    const references = net.endpoints.filter((endpoint) => groundIds.has(endpoint.component));
    if (!references.length) return clone(net);
    const endpoints = net.endpoints.filter((endpoint) => !groundIds.has(endpoint.component));
    if (!endpoints.length) fail('GROUND_REFERENCE_EMPTY_NET', { netId: net.id });
    let boardGround = endpoints.find((endpoint) => endpoint.component === board.id && BOARD_GROUND_PINS.includes(endpoint.pin));
    if (!boardGround) {
      const pin = availablePins.shift();
      if (!pin) fail('GROUND_REFERENCE_CAPACITY', { netId: net.id });
      boardGround = { component: board.id, pin };
      endpoints.push(boardGround);
    }
    endpoints.sort((left, right) => endpointKey(left).localeCompare(endpointKey(right)));
    referenceNets.push({
      netId: net.id,
      referenceComponentIds: references.map((endpoint) => endpoint.component).sort(),
      projectedBoardEndpoint: clone(boardGround),
      potentialVolts: 0,
    });
    return { id: net.id, endpoints };
  });
  return {
    runtimeGraph: {
      schema: CIRCUIT_SCHEMA,
      components: graph.components.filter((component) => !groundIds.has(component.id)).map(clone),
      nets,
      junctions: clone(graph.junctions),
    },
    referenceNets,
  };
}

export function validateGroundReferenceCircuit(value, options = {}) {
  try {
    const { graph, groundIds } = normalizeCandidate(value);
    if (groundIds.size === 0) fail('GROUND_REFERENCE_REQUIRED');
    const { runtimeGraph, referenceNets } = projectCandidate(graph, groundIds);
    const drivers = { ...(options.drivers ?? {}) };
    for (const endpoint of runtimeGraph.nets.flatMap((net) => net.endpoints)) {
      if (endpoint.component === runtimeGraph.components.find((component) => component.type === BOARD_TYPE)?.id
          && BOARD_GROUND_PINS.includes(endpoint.pin)) {
        const key = endpointKey(endpoint);
        if (drivers[key] === 'HIGH') fail('OUTPUT_CONTENTION', { componentId: endpoint.component });
        drivers[key] = 'LOW';
      }
    }
    const result = validateCircuit(runtimeGraph, { ...options, drivers });
    if (!result.ok) return { ...result, graph, runtimeGraph, referenceNets };
    return {
      ok: true, code: 'OK', graph, runtimeGraph: result.graph,
      diagnostics: [], models: result.models, referenceNets,
    };
  } catch (error) {
    if (error instanceof GroundReferenceError) {
      return { ok: false, code: error.code, diagnostics: [error.diagnostic] };
    }
    throw error;
  }
}

export function parseGroundReferenceCircuitText(source, options = {}) {
  try { return validateGroundReferenceCircuit(parseStrictJson(source), options); }
  catch (error) {
    const code = error.code ?? 'MALFORMED_JSON';
    return { ok: false, code, diagnostics: [{ code, severity: 'block', componentId: null, netId: null, message: code }] };
  }
}

export function canonicalGroundReferenceCircuitJson(value) {
  const result = validateGroundReferenceCircuit(value);
  if (!result.ok) throw new GroundReferenceError(result.code, result.diagnostics?.[0]);
  return JSON.stringify(result.graph);
}

export function replaceBoardGroundEndpointsWithReferences(value) {
  const graph = clone(value);
  const board = graph.components.find((component) => component.type === BOARD_TYPE);
  if (!board) throw new GroundReferenceError('BOARD_COUNT');
  let sequence = 0;
  for (const net of graph.nets) {
    net.endpoints = net.endpoints.map((endpoint) => {
      if (endpoint.component !== board.id || !BOARD_GROUND_PINS.includes(endpoint.pin)) return endpoint;
      sequence += 1;
      const id = `ground-reference-${sequence}`;
      graph.components.push(createGroundReferenceComponent(id, `0 V reference ${sequence}`));
      return { component: id, pin: 'REF' };
    });
  }
  if (sequence === 0) throw new GroundReferenceError('GROUND_REFERENCE_REQUIRED');
  return graph;
}
