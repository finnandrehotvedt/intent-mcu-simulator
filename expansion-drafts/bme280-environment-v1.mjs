// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';

export const BME280_TYPE = 'sensor.bme280-environment-v1';
export const BME280_MODEL = 'model.bme280-environment-i2c-v1';
export const BME280_RENDERER = 'sensor-bme280-environment';
export const BME280_RUNTIME_ADAPTER = 'avr-twi-bme280-environment-v1';
export const BME280_ADDRESS = 0x76;
export const BME280_TEMPERATURE_MIN_C = -40;
export const BME280_TEMPERATURE_MAX_C = 85;
export const BME280_HUMIDITY_MIN_PERCENT = 0;
export const BME280_HUMIDITY_MAX_PERCENT = 100;
export const BME280_PRESSURE_MIN_HPA = 300;
export const BME280_PRESSURE_MAX_HPA = 1100;
export const BME280_VALUE_STEP = 0.1;

const BOARD_TYPE = 'board.atmega328p-16mhz-v1';
const PCF8574_LCD_TYPE = 'output.character-lcd-16x2-pcf8574-v1';
const clone = (value) => structuredClone(value);
const fail = (code, details = []) => ({ ok: false, code, details });
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;
const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

export const BME280_CALIBRATION = Object.freeze({
  T1: 27504, T2: 26435, T3: -1000,
  P1: 36477, P2: -10685, P3: 3024, P4: 2855, P5: 140,
  P6: -7, P7: 15500, P8: -14600, P9: 6000,
  H1: 75, H2: 362, H3: 0, H4: 325, H5: 50, H6: 30,
});

const pin = (id, label, role, signals, constraints, x) => ({
  id, label, role, signals, capabilities: [...signals], constraints, anchor: { x, y: 118 / 124 },
});

export const BME280_DEFINITION = deepFreeze({
  family: 'sensor.environment-digital',
  variant: 'bme280-fixed-0x76-i2c',
  type: BME280_TYPE,
  version: 1,
  displayName: 'BME280 temperature, humidity and pressure sensor',
  manufacturer: 'Intent Learning',
  partNumber: 'IL-BME280-I2C-76',
  pins: [
    pin('VCC', '5 V module supply', 'power-input', ['power.5v-reference'], { voltage: 5, onboardRegulatorIdealized: true }, 24 / 180),
    pin('GND', 'Logic ground', 'ground', ['ground.reference'], { voltage: 0 }, 68 / 180),
    pin('SDA', 'I2C data · AVR A4', 'bidirectional', ['digital.i2c-sda'], { boardPin: 'A4', openDrainIdealized: true, levelShiftIdealized: true }, 112 / 180),
    pin('SCL', 'I2C clock · AVR A5', 'digital-input', ['digital.i2c-scl'], { boardPin: 'A5', openDrainIdealized: true, levelShiftIdealized: true }, 156 / 180),
  ],
  propertyKeys: ['address'],
  propertySchema: {
    address: { kind: 'integer', minimum: BME280_ADDRESS, maximum: BME280_ADDRESS, default: BME280_ADDRESS },
  },
  controlKeys: ['temperatureC', 'humidityPercent', 'pressureHpa'],
  modelRef: BME280_MODEL,
  internalTerminalGroups: [],
  selectable: true,
  artwork: {
    renderer: BME280_RENDERER,
    thumbnail: BME280_RENDERER,
    viewBox: [0, 0, 180, 124],
    cssWidth: 180,
    cssHeight: 124,
    provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced board, photograph or third-party simulator artwork.',
    license: 'Apache-2.0',
  },
  catalog: {
    category: 'sensors',
    aliases: ['BME280', 'I2C environment sensor', 'digital barometer', 'digital humidity sensor'],
    functions: ['digital temperature measurement', 'digital relative humidity measurement', 'digital barometric pressure measurement'],
    interfaces: ['I2C register protocol at 0x76'],
    supplyVolts: { min: 5, max: 5 },
    package: 'original virtual 5 V tolerant BME280 breakout module',
  },
  support: {
    status: 'simulated',
    limitations: [
      'AVR-only fixed 7-bit address 0x76 on A4/SDA and A5/SCL with chip ID, calibration, control and measurement registers needed by the included firmware.',
      'Temperature -40.0–85.0 °C, humidity 0.0–100.0 %RH and pressure 300.0–1100.0 hPa are controllable in 0.1-unit steps and encoded through one fixed calibration set.',
      'The virtual breakout idealizes an onboard 5 V regulator, I2C level shifting and pull-ups; physical bus timing, clock stretching, arbitration, noise, sensor latency, weather accuracy and electrical loading are not modelled.',
      'This is a bounded standard-register teaching model, not a claim of arbitrary third-party BME280 library compatibility.',
    ],
  },
});

export const validBme280Value = (value, minimum, maximum) => Number.isFinite(value)
  && value >= minimum && value <= maximum
  && Math.abs(value * 10 - Math.round(value * 10)) < Number.EPSILON * 128;

export function createBme280Component(id, label = 'BME280 environment sensor', controls = {}) {
  return {
    id,
    type: BME280_TYPE,
    label,
    properties: { address: BME280_ADDRESS },
    controls: {
      temperatureC: controls.temperatureC ?? 23.5,
      humidityPercent: controls.humidityPercent ?? 50,
      pressureHpa: controls.pressureHpa ?? 1013.2,
    },
  };
}

export function validateBme280Component(component) {
  return exactKeys(component ?? {}, ['id', 'type', 'label', 'properties', 'controls'])
    && component.type === BME280_TYPE
    && typeof component.id === 'string'
    && typeof component.label === 'string'
    && exactKeys(component.properties, ['address'])
    && component.properties.address === BME280_ADDRESS
    && exactKeys(component.controls, ['temperatureC', 'humidityPercent', 'pressureHpa'])
    && validBme280Value(component.controls.temperatureC, BME280_TEMPERATURE_MIN_C, BME280_TEMPERATURE_MAX_C)
    && validBme280Value(component.controls.humidityPercent, BME280_HUMIDITY_MIN_PERCENT, BME280_HUMIDITY_MAX_PERCENT)
    && validBme280Value(component.controls.pressureHpa, BME280_PRESSURE_MIN_HPA, BME280_PRESSURE_MAX_HPA);
}

export function compensateBme280(rawTemperature, rawPressure, rawHumidity,
  calibration = BME280_CALIBRATION) {
  const t1 = rawTemperature / 16384 - calibration.T1 / 1024;
  const t2 = rawTemperature / 131072 - calibration.T1 / 8192;
  const tFine = t1 * calibration.T2 + t2 * t2 * calibration.T3;
  const temperatureC = tFine / 5120;

  let p1 = tFine / 2 - 64000;
  let p2 = p1 * p1 * calibration.P6 / 32768;
  p2 += p1 * calibration.P5 * 2;
  p2 = p2 / 4 + calibration.P4 * 65536;
  p1 = (calibration.P3 * p1 * p1 / 524288 + calibration.P2 * p1) / 524288;
  p1 = (1 + p1 / 32768) * calibration.P1;
  let pressurePa = Number.NaN;
  if (p1 !== 0) {
    pressurePa = 1048576 - rawPressure;
    pressurePa = (pressurePa - p2 / 4096) * 6250 / p1;
    p1 = calibration.P9 * pressurePa * pressurePa / 2147483648;
    p2 = pressurePa * calibration.P8 / 32768;
    pressurePa += (p1 + p2 + calibration.P7) / 16;
  }

  let humidityPercent = tFine - 76800;
  humidityPercent = (rawHumidity - (calibration.H4 * 64
    + calibration.H5 / 16384 * humidityPercent))
    * (calibration.H2 / 65536 * (1 + calibration.H6 / 67108864
      * humidityPercent * (1 + calibration.H3 / 67108864 * humidityPercent)));
  humidityPercent *= 1 - calibration.H1 * humidityPercent / 524288;
  humidityPercent = Math.max(0, Math.min(100, humidityPercent));
  return { temperatureC, pressurePa, pressureHpa: pressurePa / 100, humidityPercent, tFine };
}

function nearestRaw(target, low, high, evaluate) {
  const ascending = evaluate(high) >= evaluate(low);
  let best = low;
  let bestDistance = Math.abs(evaluate(low) - target);
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const value = evaluate(middle);
    const distance = Math.abs(value - target);
    if (distance < bestDistance) { best = middle; bestDistance = distance; }
    if (value === target) return middle;
    if ((value < target) === ascending) low = middle + 1;
    else high = middle - 1;
  }
  for (const candidate of [best - 2, best - 1, best + 1, best + 2]) {
    if (candidate < 0 || candidate > 0xfffff) continue;
    const distance = Math.abs(evaluate(candidate) - target);
    if (distance < bestDistance) { best = candidate; bestDistance = distance; }
  }
  return best;
}

export function bme280RawSample(temperatureC, humidityPercent, pressureHpa) {
  if (!validBme280Value(temperatureC, BME280_TEMPERATURE_MIN_C, BME280_TEMPERATURE_MAX_C)
      || !validBme280Value(humidityPercent, BME280_HUMIDITY_MIN_PERCENT, BME280_HUMIDITY_MAX_PERCENT)
      || !validBme280Value(pressureHpa, BME280_PRESSURE_MIN_HPA, BME280_PRESSURE_MAX_HPA)) {
    throw new TypeError('BME280_ENVIRONMENT');
  }
  const rawTemperature = nearestRaw(temperatureC, 0, 0xfffff,
    (raw) => compensateBme280(raw, 0x80000, 0x8000).temperatureC);
  const temperatureOnly = compensateBme280(rawTemperature, 0x80000, 0x8000);
  const rawPressure = nearestRaw(pressureHpa, 0, 0xfffff,
    (raw) => compensateBme280(rawTemperature, raw, 0x8000).pressureHpa);
  const rawHumidity = nearestRaw(humidityPercent, 0, 0xffff,
    (raw) => compensateBme280(rawTemperature, rawPressure, raw).humidityPercent);
  return {
    rawTemperature, rawPressure, rawHumidity,
    compensated: compensateBme280(rawTemperature, rawPressure, rawHumidity),
    tFine: temperatureOnly.tFine,
  };
}

const putU16 = (registers, address, value) => {
  registers[address] = value & 0xff; registers[address + 1] = (value >> 8) & 0xff;
};
const putS16 = (registers, address, value) => putU16(registers, address, value & 0xffff);

export function bme280RegisterMap(temperatureC, humidityPercent, pressureHpa) {
  const sample = bme280RawSample(temperatureC, humidityPercent, pressureHpa);
  const c = BME280_CALIBRATION;
  const registers = new Uint8Array(256);
  putU16(registers, 0x88, c.T1); putS16(registers, 0x8a, c.T2); putS16(registers, 0x8c, c.T3);
  putU16(registers, 0x8e, c.P1); putS16(registers, 0x90, c.P2); putS16(registers, 0x92, c.P3);
  putS16(registers, 0x94, c.P4); putS16(registers, 0x96, c.P5); putS16(registers, 0x98, c.P6);
  putS16(registers, 0x9a, c.P7); putS16(registers, 0x9c, c.P8); putS16(registers, 0x9e, c.P9);
  registers[0xa1] = c.H1;
  putS16(registers, 0xe1, c.H2); registers[0xe3] = c.H3;
  registers[0xe4] = (c.H4 >> 4) & 0xff;
  registers[0xe5] = ((c.H5 & 0x0f) << 4) | (c.H4 & 0x0f);
  registers[0xe6] = (c.H5 >> 4) & 0xff; registers[0xe7] = c.H6 & 0xff;
  registers[0xd0] = 0x60; registers[0xf2] = 0x01; registers[0xf3] = 0x00;
  registers[0xf4] = 0x27; registers[0xf5] = 0x00;
  registers[0xf7] = (sample.rawPressure >> 12) & 0xff;
  registers[0xf8] = (sample.rawPressure >> 4) & 0xff;
  registers[0xf9] = (sample.rawPressure & 0x0f) << 4;
  registers[0xfa] = (sample.rawTemperature >> 12) & 0xff;
  registers[0xfb] = (sample.rawTemperature >> 4) & 0xff;
  registers[0xfc] = (sample.rawTemperature & 0x0f) << 4;
  registers[0xfd] = (sample.rawHumidity >> 8) & 0xff;
  registers[0xfe] = sample.rawHumidity & 0xff;
  return registers;
}

export function projectBme280Sensors(value) {
  const graph = clone(value);
  const sensors = [];
  const components = graph.components.filter((item) => item.type === BME280_TYPE);
  if (!components.length) return { ok: true, runtimeGraph: graph, sensors };
  if (components.length > 1) return fail('BME280_DUPLICATE_ADDRESS', components.map((item) => item.id));
  const byId = new Map(graph.components.map((item) => [item.id, item]));
  const endpointToNet = new Map();
  for (const net of graph.nets) for (const endpoint of net.endpoints) endpointToNet.set(endpointKey(endpoint), net);
  for (const component of components) {
    if (!validateBme280Component(component)) return fail('BME280_STATE', [component.id]);
    for (const [pinId, required] of Object.entries({ VCC: '5V', SDA: 'A4', SCL: 'A5' })) {
      const net = endpointToNet.get(`${component.id}.${pinId}`);
      if (!net) return fail(`BME280_${pinId}_DISCONNECTED`, [component.id]);
      const boards = net.endpoints.filter((endpoint) => byId.get(endpoint.component)?.type === BOARD_TYPE);
      if (boards.length !== 1 || boards[0].pin !== required) return fail(`BME280_${pinId}_REQUIRES_${required}`, [component.id]);
      if (pinId === 'SDA' || pinId === 'SCL') {
        const validBus = net.endpoints.every((endpoint) => endpoint.component === component.id
          || (byId.get(endpoint.component)?.type === BOARD_TYPE && endpoint.pin === required)
          || (byId.get(endpoint.component)?.type === PCF8574_LCD_TYPE && endpoint.pin === pinId));
        if (!validBus) return fail(`BME280_${pinId}_BUS_CONFLICT`, [component.id]);
      }
    }
    const ground = endpointToNet.get(`${component.id}.GND`);
    if (!ground) return fail('BME280_GND_DISCONNECTED', [component.id]);
    const groundBoards = ground.endpoints.filter((endpoint) => byId.get(endpoint.component)?.type === BOARD_TYPE);
    if (groundBoards.length !== 1 || !/^GND[123]$/u.test(groundBoards[0].pin)) return fail('BME280_GND_REQUIRES_GROUND', [component.id]);
    sensors.push({
      componentId: component.id,
      type: BME280_TYPE,
      address: BME280_ADDRESS,
      sdaPin: 'A4',
      sclPin: 'A5',
      temperatureC: component.controls.temperatureC,
      humidityPercent: component.controls.humidityPercent,
      pressureHpa: component.controls.pressureHpa,
      runtimeAdapter: BME280_RUNTIME_ADAPTER,
    });
  }
  const ids = new Set(components.map((item) => item.id));
  graph.components = graph.components.filter((item) => !ids.has(item.id));
  graph.nets = graph.nets.map((net) => ({ ...net,
    endpoints: net.endpoints.filter((endpoint) => !ids.has(endpoint.component)),
  })).filter((net) => net.endpoints.length >= 2);
  const netIds = new Set(graph.nets.map((net) => net.id));
  graph.junctions = graph.junctions.filter((item) => netIds.has(item.net));
  return { ok: true, runtimeGraph: graph, sensors };
}
