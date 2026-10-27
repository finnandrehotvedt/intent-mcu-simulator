// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';
import { inspectIdealThreePinPoweredModules } from './ideal-three-pin-analogue-module-v1.mjs';

export const CAPACITIVE_TOUCH_TYPE = 'input.capacitive-touch-button-v1';
export const PIR_MOTION_TYPE = 'sensor.pir-motion-v1';
export const HALL_SWITCH_TYPE = 'sensor.hall-switch-digital-v1';
export const DIGITAL_PRESENCE_SENSOR_RUNTIME_TYPE = 'button.momentary-v1';

const freeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
const pins = () => [
  { id: 'VCC', label: '5 V supply', role: 'power-input', signals: ['power.5v-reference'], capabilities: ['power.5v-reference'], constraints: { voltage: 5 }, anchor: { x: 0.18, y: 0.92 } },
  { id: 'GND', label: 'Ground', role: 'ground', signals: ['ground.reference'], capabilities: ['ground.reference'], constraints: { voltage: 0 }, anchor: { x: 0.5, y: 0.92 } },
  { id: 'OUT', label: 'Active-high digital output', role: 'digital-out', signals: ['digital.active-high'], capabilities: ['digital.active-high'], constraints: { voltageMin: 0, voltageMax: 5 }, anchor: { x: 0.82, y: 0.92 } },
];
const artwork = (renderer) => ({ renderer, thumbnail: renderer, viewBox: [0, 0, 120, 100],
  cssWidth: 120, cssHeight: 100,
  provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
  license: 'Apache-2.0' });
function definition({ type, family, displayName, partNumber, renderer, control, aliases, functions, limitations }) {
  return freeze({ family, variant: 'ideal-active-high-three-pin-module', type, version: 1, displayName,
    manufacturer: 'Intent Learning', partNumber, pins: pins(), propertyKeys: [], propertySchema: {},
    controlKeys: [control], modelRef: `model.${family}-ideal-v1`, internalTerminalGroups: [], selectable: true,
    artwork: artwork(renderer), catalog: { category: 'inputs', aliases, functions,
      interfaces: ['GPIO'], supplyVolts: { min: 5, max: 5 }, package: 'virtual three-pin digital module' },
    support: { status: 'simulated', limitations: [
      ...limitations,
      'OUT must connect directly and exclusively to one D2–D12 digital input on the supported 5 V AVR controller.',
    ] } });
}

export const DIGITAL_PRESENCE_SENSOR_DEFINITIONS = freeze({
  [CAPACITIVE_TOUCH_TYPE]: definition({ type: CAPACITIVE_TOUCH_TYPE, family: 'input.capacitive-touch',
    displayName: 'Capacitive touch button', partNumber: 'IL-TOUCH-D1', renderer: 'input-capacitive-touch', control: 'touched',
    aliases: ['touch button', 'capacitive key'], functions: ['digital touch input'],
    limitations: ['Ideal active-high touch state only.', 'No capacitance, electrode geometry, calibration, debounce, moisture or electromagnetic interference model.'] }),
  [PIR_MOTION_TYPE]: definition({ type: PIR_MOTION_TYPE, family: 'sensor.pir-motion', displayName: 'PIR motion sensor',
    partNumber: 'IL-PIR-D1', renderer: 'sensor-pir-motion', control: 'motionDetected', aliases: ['PIR', 'motion detector'],
    functions: ['digital motion input'], limitations: ['Ideal active-high motion state only.', 'No warm-up, retrigger delay, lens, range, field-of-view, thermal background or human-presence accuracy.'] }),
  [HALL_SWITCH_TYPE]: definition({ type: HALL_SWITCH_TYPE, family: 'sensor.hall-switch', displayName: 'Digital Hall switch',
    partNumber: 'IL-HALL-D1', renderer: 'sensor-hall-switch', control: 'magnetPresent', aliases: ['Hall switch', 'magnetic switch'],
    functions: ['digital magnetic input'], limitations: ['Ideal active-high magnet-presence state only.', 'No magnetic field strength, polarity, distance, hysteresis, orientation or electrical tolerance model.'] }),
});

export function createDigitalPresenceSensor(type, id) {
  const definitionValue = DIGITAL_PRESENCE_SENSOR_DEFINITIONS[type]; if (!definitionValue) throw new TypeError('DIGITAL_PRESENCE_SENSOR_TYPE');
  const key = definitionValue.controlKeys[0]; return { id, type, label: definitionValue.displayName, properties: {}, controls: { [key]: false } };
}

export function validateDigitalPresenceSensor(component) {
  const definitionValue = DIGITAL_PRESENCE_SENSOR_DEFINITIONS[component?.type]; if (!definitionValue) return false;
  const key = definitionValue.controlKeys[0];
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && typeof component.id === 'string' && typeof component.label === 'string'
    && exactKeys(component.properties, []) && exactKeys(component.controls, [key])
    && typeof component.controls[key] === 'boolean';
}

export function digitalPresenceActive(component) {
  if (!validateDigitalPresenceSensor(component)) throw new TypeError('DIGITAL_PRESENCE_SENSOR_STATE');
  return component.controls[DIGITAL_PRESENCE_SENSOR_DEFINITIONS[component.type].controlKeys[0]];
}

export function projectDigitalPresenceSensors(value) {
  let runtimeGraph = structuredClone(value);
  const sensors = [];
  for (const type of [CAPACITIVE_TOUCH_TYPE, PIR_MOTION_TYPE, HALL_SWITCH_TYPE]) {
    const inspected = inspectIdealThreePinPoweredModules(runtimeGraph, {
      type,
      diagnosticPrefix: 'DIGITAL_PRESENCE_SENSOR',
      validateComponent: validateDigitalPresenceSensor,
      outputPinId: 'OUT',
      outputBoardPin: (pin) => /^D(?:[2-9]|1[0-2])$/u.test(pin),
      outputRequiresSuffix: 'OUT_REQUIRES_DIGITAL_INPUT',
    });
    if (!inspected.ok) return inspected;
    const ids = new Set(inspected.modules.map((module) => module.componentId));
    const records = new Map(inspected.modules.map((module) => [module.componentId, module]));
    runtimeGraph = inspected.runtimeGraph;
    runtimeGraph.components = runtimeGraph.components.map((component) => {
      if (!ids.has(component.id)) return component;
      return {
        id: component.id,
        type: DIGITAL_PRESENCE_SENSOR_RUNTIME_TYPE,
        label: component.label,
        properties: { normallyOpen: true },
        controls: { pressed: !digitalPresenceActive(records.get(component.id).component) },
      };
    });
    runtimeGraph.nets = runtimeGraph.nets.map((net) => ({
      id: net.id,
      endpoints: net.endpoints.flatMap((endpoint) => {
        if (!ids.has(endpoint.component)) return [endpoint];
        if (endpoint.pin === 'VCC') return [];
        return [{ component: endpoint.component, pin: endpoint.pin === 'GND' ? 'B' : 'A' }];
      }),
    })).filter((net) => net.endpoints.length >= 2);
    const retainedNetIds = new Set(runtimeGraph.nets.map((net) => net.id));
    runtimeGraph.junctions = runtimeGraph.junctions.filter((junction) => retainedNetIds.has(junction.net));
    sensors.push(...inspected.modules.map((module) => {
      const active = digitalPresenceActive(module.component);
      return {
        componentId: module.componentId,
        type,
        boardPin: module.boardPin,
        active,
        outputLevel: active ? 'HIGH' : 'LOW',
        activePolarity: 'HIGH',
        runtimeAdapter: 'button.momentary-v1-active-high-inverted-adapter',
      };
    }));
  }
  return { ok: true, runtimeGraph, sensors };
}
