// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';

export const FLOAT_SWITCH_TYPE = 'switch.float-no-v1';
export const TILT_SWITCH_TYPE = 'sensor.tilt-switch-no-v1';
export const BALL_VIBRATION_SWITCH_TYPE = 'sensor.ball-vibration-switch-no-v1';

const freeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
const pin = (id, label, x) => ({ id, label, role: 'passive', signals: ['passive.contact'],
  capabilities: ['passive.contact'], constraints: {}, anchor: { x, y: 0.84 } });
const artwork = (renderer) => ({ renderer, thumbnail: renderer,
  viewBox: [0, 0, 126, 90], cssWidth: 126, cssHeight: 90,
  provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
  license: 'Apache-2.0' });
function definition({ type, family, displayName, partNumber, renderer, controlKey,
  aliases, functions, packageName, behavior, omittedPhysics }) {
  return freeze({ family, variant: 'ideal-normally-open-two-terminal-contact', type, version: 1,
    displayName, manufacturer: 'Generic', partNumber,
    pins: [pin('A', 'Contact A', 0.07), pin('B', 'Contact B', 0.93)],
    propertyKeys: ['normallyOpen'],
    propertySchema: { normallyOpen: { kind: 'boolean', default: true } },
    controlKeys: [controlKey], control: { kind: 'boolean', default: false },
    modelRef: `model.${family}-ideal-v1`, internalTerminalGroups: [], selectable: true,
    artwork: artwork(renderer),
    catalog: { category: 'sensors', aliases, functions, interfaces: ['GPIO'],
      supplyVolts: { min: 0, max: 5 }, package: packageName },
    support: { status: 'partial', limitations: [
      `Ideal normally-open passive contact: ${behavior}.`,
      `No ${omittedPhysics} is modelled.`,
      'The executable AVR example requires one terminal on a direct INPUT_PULLUP pin and the other on a dedicated ground reference.',
    ] } });
}

export const CONTACT_SENSOR_DEFINITIONS = freeze({
  [FLOAT_SWITCH_TYPE]: definition({
    type: FLOAT_SWITCH_TYPE, family: 'sensor.float-switch-no',
    displayName: 'Normally-open float switch', partNumber: 'FLOAT-SW-NO',
    renderer: 'sensor-float-switch-no', controlKey: 'liquidHigh',
    aliases: ['float switch', 'liquid level switch'],
    functions: ['liquid level contact', 'normally-open digital input'],
    packageName: 'two-wire normally-open float contact',
    behavior: 'the contact closes while Liquid high is enabled',
    omittedPhysics: 'liquid type, buoyancy, mounting orientation, switching height, hysteresis, waves, bounce, resistance, cable, current rating or wear',
  }),
  [TILT_SWITCH_TYPE]: definition({
    type: TILT_SWITCH_TYPE, family: 'sensor.tilt-switch-no',
    displayName: 'Normally-open tilt switch', partNumber: 'TILT-SW-NO',
    renderer: 'sensor-tilt-switch-no', controlKey: 'tilted',
    aliases: ['tilt switch', 'ball tilt sensor'],
    functions: ['orientation contact', 'normally-open digital input'],
    packageName: 'two-terminal ball tilt contact',
    behavior: 'the contact closes while Tilted is enabled for this explicitly chosen orientation',
    omittedPhysics: 'angle threshold, gravity vector, mounting orientation beyond the authored state, chatter, bounce, resistance, current rating or wear',
  }),
  [BALL_VIBRATION_SWITCH_TYPE]: definition({
    type: BALL_VIBRATION_SWITCH_TYPE, family: 'sensor.ball-vibration-switch-no',
    displayName: 'Normally-open ball vibration switch', partNumber: 'VIBRATION-SW-NO',
    renderer: 'sensor-ball-vibration-switch-no', controlKey: 'vibrationDetected',
    aliases: ['ball vibration switch', 'spring vibration sensor'],
    functions: ['vibration contact snapshot', 'normally-open digital input'],
    packageName: 'two-terminal ball or spring vibration contact',
    behavior: 'the contact is represented closed while Vibration detected is enabled',
    omittedPhysics: 'acceleration, frequency, direction, sensitivity, pulse train, contact duration, chatter, bounce, resistance, current rating or wear',
  }),
});

export function createContactSensor(type, id) {
  const definitionValue = CONTACT_SENSOR_DEFINITIONS[type];
  if (!definitionValue) throw new TypeError('CONTACT_SENSOR_TYPE');
  const key = definitionValue.controlKeys[0];
  return { id, type, label: definitionValue.displayName,
    properties: { normallyOpen: true }, controls: { [key]: false } };
}

export function validateContactSensor(component) {
  const definitionValue = CONTACT_SENSOR_DEFINITIONS[component?.type];
  if (!definitionValue) return false;
  const key = definitionValue.controlKeys[0];
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && typeof component.id === 'string' && typeof component.label === 'string'
    && exactKeys(component.properties, ['normallyOpen'])
    && component.properties.normallyOpen === true
    && exactKeys(component.controls, [key]) && typeof component.controls[key] === 'boolean';
}

export function contactSensorRuntimeState(component) {
  if (!validateContactSensor(component)) throw new TypeError('CONTACT_SENSOR_STATE');
  const key = CONTACT_SENSOR_DEFINITIONS[component.type].controlKeys[0];
  return { closed: component.controls[key] };
}
