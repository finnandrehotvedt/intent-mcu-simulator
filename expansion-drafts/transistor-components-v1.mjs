// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';

export const NPN_BJT_TYPE = 'transistor.bjt-npn-v1';
export const PNP_BJT_TYPE = 'transistor.bjt-pnp-v1';
export const N_CHANNEL_MOSFET_TYPE = 'transistor.mosfet-n-channel-v1';

const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const pin = (id, label, role, x, y) => ({ id, label, role,
  signals: ['semiconductor.three-terminal'], capabilities: ['semiconductor.three-terminal'],
  constraints: { terminal: id.toLowerCase() }, anchor: { x, y } });
const bjtPins = () => [pin('BASE', 'Base', 'semiconductor-control', 0.06, 0.5),
  pin('COLLECTOR', 'Collector', 'semiconductor-terminal', 0.94, 0.22),
  pin('EMITTER', 'Emitter', 'semiconductor-terminal', 0.94, 0.78)];
const mosfetPins = () => [pin('GATE', 'Gate', 'semiconductor-control', 0.06, 0.5),
  pin('DRAIN', 'Drain', 'semiconductor-terminal', 0.94, 0.22),
  pin('SOURCE', 'Source', 'semiconductor-terminal', 0.94, 0.78)];
const numeric = (minimum, maximum, defaultValue, unit) =>
  ({ kind: 'number', minimum, maximum, default: defaultValue, unit });
const artwork = (renderer) => ({ renderer, thumbnail: renderer, viewBox: [0, 0, 160, 104],
  cssWidth: 160, cssHeight: 104,
  provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
  license: 'Apache-2.0' });
const catalog = (aliases, packageName) => ({ category: 'semiconductors', aliases,
  functions: ['schematic authoring', 'terminal and polarity documentation', 'bounded nameplate metadata'],
  interfaces: ['passive'], supplyVolts: { min: 0, max: 5 }, package: packageName });
const support = (specific) => ({ status: 'visual', limitations: [specific,
  'Authoring-only raw three-terminal semiconductor; it never grants Build or Run authority.',
  'No bias network, switching threshold, gain/current, body diode, saturation, leakage, capacitance, thermal, breakdown, safe-operating-area or physical-hardware equivalence is modelled.',
] });

export const TRANSISTOR_COMPONENT_DEFINITIONS = freeze({
  [NPN_BJT_TYPE]: {
    family: 'semiconductor.transistor', variant: 'bjt-npn-three-terminal', type: NPN_BJT_TYPE,
    version: 1, displayName: 'NPN bipolar transistor', manufacturer: 'Intent Learning',
    partNumber: 'IL-BJT-NPN-AUTHORING', pins: bjtPins(),
    propertyKeys: ['nominalCurrentGain', 'maxCollectorEmitterVoltageVolts', 'maxCollectorCurrentAmps'],
    propertySchema: {
      nominalCurrentGain: numeric(20, 1_000, 100, 'ratio'),
      maxCollectorEmitterVoltageVolts: numeric(1, 300, 40, 'V'),
      maxCollectorCurrentAmps: numeric(0.001, 20, 0.6, 'A'),
    }, controlKeys: [], modelRef: 'model.transistor-bjt-npn-authoring-only-v1',
    internalTerminalGroups: [], selectable: true, artwork: artwork('transistor-bjt-npn'),
    catalog: catalog(['npn transistor', 'bjt npn', 'bipolar junction transistor'],
      'raw three-terminal NPN BJT symbol'),
    support: support('Gain and maximum collector ratings are bounded nameplate metadata only; NPN switching is not simulated.'),
  },
  [PNP_BJT_TYPE]: {
    family: 'semiconductor.transistor', variant: 'bjt-pnp-three-terminal', type: PNP_BJT_TYPE,
    version: 1, displayName: 'PNP bipolar transistor', manufacturer: 'Intent Learning',
    partNumber: 'IL-BJT-PNP-AUTHORING', pins: bjtPins(),
    propertyKeys: ['nominalCurrentGain', 'maxCollectorEmitterVoltageVolts', 'maxCollectorCurrentAmps'],
    propertySchema: {
      nominalCurrentGain: numeric(20, 1_000, 100, 'ratio'),
      maxCollectorEmitterVoltageVolts: numeric(1, 300, 40, 'V'),
      maxCollectorCurrentAmps: numeric(0.001, 20, 0.6, 'A'),
    }, controlKeys: [], modelRef: 'model.transistor-bjt-pnp-authoring-only-v1',
    internalTerminalGroups: [], selectable: true, artwork: artwork('transistor-bjt-pnp'),
    catalog: catalog(['pnp transistor', 'bjt pnp', 'bipolar junction transistor'],
      'raw three-terminal PNP BJT symbol'),
    support: support('Gain and maximum collector ratings are bounded nameplate metadata only; PNP switching is not simulated.'),
  },
  [N_CHANNEL_MOSFET_TYPE]: {
    family: 'semiconductor.transistor', variant: 'mosfet-n-channel-three-terminal',
    type: N_CHANNEL_MOSFET_TYPE, version: 1, displayName: 'N-channel MOSFET',
    manufacturer: 'Intent Learning', partNumber: 'IL-MOSFET-N-AUTHORING', pins: mosfetPins(),
    propertyKeys: ['nominalGateThresholdVoltageVolts', 'maxDrainSourceVoltageVolts', 'maxDrainCurrentAmps'],
    propertySchema: {
      nominalGateThresholdVoltageVolts: numeric(0.5, 10, 2, 'V'),
      maxDrainSourceVoltageVolts: numeric(1, 600, 60, 'V'),
      maxDrainCurrentAmps: numeric(0.01, 100, 10, 'A'),
    }, controlKeys: [], modelRef: 'model.transistor-mosfet-n-channel-authoring-only-v1',
    internalTerminalGroups: [], selectable: true, artwork: artwork('transistor-mosfet-n-channel'),
    catalog: catalog(['n-channel mosfet', 'nmos', 'field effect transistor'],
      'raw three-terminal N-channel MOSFET symbol'),
    support: support('Gate threshold and maximum drain ratings are bounded nameplate metadata only; MOSFET switching and its body diode are not simulated.'),
  },
});

export function createTransistorComponent(type, id) {
  const definition = TRANSISTOR_COMPONENT_DEFINITIONS[type];
  if (!definition) throw new TypeError('TRANSISTOR_COMPONENT_TYPE');
  return { id, type, label: definition.displayName,
    properties: Object.fromEntries(definition.propertyKeys.map((key) =>
      [key, definition.propertySchema[key].default])), controls: {} };
}

export function validateTransistorComponent(component) {
  const definition = TRANSISTOR_COMPONENT_DEFINITIONS[component?.type];
  if (!definition || !exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
      || typeof component.id !== 'string' || !component.id || typeof component.label !== 'string'
      || !component.label || !exactKeys(component.properties, definition.propertyKeys)
      || !exactKeys(component.controls, [])) return false;
  return definition.propertyKeys.every((key) => {
    const value = component.properties[key]; const contract = definition.propertySchema[key];
    return Number.isFinite(value) && value >= contract.minimum && value <= contract.maximum;
  });
}

export function validateTransistorAuthoringGraph(graph) {
  if (!Array.isArray(graph?.components) || !Array.isArray(graph?.nets)) {
    return { ok: false, code: 'TRANSISTOR_AUTHORING_GRAPH_SHAPE', details: [] };
  }
  const transistors = graph.components.filter((component) =>
    TRANSISTOR_COMPONENT_DEFINITIONS[component?.type]);
  if (!transistors.length) {
    return { ok: false, code: 'TRANSISTOR_AUTHORING_COMPONENT_REQUIRED', details: [] };
  }
  for (const component of transistors) {
    if (!validateTransistorComponent(component)) {
      return { ok: false, code: 'TRANSISTOR_AUTHORING_COMPONENT_INVALID', details: [component?.id ?? null] };
    }
    const knownPins = new Set(TRANSISTOR_COMPONENT_DEFINITIONS[component.type].pins.map(({ id }) => id));
    for (const net of graph.nets) for (const endpoint of net?.endpoints ?? []) {
      if (endpoint.component === component.id && !knownPins.has(endpoint.pin)) {
        return { ok: false, code: 'TRANSISTOR_AUTHORING_PIN_UNKNOWN',
          details: [component.id, endpoint.pin] };
      }
    }
  }
  return { ok: true, code: 'TRANSISTOR_AUTHORING_GRAPH_ACCEPTED_DATA_ONLY', executable: false,
    componentIds: transistors.map(({ id }) => id).sort() };
}
