// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';
import {
  createIdealThreePinPoweredModulePins,
  inspectIdealThreePinPoweredModules,
} from './ideal-three-pin-analogue-module-v1.mjs';

export const DIGITAL_LIGHT_THRESHOLD_TYPE = 'sensor.light-threshold-digital-v1';
export const DIGITAL_LIGHT_THRESHOLD_MODEL = 'model.light-threshold-digital-ideal-v1';
export const DIGITAL_LIGHT_THRESHOLD_RENDERER = 'sensor-light-threshold-digital';
export const DIGITAL_LIGHT_THRESHOLD_RUNTIME_TYPE = 'button.momentary-v1';
export const LIGHT_LEVEL_MIN_PERCENT = 0;
export const LIGHT_LEVEL_MAX_PERCENT = 100;
export const LIGHT_THRESHOLD_MIN_PERCENT = 10;
export const LIGHT_THRESHOLD_MAX_PERCENT = 100;
export const LIGHT_HYSTERESIS_MIN_POINTS = 0;
export const LIGHT_HYSTERESIS_MAX_POINTS = 10;

const clone = (value) => structuredClone(value);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function validInputs(lightLevelPercent, thresholdPercent, hysteresisPercentagePoints) {
  return Number.isFinite(lightLevelPercent)
    && lightLevelPercent >= LIGHT_LEVEL_MIN_PERCENT
    && lightLevelPercent <= LIGHT_LEVEL_MAX_PERCENT
    && Number.isFinite(thresholdPercent)
    && thresholdPercent >= LIGHT_THRESHOLD_MIN_PERCENT
    && thresholdPercent <= LIGHT_THRESHOLD_MAX_PERCENT
    && Number.isFinite(hysteresisPercentagePoints)
    && hysteresisPercentagePoints >= LIGHT_HYSTERESIS_MIN_POINTS
    && hysteresisPercentagePoints <= LIGHT_HYSTERESIS_MAX_POINTS;
}

export function nextDigitalLightThresholdActive({
  currentActive,
  lightLevelPercent,
  thresholdPercent,
  hysteresisPercentagePoints,
}) {
  if (typeof currentActive !== 'boolean'
      || !validInputs(lightLevelPercent, thresholdPercent, hysteresisPercentagePoints)) {
    throw new TypeError('DIGITAL_LIGHT_THRESHOLD_RANGE');
  }
  if (lightLevelPercent >= thresholdPercent) return true;
  if (lightLevelPercent <= thresholdPercent - hysteresisPercentagePoints) return false;
  return currentActive;
}

export const DIGITAL_LIGHT_THRESHOLD_DEFINITION = deepFreeze({
  family: 'sensor.light-threshold-digital',
  variant: 'ideal-active-low-hysteresis-module',
  type: DIGITAL_LIGHT_THRESHOLD_TYPE,
  version: 1,
  displayName: 'Digital light threshold module',
  manufacturer: 'Intent Learning',
  partNumber: 'IL-SENSE-LIGHT-D1',
  pins: createIdealThreePinPoweredModulePins({
    id: 'DOUT', label: 'Active-low digital threshold output', role: 'digital-out',
    signals: ['digital.active-low'], capabilities: ['digital.active-low'],
    constraints: { voltageMin: 0, voltageMax: 5 }, anchor: { x: 0.82, y: 0.92 },
  }),
  propertyKeys: [],
  propertySchema: {},
  controlKeys: [
    'lightLevelPercent', 'thresholdPercent', 'hysteresisPercentagePoints', 'outputActive',
  ],
  modelRef: DIGITAL_LIGHT_THRESHOLD_MODEL,
  internalTerminalGroups: [],
  selectable: true,
  artwork: {
    renderer: DIGITAL_LIGHT_THRESHOLD_RENDERER,
    thumbnail: DIGITAL_LIGHT_THRESHOLD_RENDERER,
    viewBox: [0, 0, 120, 100], cssWidth: 120, cssHeight: 100,
    provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
    license: 'Apache-2.0',
  },
  catalog: {
    category: 'sensors',
    aliases: ['digital light threshold', 'light comparator', 'light switch module'],
    functions: ['digital input', 'threshold detector', 'hysteresis demonstration'],
    interfaces: ['GPIO'],
    supplyVolts: { min: 5, max: 5 },
    package: 'virtual three-pin digital threshold module',
  },
  support: {
    status: 'simulated',
    limitations: [
      'Generic idealized signal only: input and threshold are percentages; hysteresis is measured in percentage points.',
      'DOUT is active LOW: it activates at input >= threshold, deactivates at input <= threshold - hysteresis, and retains its prior state inside that band.',
      'No lux calibration, physical detector curve, propagation delay, electrical loading, tolerance, noise or ambient-light physics is modelled.',
      'DOUT must connect directly and exclusively to one D2–D12 INPUT_PULLUP pin on the supported 5 V AVR controller.',
    ],
  },
});

export function validateDigitalLightThresholdDefinition(
  definition = DIGITAL_LIGHT_THRESHOLD_DEFINITION,
) {
  return exactKeys(definition, [
    'family', 'variant', 'type', 'version', 'displayName', 'manufacturer', 'partNumber',
    'pins', 'propertyKeys', 'propertySchema', 'controlKeys', 'modelRef',
    'internalTerminalGroups', 'selectable', 'artwork', 'catalog', 'support',
  ]) && JSON.stringify(definition) === JSON.stringify(DIGITAL_LIGHT_THRESHOLD_DEFINITION);
}

export function createDigitalLightThresholdComponent(
  id,
  label = 'Digital light threshold module',
  {
    lightLevelPercent = 40,
    thresholdPercent = 50,
    hysteresisPercentagePoints = 5,
    outputActive = null,
  } = {},
) {
  if (!validInputs(lightLevelPercent, thresholdPercent, hysteresisPercentagePoints)
      || ![null, true, false].includes(outputActive)) {
    throw new TypeError('DIGITAL_LIGHT_THRESHOLD_RANGE');
  }
  const resolvedOutput = outputActive ?? nextDigitalLightThresholdActive({
    currentActive: false,
    lightLevelPercent,
    thresholdPercent,
    hysteresisPercentagePoints,
  });
  const component = {
    id,
    type: DIGITAL_LIGHT_THRESHOLD_TYPE,
    label,
    properties: {},
    controls: {
      lightLevelPercent,
      thresholdPercent,
      hysteresisPercentagePoints,
      outputActive: resolvedOutput,
    },
  };
  if (!validateDigitalLightThresholdComponent(component)) {
    throw new TypeError('DIGITAL_LIGHT_THRESHOLD_STATE');
  }
  return component;
}

export function validateDigitalLightThresholdComponent(component) {
  if (!exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
      || component.type !== DIGITAL_LIGHT_THRESHOLD_TYPE
      || !exactKeys(component.properties, [])
      || !exactKeys(component.controls, [
        'lightLevelPercent', 'thresholdPercent', 'hysteresisPercentagePoints', 'outputActive',
      ])) return false;
  const {
    lightLevelPercent, thresholdPercent, hysteresisPercentagePoints, outputActive,
  } = component.controls;
  if (!validInputs(lightLevelPercent, thresholdPercent, hysteresisPercentagePoints)
      || typeof outputActive !== 'boolean') return false;
  if (lightLevelPercent >= thresholdPercent) return outputActive;
  if (lightLevelPercent <= thresholdPercent - hysteresisPercentagePoints) return !outputActive;
  return true;
}

export function updateDigitalLightThresholdControl(component, key, value) {
  if (!validateDigitalLightThresholdComponent(component)
      || !['lightLevelPercent', 'thresholdPercent', 'hysteresisPercentagePoints'].includes(key)) {
    throw new TypeError('DIGITAL_LIGHT_THRESHOLD_CONTROL');
  }
  const next = clone(component);
  next.controls[key] = value;
  const {
    lightLevelPercent, thresholdPercent, hysteresisPercentagePoints,
  } = next.controls;
  next.controls.outputActive = nextDigitalLightThresholdActive({
    currentActive: component.controls.outputActive,
    lightLevelPercent,
    thresholdPercent,
    hysteresisPercentagePoints,
  });
  if (!validateDigitalLightThresholdComponent(next)) {
    throw new TypeError('DIGITAL_LIGHT_THRESHOLD_STATE');
  }
  return next;
}

export function projectDigitalLightThresholdModules(value) {
  const inspected = inspectIdealThreePinPoweredModules(value, {
    type: DIGITAL_LIGHT_THRESHOLD_TYPE,
    diagnosticPrefix: 'DIGITAL_LIGHT_THRESHOLD',
    validateComponent: validateDigitalLightThresholdComponent,
    outputPinId: 'DOUT',
    outputBoardPin: (pin) => /^D(?:[2-9]|1[0-2])$/u.test(pin),
    outputRequiresSuffix: 'DOUT_REQUIRES_DIGITAL_INPUT',
  });
  if (!inspected.ok) return inspected;
  const moduleIds = new Set(inspected.modules.map((module) => module.componentId));
  const recordById = new Map(inspected.modules.map((module) => [module.componentId, module]));
  const runtimeGraph = inspected.runtimeGraph;
  runtimeGraph.components = runtimeGraph.components.map((component) => moduleIds.has(component.id) ? {
    id: component.id,
    type: DIGITAL_LIGHT_THRESHOLD_RUNTIME_TYPE,
    label: component.label,
    properties: { normallyOpen: true },
    controls: { pressed: recordById.get(component.id).component.controls.outputActive },
  } : component);
  runtimeGraph.nets = runtimeGraph.nets.map((net) => ({
    id: net.id,
    endpoints: net.endpoints.flatMap((endpoint) => {
      if (!moduleIds.has(endpoint.component)) return [endpoint];
      if (endpoint.pin === 'VCC') return [];
      return [{ component: endpoint.component, pin: endpoint.pin === 'GND' ? 'B' : 'A' }];
    }),
  })).filter((net) => net.endpoints.length >= 2);
  const runtimeNetIds = new Set(runtimeGraph.nets.map((net) => net.id));
  runtimeGraph.junctions = runtimeGraph.junctions.filter((junction) => runtimeNetIds.has(junction.net));
  return {
    ok: true,
    runtimeGraph,
    modules: inspected.modules.map((module) => ({
      componentId: module.componentId,
      boardPin: module.boardPin,
      ...clone(module.component.controls),
      outputLevel: module.component.controls.outputActive ? 'LOW' : 'HIGH',
      activePolarity: 'LOW',
      runtimeAdapter: DIGITAL_LIGHT_THRESHOLD_RUNTIME_TYPE,
    })),
  };
}
