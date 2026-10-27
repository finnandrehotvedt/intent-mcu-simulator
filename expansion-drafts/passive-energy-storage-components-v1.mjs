// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';

export const NONPOLAR_CAPACITOR_TYPE = 'capacitor.nonpolarized-v1';
export const ELECTROLYTIC_CAPACITOR_TYPE = 'capacitor.electrolytic-v1';
export const FIXED_INDUCTOR_TYPE = 'inductor.fixed-v1';

const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const pin = (id, label, x, constraints = {}) => ({ id, label, role: 'passive',
  signals: ['passive.two-terminal'], capabilities: ['passive.two-terminal'],
  constraints, anchor: { x, y: 0.5 } });
const artwork = (renderer) => ({ renderer, thumbnail: renderer, viewBox: [0, 0, 130, 80],
  cssWidth: 130, cssHeight: 80,
  provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
  license: 'Apache-2.0' });
const catalog = (aliases, functions, packageName) => ({ category: 'passives', aliases, functions,
  interfaces: ['passive'], supplyVolts: { min: 0, max: 50 }, package: packageName });
const support = (specific) => ({ status: 'visual', limitations: [specific,
  'Authoring-only raw two-terminal component; it never grants Build or Run authority.',
  'No transient or frequency-domain solver, parasitics, tolerance, temperature, saturation, ageing or physical-hardware equivalence is modelled.',
] });

export const PASSIVE_ENERGY_STORAGE_DEFINITIONS = freeze({
  [NONPOLAR_CAPACITOR_TYPE]: {
    family: 'passive.capacitor', variant: 'nonpolarized-two-terminal',
    type: NONPOLAR_CAPACITOR_TYPE, version: 1, displayName: 'Non-polarized capacitor',
    manufacturer: 'Intent Learning', partNumber: 'IL-CAP-NP-AUTHORING',
    pins: [pin('A', 'Terminal A', 0.08), pin('B', 'Terminal B', 0.92)],
    propertyKeys: ['capacitanceFarads'], propertySchema: {
      capacitanceFarads: { kind: 'number', minimum: 1e-12, maximum: 1, default: 100e-9, unit: 'F' },
    }, controlKeys: [], modelRef: 'model.capacitor-nonpolarized-authoring-only-v1',
    internalTerminalGroups: [], selectable: true, artwork: artwork('capacitor-nonpolarized'),
    catalog: catalog(['capacitor', 'ceramic capacitor', 'film capacitor'],
      ['schematic authoring', 'nameplate capacitance'], 'raw two-terminal non-polarized symbol'),
    support: support('Capacitance is persisted only as a bounded nameplate value from 1 pF through 1 F.'),
  },
  [ELECTROLYTIC_CAPACITOR_TYPE]: {
    family: 'passive.capacitor', variant: 'polarized-electrolytic-two-terminal',
    type: ELECTROLYTIC_CAPACITOR_TYPE, version: 1, displayName: 'Electrolytic capacitor',
    manufacturer: 'Intent Learning', partNumber: 'IL-CAP-EL-AUTHORING',
    pins: [pin('POSITIVE', 'Positive terminal (+)', 0.08, { polarity: 'anode' }),
      pin('NEGATIVE', 'Negative terminal (−)', 0.92, { polarity: 'cathode' })],
    propertyKeys: ['capacitanceFarads'], propertySchema: {
      capacitanceFarads: { kind: 'number', minimum: 1e-9, maximum: 10, default: 100e-6, unit: 'F' },
    }, controlKeys: [], modelRef: 'model.capacitor-electrolytic-authoring-only-v1',
    internalTerminalGroups: [], selectable: true, artwork: artwork('capacitor-electrolytic'),
    catalog: catalog(['electrolytic capacitor', 'polarized capacitor'],
      ['schematic authoring', 'polarity documentation', 'nameplate capacitance'],
      'raw two-terminal polarized symbol'),
    support: support('POSITIVE/NEGATIVE polarity is documentation-only; reverse-polarity behavior and voltage rating are not simulated.'),
  },
  [FIXED_INDUCTOR_TYPE]: {
    family: 'passive.inductor', variant: 'fixed-two-terminal',
    type: FIXED_INDUCTOR_TYPE, version: 1, displayName: 'Fixed inductor',
    manufacturer: 'Intent Learning', partNumber: 'IL-IND-FIXED-AUTHORING',
    pins: [pin('A', 'Terminal A', 0.08), pin('B', 'Terminal B', 0.92)],
    propertyKeys: ['inductanceHenries'], propertySchema: {
      inductanceHenries: { kind: 'number', minimum: 1e-9, maximum: 1_000, default: 1e-3, unit: 'H' },
    }, controlKeys: [], modelRef: 'model.inductor-fixed-authoring-only-v1',
    internalTerminalGroups: [], selectable: true, artwork: artwork('inductor-fixed'),
    catalog: catalog(['inductor', 'coil', 'choke'],
      ['schematic authoring', 'nameplate inductance'], 'raw two-terminal fixed-inductor symbol'),
    support: support('Inductance is persisted only as a bounded nameplate value from 1 nH through 1000 H.'),
  },
});

export function createPassiveEnergyStorageComponent(type, id) {
  const definition = PASSIVE_ENERGY_STORAGE_DEFINITIONS[type];
  if (!definition) throw new TypeError('PASSIVE_ENERGY_STORAGE_TYPE');
  return { id, type, label: definition.displayName,
    properties: Object.fromEntries(definition.propertyKeys.map((key) =>
      [key, definition.propertySchema[key].default])), controls: {} };
}

export function validatePassiveEnergyStorageComponent(component) {
  const definition = PASSIVE_ENERGY_STORAGE_DEFINITIONS[component?.type];
  if (!definition || !exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
      || typeof component.id !== 'string' || !component.id || typeof component.label !== 'string'
      || !component.label || !exactKeys(component.properties, definition.propertyKeys)
      || !exactKeys(component.controls, [])) return false;
  return definition.propertyKeys.every((key) => {
    const value = component.properties[key]; const contract = definition.propertySchema[key];
    return Number.isFinite(value) && value >= contract.minimum && value <= contract.maximum;
  });
}

export function validatePassiveEnergyStorageAuthoringGraph(graph) {
  const components = graph?.components;
  if (!Array.isArray(components) || !Array.isArray(graph?.nets)) {
    return { ok: false, code: 'PASSIVE_AUTHORING_GRAPH_SHAPE', details: [] };
  }
  const passive = components.filter((component) => PASSIVE_ENERGY_STORAGE_DEFINITIONS[component?.type]);
  if (!passive.length) return { ok: false, code: 'PASSIVE_AUTHORING_COMPONENT_REQUIRED', details: [] };
  for (const component of passive) {
    if (!validatePassiveEnergyStorageComponent(component)) {
      return { ok: false, code: 'PASSIVE_AUTHORING_COMPONENT_INVALID', details: [component?.id ?? null] };
    }
    const pins = new Set(PASSIVE_ENERGY_STORAGE_DEFINITIONS[component.type].pins.map(({ id }) => id));
    for (const net of graph.nets) for (const endpoint of net?.endpoints ?? []) {
      if (endpoint.component === component.id && !pins.has(endpoint.pin)) {
        return { ok: false, code: 'PASSIVE_AUTHORING_PIN_UNKNOWN', details: [component.id, endpoint.pin] };
      }
    }
  }
  return { ok: true, code: 'PASSIVE_AUTHORING_GRAPH_ACCEPTED_DATA_ONLY', executable: false,
    componentIds: passive.map(({ id }) => id).sort() };
}
