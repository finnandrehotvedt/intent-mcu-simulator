// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';
import {
  IDEAL_ANALOGUE_MODULE_RUNTIME_TYPE,
  createIdealThreePinAnaloguePins,
  projectIdealThreePinAnalogueModules,
} from './ideal-three-pin-analogue-module-v1.mjs';

export const RAIN_ANALOGUE_TYPE = 'sensor.rain-analogue-v1';
export const SOUND_LEVEL_ANALOGUE_TYPE = 'sensor.sound-level-analogue-v1';
export const FLAME_ANALOGUE_TYPE = 'sensor.flame-analogue-v1';
export const ANALOGUE_DETECTION_RUNTIME_TYPE = IDEAL_ANALOGUE_MODULE_RUNTIME_TYPE;

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
      package: 'virtual three-pin analogue detection module' },
    support: { status: 'simulated', limitations: [
      `Idealized module signal only: ${signalDescription} maps linearly to 0–5 V on AOUT.`,
      `No ${omittedPhysics} is modelled.`,
      'AOUT must connect directly and exclusively to one A0–A5 input on the supported 5 V AVR controller.',
    ] } });
}

export const ANALOGUE_DETECTION_DEFINITIONS = freeze({
  [RAIN_ANALOGUE_TYPE]: definition({
    type: RAIN_ANALOGUE_TYPE, family: 'sensor.rain-analogue',
    displayName: 'Analogue rain sensor', partNumber: 'IL-RAIN-A1',
    renderer: 'sensor-rain-analogue', controlKey: 'wetnessRatio',
    outputLabel: 'Ideal rain wetness signal', aliases: ['rain plate', 'analogue raindrop sensor'],
    functions: ['analogue wetness input'], signalDescription: '0 dry to 1 fully wet',
    omittedPhysics: 'rainfall rate or depth calibration, droplet geometry, conductivity, contamination, drying, corrosion, temperature, loading, tolerance, noise or response time',
  }),
  [SOUND_LEVEL_ANALOGUE_TYPE]: definition({
    type: SOUND_LEVEL_ANALOGUE_TYPE, family: 'sensor.sound-level-analogue',
    displayName: 'Analogue sound level module', partNumber: 'IL-SOUND-A1',
    renderer: 'sensor-sound-level-analogue', controlKey: 'soundLevelRatio',
    outputLabel: 'Ideal sound level signal', aliases: ['microphone level module', 'analogue sound sensor'],
    functions: ['analogue sound-level input'], signalDescription: '0 quiet to 1 maximum ideal level',
    omittedPhysics: 'dB or SPL calibration, frequency response, waveform, microphone directivity, clipping, automatic gain, loading, tolerance, noise or response time',
  }),
  [FLAME_ANALOGUE_TYPE]: definition({
    type: FLAME_ANALOGUE_TYPE, family: 'sensor.flame-analogue',
    displayName: 'Analogue flame sensor', partNumber: 'IL-FLAME-A1',
    renderer: 'sensor-flame-analogue', controlKey: 'flameIntensityRatio',
    outputLabel: 'Ideal flame response signal', aliases: ['infrared flame module', 'analogue flame detector'],
    functions: ['analogue flame-response input'], signalDescription: '0 no response to 1 maximum ideal response',
    omittedPhysics: 'flame detection or safety capability, distance, spectrum, angle, ambient-light rejection, source geometry, loading, tolerance, noise or response time',
  }),
});

export function createAnalogueDetectionSensor(type, id) {
  const definitionValue = ANALOGUE_DETECTION_DEFINITIONS[type];
  if (!definitionValue) throw new TypeError('ANALOGUE_DETECTION_TYPE');
  const key = definitionValue.controlKeys[0];
  return { id, type, label: definitionValue.displayName, properties: {}, controls: { [key]: 0.5 } };
}

export function validateAnalogueDetectionSensor(component) {
  const definitionValue = ANALOGUE_DETECTION_DEFINITIONS[component?.type];
  if (!definitionValue) return false;
  const key = definitionValue.controlKeys[0];
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && typeof component.id === 'string' && typeof component.label === 'string'
    && exactKeys(component.properties, []) && exactKeys(component.controls, [key])
    && Number.isFinite(component.controls[key])
    && component.controls[key] >= 0 && component.controls[key] <= 1;
}

export function analogueDetectionRatio(component) {
  if (!validateAnalogueDetectionSensor(component)) throw new TypeError('ANALOGUE_DETECTION_STATE');
  return component.controls[ANALOGUE_DETECTION_DEFINITIONS[component.type].controlKeys[0]];
}

export function projectAnalogueDetectionSensors(value) {
  let runtimeGraph = structuredClone(value);
  const sensors = [];
  for (const type of [RAIN_ANALOGUE_TYPE, SOUND_LEVEL_ANALOGUE_TYPE, FLAME_ANALOGUE_TYPE]) {
    const definitionValue = ANALOGUE_DETECTION_DEFINITIONS[type];
    const controlKey = definitionValue.controlKeys[0];
    const projected = projectIdealThreePinAnalogueModules(runtimeGraph, {
      type,
      diagnosticPrefix: 'ANALOGUE_DETECTION_SENSOR',
      validateComponent: validateAnalogueDetectionSensor,
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

