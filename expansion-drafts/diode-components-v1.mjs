// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';

// CMP-007 deliberately promotes the pre-existing foundation draft type instead
// of creating a second silicon-diode identity.
export const SILICON_DIODE_TYPE = 'diode.rectifier-v1';
export const SCHOTTKY_DIODE_TYPE = 'diode.schottky-v1';
export const ZENER_DIODE_TYPE = 'diode.zener-v1';

const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const pins = () => [
  { id: 'ANODE', label: 'Anode', role: 'passive-polarized',
    signals: ['passive.two-terminal'], capabilities: ['passive.two-terminal'],
    constraints: { polarity: 'anode' }, anchor: { x: 0.08, y: 0.5 } },
  { id: 'CATHODE', label: 'Cathode', role: 'passive-polarized',
    signals: ['passive.two-terminal'], capabilities: ['passive.two-terminal'],
    constraints: { polarity: 'cathode' }, anchor: { x: 0.92, y: 0.5 } },
];
const artwork = (renderer) => ({ renderer, thumbnail: renderer, viewBox: [0, 0, 150, 88],
  cssWidth: 150, cssHeight: 88,
  provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
  license: 'Apache-2.0' });
const catalog = (aliases, functions, packageName) => ({ category: 'semiconductors', aliases, functions,
  interfaces: ['passive'], supplyVolts: { min: 0, max: 50 }, package: packageName });
const support = (specific) => ({ status: 'visual', limitations: [specific,
  'Authoring-only raw two-terminal diode; it never grants Build or Run authority.',
  'No nonlinear I-V curve, current, reverse leakage/breakdown event, temperature, recovery time, power dissipation, tolerance or physical-hardware equivalence is modelled.',
] });
const numeric = (minimum, maximum, defaultValue, unit = 'V') =>
  ({ kind: 'number', minimum, maximum, default: defaultValue, unit });

export const DIODE_COMPONENT_DEFINITIONS = freeze({
  [SILICON_DIODE_TYPE]: {
    family: 'semiconductor.diode', variant: 'silicon-rectifier-two-terminal',
    type: SILICON_DIODE_TYPE, version: 1, displayName: 'Silicon rectifier diode',
    manufacturer: 'Intent Learning', partNumber: 'IL-DIODE-SI-AUTHORING', pins: pins(),
    propertyKeys: ['nominalForwardVoltageVolts', 'maxReverseVoltageVolts'], propertySchema: {
      nominalForwardVoltageVolts: numeric(0.2, 1.2, 0.7),
      maxReverseVoltageVolts: numeric(1, 1_000, 50),
    }, controlKeys: [], modelRef: 'model.diode-silicon-authoring-only-v1',
    internalTerminalGroups: [], selectable: true, artwork: artwork('diode-silicon'),
    catalog: catalog(['silicon diode', 'rectifier diode', 'pn diode'],
      ['schematic authoring', 'polarity documentation', 'nameplate forward and reverse ratings'],
      'raw two-terminal silicon diode symbol'),
    support: support('The existing foundation-draft 0.7 V forward and 50 V reverse defaults are persisted as metadata only.'),
  },
  [SCHOTTKY_DIODE_TYPE]: {
    family: 'semiconductor.diode', variant: 'schottky-two-terminal',
    type: SCHOTTKY_DIODE_TYPE, version: 1, displayName: 'Schottky diode',
    manufacturer: 'Intent Learning', partNumber: 'IL-DIODE-SCHOTTKY-AUTHORING', pins: pins(),
    propertyKeys: ['nominalForwardVoltageVolts', 'maxReverseVoltageVolts'], propertySchema: {
      nominalForwardVoltageVolts: numeric(0.1, 0.6, 0.3),
      maxReverseVoltageVolts: numeric(1, 200, 40),
    }, controlKeys: [], modelRef: 'model.diode-schottky-authoring-only-v1',
    internalTerminalGroups: [], selectable: true, artwork: artwork('diode-schottky'),
    catalog: catalog(['schottky diode', 'barrier diode', 'low forward drop diode'],
      ['schematic authoring', 'polarity documentation', 'nameplate forward and reverse ratings'],
      'raw two-terminal Schottky symbol'),
    support: support('The nominal 0.3 V forward and 40 V reverse values are persisted as bounded metadata only.'),
  },
  [ZENER_DIODE_TYPE]: {
    family: 'semiconductor.diode', variant: 'zener-two-terminal',
    type: ZENER_DIODE_TYPE, version: 1, displayName: 'Zener diode',
    manufacturer: 'Intent Learning', partNumber: 'IL-DIODE-ZENER-AUTHORING', pins: pins(),
    propertyKeys: ['nominalForwardVoltageVolts', 'zenerVoltageVolts', 'maxPowerWatts'], propertySchema: {
      nominalForwardVoltageVolts: numeric(0.2, 1.2, 0.7),
      zenerVoltageVolts: numeric(1.8, 200, 5.1),
      maxPowerWatts: numeric(0.1, 5, 0.5, 'W'),
    }, controlKeys: [], modelRef: 'model.diode-zener-authoring-only-v1',
    internalTerminalGroups: [], selectable: true, artwork: artwork('diode-zener'),
    catalog: catalog(['zener diode', 'voltage reference diode', 'breakdown diode'],
      ['schematic authoring', 'polarity documentation', 'nameplate Zener voltage and power'],
      'raw two-terminal Zener symbol'),
    support: support('The nominal 5.1 V Zener voltage and 0.5 W power value are metadata, not a clamp or regulator model.'),
  },
});

export function createDiodeComponent(type, id) {
  const definition = DIODE_COMPONENT_DEFINITIONS[type];
  if (!definition) throw new TypeError('DIODE_COMPONENT_TYPE');
  return { id, type, label: definition.displayName,
    properties: Object.fromEntries(definition.propertyKeys.map((key) =>
      [key, definition.propertySchema[key].default])), controls: {} };
}

export function validateDiodeComponent(component) {
  const definition = DIODE_COMPONENT_DEFINITIONS[component?.type];
  if (!definition || !exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
      || typeof component.id !== 'string' || !component.id || typeof component.label !== 'string'
      || !component.label || !exactKeys(component.properties, definition.propertyKeys)
      || !exactKeys(component.controls, [])) return false;
  return definition.propertyKeys.every((key) => {
    const value = component.properties[key]; const contract = definition.propertySchema[key];
    return Number.isFinite(value) && value >= contract.minimum && value <= contract.maximum;
  });
}

export function validateDiodeAuthoringGraph(graph) {
  if (!Array.isArray(graph?.components) || !Array.isArray(graph?.nets)) {
    return { ok: false, code: 'DIODE_AUTHORING_GRAPH_SHAPE', details: [] };
  }
  const diodes = graph.components.filter((component) => DIODE_COMPONENT_DEFINITIONS[component?.type]);
  if (!diodes.length) return { ok: false, code: 'DIODE_AUTHORING_COMPONENT_REQUIRED', details: [] };
  for (const component of diodes) {
    if (!validateDiodeComponent(component)) {
      return { ok: false, code: 'DIODE_AUTHORING_COMPONENT_INVALID', details: [component?.id ?? null] };
    }
    const knownPins = new Set(DIODE_COMPONENT_DEFINITIONS[component.type].pins.map(({ id }) => id));
    for (const net of graph.nets) for (const endpoint of net?.endpoints ?? []) {
      if (endpoint.component === component.id && !knownPins.has(endpoint.pin)) {
        return { ok: false, code: 'DIODE_AUTHORING_PIN_UNKNOWN', details: [component.id, endpoint.pin] };
      }
    }
  }
  return { ok: true, code: 'DIODE_AUTHORING_GRAPH_ACCEPTED_DATA_ONLY', executable: false,
    componentIds: diodes.map(({ id }) => id).sort() };
}

