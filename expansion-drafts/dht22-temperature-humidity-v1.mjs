// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';
import { inspectIdealThreePinPoweredModules } from './ideal-three-pin-analogue-module-v1.mjs';

export const DHT22_TYPE = 'sensor.dht22-temperature-humidity-v1';
export const DHT22_MODEL = 'model.dht22-temperature-humidity-protocol-v1';
export const DHT22_RENDERER = 'sensor-dht22-temperature-humidity';
export const DHT22_RUNTIME_ADAPTER = 'avr-dht22-single-wire-protocol-v1';
export const DHT22_TEMPERATURE_MIN_C = -40;
export const DHT22_TEMPERATURE_MAX_C = 80;
export const DHT22_HUMIDITY_MIN_PERCENT = 0;
export const DHT22_HUMIDITY_MAX_PERCENT = 100;
export const DHT22_VALUE_STEP = 0.1;

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

export const validDht22Value = (value, minimum, maximum) => Number.isFinite(value)
  && value >= minimum && value <= maximum
  && Math.abs(value * 10 - Math.round(value * 10)) < Number.EPSILON * 64;

export const DHT22_DEFINITION = deepFreeze({
  family: 'sensor.temperature-humidity-digital',
  variant: 'dht22-decimal-single-wire',
  type: DHT22_TYPE,
  version: 1,
  displayName: 'DHT22 temperature and humidity sensor',
  manufacturer: 'Intent Learning',
  partNumber: 'IL-DHT22-D1',
  pins: [
    { id: 'VCC', label: '5 V supply', role: 'power-input', signals: ['power.5v-reference'], capabilities: ['power.5v-reference'], constraints: { voltage: 5 }, anchor: { x: 0.2, y: 0.92 } },
    { id: 'DATA', label: 'DHT22 single-wire data', role: 'digital-io', signals: ['digital.bidirectional', 'protocol.dht22'], capabilities: ['digital.bidirectional', 'protocol.dht22'], constraints: { voltageMin: 0, voltageMax: 5, pullupRequired: true }, anchor: { x: 0.5, y: 0.92 } },
    { id: 'GND', label: 'Ground', role: 'ground', signals: ['ground.reference'], capabilities: ['ground.reference'], constraints: { voltage: 0 }, anchor: { x: 0.8, y: 0.92 } },
  ],
  propertyKeys: [],
  propertySchema: {},
  controlKeys: ['temperatureC', 'humidityPercent'],
  modelRef: DHT22_MODEL,
  internalTerminalGroups: [],
  selectable: true,
  artwork: {
    renderer: DHT22_RENDERER,
    thumbnail: DHT22_RENDERER,
    viewBox: [0, 0, 130, 110],
    cssWidth: 130,
    cssHeight: 110,
    provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
    license: 'Apache-2.0',
  },
  catalog: {
    category: 'sensors',
    aliases: ['DHT22', 'AM2302', 'decimal digital temperature sensor', 'decimal digital humidity sensor'],
    functions: ['digital temperature measurement', 'digital relative humidity measurement'],
    interfaces: ['DHT22 single-wire protocol'],
    supplyVolts: { min: 5, max: 5 },
    package: 'original virtual three-pin DHT22 module',
  },
  support: {
    status: 'simulated',
    limitations: [
      'Decimal DHT22 payload only: -40.0–80.0 °C and 0.0–100.0 %RH in 0.1-unit steps with a valid checksum.',
      'Firmware must issue a DHT22 start pulse and decode the timed five-byte response on AVR.',
      'DATA must connect directly and exclusively to one D2–D12 INPUT_PULLUP-capable pin.',
      'No physical sensor latency, minimum sampling interval, noise, self-heating, cable effects, electrical loading or out-of-range behavior is modelled.',
    ],
  },
});

export function createDht22Component(id, label = 'DHT22 temperature and humidity', controls = {}) {
  return {
    id,
    type: DHT22_TYPE,
    label,
    properties: {},
    controls: {
      temperatureC: controls.temperatureC ?? 23.5,
      humidityPercent: controls.humidityPercent ?? 50,
    },
  };
}

export function validateDht22Component(component) {
  return exactKeys(component ?? {}, ['id', 'type', 'label', 'properties', 'controls'])
    && component.type === DHT22_TYPE
    && typeof component.id === 'string'
    && typeof component.label === 'string'
    && exactKeys(component.properties, [])
    && exactKeys(component.controls, ['temperatureC', 'humidityPercent'])
    && validDht22Value(component.controls.temperatureC, DHT22_TEMPERATURE_MIN_C, DHT22_TEMPERATURE_MAX_C)
    && validDht22Value(component.controls.humidityPercent, DHT22_HUMIDITY_MIN_PERCENT, DHT22_HUMIDITY_MAX_PERCENT);
}

export function dht22Payload(temperatureC, humidityPercent) {
  if (!validDht22Value(temperatureC, DHT22_TEMPERATURE_MIN_C, DHT22_TEMPERATURE_MAX_C)
      || !validDht22Value(humidityPercent, DHT22_HUMIDITY_MIN_PERCENT, DHT22_HUMIDITY_MAX_PERCENT)) {
    throw new TypeError('DHT22_ENVIRONMENT');
  }
  const humidityRaw = Math.round(humidityPercent * 10);
  const temperatureMagnitude = Math.round(Math.abs(temperatureC) * 10);
  const bytes = [
    (humidityRaw >> 8) & 0xff,
    humidityRaw & 0xff,
    ((temperatureMagnitude >> 8) & 0x7f) | (temperatureC < 0 ? 0x80 : 0),
    temperatureMagnitude & 0xff,
  ];
  return [...bytes, bytes.reduce((sum, value) => (sum + value) & 0xff, 0)];
}

export function projectDht22Sensors(value) {
  const inspected = inspectIdealThreePinPoweredModules(value, {
    type: DHT22_TYPE,
    diagnosticPrefix: 'DHT22',
    validateComponent: validateDht22Component,
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
      type: DHT22_TYPE,
      boardPin: module.boardPin,
      boardPinNumber: Number(module.boardPin.slice(1)),
      temperatureC: module.component.controls.temperatureC,
      humidityPercent: module.component.controls.humidityPercent,
      payload: dht22Payload(module.component.controls.temperatureC, module.component.controls.humidityPercent),
      runtimeAdapter: DHT22_RUNTIME_ADAPTER,
    })),
  };
}
