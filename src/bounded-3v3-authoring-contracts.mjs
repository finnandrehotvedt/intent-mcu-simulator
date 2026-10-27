// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { PASSIVE_ENERGY_STORAGE_DEFINITIONS,
  validatePassiveEnergyStorageComponent } from '../expansion-drafts/passive-energy-storage-components-v1.mjs';
import { DIODE_COMPONENT_DEFINITIONS,
  validateDiodeComponent } from '../expansion-drafts/diode-components-v1.mjs';
import { TRANSISTOR_COMPONENT_DEFINITIONS,
  validateTransistorComponent } from '../expansion-drafts/transistor-components-v1.mjs';
import { CIRCUIT_PROTECTION_DEFINITIONS,
  validateCircuitProtectionComponent } from '../expansion-drafts/circuit-protection-components-v1.mjs';
import { CONNECTION_HARDWARE_DEFINITIONS,
  validateConnectionHardwareComponent } from '../expansion-drafts/connection-hardware-components-v1.mjs';
import { SEMICONDUCTOR_ACTIVE_DEFINITIONS,
  validateSemiconductorActiveComponent } from '../expansion-drafts/semiconductor-active-components-v1.mjs';

export const BOUNDED_3V3_AUTHORING_SCHEMA = 'intent-mcu-bounded-3v3-authoring@1';
export const GROUND_REFERENCE_3V3_TYPE = 'ground.reference-3v3-v1';
export const MOMENTARY_BUTTON_3V3_TYPE = 'button.momentary-3v3-v1';
export const TOGGLE_SWITCH_3V3_TYPE = 'switch.toggle-3v3-v1';
export const POTENTIOMETER_3V3_TYPE = 'potentiometer.linear-3v3-v1';

const contract = (value) => Object.freeze({
  ...value,
  pins: Object.freeze(value.pins.map((pin) => Object.freeze({ ...pin }))),
  properties: Object.freeze({ ...value.properties }),
});

export const BOUNDED_3V3_AUTHORING_CONTRACTS = Object.freeze({
  schema: BOUNDED_3V3_AUTHORING_SCHEMA,
  nominalVolts: 3.3,
  execution: 'authoring-only',
  components: Object.freeze({
    [GROUND_REFERENCE_3V3_TYPE]: contract({
      type: GROUND_REFERENCE_3V3_TYPE, version: 1, displayName: '3.3 V ground reference',
      pins: [{ id: 'GND', role: 'ground', voltageMin: 0, voltageMax: 0 }], properties: {},
    }),
    [MOMENTARY_BUTTON_3V3_TYPE]: contract({
      type: MOMENTARY_BUTTON_3V3_TYPE, version: 1, displayName: 'Momentary button (3.3 V authoring)',
      pins: [{ id: 'A', role: 'passive', voltageMin: 0, voltageMax: 3.3 },
        { id: 'B', role: 'passive', voltageMin: 0, voltageMax: 3.3 }],
      properties: { defaultClosed: false },
    }),
    [TOGGLE_SWITCH_3V3_TYPE]: contract({
      type: TOGGLE_SWITCH_3V3_TYPE, version: 1, displayName: 'Toggle switch (3.3 V authoring)',
      pins: [{ id: 'A', role: 'passive', voltageMin: 0, voltageMax: 3.3 },
        { id: 'B', role: 'passive', voltageMin: 0, voltageMax: 3.3 }],
      properties: { defaultClosed: false },
    }),
    [POTENTIOMETER_3V3_TYPE]: contract({
      type: POTENTIOMETER_3V3_TYPE, version: 1, displayName: 'Linear potentiometer (3.3 V authoring)',
      pins: [{ id: 'HIGH', role: 'passive', voltageMin: 0, voltageMax: 3.3 },
        { id: 'WIPER', role: 'passive', voltageMin: 0, voltageMax: 3.3 },
        { id: 'LOW', role: 'passive', voltageMin: 0, voltageMax: 3.3 }],
      properties: { ohms: 10000, taper: 'linear' },
    }),
    ...Object.fromEntries(Object.values(PASSIVE_ENERGY_STORAGE_DEFINITIONS).map((definition) =>
      [definition.type, contract({ type: definition.type, version: definition.version,
        displayName: definition.displayName,
        pins: definition.pins.map(({ id }) => ({ id, role: 'passive', voltageMin: 0, voltageMax: 3.3 })),
        properties: Object.fromEntries(definition.propertyKeys.map((key) =>
          [key, definition.propertySchema[key].default])),
      })])),
    ...Object.fromEntries(Object.values(DIODE_COMPONENT_DEFINITIONS).map((definition) =>
      [definition.type, contract({ type: definition.type, version: definition.version,
        displayName: definition.displayName,
        pins: definition.pins.map(({ id }) => ({ id, role: 'passive', voltageMin: 0, voltageMax: 3.3 })),
        properties: Object.fromEntries(definition.propertyKeys.map((key) =>
          [key, definition.propertySchema[key].default])),
      })])),
    ...Object.fromEntries(Object.values(TRANSISTOR_COMPONENT_DEFINITIONS).map((definition) =>
      [definition.type, contract({ type: definition.type, version: definition.version,
        displayName: definition.displayName,
        pins: definition.pins.map(({ id }) => ({ id, role: 'passive', voltageMin: 0, voltageMax: 3.3 })),
        properties: Object.fromEntries(definition.propertyKeys.map((key) =>
          [key, definition.propertySchema[key].default])),
      })])),
    ...Object.fromEntries(Object.values(CIRCUIT_PROTECTION_DEFINITIONS).map((definition) =>
      [definition.type, contract({ type: definition.type, version: definition.version,
        displayName: definition.displayName,
        pins: definition.pins.map(({ id }) => ({ id, role: 'passive', voltageMin: 0, voltageMax: 3.3 })),
        properties: Object.fromEntries(definition.propertyKeys.map((key) =>
          [key, definition.propertySchema[key].default])),
      })])),
    ...Object.fromEntries(Object.values(CONNECTION_HARDWARE_DEFINITIONS).map((definition) =>
      [definition.type, contract({ type: definition.type, version: definition.version,
        displayName: definition.displayName,
        pins: definition.pins.map(({ id }) => ({ id, role: 'passive', voltageMin: 0, voltageMax: 3.3 })),
        properties: {},
      })])),
    ...Object.fromEntries(Object.values(SEMICONDUCTOR_ACTIVE_DEFINITIONS).map((definition) =>
      [definition.type, contract({ type: definition.type, version: definition.version,
        displayName: definition.displayName,
        pins: definition.pins.map(({ id }) => ({ id, role: 'passive', voltageMin: 0, voltageMax: 3.3 })),
        properties: Object.fromEntries(definition.propertyKeys.map((key) =>
          [key, definition.propertySchema[key].default])),
      })])),
  }),
});

const uiPin = (id, label, role, x, voltageMax = 3.3) => Object.freeze({ id, label, role,
  signals: Object.freeze([role === 'ground' ? 'ground.reference' : 'passive.contact']),
  capabilities: Object.freeze([role === 'ground' ? 'ground.reference' : 'passive.contact']),
  constraints: Object.freeze({ voltageMin: 0, voltageMax }), anchor: Object.freeze({ x, y: 0.5 }) });
const uiDefinition = (type, displayName, pins, renderer = 'button-tactile') => Object.freeze({
  family: 'bounded-3v3-authoring', variant: type, type, version: 1, displayName,
  manufacturer: 'Intent Learning', partNumber: `IL-${type.toUpperCase()}`, pins: Object.freeze(pins),
  propertyKeys: Object.freeze([]), controlKeys: Object.freeze([]), propertySchema: Object.freeze({}),
  modelRef: `${type}.authoring-only`, internalTerminalGroups: Object.freeze([]), selectable: true,
  artwork: Object.freeze({ provenance: 'Original project geometry.', license: 'Apache-2.0', renderer,
    thumbnail: renderer, viewBox: Object.freeze([0, 0, 100, 78]), cssWidth: 100, cssHeight: 78 }),
  catalog: Object.freeze({ category: 'inputs', aliases: Object.freeze([displayName.toLowerCase(), '3.3v']),
    functions: Object.freeze(['data-only circuit authoring']), interfaces: Object.freeze(['GPIO']),
    supplyVolts: Object.freeze({ min: 0, max: 3.3 }), package: 'authoring symbol' }),
  support: Object.freeze({ status: 'visual', limitations: Object.freeze(['Authoring-only; no runtime adapter.']) }),
});

export const BOUNDED_3V3_UI_COMPONENTS = Object.freeze({
  [GROUND_REFERENCE_3V3_TYPE]: uiDefinition(GROUND_REFERENCE_3V3_TYPE, '3.3 V ground reference',
    [uiPin('GND', 'Ground reference', 'ground', 0.5, 0)], 'ground-reference-3v3'),
  [MOMENTARY_BUTTON_3V3_TYPE]: uiDefinition(MOMENTARY_BUTTON_3V3_TYPE, 'Momentary button (3.3 V)',
    [uiPin('A', 'Contact A', 'passive', 0.08), uiPin('B', 'Contact B', 'passive', 0.92)]),
  [TOGGLE_SWITCH_3V3_TYPE]: uiDefinition(TOGGLE_SWITCH_3V3_TYPE, 'Toggle switch (3.3 V)',
    [uiPin('A', 'Contact A', 'passive', 0.08), uiPin('B', 'Contact B', 'passive', 0.92)], 'switch-toggle-3v3'),
  [POTENTIOMETER_3V3_TYPE]: Object.freeze({
    ...uiDefinition(POTENTIOMETER_3V3_TYPE, 'Linear potentiometer (3.3 V)', [
      uiPin('HIGH', 'High terminal', 'passive', 0.19),
      uiPin('WIPER', 'Wiper', 'passive', 0.5),
      uiPin('LOW', 'Low terminal', 'passive', 0.81),
    ], 'potentiometer-rotary'),
    family: 'input.potentiometer-rotary', variant: 'linear-three-terminal-3v3-authoring',
    propertyKeys: Object.freeze(['ohms', 'taper']),
    propertySchema: Object.freeze({ ohms: Object.freeze({ kind: 'number', minimum: 1, maximum: 10_000_000, default: 10_000, unit: 'Ω' }),
      taper: Object.freeze({ kind: 'enum', values: Object.freeze(['linear']), default: 'linear' }) }),
    catalog: Object.freeze({ category: 'inputs', aliases: Object.freeze(['potentiometer', 'analogue dial', '3.3v']),
      functions: Object.freeze(['data-only analogue circuit authoring']), interfaces: Object.freeze(['analogue']),
      supplyVolts: Object.freeze({ min: 0, max: 3.3 }), package: 'three-terminal authoring symbol' }),
  }),
  ...PASSIVE_ENERGY_STORAGE_DEFINITIONS,
  ...DIODE_COMPONENT_DEFINITIONS,
  ...TRANSISTOR_COMPONENT_DEFINITIONS,
  ...CIRCUIT_PROTECTION_DEFINITIONS,
  ...CONNECTION_HARDWARE_DEFINITIONS,
  ...SEMICONDUCTOR_ACTIVE_DEFINITIONS,
});

const key = ({ component, pin }) => `${component}.${pin}`;
const failure = (code, details = {}) => ({ ok: false, code, details });

/** Structural authoring validation only. It never grants executable authority. */
export function validateBounded3v3AuthoringGraph({ board, components, nets }) {
  if (!board || !Array.isArray(board.pins) || !Array.isArray(components) || !Array.isArray(nets)) {
    return failure('AUTHORING_GRAPH_SHAPE_INVALID');
  }
  const passive = (pins) => ({ pins: pins.map((id) => ({ id, role: 'passive', voltageMin: 0, voltageMax: 3.3 })) });
  const definitions = new Map([[board.type, board], ['resistor.fixed-v1', passive(['A', 'B'])],
    ['led.basic-v1', passive(['ANODE', 'CATHODE'])],
    ...Object.entries(BOUNDED_3V3_AUTHORING_CONTRACTS.components)]);
  const instances = new Map();
  for (const component of components) {
    if (!component || typeof component.id !== 'string' || instances.has(component.id)) {
      return failure('AUTHORING_COMPONENT_ID_INVALID');
    }
    const definition = definitions.get(component.type);
    if (!definition) return failure('AUTHORING_COMPONENT_UNSUPPORTED', { componentId: component.id, type: component.type });
    if ([MOMENTARY_BUTTON_3V3_TYPE, TOGGLE_SWITCH_3V3_TYPE].includes(component.type)
        && component.properties?.defaultClosed === true) {
      return failure('AUTHORING_CLOSED_CONTACT_UNSUPPORTED', { componentId: component.id });
    }
    if (component.type === POTENTIOMETER_3V3_TYPE
        && (component.properties?.taper !== 'linear' || !Number.isFinite(component.properties?.ohms)
          || component.properties.ohms < 1 || component.properties.ohms > 10_000_000)) {
      return failure('AUTHORING_POTENTIOMETER_PROPERTIES_UNSUPPORTED', { componentId: component.id });
    }
    if (PASSIVE_ENERGY_STORAGE_DEFINITIONS[component.type]
        && !validatePassiveEnergyStorageComponent(component)) {
      return failure('AUTHORING_PASSIVE_PROPERTIES_UNSUPPORTED', { componentId: component.id });
    }
    if (DIODE_COMPONENT_DEFINITIONS[component.type] && !validateDiodeComponent(component)) {
      return failure('AUTHORING_DIODE_PROPERTIES_UNSUPPORTED', { componentId: component.id });
    }
    if (TRANSISTOR_COMPONENT_DEFINITIONS[component.type] && !validateTransistorComponent(component)) {
      return failure('AUTHORING_TRANSISTOR_PROPERTIES_UNSUPPORTED', { componentId: component.id });
    }
    if (CIRCUIT_PROTECTION_DEFINITIONS[component.type]
        && !validateCircuitProtectionComponent(component)) {
      return failure('AUTHORING_CIRCUIT_PROTECTION_PROPERTIES_UNSUPPORTED',
        { componentId: component.id });
    }
    if (CONNECTION_HARDWARE_DEFINITIONS[component.type]
        && !validateConnectionHardwareComponent(component)) {
      return failure('AUTHORING_CONNECTION_HARDWARE_STATE_UNSUPPORTED',
        { componentId: component.id });
    }
    if (SEMICONDUCTOR_ACTIVE_DEFINITIONS[component.type]
        && !validateSemiconductorActiveComponent(component)) {
      return failure('AUTHORING_SEMICONDUCTOR_ACTIVE_PROPERTIES_UNSUPPORTED', { componentId: component.id });
    }
    instances.set(component.id, definition);
  }
  const used = new Set();
  for (const net of nets) {
    if (!net || typeof net.id !== 'string' || !Array.isArray(net.endpoints)
        || net.endpoints.length < 2 || net.endpoints.length > 8) return failure('AUTHORING_NET_INVALID', { netId: net?.id });
    let source = false; let sourceCount = 0; let ground = false;
    for (const endpoint of net.endpoints) {
      const definition = instances.get(endpoint?.component);
      const pin = definition?.pins.find(({ id }) => id === endpoint?.pin);
      if (!pin) return failure('AUTHORING_ENDPOINT_UNSUPPORTED', { endpoint });
      if (used.has(key(endpoint))) return failure('AUTHORING_ENDPOINT_REUSED', { endpoint });
      used.add(key(endpoint));
      const output = ['digital-io', 'digital-output'].includes(pin.role) || pin.voltageMax === 3.3 && pin.role === 'source';
      source ||= output; sourceCount += output ? 1 : 0;
      ground ||= pin.role === 'ground';
      if (pin.voltageMin < 0 || pin.voltageMax > 3.3) return failure('AUTHORING_VOLTAGE_UNSUPPORTED', { endpoint });
    }
    if (sourceCount > 1) return failure('AUTHORING_OUTPUT_CONFLICT', { netId: net.id });
    if (source && ground) return failure('AUTHORING_DIRECT_SOURCE_GROUND_SHORT', { netId: net.id });
  }
  return { ok: true, code: 'AUTHORING_GRAPH_ACCEPTED_DATA_ONLY', executable: false,
    schema: BOUNDED_3V3_AUTHORING_SCHEMA };
}
