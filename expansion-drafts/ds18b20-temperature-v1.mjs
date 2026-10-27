// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';
import { inspectIdealThreePinPoweredModules } from './ideal-three-pin-analogue-module-v1.mjs';

export const DS18B20_TYPE = 'sensor.ds18b20-temperature-v1';
export const DS18B20_MODEL = 'model.ds18b20-onewire-scratchpad-v1';
export const DS18B20_RENDERER = 'sensor-ds18b20-temperature';
export const DS18B20_RUNTIME_ADAPTER = 'avr-ds18b20-onewire-protocol-v1';
export const DS18B20_TEMPERATURE_MIN_C = -55;
export const DS18B20_TEMPERATURE_MAX_C = 125;
export const DS18B20_TEMPERATURE_STEP_C = 0.0625;

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

export const DS18B20_DEFINITION = deepFreeze({
  family: 'sensor.temperature-digital',
  variant: 'ds18b20-onewire-powered-probe',
  type: DS18B20_TYPE,
  version: 1,
  displayName: 'DS18B20 OneWire temperature sensor',
  manufacturer: 'Intent Learning',
  partNumber: 'IL-DS18B20-D1',
  pins: [
    { id: 'VCC', label: '5 V supply', role: 'power-input', signals: ['power.5v-reference'], capabilities: ['power.5v-reference'], constraints: { voltage: 5 }, anchor: { x: 0.2, y: 0.92 } },
    { id: 'DQ', label: 'OneWire data', role: 'digital-io', signals: ['digital.bidirectional', 'protocol.onewire'], capabilities: ['digital.bidirectional', 'protocol.onewire'], constraints: { voltageMin: 0, voltageMax: 5, pullupRequired: true }, anchor: { x: 0.5, y: 0.92 } },
    { id: 'GND', label: 'Ground', role: 'ground', signals: ['ground.reference'], capabilities: ['ground.reference'], constraints: { voltage: 0 }, anchor: { x: 0.8, y: 0.92 } },
  ],
  propertyKeys: [],
  propertySchema: {},
  controlKeys: ['temperatureC'],
  modelRef: DS18B20_MODEL,
  internalTerminalGroups: [],
  selectable: true,
  artwork: {
    renderer: DS18B20_RENDERER,
    thumbnail: DS18B20_RENDERER,
    viewBox: [0, 0, 150, 110],
    cssWidth: 150,
    cssHeight: 110,
    provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced or third-party simulator artwork.',
    license: 'Apache-2.0',
  },
  catalog: {
    category: 'sensors',
    aliases: ['DS18B20', 'OneWire temperature sensor', 'digital temperature probe'],
    functions: ['digital temperature measurement'],
    interfaces: ['OneWire Skip ROM and scratchpad'],
    supplyVolts: { min: 5, max: 5 },
    package: 'original virtual three-wire waterproof-style probe',
  },
  support: {
    status: 'simulated',
    limitations: [
      'One externally powered DS18B20 on one AVR pin; parasite power and multidrop ROM addressing are unavailable.',
      'Temperature is authored from −55 to 125 °C in exact 1/16 °C steps and encoded in a checksum-valid nine-byte scratchpad.',
      'Firmware must use reset/presence, Skip ROM, Convert T and Read Scratchpad transactions on D2–D12.',
      'Conversion completes immediately in the model; physical latency, thermal mass, self-heating, cable effects and electrical loading are not modelled.',
    ],
  },
});

export function validDs18b20Temperature(temperatureC) {
  return Number.isFinite(temperatureC)
    && temperatureC >= DS18B20_TEMPERATURE_MIN_C
    && temperatureC <= DS18B20_TEMPERATURE_MAX_C
    && Number.isInteger(temperatureC / DS18B20_TEMPERATURE_STEP_C);
}

export function createDs18b20Component(id, label = 'DS18B20 temperature probe', controls = {}) {
  return {
    id,
    type: DS18B20_TYPE,
    label,
    properties: {},
    controls: { temperatureC: controls.temperatureC ?? 23.5 },
  };
}

export function validateDs18b20Component(component) {
  return exactKeys(component ?? {}, ['id', 'type', 'label', 'properties', 'controls'])
    && component.type === DS18B20_TYPE
    && typeof component.id === 'string'
    && typeof component.label === 'string'
    && exactKeys(component.properties, [])
    && exactKeys(component.controls, ['temperatureC'])
    && validDs18b20Temperature(component.controls.temperatureC);
}

export function ds18b20Crc8(bytes) {
  if (!Array.isArray(bytes) || bytes.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new TypeError('DS18B20_CRC_BYTES');
  }
  let crc = 0;
  for (const value of bytes) {
    let incoming = value;
    for (let bit = 0; bit < 8; bit += 1) {
      const mix = (crc ^ incoming) & 1;
      crc >>= 1;
      if (mix) crc ^= 0x8c;
      incoming >>= 1;
    }
  }
  return crc;
}

export function ds18b20Scratchpad(temperatureC) {
  if (!validDs18b20Temperature(temperatureC)) throw new TypeError('DS18B20_TEMPERATURE');
  const raw = Math.round(temperatureC * 16);
  const bytes = [raw & 0xff, (raw >> 8) & 0xff, 75, 70, 0x7f, 0xff, 0x0c, 0x10];
  return [...bytes, ds18b20Crc8(bytes)];
}

export function projectDs18b20Sensors(value) {
  const inspected = inspectIdealThreePinPoweredModules(value, {
    type: DS18B20_TYPE,
    diagnosticPrefix: 'DS18B20',
    validateComponent: validateDs18b20Component,
    outputPinId: 'DQ',
    outputBoardPin: (pin) => /^D(?:[2-9]|1[0-2])$/u.test(pin),
    outputRequiresSuffix: 'DQ_REQUIRES_DIGITAL_IO',
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
      type: DS18B20_TYPE,
      boardPin: module.boardPin,
      boardPinNumber: Number(module.boardPin.slice(1)),
      temperatureC: module.component.controls.temperatureC,
      scratchpad: ds18b20Scratchpad(module.component.controls.temperatureC),
      runtimeAdapter: DS18B20_RUNTIME_ADAPTER,
    })),
  };
}
