// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';
import {
  createIdealThreePinAnaloguePins,
  projectIdealThreePinAnalogueModules,
} from './ideal-three-pin-analogue-module-v1.mjs';

export const LDR_DIVIDER_TYPE = 'sensor.ldr-divider-v1';
export const NTC_DIVIDER_TYPE = 'sensor.ntc-10k-divider-v1';
export const FLEX_DIVIDER_TYPE = 'sensor.flex-divider-v1';
export const DIVIDER_FIXED_OHMS = 10_000;

const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const voltageWithSensorHigh = (sensorOhms) => 5 * DIVIDER_FIXED_OHMS
  / (sensorOhms + DIVIDER_FIXED_OHMS);
const pins = () => createIdealThreePinAnaloguePins('Divider midpoint output');
const artwork = (renderer) => ({ renderer, thumbnail: renderer, viewBox: [0, 0, 132, 106],
  cssWidth: 132, cssHeight: 106,
  provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
  license: 'Apache-2.0' });
const catalog = (aliases, functions, packageName) => ({ category: 'sensors', aliases, functions,
  interfaces: ['analogue'], supplyVolts: { min: 5, max: 5 }, package: packageName });

const SPECS = freeze({
  [LDR_DIVIDER_TYPE]: {
    family: 'sensor.light-dependent-resistor-divider', displayName: 'LDR voltage-divider module',
    partNumber: 'IL-LDR-DIV-10K', renderer: 'sensor-ldr-divider', controlKey: 'lightLevel',
    control: { label: 'Relative light', minimum: 0, maximum: 1, step: 0.01, default: 0.5 },
    aliases: ['LDR', 'photoresistor', 'light dependent resistor divider'],
    functions: ['relative light input', 'analogue voltage divider'], package: 'LDR plus fixed 10 kΩ divider',
    limitations: [
      'Ideal integrated divider: an LDR high side and fixed 10 kΩ low side drive AOUT from a fixed 5 V supply.',
      'The teaching curve interpolates LDR resistance logarithmically from 1 MΩ dark to 1 kΩ bright; it is not a lux calibration or a specific physical part curve.',
    ],
  },
  [NTC_DIVIDER_TYPE]: {
    family: 'sensor.ntc-thermistor-divider', displayName: '10 kΩ NTC thermistor divider',
    partNumber: 'IL-NTC-10K-B3950-DIV', renderer: 'sensor-ntc-divider', controlKey: 'temperatureC',
    control: { label: 'Temperature', minimum: -40, maximum: 125, step: 0.5, default: 25 },
    aliases: ['NTC thermistor', '10k thermistor', 'B3950 divider'],
    functions: ['temperature input', 'analogue voltage divider'], package: '10 kΩ B3950 NTC plus fixed 10 kΩ divider',
    limitations: [
      'Ideal integrated divider: a 10 kΩ at 25 °C, B3950 NTC high side and fixed 10 kΩ low side drive AOUT from 5 V.',
      'No tolerance, self-heating, thermal lag, dissipation factor, calibration error or physical package behavior is modelled.',
    ],
  },
  [FLEX_DIVIDER_TYPE]: {
    family: 'sensor.flex-resistor-divider', displayName: 'Flex sensor voltage divider',
    partNumber: 'IL-FLEX-DIV-10K', renderer: 'sensor-flex-divider', controlKey: 'bendRatio',
    control: { label: 'Bend', minimum: 0, maximum: 1, step: 0.01, default: 0 },
    aliases: ['flex sensor', 'bend sensor', 'flex resistor divider'],
    functions: ['bend input', 'analogue voltage divider'], package: 'flex resistor plus fixed 10 kΩ divider',
    limitations: [
      'Ideal integrated divider: a high-side flex resistor rises linearly from 10 kΩ flat to 40 kΩ at maximum authored bend, above a fixed 10 kΩ low side.',
      'No bend angle, direction, hysteresis, fatigue, tolerance, response time or physical force accuracy is modelled.',
    ],
  },
});

function definition(type, spec) {
  return freeze({
    family: spec.family, variant: 'ideal-integrated-five-volt-divider', type, version: 1,
    displayName: spec.displayName, manufacturer: 'Intent Learning', partNumber: spec.partNumber,
    pins: pins(), propertyKeys: [], propertySchema: {}, controlKeys: [spec.controlKey],
    control: spec.control, modelRef: `model.${type}-ideal`, internalTerminalGroups: [], selectable: true,
    artwork: artwork(spec.renderer), catalog: catalog(spec.aliases, spec.functions, spec.package),
    support: { status: 'simulated', limitations: [...spec.limitations,
      'This is a three-terminal integrated divider model, not a general two-terminal resistor or arbitrary analogue-network solver.',
      'AOUT must connect directly and exclusively to one A0–A5 input on the supported 5 V AVR controller.' ] },
  });
}

export const RESISTIVE_DIVIDER_SENSOR_DEFINITIONS = freeze(Object.fromEntries(
  Object.entries(SPECS).map(([type, spec]) => [type, definition(type, spec)]),
));

export function resistiveDividerSensorResistance(type, value) {
  if (type === LDR_DIVIDER_TYPE) return 1_000_000 * (1_000 / 1_000_000) ** value;
  if (type === NTC_DIVIDER_TYPE) {
    const kelvin = value + 273.15;
    return 10_000 * Math.exp(3950 * ((1 / kelvin) - (1 / 298.15)));
  }
  if (type === FLEX_DIVIDER_TYPE) return 10_000 + 30_000 * value;
  throw new TypeError('RESISTIVE_DIVIDER_SENSOR_TYPE');
}

export function resistiveDividerSensorVoltage(type, value) {
  return clamp(voltageWithSensorHigh(resistiveDividerSensorResistance(type, value)), 0, 5);
}

export function createResistiveDividerSensor(type, id) {
  const definitionValue = RESISTIVE_DIVIDER_SENSOR_DEFINITIONS[type];
  if (!definitionValue) throw new TypeError('RESISTIVE_DIVIDER_SENSOR_TYPE');
  return { id, type, label: definitionValue.displayName, properties: {},
    controls: { [definitionValue.controlKeys[0]]: definitionValue.control.default } };
}

export function resistiveDividerSensorValue(component) {
  const definitionValue = RESISTIVE_DIVIDER_SENSOR_DEFINITIONS[component?.type];
  return definitionValue ? component.controls?.[definitionValue.controlKeys[0]] : undefined;
}

export function validateResistiveDividerSensor(component) {
  const definitionValue = RESISTIVE_DIVIDER_SENSOR_DEFINITIONS[component?.type];
  if (!definitionValue || !exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
      || typeof component.id !== 'string' || !component.id || typeof component.label !== 'string'
      || !exactKeys(component.properties, [])
      || !exactKeys(component.controls, definitionValue.controlKeys)) return false;
  const value = resistiveDividerSensorValue(component);
  return Number.isFinite(value) && value >= definitionValue.control.minimum
    && value <= definitionValue.control.maximum;
}

export function projectResistiveDividerSensors(value) {
  let runtimeGraph = structuredClone(value); const sensors = [];
  for (const type of Object.keys(RESISTIVE_DIVIDER_SENSOR_DEFINITIONS)) {
    const definitionValue = RESISTIVE_DIVIDER_SENSOR_DEFINITIONS[type];
    const projected = projectIdealThreePinAnalogueModules(runtimeGraph, {
      type, diagnosticPrefix: 'RESISTIVE_DIVIDER_SENSOR',
      validateComponent: validateResistiveDividerSensor,
      controlKey: definitionValue.controlKeys[0],
      valueToVoltage: (controlValue) => resistiveDividerSensorVoltage(type, controlValue),
      transferModel: `${type}-integrated-10k-divider`,
    });
    if (!projected.ok) return projected;
    runtimeGraph = projected.runtimeGraph;
    sensors.push(...projected.modules.map((module) => ({ componentId: module.componentId,
      type, boardPin: module.boardPin, controlKey: module.controlKey, controlValue: module.controlValue,
      resistanceOhms: resistiveDividerSensorResistance(type, module.controlValue),
      voltage: module.voltage, supplyVolts: module.supplyVolts, transferModel: module.transferModel })));
  }
  return { ok: true, runtimeGraph, sensors };
}
