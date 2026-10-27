// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';
import { inspectIdealThreePinPoweredModules } from './ideal-three-pin-analogue-module-v1.mjs';

export const FLOW_PULSE_SENSOR_TYPE = 'sensor.flow-pulse-digital-v1';
export const WIND_SPEED_PULSE_SENSOR_TYPE = 'sensor.wind-speed-pulse-digital-v1';
export const DIGITAL_PULSE_SENSOR_RUNTIME_TYPE = 'button.momentary-v1';

const freeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
const pins = () => [
  { id: 'VCC', label: '5 V supply', role: 'power-input', signals: ['power.5v-reference'],
    capabilities: ['power.5v-reference'], constraints: { voltage: 5 }, anchor: { x: 0.18, y: 0.92 } },
  { id: 'GND', label: 'Ground', role: 'ground', signals: ['ground.reference'],
    capabilities: ['ground.reference'], constraints: { voltage: 0 }, anchor: { x: 0.5, y: 0.92 } },
  { id: 'OUT', label: 'Active-high pulse output', role: 'digital-out', signals: ['digital.active-high'],
    capabilities: ['digital.active-high'], constraints: { voltageMin: 0, voltageMax: 5 }, anchor: { x: 0.82, y: 0.92 } },
];
const artwork = (renderer) => ({ renderer, thumbnail: renderer, viewBox: [0, 0, 120, 100],
  cssWidth: 120, cssHeight: 100,
  provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
  license: 'Apache-2.0' });
function definition({ type, family, displayName, partNumber, renderer, aliases, functions, physicalLimits }) {
  return freeze({ family, variant: 'manual-active-high-pulse-level-three-pin-module', type, version: 1,
    displayName, manufacturer: 'Intent Learning', partNumber, pins: pins(), propertyKeys: [], propertySchema: {},
    controlKeys: ['pulseHigh'], modelRef: `model.${family}-manual-pulse-level-v1`,
    internalTerminalGroups: [], selectable: true, artwork: artwork(renderer),
    catalog: { category: 'sensors', aliases, functions, interfaces: ['GPIO'],
      supplyVolts: { min: 5, max: 5 }, package: 'virtual three-pin pulse-output sensor' },
    support: { status: 'partial', limitations: [
      'The retained pulseHigh control represents one manually authored instantaneous active-high OUT level.',
      'The model does not generate a pulse train, frequency, edge timing or accumulated count automatically.',
      physicalLimits,
      'OUT must connect directly and exclusively to one D2–D12 digital input on the supported 5 V AVR controller.',
    ] } });
}

export const DIGITAL_PULSE_SENSOR_DEFINITIONS = freeze({
  [FLOW_PULSE_SENSOR_TYPE]: definition({ type: FLOW_PULSE_SENSOR_TYPE, family: 'sensor.flow-pulse',
    displayName: 'Flow pulse sensor', partNumber: 'IL-FLOW-PULSE-D1', renderer: 'sensor-flow-pulse',
    aliases: ['flow meter pulse sensor', 'liquid flow pulse'], functions: ['manual digital flow pulse level'],
    physicalLimits: 'No liquid type, flow rate, litres, turbine inertia, calibration factor, pressure, direction, bounce, loading or physical accuracy is modelled.',
  }),
  [WIND_SPEED_PULSE_SENSOR_TYPE]: definition({ type: WIND_SPEED_PULSE_SENSOR_TYPE,
    family: 'sensor.wind-speed-pulse', displayName: 'Wind speed pulse sensor',
    partNumber: 'IL-WIND-PULSE-D1', renderer: 'sensor-wind-speed-pulse',
    aliases: ['anemometer pulse sensor', 'wind pulse'], functions: ['manual digital wind-speed pulse level'],
    physicalLimits: 'No wind speed, metres per second, cup or rotor inertia, gust response, direction, calibration factor, bounce, loading or physical accuracy is modelled.',
  }),
});

export function createDigitalPulseSensor(type, id) {
  const definitionValue = DIGITAL_PULSE_SENSOR_DEFINITIONS[type];
  if (!definitionValue) throw new TypeError('DIGITAL_PULSE_SENSOR_TYPE');
  return { id, type, label: definitionValue.displayName, properties: {}, controls: { pulseHigh: false } };
}

export function validateDigitalPulseSensor(component) {
  return Boolean(DIGITAL_PULSE_SENSOR_DEFINITIONS[component?.type])
    && exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && typeof component.id === 'string' && typeof component.label === 'string'
    && exactKeys(component.properties, []) && exactKeys(component.controls, ['pulseHigh'])
    && typeof component.controls.pulseHigh === 'boolean';
}

export function digitalPulseLevel(component) {
  if (!validateDigitalPulseSensor(component)) throw new TypeError('DIGITAL_PULSE_SENSOR_STATE');
  return component.controls.pulseHigh;
}

export function projectDigitalPulseSensors(value) {
  let runtimeGraph = structuredClone(value); const sensors = [];
  for (const type of [FLOW_PULSE_SENSOR_TYPE, WIND_SPEED_PULSE_SENSOR_TYPE]) {
    const inspected = inspectIdealThreePinPoweredModules(runtimeGraph, {
      type, diagnosticPrefix: 'DIGITAL_PULSE_SENSOR', validateComponent: validateDigitalPulseSensor,
      outputPinId: 'OUT', outputBoardPin: (pin) => /^D(?:[2-9]|1[0-2])$/u.test(pin),
      outputRequiresSuffix: 'OUT_REQUIRES_DIGITAL_INPUT',
    });
    if (!inspected.ok) return inspected;
    const ids = new Set(inspected.modules.map((module) => module.componentId));
    const records = new Map(inspected.modules.map((module) => [module.componentId, module]));
    runtimeGraph = inspected.runtimeGraph;
    runtimeGraph.components = runtimeGraph.components.map((component) => !ids.has(component.id) ? component : ({
      id: component.id, type: DIGITAL_PULSE_SENSOR_RUNTIME_TYPE, label: component.label,
      properties: { normallyOpen: true }, controls: { pressed: !digitalPulseLevel(records.get(component.id).component) },
    }));
    runtimeGraph.nets = runtimeGraph.nets.map((net) => ({ id: net.id,
      endpoints: net.endpoints.flatMap((endpoint) => {
        if (!ids.has(endpoint.component)) return [endpoint];
        if (endpoint.pin === 'VCC') return [];
        return [{ component: endpoint.component, pin: endpoint.pin === 'GND' ? 'B' : 'A' }];
      }),
    })).filter((net) => net.endpoints.length >= 2);
    const retainedNetIds = new Set(runtimeGraph.nets.map((net) => net.id));
    runtimeGraph.junctions = runtimeGraph.junctions.filter((junction) => retainedNetIds.has(junction.net));
    sensors.push(...inspected.modules.map((module) => ({ componentId: module.componentId, type,
      boardPin: module.boardPin, pulseHigh: digitalPulseLevel(module.component),
      outputLevel: digitalPulseLevel(module.component) ? 'HIGH' : 'LOW', activePolarity: 'HIGH',
      runtimeAdapter: 'button.momentary-v1-active-high-inverted-manual-pulse-level-adapter' })));
  }
  return { ok: true, runtimeGraph, sensors };
}
