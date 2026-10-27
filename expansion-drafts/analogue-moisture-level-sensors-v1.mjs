// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';
import {
  IDEAL_ANALOGUE_MODULE_RUNTIME_TYPE,
  createIdealThreePinAnaloguePins,
  projectIdealThreePinAnalogueModules,
} from './ideal-three-pin-analogue-module-v1.mjs';

export const RESISTIVE_SOIL_MOISTURE_TYPE = 'sensor.soil-moisture-resistive-analogue-v1';
export const CAPACITIVE_SOIL_MOISTURE_TYPE = 'sensor.soil-moisture-capacitive-analogue-v1';
export const ANALOGUE_WATER_LEVEL_TYPE = 'sensor.water-level-analogue-v1';
export const ANALOGUE_MOISTURE_LEVEL_RUNTIME_TYPE = IDEAL_ANALOGUE_MODULE_RUNTIME_TYPE;

const freeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
const artwork = (renderer) => ({ renderer, thumbnail: renderer, viewBox: [0, 0, 120, 100],
  cssWidth: 120, cssHeight: 100,
  provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
  license: 'Apache-2.0' });
function definition({ type, family, displayName, partNumber, renderer, controlKey, outputLabel,
  aliases, functions, signalDescription, omittedPhysics }) {
  return freeze({ family, variant: 'ideal-linear-three-pin-analogue-module', type, version: 1,
    displayName, manufacturer: 'Intent Learning', partNumber,
    pins: createIdealThreePinAnaloguePins(outputLabel), propertyKeys: [], propertySchema: {},
    controlKeys: [controlKey], modelRef: `model.${family}-ideal-v1`, internalTerminalGroups: [],
    selectable: true, artwork: artwork(renderer), catalog: { category: 'sensors', aliases, functions,
      interfaces: ['analogue'], supplyVolts: { min: 5, max: 5 },
      package: 'virtual three-pin analogue environment module' },
    support: { status: 'simulated', limitations: [
      `Idealized module signal only: ${signalDescription} maps linearly to 0–5 V on AOUT.`,
      `No ${omittedPhysics} is modelled.`,
      'AOUT must connect directly and exclusively to one A0–A5 input on the supported 5 V AVR controller.',
    ] } });
}

export const ANALOGUE_MOISTURE_LEVEL_DEFINITIONS = freeze({
  [RESISTIVE_SOIL_MOISTURE_TYPE]: definition({
    type: RESISTIVE_SOIL_MOISTURE_TYPE, family: 'sensor.soil-moisture-resistive-analogue',
    displayName: 'Resistive soil moisture module', partNumber: 'IL-SOIL-RES-A1',
    renderer: 'sensor-soil-moisture-resistive', controlKey: 'moistureRatio',
    outputLabel: 'Ideal resistive moisture signal', aliases: ['soil moisture probe', 'resistive moisture sensor'],
    functions: ['analogue moisture input'], signalDescription: '0 dry to 1 wet',
    omittedPhysics: 'conductivity calibration, electrode corrosion, soil composition, salinity, temperature, polarization, loading, tolerance, noise or response time',
  }),
  [CAPACITIVE_SOIL_MOISTURE_TYPE]: definition({
    type: CAPACITIVE_SOIL_MOISTURE_TYPE, family: 'sensor.soil-moisture-capacitive-analogue',
    displayName: 'Capacitive soil moisture module', partNumber: 'IL-SOIL-CAP-A1',
    renderer: 'sensor-soil-moisture-capacitive', controlKey: 'moistureRatio',
    outputLabel: 'Ideal capacitive moisture signal', aliases: ['capacitive soil probe', 'capacitive moisture sensor'],
    functions: ['analogue moisture input'], signalDescription: '0 dry to 1 wet',
    omittedPhysics: 'dielectric calibration, soil composition, salinity, temperature, probe geometry, waterproofing, loading, tolerance, noise or response time',
  }),
  [ANALOGUE_WATER_LEVEL_TYPE]: definition({
    type: ANALOGUE_WATER_LEVEL_TYPE, family: 'sensor.water-level-analogue',
    displayName: 'Analogue water level module', partNumber: 'IL-WATER-LEVEL-A1',
    renderer: 'sensor-water-level-analogue', controlKey: 'waterLevelRatio',
    outputLabel: 'Ideal water level signal', aliases: ['water level strip', 'analogue liquid level sensor'],
    functions: ['analogue level input'], signalDescription: '0 empty to 1 full',
    omittedPhysics: 'physical depth calibration, liquid conductivity, container geometry, wetting, corrosion, contamination, loading, tolerance, noise or response time',
  }),
});

export function createAnalogueMoistureLevelSensor(type, id) {
  const definitionValue = ANALOGUE_MOISTURE_LEVEL_DEFINITIONS[type];
  if (!definitionValue) throw new TypeError('ANALOGUE_MOISTURE_LEVEL_TYPE');
  const key = definitionValue.controlKeys[0];
  return { id, type, label: definitionValue.displayName, properties: {}, controls: { [key]: 0.5 } };
}

export function validateAnalogueMoistureLevelSensor(component) {
  const definitionValue = ANALOGUE_MOISTURE_LEVEL_DEFINITIONS[component?.type];
  if (!definitionValue) return false;
  const key = definitionValue.controlKeys[0];
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && typeof component.id === 'string' && typeof component.label === 'string'
    && exactKeys(component.properties, []) && exactKeys(component.controls, [key])
    && Number.isFinite(component.controls[key])
    && component.controls[key] >= 0 && component.controls[key] <= 1;
}

export function analogueMoistureLevelRatio(component) {
  if (!validateAnalogueMoistureLevelSensor(component)) throw new TypeError('ANALOGUE_MOISTURE_LEVEL_STATE');
  return component.controls[ANALOGUE_MOISTURE_LEVEL_DEFINITIONS[component.type].controlKeys[0]];
}

export function projectAnalogueMoistureLevelSensors(value) {
  let runtimeGraph = structuredClone(value);
  const sensors = [];
  for (const type of [RESISTIVE_SOIL_MOISTURE_TYPE, CAPACITIVE_SOIL_MOISTURE_TYPE,
    ANALOGUE_WATER_LEVEL_TYPE]) {
    const definitionValue = ANALOGUE_MOISTURE_LEVEL_DEFINITIONS[type];
    const controlKey = definitionValue.controlKeys[0];
    const projected = projectIdealThreePinAnalogueModules(runtimeGraph, {
      type,
      diagnosticPrefix: 'ANALOGUE_MOISTURE_LEVEL_SENSOR',
      validateComponent: validateAnalogueMoistureLevelSensor,
      controlKey,
      valueToVoltage: (ratio) => ratio * 5,
      transferModel: 'ideal-linear-ratio-0-to-5v',
    });
    if (!projected.ok) return projected;
    runtimeGraph = projected.runtimeGraph;
    sensors.push(...projected.modules.map((module) => ({
      componentId: module.componentId,
      type,
      boardPin: module.boardPin,
      controlKey,
      ratio: module.controlValue,
      voltage: module.voltage,
      supplyVolts: module.supplyVolts,
      transferModel: module.transferModel,
      runtimeAdapter: 'potentiometer.linear-v1-ideal-analogue-sensor-adapter',
    })));
  }
  return { ok: true, runtimeGraph, sensors };
}

