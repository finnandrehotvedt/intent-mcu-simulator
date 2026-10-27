// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';
import { inspectIdealThreePinPoweredModules } from './ideal-three-pin-analogue-module-v1.mjs';

export const IR_OBSTACLE_SENSOR_TYPE = 'sensor.ir-obstacle-reflective-v1';
export const LINE_TRACKING_SENSOR_TYPE = 'sensor.line-tracking-reflective-v1';
export const DIGITAL_REFLECTIVE_SENSOR_RUNTIME_TYPE = 'button.momentary-v1';

const freeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
const pins = () => [
  { id: 'VCC', label: '5 V supply', role: 'power-input', signals: ['power.5v-reference'], capabilities: ['power.5v-reference'], constraints: { voltage: 5 }, anchor: { x: 0.18, y: 0.92 } },
  { id: 'GND', label: 'Ground', role: 'ground', signals: ['ground.reference'], capabilities: ['ground.reference'], constraints: { voltage: 0 }, anchor: { x: 0.5, y: 0.92 } },
  { id: 'OUT', label: 'Active-low digital output', role: 'digital-out', signals: ['digital.active-low'], capabilities: ['digital.active-low'], constraints: { voltageMin: 0, voltageMax: 5 }, anchor: { x: 0.82, y: 0.92 } },
];
const artwork = (renderer) => ({ renderer, thumbnail: renderer, viewBox: [0, 0, 120, 100],
  cssWidth: 120, cssHeight: 100,
  provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
  license: 'Apache-2.0' });
function definition({ type, family, displayName, partNumber, renderer, control, aliases, functions, limitations }) {
  return freeze({ family, variant: 'ideal-active-low-three-pin-reflective-module', type, version: 1,
    displayName, manufacturer: 'Intent Learning', partNumber, pins: pins(), propertyKeys: [], propertySchema: {},
    controlKeys: [control], modelRef: `model.${family}-ideal-v1`, internalTerminalGroups: [], selectable: true,
    artwork: artwork(renderer), catalog: { category: 'sensors', aliases, functions,
      interfaces: ['GPIO'], supplyVolts: { min: 5, max: 5 }, package: 'virtual three-pin reflective sensor module' },
    support: { status: 'simulated', limitations: [
      ...limitations,
      'OUT is active LOW and must connect directly and exclusively to one D2–D12 INPUT_PULLUP pin on the supported 5 V AVR controller.',
    ] } });
}

export const DIGITAL_REFLECTIVE_SENSOR_DEFINITIONS = freeze({
  [IR_OBSTACLE_SENSOR_TYPE]: definition({
    type: IR_OBSTACLE_SENSOR_TYPE, family: 'sensor.ir-obstacle-reflective',
    displayName: 'IR reflective obstacle sensor', partNumber: 'IL-IR-OBSTACLE-D1',
    renderer: 'sensor-ir-obstacle-reflective', control: 'obstacleDetected',
    aliases: ['IR obstacle sensor', 'reflective proximity sensor'], functions: ['digital obstacle input'],
    limitations: ['Ideal active-low reflected-object state only.',
      'No distance, reflectivity, target size, angle, emitter power, threshold calibration, crosstalk or ambient-light model.'],
  }),
  [LINE_TRACKING_SENSOR_TYPE]: definition({
    type: LINE_TRACKING_SENSOR_TYPE, family: 'sensor.line-tracking-reflective',
    displayName: 'Reflective line tracking sensor', partNumber: 'IL-LINE-TRACK-D1',
    renderer: 'sensor-line-tracking-reflective', control: 'lineDetected',
    aliases: ['line sensor', 'IR line tracker'], functions: ['digital line input'],
    limitations: ['Ideal active-low dark-line state only.',
      'No surface colour calibration, sensor height, line width, speed, angle, emitter power, crosstalk or ambient-light model.'],
  }),
});

export function createDigitalReflectiveSensor(type, id) {
  const definitionValue = DIGITAL_REFLECTIVE_SENSOR_DEFINITIONS[type];
  if (!definitionValue) throw new TypeError('DIGITAL_REFLECTIVE_SENSOR_TYPE');
  const key = definitionValue.controlKeys[0];
  return { id, type, label: definitionValue.displayName, properties: {}, controls: { [key]: false } };
}

export function validateDigitalReflectiveSensor(component) {
  const definitionValue = DIGITAL_REFLECTIVE_SENSOR_DEFINITIONS[component?.type];
  if (!definitionValue) return false;
  const key = definitionValue.controlKeys[0];
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && typeof component.id === 'string' && typeof component.label === 'string'
    && exactKeys(component.properties, []) && exactKeys(component.controls, [key])
    && typeof component.controls[key] === 'boolean';
}

export function digitalReflectiveSensorActive(component) {
  if (!validateDigitalReflectiveSensor(component)) throw new TypeError('DIGITAL_REFLECTIVE_SENSOR_STATE');
  return component.controls[DIGITAL_REFLECTIVE_SENSOR_DEFINITIONS[component.type].controlKeys[0]];
}

export function projectDigitalReflectiveSensors(value) {
  let runtimeGraph = structuredClone(value);
  const sensors = [];
  for (const type of [IR_OBSTACLE_SENSOR_TYPE, LINE_TRACKING_SENSOR_TYPE]) {
    const inspected = inspectIdealThreePinPoweredModules(runtimeGraph, {
      type,
      diagnosticPrefix: 'DIGITAL_REFLECTIVE_SENSOR',
      validateComponent: validateDigitalReflectiveSensor,
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
        type: DIGITAL_REFLECTIVE_SENSOR_RUNTIME_TYPE,
        label: component.label,
        properties: { normallyOpen: true },
        controls: { pressed: digitalReflectiveSensorActive(records.get(component.id).component) },
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
      const active = digitalReflectiveSensorActive(module.component);
      return {
        componentId: module.componentId,
        type,
        boardPin: module.boardPin,
        active,
        outputLevel: active ? 'LOW' : 'HIGH',
        activePolarity: 'LOW',
        runtimeAdapter: 'button.momentary-v1-active-low-adapter',
      };
    }));
  }
  return { ok: true, runtimeGraph, sensors };
}

