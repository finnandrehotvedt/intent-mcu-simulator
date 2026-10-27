// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';
import {
  IDEAL_ANALOGUE_MODULE_RUNTIME_TYPE,
  createIdealThreePinAnaloguePins,
  projectIdealThreePinAnalogueModules,
} from './ideal-three-pin-analogue-module-v1.mjs';

export const WIND_DIRECTION_ANALOGUE_TYPE = 'sensor.wind-direction-analogue-v1';
export const HALL_MAGNETIC_ANALOGUE_TYPE = 'sensor.hall-magnetic-analogue-v1';
export const ANALOGUE_DIRECTION_FIELD_RUNTIME_TYPE = IDEAL_ANALOGUE_MODULE_RUNTIME_TYPE;

const freeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
const artwork = (renderer) => ({ renderer, thumbnail: renderer, viewBox: [0, 0, 120, 100],
  cssWidth: 120, cssHeight: 100,
  provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
  license: 'Apache-2.0' });
function definition({ type, family, displayName, partNumber, renderer, controlKey, control,
  outputLabel, aliases, functions, signalDescription, omittedPhysics }) {
  return freeze({ family, variant: 'ideal-linear-three-pin-analogue-module', type, version: 1,
    displayName, manufacturer: 'Intent Learning', partNumber,
    pins: createIdealThreePinAnaloguePins(outputLabel), propertyKeys: [], propertySchema: {},
    controlKeys: [controlKey], control, modelRef: `model.${family}-ideal-v1`,
    internalTerminalGroups: [], selectable: true, artwork: artwork(renderer),
    catalog: { category: 'sensors', aliases, functions, interfaces: ['analogue'],
      supplyVolts: { min: 5, max: 5 }, package: 'virtual three-pin analogue direction/field module' },
    support: { status: 'simulated', limitations: [
      `Idealized module signal only: ${signalDescription} maps linearly to 0–5 V on AOUT.`,
      `No ${omittedPhysics} is modelled.`,
      'AOUT must connect directly and exclusively to one A0–A5 input on the supported 5 V AVR controller.',
    ] } });
}

export const ANALOGUE_DIRECTION_FIELD_DEFINITIONS = freeze({
  [WIND_DIRECTION_ANALOGUE_TYPE]: definition({
    type: WIND_DIRECTION_ANALOGUE_TYPE, family: 'sensor.wind-direction-analogue',
    displayName: 'Analogue wind direction sensor', partNumber: 'IL-WIND-DIRECTION-A1',
    renderer: 'sensor-wind-direction-analogue', controlKey: 'directionDegrees',
    control: { minimum: 0, maximum: 360, default: 180, unit: '°' },
    outputLabel: 'Ideal wind direction signal', aliases: ['wind vane', 'analogue wind direction module'],
    functions: ['analogue direction input'], signalDescription: '0° to 360° ideal direction',
    omittedPhysics: 'physical vane, wind speed, compass reference, north alignment, wrap dead band, resistance ladder, calibration, loading, tolerance, noise or response time',
  }),
  [HALL_MAGNETIC_ANALOGUE_TYPE]: definition({
    type: HALL_MAGNETIC_ANALOGUE_TYPE, family: 'sensor.hall-magnetic-analogue',
    displayName: 'Analogue Hall field sensor', partNumber: 'IL-HALL-A1',
    renderer: 'sensor-hall-magnetic-analogue', controlKey: 'magneticFieldRatio',
    control: { minimum: -1, maximum: 1, default: 0, unit: 'signed ratio' },
    outputLabel: 'Ideal bipolar magnetic field signal', aliases: ['linear Hall sensor', 'analogue magnetic sensor'],
    functions: ['analogue bipolar field-response input'],
    signalDescription: '−1 negative through 0 neutral to +1 positive ideal response',
    omittedPhysics: 'tesla or gauss calibration, magnet identity, field geometry, distance, orientation, saturation, hysteresis, temperature drift, loading, tolerance, noise or response time',
  }),
});

export function createAnalogueDirectionFieldSensor(type, id) {
  const definitionValue = ANALOGUE_DIRECTION_FIELD_DEFINITIONS[type];
  if (!definitionValue) throw new TypeError('ANALOGUE_DIRECTION_FIELD_TYPE');
  const key = definitionValue.controlKeys[0];
  return { id, type, label: definitionValue.displayName, properties: {},
    controls: { [key]: definitionValue.control.default } };
}

export function validateAnalogueDirectionFieldSensor(component) {
  const definitionValue = ANALOGUE_DIRECTION_FIELD_DEFINITIONS[component?.type];
  if (!definitionValue) return false;
  const key = definitionValue.controlKeys[0];
  const control = definitionValue.control;
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && typeof component.id === 'string' && typeof component.label === 'string'
    && exactKeys(component.properties, []) && exactKeys(component.controls, [key])
    && Number.isFinite(component.controls[key])
    && component.controls[key] >= control.minimum && component.controls[key] <= control.maximum;
}

export function analogueDirectionFieldValue(component) {
  if (!validateAnalogueDirectionFieldSensor(component)) throw new TypeError('ANALOGUE_DIRECTION_FIELD_STATE');
  return component.controls[ANALOGUE_DIRECTION_FIELD_DEFINITIONS[component.type].controlKeys[0]];
}

export function analogueDirectionFieldVoltage(type, value) {
  if (type === WIND_DIRECTION_ANALOGUE_TYPE) return value / 72;
  if (type === HALL_MAGNETIC_ANALOGUE_TYPE) return (value + 1) * 2.5;
  throw new TypeError('ANALOGUE_DIRECTION_FIELD_TYPE');
}

export function projectAnalogueDirectionFieldSensors(value) {
  let runtimeGraph = structuredClone(value);
  const sensors = [];
  for (const type of [WIND_DIRECTION_ANALOGUE_TYPE, HALL_MAGNETIC_ANALOGUE_TYPE]) {
    const definitionValue = ANALOGUE_DIRECTION_FIELD_DEFINITIONS[type];
    const controlKey = definitionValue.controlKeys[0];
    const projected = projectIdealThreePinAnalogueModules(runtimeGraph, {
      type,
      diagnosticPrefix: 'ANALOGUE_DIRECTION_FIELD_SENSOR',
      validateComponent: validateAnalogueDirectionFieldSensor,
      controlKey,
      valueToVoltage: (controlValue) => analogueDirectionFieldVoltage(type, controlValue),
      transferModel: type === WIND_DIRECTION_ANALOGUE_TYPE
        ? 'ideal-linear-direction-0-to-360deg-0-to-5v'
        : 'ideal-bipolar-field-ratio-minus1-to-plus1-0-to-5v',
    });
    if (!projected.ok) return projected;
    runtimeGraph = projected.runtimeGraph;
    sensors.push(...projected.modules.map((module) => ({
      componentId: module.componentId,
      type,
      boardPin: module.boardPin,
      controlKey,
      value: module.controlValue,
      voltage: module.voltage,
      supplyVolts: module.supplyVolts,
      transferModel: module.transferModel,
      runtimeAdapter: 'potentiometer.linear-v1-ideal-analogue-sensor-adapter',
    })));
  }
  return { ok: true, runtimeGraph, sensors };
}
