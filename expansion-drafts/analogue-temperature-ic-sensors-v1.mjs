// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';
import {
  IDEAL_ANALOGUE_MODULE_RUNTIME_TYPE,
  createIdealThreePinAnaloguePins,
  projectIdealThreePinAnalogueModules,
} from './ideal-three-pin-analogue-module-v1.mjs';

export const TMP36_TEMPERATURE_TYPE = 'sensor.tmp36-temperature-analogue-v1';
export const LM35_TEMPERATURE_TYPE = 'sensor.lm35-temperature-analogue-v1';
export const ANALOGUE_TEMPERATURE_IC_RUNTIME_TYPE = IDEAL_ANALOGUE_MODULE_RUNTIME_TYPE;

const freeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
const artwork = (renderer) => ({ renderer, thumbnail: renderer, viewBox: [0, 0, 120, 100],
  cssWidth: 120, cssHeight: 100,
  provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
  license: 'Apache-2.0' });
function definition({ type, family, displayName, manufacturer, partNumber, renderer,
  minimum, maximum, defaultValue, transfer, limitations }) {
  return freeze({ family, variant: 'ideal-temperature-transfer-three-pin-analogue-sensor',
    type, version: 1, displayName, manufacturer, partNumber,
    pins: createIdealThreePinAnaloguePins('Ideal temperature-proportional voltage'),
    propertyKeys: [], propertySchema: {}, controlKeys: ['temperatureC'],
    control: { minimum, maximum, default: defaultValue, unit: '°C' },
    modelRef: `model.${family}-ideal-v1`, internalTerminalGroups: [], selectable: true,
    artwork: artwork(renderer),
    catalog: { category: 'sensors', aliases: [partNumber.toLowerCase(), `${partNumber} temperature sensor`],
      functions: ['analogue temperature input'], interfaces: ['analogue'],
      supplyVolts: { min: 5, max: 5 },
      package: 'virtual three-pin transfer-function model; schematic terminals are not a package pinout' },
    support: { status: 'simulated', limitations: [
      `Idealized ${partNumber} transfer only: ${transfer}.`,
      limitations,
      'The schematic VCC/AOUT/GND terminal order is not a physical package-orientation guide; verify the real device datasheet before wiring hardware.',
      'AOUT must connect directly and exclusively to one A0–A5 input on the supported 5 V AVR controller.',
    ] } });
}

export const ANALOGUE_TEMPERATURE_IC_DEFINITIONS = freeze({
  [TMP36_TEMPERATURE_TYPE]: definition({
    type: TMP36_TEMPERATURE_TYPE, family: 'sensor.tmp36-temperature-analogue',
    displayName: 'TMP36 analogue temperature sensor', manufacturer: 'Analog Devices',
    partNumber: 'TMP36', renderer: 'sensor-tmp36-temperature-analogue',
    minimum: -40, maximum: 125, defaultValue: 25,
    transfer: '−40 to 125 °C maps with VOUT = 0.5 V + temperatureC × 0.01 V',
    limitations: 'No device tolerance, calibration error, supply rejection, output loading, self-heating, thermal lag, noise or absolute-maximum behavior is modelled',
  }),
  [LM35_TEMPERATURE_TYPE]: definition({
    type: LM35_TEMPERATURE_TYPE, family: 'sensor.lm35-temperature-analogue',
    displayName: 'LM35 analogue temperature sensor', manufacturer: 'Texas Instruments',
    partNumber: 'LM35', renderer: 'sensor-lm35-temperature-analogue',
    minimum: 0, maximum: 150, defaultValue: 25,
    transfer: '0 to 150 °C single-supply range maps with VOUT = temperatureC × 0.01 V',
    limitations: 'Negative-temperature circuitry, device tolerance, calibration error, output loading, self-heating, thermal lag, noise and absolute-maximum behavior are not modelled',
  }),
});

export function createAnalogueTemperatureIcSensor(type, id) {
  const definitionValue = ANALOGUE_TEMPERATURE_IC_DEFINITIONS[type];
  if (!definitionValue) throw new TypeError('ANALOGUE_TEMPERATURE_IC_TYPE');
  return { id, type, label: definitionValue.displayName, properties: {},
    controls: { temperatureC: definitionValue.control.default } };
}

export function validateAnalogueTemperatureIcSensor(component) {
  const definitionValue = ANALOGUE_TEMPERATURE_IC_DEFINITIONS[component?.type];
  return Boolean(definitionValue)
    && exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && typeof component.id === 'string' && typeof component.label === 'string'
    && exactKeys(component.properties, []) && exactKeys(component.controls, ['temperatureC'])
    && Number.isFinite(component.controls.temperatureC)
    && component.controls.temperatureC >= definitionValue.control.minimum
    && component.controls.temperatureC <= definitionValue.control.maximum;
}

export function analogueTemperatureIcValue(component) {
  if (!validateAnalogueTemperatureIcSensor(component)) {
    throw new TypeError('ANALOGUE_TEMPERATURE_IC_STATE');
  }
  return component.controls.temperatureC;
}

export function analogueTemperatureIcVoltage(type, temperatureC) {
  const definitionValue = ANALOGUE_TEMPERATURE_IC_DEFINITIONS[type];
  if (!definitionValue || !Number.isFinite(temperatureC)
      || temperatureC < definitionValue.control.minimum
      || temperatureC > definitionValue.control.maximum) {
    throw new TypeError('ANALOGUE_TEMPERATURE_IC_RANGE');
  }
  if (type === TMP36_TEMPERATURE_TYPE) return 0.5 + temperatureC * 0.01;
  if (type === LM35_TEMPERATURE_TYPE) return temperatureC * 0.01;
  throw new TypeError('ANALOGUE_TEMPERATURE_IC_TYPE');
}

export function projectAnalogueTemperatureIcSensors(value) {
  let runtimeGraph = structuredClone(value);
  const sensors = [];
  for (const type of [TMP36_TEMPERATURE_TYPE, LM35_TEMPERATURE_TYPE]) {
    const projected = projectIdealThreePinAnalogueModules(runtimeGraph, {
      type,
      diagnosticPrefix: 'ANALOGUE_TEMPERATURE_IC_SENSOR',
      validateComponent: validateAnalogueTemperatureIcSensor,
      controlKey: 'temperatureC',
      valueToVoltage: (controlValue) => analogueTemperatureIcVoltage(type, controlValue),
      transferModel: type === TMP36_TEMPERATURE_TYPE
        ? 'ideal-tmp36-10mv-per-celsius-with-500mv-offset'
        : 'ideal-lm35-10mv-per-celsius-single-supply-nonnegative',
    });
    if (!projected.ok) return projected;
    runtimeGraph = projected.runtimeGraph;
    sensors.push(...projected.modules.map((module) => ({
      componentId: module.componentId, type, boardPin: module.boardPin,
      controlKey: 'temperatureC', temperatureC: module.controlValue,
      voltage: module.voltage, supplyVolts: module.supplyVolts,
      transferModel: module.transferModel,
      runtimeAdapter: 'potentiometer.linear-v1-ideal-analogue-sensor-adapter',
    })));
  }
  return { ok: true, runtimeGraph, sensors };
}
