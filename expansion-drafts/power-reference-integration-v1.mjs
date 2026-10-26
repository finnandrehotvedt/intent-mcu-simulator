// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { validateCircuit } from '../src/circuit-engine.mjs';
import { exactKeys, parseStrictJson } from '../src/strict-json.mjs';

export const POWER_REFERENCE_TYPE = 'reference.power-5v-v1';
export const POWER_REFERENCE_MODEL = 'model.power-reference-5v-v1';
export const POWER_REFERENCE_RENDERER = 'power-reference-5v-symbol';

const BOARD_TYPE = 'board.atmega328p-16mhz-v1';
const clone = (value) => structuredClone(value);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const POWER_REFERENCE_DEFINITION = deepFreeze({
  family: 'reference.power', variant: 'fixed-5v-source', type: POWER_REFERENCE_TYPE,
  version: 1, displayName: '5 V circuit source', manufacturer: 'Intent Learning',
  partNumber: 'IL-REF-PWR-5V',
  pins: [{
    id: 'OUT', label: '5 V source output', role: 'power-out',
    signals: ['power.5v-reference'], capabilities: ['power.5v-reference'],
    constraints: { voltage: 5, direction: 'source' }, anchor: { x: 0.5, y: 0.92 },
  }],
  propertyKeys: ['voltageVolts'],
  propertySchema: { voltageVolts: { kind: 'number', minimum: 5, maximum: 5, default: 5, unit: 'V' } },
  controlKeys: [], modelRef: POWER_REFERENCE_MODEL, internalTerminalGroups: [], selectable: true,
  artwork: {
    renderer: POWER_REFERENCE_RENDERER, thumbnail: POWER_REFERENCE_RENDERER,
    viewBox: [0, 0, 72, 72], cssWidth: 72, cssHeight: 72,
    provenance: 'Original IntentForce SVG assembled from basic geometric lines; no traced or third-party simulator artwork.',
    license: 'Apache-2.0',
  },
  catalog: {
    category: 'power', aliases: ['5 v source', 'positive supply', 'vcc'],
    functions: ['fixed voltage source', 'positive supply reference'], interfaces: ['5 V power'],
    supplyVolts: { min: 5, max: 5 }, package: 'virtual schematic source',
  },
  support: {
    status: 'simulated',
    limitations: [
      'Bounded to the existing AVR board 5 V output; it is not an independent bench supply.',
      'Sources exactly 5 V and never acts as ground, a passive label or a bidirectional terminal.',
      'No current capacity, source impedance, short-circuit, regulator or multiple-supply model.',
    ],
  },
});

export function validatePowerReferenceDefinition(value = POWER_REFERENCE_DEFINITION) {
  return JSON.stringify(value) === JSON.stringify(POWER_REFERENCE_DEFINITION)
    && value.pins[0].constraints.direction === 'source'
    && value.pins[0].constraints.voltage === 5;
}

export function createPowerReferenceComponent(id, label = '5 V circuit source') {
  return { id, type: POWER_REFERENCE_TYPE, label, properties: { voltageVolts: 5 }, controls: {} };
}

function failure(code, componentId = null, netId = null) {
  return { ok: false, code, diagnostics: [{ code, severity: 'block', componentId, netId, message: code }] };
}

export function validatePowerReferenceCircuit(value, options = {}) {
  if (!exactKeys(value, ['schema', 'components', 'nets', 'junctions'])
      || !Array.isArray(value.components) || !Array.isArray(value.nets) || !Array.isArray(value.junctions)) {
    return failure('CIRCUIT_SHAPE');
  }
  const graph = clone(value);
  const references = new Set();
  for (const component of graph.components) {
    if (component?.type !== POWER_REFERENCE_TYPE) continue;
    if (!exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
        || !exactKeys(component.properties, ['voltageVolts']) || component.properties.voltageVolts !== 5
        || !exactKeys(component.controls, [])) return failure('POWER_REFERENCE_FIXED_5V', component?.id);
    references.add(component.id);
  }
  if (!references.size) return failure('POWER_REFERENCE_REQUIRED');
  const board = graph.components.find((item) => item.type === BOARD_TYPE);
  if (!board) return failure('POWER_REFERENCE_AVR_ONLY');

  const used = new Set();
  for (const net of graph.nets) {
    const sourceEndpoints = net.endpoints?.filter((endpoint) => references.has(endpoint.component)) ?? [];
    if (!sourceEndpoints.length) continue;
    if (sourceEndpoints.length !== 1 || sourceEndpoints[0].pin !== 'OUT') {
      return failure('POWER_REFERENCE_SOURCE_CONFLICT', sourceEndpoints[0]?.component ?? null, net.id);
    }
    if (used.has(sourceEndpoints[0].component)) return failure('POWER_REFERENCE_REUSED', sourceEndpoints[0].component, net.id);
    used.add(sourceEndpoints[0].component);
    const remaining = net.endpoints.filter((endpoint) => !references.has(endpoint.component));
    if (remaining.some((endpoint) => endpoint.component === board.id && endpoint.pin.startsWith('GND'))) {
      return failure('POWER_REFERENCE_GROUND_CONFLICT', sourceEndpoints[0].component, net.id);
    }
    const boardSources = remaining.filter((endpoint) => endpoint.component === board.id && endpoint.pin === '5V');
    if (boardSources.length > 1) return failure('POWER_REFERENCE_SOURCE_CONFLICT', sourceEndpoints[0].component, net.id);
    if (!boardSources.length) remaining.push({ component: board.id, pin: '5V' });
    net.endpoints = remaining;
  }
  for (const id of references) if (!used.has(id)) return failure('POWER_REFERENCE_UNCONNECTED', id);
  graph.components = graph.components.filter((item) => !references.has(item.id));
  const result = validateCircuit(graph, options);
  if (!result.ok) return { ...result, sourceReferences: [] };
  return {
    ok: true, code: 'OK', graph: clone(value), runtimeGraph: result.graph,
    diagnostics: [], models: result.models,
    sourceReferences: [...references].sort().map((componentId) => ({ componentId, voltageVolts: 5, direction: 'source' })),
  };
}

export function parsePowerReferenceCircuitText(source, options = {}) {
  try { return validatePowerReferenceCircuit(parseStrictJson(source), options); }
  catch (error) { return failure(error.code ?? 'MALFORMED_JSON'); }
}
