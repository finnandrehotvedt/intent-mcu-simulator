// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';
import {
  IDEAL_ANALOGUE_MODULE_RUNTIME_TYPE,
  createIdealThreePinAnaloguePins,
  projectIdealThreePinAnalogueModules,
} from './ideal-three-pin-analogue-module-v1.mjs';

export const TEMPERATURE_ANALOGUE_SENSOR_TYPE = 'sensor.temperature-analogue-v1';
export const TEMPERATURE_ANALOGUE_SENSOR_MODEL = 'model.temperature-analogue-ideal-v1';
export const TEMPERATURE_ANALOGUE_SENSOR_RENDERER = 'sensor-temperature-analogue';
export const TEMPERATURE_ANALOGUE_SENSOR_RUNTIME_TYPE = IDEAL_ANALOGUE_MODULE_RUNTIME_TYPE;
export const TEMPERATURE_MIN_C = -50;
export const TEMPERATURE_MAX_C = 150;
export const TEMPERATURE_C_PER_VOLT = 40;
export const TEMPERATURE_ZERO_VOLT_C = -50;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function temperatureCToVoltage(temperatureC) {
  if (!Number.isFinite(temperatureC) || temperatureC < TEMPERATURE_MIN_C
      || temperatureC > TEMPERATURE_MAX_C) throw new TypeError('TEMPERATURE_SENSOR_RANGE');
  return (temperatureC - TEMPERATURE_ZERO_VOLT_C) / TEMPERATURE_C_PER_VOLT;
}

export function voltageToTemperatureC(voltage) {
  if (!Number.isFinite(voltage) || voltage < 0 || voltage > 5) {
    throw new TypeError('TEMPERATURE_SENSOR_VOLTAGE_RANGE');
  }
  return voltage * TEMPERATURE_C_PER_VOLT + TEMPERATURE_ZERO_VOLT_C;
}

export const TEMPERATURE_ANALOGUE_SENSOR_DEFINITION = deepFreeze({
  family: 'sensor.temperature-analogue',
  variant: 'ideal-linear-three-pin-module',
  type: TEMPERATURE_ANALOGUE_SENSOR_TYPE,
  version: 1,
  displayName: 'Analogue temperature module',
  manufacturer: 'Intent Learning',
  partNumber: 'IL-SENSE-TEMP-A1',
  pins: createIdealThreePinAnaloguePins('Ideal temperature signal'),
  propertyKeys: [],
  propertySchema: {},
  controlKeys: ['temperatureC'],
  modelRef: TEMPERATURE_ANALOGUE_SENSOR_MODEL,
  internalTerminalGroups: [],
  selectable: true,
  artwork: {
    renderer: TEMPERATURE_ANALOGUE_SENSOR_RENDERER,
    thumbnail: TEMPERATURE_ANALOGUE_SENSOR_RENDERER,
    viewBox: [0, 0, 120, 100], cssWidth: 120, cssHeight: 100,
    provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
    license: 'Apache-2.0',
  },
  catalog: {
    category: 'sensors',
    aliases: ['temperature sensor', 'analogue temperature module', 'thermal signal'],
    functions: ['analogue input', 'controlled temperature signal'],
    interfaces: ['analogue'],
    supplyVolts: { min: 5, max: 5 },
    package: 'virtual three-pin analogue module',
  },
  support: {
    status: 'simulated',
    limitations: [
      'Idealized generic module only: -50 to 150 °C maps linearly to 0–5 V using AOUT = (temperatureC + 50) / 40 V.',
      'No physical-sensor accuracy, calibration error, self-heating, thermal lag, loading, tolerance or noise is modelled.',
      'AOUT must connect directly and exclusively to one A0–A5 input on the supported 5 V AVR controller.',
    ],
  },
});

export function validateTemperatureAnalogueSensorDefinition(
  definition = TEMPERATURE_ANALOGUE_SENSOR_DEFINITION,
) {
  return exactKeys(definition, [
    'family', 'variant', 'type', 'version', 'displayName', 'manufacturer', 'partNumber',
    'pins', 'propertyKeys', 'propertySchema', 'controlKeys', 'modelRef',
    'internalTerminalGroups', 'selectable', 'artwork', 'catalog', 'support',
  ]) && JSON.stringify(definition) === JSON.stringify(TEMPERATURE_ANALOGUE_SENSOR_DEFINITION);
}

export function createTemperatureAnalogueSensorComponent(
  id,
  label = 'Analogue temperature module',
  { temperatureC = 25 } = {},
) {
  temperatureCToVoltage(temperatureC);
  return {
    id,
    type: TEMPERATURE_ANALOGUE_SENSOR_TYPE,
    label,
    properties: {},
    controls: { temperatureC },
  };
}

export function validateTemperatureAnalogueSensorComponent(component) {
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && component.type === TEMPERATURE_ANALOGUE_SENSOR_TYPE
    && exactKeys(component.properties, [])
    && exactKeys(component.controls, ['temperatureC'])
    && Number.isFinite(component.controls.temperatureC)
    && component.controls.temperatureC >= TEMPERATURE_MIN_C
    && component.controls.temperatureC <= TEMPERATURE_MAX_C;
}

export function projectTemperatureAnalogueSensors(value) {
  const projected = projectIdealThreePinAnalogueModules(value, {
    type: TEMPERATURE_ANALOGUE_SENSOR_TYPE,
    diagnosticPrefix: 'TEMPERATURE_SENSOR',
    validateComponent: validateTemperatureAnalogueSensorComponent,
    controlKey: 'temperatureC',
    valueToVoltage: temperatureCToVoltage,
    transferModel: 'ideal-linear-minus50-to-150c-0-to-5v',
  });
  if (!projected.ok) return projected;
  return {
    ok: true,
    runtimeGraph: projected.runtimeGraph,
    sensors: projected.modules.map((module) => ({
      componentId: module.componentId,
      boardPin: module.boardPin,
      temperatureC: module.controlValue,
      voltage: module.voltage,
      supplyVolts: module.supplyVolts,
      transferModel: module.transferModel,
    })),
  };
}
