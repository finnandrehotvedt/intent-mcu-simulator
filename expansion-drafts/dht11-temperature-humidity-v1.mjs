// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';
import { inspectIdealThreePinPoweredModules } from './ideal-three-pin-analogue-module-v1.mjs';

export const DHT11_TYPE = 'sensor.dht11-temperature-humidity-v1';
export const DHT11_MODEL = 'model.dht11-temperature-humidity-protocol-v1';
export const DHT11_RENDERER = 'sensor-dht11-temperature-humidity';
export const DHT11_RUNTIME_ADAPTER = 'avr-dht11-single-wire-protocol-v1';
export const DHT11_TEMPERATURE_MIN_C = 0;
export const DHT11_TEMPERATURE_MAX_C = 50;
export const DHT11_HUMIDITY_MIN_PERCENT = 20;
export const DHT11_HUMIDITY_MAX_PERCENT = 90;

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

export const DHT11_DEFINITION = deepFreeze({
  family: 'sensor.temperature-humidity-digital',
  variant: 'dht11-integer-single-wire',
  type: DHT11_TYPE,
  version: 1,
  displayName: 'DHT11 temperature and humidity sensor',
  manufacturer: 'Intent Learning',
  partNumber: 'IL-DHT11-D1',
  pins: [
    { id: 'VCC', label: '5 V supply', role: 'power-input', signals: ['power.5v-reference'], capabilities: ['power.5v-reference'], constraints: { voltage: 5 }, anchor: { x: 0.2, y: 0.92 } },
    { id: 'DATA', label: 'DHT11 single-wire data', role: 'digital-io', signals: ['digital.bidirectional', 'protocol.dht11'], capabilities: ['digital.bidirectional', 'protocol.dht11'], constraints: { voltageMin: 0, voltageMax: 5, pullupRequired: true }, anchor: { x: 0.5, y: 0.92 } },
    { id: 'GND', label: 'Ground', role: 'ground', signals: ['ground.reference'], capabilities: ['ground.reference'], constraints: { voltage: 0 }, anchor: { x: 0.8, y: 0.92 } },
  ],
  propertyKeys: [],
  propertySchema: {},
  controlKeys: ['temperatureC', 'humidityPercent'],
  modelRef: DHT11_MODEL,
  internalTerminalGroups: [],
  selectable: true,
  artwork: {
    renderer: DHT11_RENDERER,
    thumbnail: DHT11_RENDERER,
    viewBox: [0, 0, 130, 110],
    cssWidth: 130,
    cssHeight: 110,
    provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
    license: 'Apache-2.0',
  },
  catalog: {
    category: 'sensors',
    aliases: ['DHT11', 'digital temperature sensor', 'digital humidity sensor'],
    functions: ['digital temperature measurement', 'digital relative humidity measurement'],
    interfaces: ['DHT11 single-wire protocol'],
    supplyVolts: { min: 5, max: 5 },
    package: 'original virtual three-pin DHT11 module',
  },
  support: {
    status: 'simulated',
    limitations: [
      'Integer DHT11 payload only: 0–50 °C and 20–90 %RH with a valid checksum.',
      'Firmware must issue a DHT11 start pulse and decode the timed five-byte response on AVR.',
      'DATA must connect directly and exclusively to one D2–D12 INPUT_PULLUP-capable pin.',
      'No physical sensor latency, sampling noise, self-heating, cable effects, electrical loading or out-of-range behavior is modelled.',
    ],
  },
});

export function createDht11Component(id, label = 'DHT11 temperature and humidity', controls = {}) {
  return {
    id,
    type: DHT11_TYPE,
    label,
    properties: {},
    controls: {
      temperatureC: controls.temperatureC ?? 25,
      humidityPercent: controls.humidityPercent ?? 50,
    },
  };
}

export function validateDht11Component(component) {
  return exactKeys(component ?? {}, ['id', 'type', 'label', 'properties', 'controls'])
    && component.type === DHT11_TYPE
    && typeof component.id === 'string'
    && typeof component.label === 'string'
    && exactKeys(component.properties, [])
    && exactKeys(component.controls, ['temperatureC', 'humidityPercent'])
    && Number.isInteger(component.controls.temperatureC)
    && component.controls.temperatureC >= DHT11_TEMPERATURE_MIN_C
    && component.controls.temperatureC <= DHT11_TEMPERATURE_MAX_C
    && Number.isInteger(component.controls.humidityPercent)
    && component.controls.humidityPercent >= DHT11_HUMIDITY_MIN_PERCENT
    && component.controls.humidityPercent <= DHT11_HUMIDITY_MAX_PERCENT;
}

export function dht11Payload(temperatureC, humidityPercent) {
  if (!Number.isInteger(temperatureC) || temperatureC < DHT11_TEMPERATURE_MIN_C
      || temperatureC > DHT11_TEMPERATURE_MAX_C
      || !Number.isInteger(humidityPercent) || humidityPercent < DHT11_HUMIDITY_MIN_PERCENT
      || humidityPercent > DHT11_HUMIDITY_MAX_PERCENT) throw new TypeError('DHT11_ENVIRONMENT');
  const bytes = [humidityPercent, 0, temperatureC, 0];
  return [...bytes, bytes.reduce((sum, value) => (sum + value) & 0xff, 0)];
}

export function projectDht11Sensors(value) {
  const inspected = inspectIdealThreePinPoweredModules(value, {
    type: DHT11_TYPE,
    diagnosticPrefix: 'DHT11',
    validateComponent: validateDht11Component,
    outputPinId: 'DATA',
    outputBoardPin: (pin) => /^D(?:[2-9]|1[0-2])$/u.test(pin),
    outputRequiresSuffix: 'DATA_REQUIRES_DIGITAL_IO',
  });
  if (!inspected.ok) return inspected;
  const ids = new Set(inspected.modules.map((module) => module.componentId));
  const runtimeGraph = inspected.runtimeGraph;
  runtimeGraph.components = runtimeGraph.components.filter((component) => !ids.has(component.id));
  runtimeGraph.nets = runtimeGraph.nets.map((net) => ({
    id: net.id,
    endpoints: net.endpoints.filter((endpoint) => !ids.has(endpoint.component)),
  })).filter((net) => net.endpoints.length >= 2);
  const retainedNetIds = new Set(runtimeGraph.nets.map((net) => net.id));
  runtimeGraph.junctions = runtimeGraph.junctions.filter((junction) => retainedNetIds.has(junction.net));
  return {
    ok: true,
    runtimeGraph,
    sensors: inspected.modules.map((module) => ({
      componentId: module.componentId,
      type: DHT11_TYPE,
      boardPin: module.boardPin,
      boardPinNumber: Number(module.boardPin.slice(1)),
      temperatureC: module.component.controls.temperatureC,
      humidityPercent: module.component.controls.humidityPercent,
      payload: dht11Payload(module.component.controls.temperatureC, module.component.controls.humidityPercent),
      runtimeAdapter: DHT11_RUNTIME_ADAPTER,
    })),
  };
}
