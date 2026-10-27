// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';

export const FUSE_TYPE = 'protection.fuse-v1';
export const RESETTABLE_FUSE_PTC_TYPE = 'protection.resettable-fuse-ptc-v1';

const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const pin = (id, label, x) => ({ id, label, role: 'passive-terminal',
  signals: ['passive.series'], capabilities: ['passive.series'],
  constraints: { terminal: id.toLowerCase(), polarity: 'none' }, anchor: { x, y: 0.5 } });
const pins = () => [pin('A', 'Terminal A', 0.06), pin('B', 'Terminal B', 0.94)];
const numeric = (minimum, maximum, defaultValue, unit) =>
  ({ kind: 'number', minimum, maximum, default: defaultValue, unit });
const artwork = (renderer) => ({ renderer, thumbnail: renderer, viewBox: [0, 0, 160, 80],
  cssWidth: 160, cssHeight: 80,
  provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
  license: 'Apache-2.0' });
const catalog = (aliases, packageName) => ({ category: 'circuit protection', aliases,
  functions: ['schematic authoring', 'terminal documentation', 'bounded nameplate metadata'],
  interfaces: ['passive'], supplyVolts: { min: 0, max: 5 }, package: packageName });
const support = (specific) => ({ status: 'visual', limitations: [specific,
  'Authoring-only raw circuit-protection symbol; it never grants Build or Run authority.',
  'No overcurrent trip execution, time-current or I²t curve, interruption, arc, resistance, heating, cooling, reset, thermal or breakdown behavior, certification, safety protection or physical-hardware equivalence is modelled.',
] });

export const CIRCUIT_PROTECTION_DEFINITIONS = freeze({
  [FUSE_TYPE]: {
    family: 'protection.overcurrent', variant: 'one-shot-fuse-two-terminal', type: FUSE_TYPE,
    version: 1, displayName: 'Fuse', manufacturer: 'Intent Learning',
    partNumber: 'IL-FUSE-AUTHORING', pins: pins(),
    propertyKeys: ['ratedCurrentAmps', 'ratedVoltageVolts', 'breakingCapacityAmps'],
    propertySchema: {
      ratedCurrentAmps: numeric(0.01, 100, 1, 'A'),
      ratedVoltageVolts: numeric(1, 1_000, 250, 'V'),
      breakingCapacityAmps: numeric(1, 100_000, 100, 'A'),
    }, controlKeys: [], modelRef: 'model.fuse-authoring-only-v1', internalTerminalGroups: [],
    selectable: true, artwork: artwork('protection-fuse'),
    catalog: catalog(['fuse', 'one-shot fuse', 'overcurrent fuse'], 'raw two-terminal fuse symbol'),
    support: support('Current, voltage and breaking-capacity values are bounded nameplate metadata only; a fault never opens the fuse.'),
  },
  [RESETTABLE_FUSE_PTC_TYPE]: {
    family: 'protection.overcurrent', variant: 'resettable-ptc-two-terminal',
    type: RESETTABLE_FUSE_PTC_TYPE, version: 1, displayName: 'Resettable PTC fuse',
    manufacturer: 'Intent Learning', partNumber: 'IL-PTC-FUSE-AUTHORING', pins: pins(),
    propertyKeys: ['holdCurrentAmps', 'tripCurrentAmps', 'maxVoltageVolts'],
    propertySchema: {
      holdCurrentAmps: numeric(0.01, 20, 0.5, 'A'),
      tripCurrentAmps: numeric(0.02, 40, 1, 'A'),
      maxVoltageVolts: numeric(1, 600, 30, 'V'),
    }, controlKeys: [], modelRef: 'model.resettable-fuse-ptc-authoring-only-v1',
    internalTerminalGroups: [], selectable: true, artwork: artwork('protection-resettable-fuse-ptc'),
    catalog: catalog(['resettable fuse', 'ptc fuse', 'polyfuse'], 'raw two-terminal resettable PTC fuse symbol'),
    support: support('Hold current, trip current and maximum voltage are bounded nameplate metadata only; PTC trip, resistance, cooldown and reset are not simulated.'),
  },
});

export function createCircuitProtectionComponent(type, id) {
  const definition = CIRCUIT_PROTECTION_DEFINITIONS[type];
  if (!definition) throw new TypeError('CIRCUIT_PROTECTION_COMPONENT_TYPE');
  return { id, type, label: definition.displayName,
    properties: Object.fromEntries(definition.propertyKeys.map((key) =>
      [key, definition.propertySchema[key].default])), controls: {} };
}

export function validateCircuitProtectionComponent(component) {
  const definition = CIRCUIT_PROTECTION_DEFINITIONS[component?.type];
  if (!definition || !exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
      || typeof component.id !== 'string' || !component.id || typeof component.label !== 'string'
      || !component.label || !exactKeys(component.properties, definition.propertyKeys)
      || !exactKeys(component.controls, [])) return false;
  if (!definition.propertyKeys.every((key) => {
    const value = component.properties[key]; const contract = definition.propertySchema[key];
    return Number.isFinite(value) && value >= contract.minimum && value <= contract.maximum;
  })) return false;
  return component.type !== RESETTABLE_FUSE_PTC_TYPE
    || component.properties.tripCurrentAmps > component.properties.holdCurrentAmps;
}

export function validateCircuitProtectionAuthoringGraph(graph) {
  if (!Array.isArray(graph?.components) || !Array.isArray(graph?.nets)) {
    return { ok: false, code: 'CIRCUIT_PROTECTION_AUTHORING_GRAPH_SHAPE', details: [] };
  }
  const components = graph.components.filter((component) =>
    CIRCUIT_PROTECTION_DEFINITIONS[component?.type]);
  if (!components.length) {
    return { ok: false, code: 'CIRCUIT_PROTECTION_AUTHORING_COMPONENT_REQUIRED', details: [] };
  }
  for (const component of components) {
    if (!validateCircuitProtectionComponent(component)) {
      return { ok: false, code: 'CIRCUIT_PROTECTION_AUTHORING_COMPONENT_INVALID',
        details: [component?.id ?? null] };
    }
    const knownPins = new Set(CIRCUIT_PROTECTION_DEFINITIONS[component.type].pins.map(({ id }) => id));
    for (const net of graph.nets) for (const endpoint of net?.endpoints ?? []) {
      if (endpoint.component === component.id && !knownPins.has(endpoint.pin)) {
        return { ok: false, code: 'CIRCUIT_PROTECTION_AUTHORING_PIN_UNKNOWN',
          details: [component.id, endpoint.pin] };
      }
    }
  }
  return { ok: true, code: 'CIRCUIT_PROTECTION_AUTHORING_GRAPH_ACCEPTED_DATA_ONLY', executable: false,
    componentIds: components.map(({ id }) => id).sort() };
}
