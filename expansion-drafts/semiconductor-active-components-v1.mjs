// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';

export const P_CHANNEL_MOSFET_TYPE = 'transistor.mosfet-p-channel-v1';
export const OPTOCOUPLER_TYPE = 'semiconductor.optocoupler-phototransistor-v1';

const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const pin = (id, label, role, x, y) => ({ id, label, role,
  signals: ['semiconductor.active-terminal'], capabilities: ['semiconductor.active-terminal'],
  constraints: { terminal: id.toLowerCase() }, anchor: { x, y } });
const numeric = (minimum, maximum, defaultValue, unit) =>
  ({ kind: 'number', minimum, maximum, default: defaultValue, unit });
const artwork = (renderer) => ({ renderer, thumbnail: renderer, viewBox: [0, 0, 170, 110],
  cssWidth: 170, cssHeight: 110,
  provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
  license: 'Apache-2.0' });
const catalog = (aliases, functions, packageName) => ({ category: 'semiconductors', aliases,
  functions, interfaces: ['passive'], supplyVolts: { min: 0, max: 5 }, package: packageName });
const support = (specific) => ({ status: 'visual', limitations: [specific,
  'Authoring-only raw active-semiconductor symbol; it never grants Build or Run authority.',
  'No bias/current network, nonlinear transfer, switching threshold, body diode, optical coupling, isolation proof, leakage, capacitance, thermal/breakdown, safe-operating-area or physical-hardware equivalence is modelled.',
] });

export const SEMICONDUCTOR_ACTIVE_DEFINITIONS = freeze({
  [P_CHANNEL_MOSFET_TYPE]: {
    family: 'semiconductor.transistor', variant: 'mosfet-p-channel-three-terminal',
    type: P_CHANNEL_MOSFET_TYPE, version: 1, displayName: 'P-channel MOSFET',
    manufacturer: 'Intent Learning', partNumber: 'IL-MOSFET-P-AUTHORING',
    pins: [pin('GATE', 'Gate', 'semiconductor-control', 0.05, 0.5),
      pin('DRAIN', 'Drain', 'semiconductor-terminal', 0.95, 0.22),
      pin('SOURCE', 'Source', 'semiconductor-terminal', 0.95, 0.78)],
    propertyKeys: ['nominalGateThresholdMagnitudeVolts', 'maxDrainSourceVoltageVolts', 'maxDrainCurrentAmps'],
    propertySchema: {
      nominalGateThresholdMagnitudeVolts: numeric(0.5, 10, 2, 'V'),
      maxDrainSourceVoltageVolts: numeric(1, 600, 60, 'V'),
      maxDrainCurrentAmps: numeric(0.01, 100, 10, 'A'),
    }, controlKeys: [], modelRef: 'model.transistor-mosfet-p-channel-authoring-only-v1',
    internalTerminalGroups: [], selectable: true, artwork: artwork('transistor-mosfet-p-channel'),
    catalog: catalog(['p-channel mosfet', 'pmos', 'p-channel field effect transistor'],
      ['schematic authoring', 'terminal documentation', 'bounded nameplate metadata'],
      'raw three-terminal P-channel MOSFET symbol'),
    support: support('Gate-threshold magnitude and maximum drain ratings are bounded nameplate metadata only; P-channel switching and its body diode are not simulated.'),
  },
  [OPTOCOUPLER_TYPE]: {
    family: 'semiconductor.isolator', variant: 'led-phototransistor-four-terminal',
    type: OPTOCOUPLER_TYPE, version: 1, displayName: 'Phototransistor optocoupler',
    manufacturer: 'Intent Learning', partNumber: 'IL-OPTO-PHOTOTRANSISTOR-AUTHORING',
    pins: [pin('ANODE', 'Input LED anode', 'semiconductor-input', 0.05, 0.23),
      pin('CATHODE', 'Input LED cathode', 'semiconductor-input', 0.05, 0.77),
      pin('COLLECTOR', 'Phototransistor collector', 'semiconductor-output', 0.95, 0.23),
      pin('EMITTER', 'Phototransistor emitter', 'semiconductor-output', 0.95, 0.77)],
    propertyKeys: ['nominalForwardVoltageVolts', 'nominalCurrentTransferRatioPercent', 'maxIsolationVoltageVolts'],
    propertySchema: {
      nominalForwardVoltageVolts: numeric(0.8, 2, 1.2, 'V'),
      nominalCurrentTransferRatioPercent: numeric(10, 600, 100, '%'),
      maxIsolationVoltageVolts: numeric(100, 10_000, 3_750, 'V'),
    }, controlKeys: [], modelRef: 'model.semiconductor-optocoupler-authoring-only-v1',
    internalTerminalGroups: [], selectable: true, artwork: artwork('semiconductor-optocoupler'),
    catalog: catalog(['optocoupler', 'opto-isolator', 'phototransistor coupler'],
      ['schematic authoring', 'input/output terminal documentation', 'bounded nameplate metadata'],
      'raw four-terminal LED-phototransistor optocoupler symbol'),
    support: support('Forward voltage, current-transfer ratio and isolation-voltage values are metadata only; optical transfer and safety-rated isolation are not simulated or certified.'),
  },
});

export function createSemiconductorActiveComponent(type, id) {
  const definition = SEMICONDUCTOR_ACTIVE_DEFINITIONS[type];
  if (!definition) throw new TypeError('SEMICONDUCTOR_ACTIVE_COMPONENT_TYPE');
  return { id, type, label: definition.displayName,
    properties: Object.fromEntries(definition.propertyKeys.map((key) =>
      [key, definition.propertySchema[key].default])), controls: {} };
}

export function validateSemiconductorActiveComponent(component) {
  const definition = SEMICONDUCTOR_ACTIVE_DEFINITIONS[component?.type];
  if (!definition || !exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
      || typeof component.id !== 'string' || !component.id || typeof component.label !== 'string'
      || !component.label || !exactKeys(component.properties, definition.propertyKeys)
      || !exactKeys(component.controls, [])) return false;
  return definition.propertyKeys.every((key) => {
    const value = component.properties[key]; const contract = definition.propertySchema[key];
    return Number.isFinite(value) && value >= contract.minimum && value <= contract.maximum;
  });
}

export function validateSemiconductorActiveAuthoringGraph(graph) {
  if (!Array.isArray(graph?.components) || !Array.isArray(graph?.nets)) {
    return { ok: false, code: 'SEMICONDUCTOR_ACTIVE_AUTHORING_GRAPH_SHAPE', details: [] };
  }
  const components = graph.components.filter((component) =>
    SEMICONDUCTOR_ACTIVE_DEFINITIONS[component?.type]);
  if (!components.length) {
    return { ok: false, code: 'SEMICONDUCTOR_ACTIVE_AUTHORING_COMPONENT_REQUIRED', details: [] };
  }
  for (const component of components) {
    if (!validateSemiconductorActiveComponent(component)) {
      return { ok: false, code: 'SEMICONDUCTOR_ACTIVE_AUTHORING_COMPONENT_INVALID',
        details: [component?.id ?? null] };
    }
    const knownPins = new Set(SEMICONDUCTOR_ACTIVE_DEFINITIONS[component.type].pins.map(({ id }) => id));
    for (const net of graph.nets) for (const endpoint of net?.endpoints ?? []) {
      if (endpoint.component === component.id && !knownPins.has(endpoint.pin)) {
        return { ok: false, code: 'SEMICONDUCTOR_ACTIVE_AUTHORING_PIN_UNKNOWN',
          details: [component.id, endpoint.pin] };
      }
    }
  }
  return { ok: true, code: 'SEMICONDUCTOR_ACTIVE_AUTHORING_GRAPH_ACCEPTED_DATA_ONLY', executable: false,
    componentIds: components.map(({ id }) => id).sort() };
}

