// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';
import {
  IDEAL_ANALOGUE_MODULE_RUNTIME_TYPE,
  createIdealThreePinAnaloguePins,
  projectIdealThreePinAnalogueModules,
} from './ideal-three-pin-analogue-module-v1.mjs';

export const LIGHT_ANALOGUE_SENSOR_TYPE = 'sensor.light-analogue-v1';
export const LIGHT_ANALOGUE_SENSOR_MODEL = 'model.light-analogue-ideal-v1';
export const LIGHT_ANALOGUE_SENSOR_RENDERER = 'sensor-light-analogue';
export const LIGHT_ANALOGUE_SENSOR_RUNTIME_TYPE = IDEAL_ANALOGUE_MODULE_RUNTIME_TYPE;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const LIGHT_ANALOGUE_SENSOR_DEFINITION = deepFreeze({
  family: 'sensor.light-analogue',
  variant: 'ideal-linear-three-pin-module',
  type: LIGHT_ANALOGUE_SENSOR_TYPE,
  version: 1,
  displayName: 'Analogue light sensor module',
  manufacturer: 'Intent Learning',
  partNumber: 'IL-SENSE-LIGHT-A1',
  pins: createIdealThreePinAnaloguePins(),
  propertyKeys: [],
  propertySchema: {},
  controlKeys: ['lightLevel'],
  modelRef: LIGHT_ANALOGUE_SENSOR_MODEL,
  internalTerminalGroups: [],
  selectable: true,
  artwork: {
    renderer: LIGHT_ANALOGUE_SENSOR_RENDERER,
    thumbnail: LIGHT_ANALOGUE_SENSOR_RENDERER,
    viewBox: [0, 0, 120, 100], cssWidth: 120, cssHeight: 100,
    provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
    license: 'Apache-2.0',
  },
  catalog: {
    category: 'sensors',
    aliases: ['light sensor', 'analogue light module', 'photo sensor'],
    functions: ['analogue input', 'controlled sensor signal'],
    interfaces: ['analogue'],
    supplyVolts: { min: 5, max: 5 },
    package: 'virtual three-pin analogue module',
  },
  support: {
    status: 'simulated',
    limitations: [
      'Idealized module signal only: light level maps linearly to 0–5 V on AOUT from a fixed 5 V supply.',
      'No lux calibration, physical LDR curve, loading, tolerance, noise, response time or ambient-light physics is modelled.',
      'AOUT must connect directly and exclusively to one A0–A5 input on the supported 5 V AVR controller.',
    ],
  },
});

export function validateLightAnalogueSensorDefinition(definition = LIGHT_ANALOGUE_SENSOR_DEFINITION) {
  return exactKeys(definition, [
    'family', 'variant', 'type', 'version', 'displayName', 'manufacturer', 'partNumber',
    'pins', 'propertyKeys', 'propertySchema', 'controlKeys', 'modelRef',
    'internalTerminalGroups', 'selectable', 'artwork', 'catalog', 'support',
  ]) && JSON.stringify(definition) === JSON.stringify(LIGHT_ANALOGUE_SENSOR_DEFINITION);
}

export function createLightAnalogueSensorComponent(
  id,
  label = 'Analogue light sensor',
  { lightLevel = 0.5 } = {},
) {
  if (!Number.isFinite(lightLevel) || lightLevel < 0 || lightLevel > 1) {
    throw new TypeError('LIGHT_SENSOR_LEVEL_RANGE');
  }
  return {
    id,
    type: LIGHT_ANALOGUE_SENSOR_TYPE,
    label,
    properties: {},
    controls: { lightLevel },
  };
}

export function validateLightAnalogueSensorComponent(component) {
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && component.type === LIGHT_ANALOGUE_SENSOR_TYPE
    && exactKeys(component.properties, [])
    && exactKeys(component.controls, ['lightLevel'])
    && Number.isFinite(component.controls.lightLevel)
    && component.controls.lightLevel >= 0
    && component.controls.lightLevel <= 1;
}

export function projectLightAnalogueSensors(value) {
  const projected = projectIdealThreePinAnalogueModules(value, {
    type: LIGHT_ANALOGUE_SENSOR_TYPE,
    diagnosticPrefix: 'LIGHT_SENSOR',
    validateComponent: validateLightAnalogueSensorComponent,
    controlKey: 'lightLevel',
    valueToVoltage: (lightLevel) => lightLevel * 5,
    transferModel: 'ideal-linear-module-signal',
  });
  if (!projected.ok) return projected;
  return {
    ok: true,
    runtimeGraph: projected.runtimeGraph,
    sensors: projected.modules.map((module) => ({
      componentId: module.componentId,
      boardPin: module.boardPin,
      lightLevel: module.controlValue,
      voltage: module.voltage,
      supplyVolts: module.supplyVolts,
      transferModel: module.transferModel,
    })),
  };
}
