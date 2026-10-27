// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';
import { CharacterLcd4BitDecoder } from './character-lcd-16x2-4bit-v1.mjs';

export const PCF8574_LCD_TYPE = 'output.character-lcd-16x2-pcf8574-v1';
export const PCF8574_LCD_MODEL = 'model.character-lcd-16x2-pcf8574-write-only-v1';
export const PCF8574_LCD_RENDERER = 'output-character-lcd-16x2-pcf8574';
export const PCF8574_LCD_RUNTIME_ADAPTER = 'avr-twi-pcf8574-hd44780-write-only-v1';
export const PCF8574_LCD_ADDRESS = 0x27;
export const PCF8574_LCD_MAPPING = Object.freeze({ RS: 0, RW: 1, E: 2, backlight: 3, D4: 4, D5: 5, D6: 6, D7: 7 });
const BOARD_TYPE = 'board.atmega328p-16mhz-v1';
const clone = (value) => structuredClone(value);
const fail = (code, details = []) => ({ ok: false, code, details });
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;
const deepFreeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; };
const pin = (id, label, role, signals, constraints, x) => ({ id, label, role, signals, capabilities: [...signals], constraints, anchor: { x, y: 124 / 130 } });

export const PCF8574_LCD_DEFINITION = deepFreeze({
  family: 'display.character-lcd', variant: 'ideal-16x2-pcf8574-fixed-0x27',
  type: PCF8574_LCD_TYPE, version: 1, displayName: '16×2 character LCD · PCF8574 backpack',
  manufacturer: 'Intent Learning', partNumber: 'IL-LCD-1602-PCF8574-27',
  pins: [
    pin('VCC', '5 V supply', 'power-in', ['power.5v-reference'], { voltage: 5 }, 28 / 220),
    pin('GND', 'Logic ground', 'ground', ['ground.reference'], { voltage: 0 }, 82 / 220),
    pin('SDA', 'I2C data · AVR A4', 'bidirectional', ['digital.i2c-sda'], { boardPin: 'A4', openDrainIdealized: true }, 138 / 220),
    pin('SCL', 'I2C clock · AVR A5', 'digital-in', ['digital.i2c-scl'], { boardPin: 'A5', openDrainIdealized: true }, 192 / 220),
  ],
  propertyKeys: ['address'], propertySchema: { address: { kind: 'integer', minimum: PCF8574_LCD_ADDRESS, maximum: PCF8574_LCD_ADDRESS, default: PCF8574_LCD_ADDRESS } },
  controlKeys: [], modelRef: PCF8574_LCD_MODEL, internalTerminalGroups: [], selectable: true,
  artwork: { renderer: PCF8574_LCD_RENDERER, thumbnail: PCF8574_LCD_RENDERER, viewBox: [0, 0, 220, 130], cssWidth: 220, cssHeight: 130,
    provenance: 'Original IntentForce SVG assembled from basic geometry; no traced board, photograph or third-party simulator artwork.', license: 'Apache-2.0' },
  catalog: { category: 'displays', aliases: ['i2c lcd', 'pcf8574 lcd', 'lcd backpack'], functions: ['two-line text display', 'bounded I2C character output'], interfaces: ['I2C write-only at 0x27'], supplyVolts: { min: 5, max: 5 }, package: 'original virtual LCD plus fixed PCF8574 mapping' },
  support: { status: 'partial', limitations: [
    'AVR-only fixed 7-bit address 0x27 on A4/SDA and A5/SCL, using mapping P0=RS, P1=RW, P2=E, P3=backlight, P4..P7=D4..D7.',
    'Only firmware writes observed through the bounded AVR TWI register protocol are accepted; arbitrary Wire-library compatibility, reads, clock stretching, arbitration, pull-up/current and physical bus timing are not modelled.',
    'The attached display uses the same write-only 4-bit initialization, printable ASCII, clear/home, 16×2 wrapping, DDRAM addressing, display-control, cursor and blink state as CMP-050; busy reads, CGRAM/custom glyphs, shifts and 8-bit mode remain unsupported.',
  ] },
});

export function createPcf8574LcdComponent(id, label = '16×2 character LCD PCF8574') {
  return { id, type: PCF8574_LCD_TYPE, label, properties: { address: PCF8574_LCD_ADDRESS }, controls: {} };
}
export function validatePcf8574LcdComponent(component) {
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && component.type === PCF8574_LCD_TYPE && exactKeys(component.properties, ['address'])
    && component.properties.address === PCF8574_LCD_ADDRESS && exactKeys(component.controls, []);
}

export function projectPcf8574LcdDisplays(value) {
  const graph = clone(value); const displays = [];
  const components = graph.components.filter((item) => item.type === PCF8574_LCD_TYPE);
  if (!components.length) return { ok: true, runtimeGraph: graph, displays };
  if (components.length > 1) return fail('PCF8574_LCD_DUPLICATE_ADDRESS', components.map((item) => item.id));
  const byId = new Map(graph.components.map((item) => [item.id, item]));
  const endpointToNet = new Map();
  for (const net of graph.nets) for (const endpoint of net.endpoints) endpointToNet.set(endpointKey(endpoint), net);
  for (const component of components) {
    if (!validatePcf8574LcdComponent(component)) return fail('PCF8574_LCD_STATE', [component.id]);
    for (const [pinId, required] of Object.entries({ VCC: '5V', SDA: 'A4', SCL: 'A5' })) {
      const net = endpointToNet.get(`${component.id}.${pinId}`);
      if (!net) return fail(`PCF8574_LCD_${pinId}_DISCONNECTED`, [component.id]);
      const boards = net.endpoints.filter((endpoint) => byId.get(endpoint.component)?.type === BOARD_TYPE);
      const exactSignal = pinId === 'SDA' || pinId === 'SCL';
      if (boards.length !== 1 || boards[0].pin !== required || (exactSignal && net.endpoints.length !== 2)) return fail(`PCF8574_LCD_${pinId}_REQUIRES_${required}`, [component.id]);
    }
    const ground = endpointToNet.get(`${component.id}.GND`);
    if (!ground) return fail('PCF8574_LCD_GND_DISCONNECTED', [component.id]);
    const groundBoards = ground.endpoints.filter((endpoint) => byId.get(endpoint.component)?.type === BOARD_TYPE);
    if (groundBoards.length !== 1 || !/^GND[123]$/u.test(groundBoards[0].pin)) return fail('PCF8574_LCD_GND_REQUIRES_GROUND', [component.id]);
    displays.push({ componentId: component.id, address: PCF8574_LCD_ADDRESS, sdaPin: 'A4', sclPin: 'A5', decoder: PCF8574_LCD_RUNTIME_ADAPTER, mapping: clone(PCF8574_LCD_MAPPING), supportedGeometry: { columns: 16, rows: 2 } });
  }
  const ids = new Set(components.map((item) => item.id));
  graph.components = graph.components.filter((item) => !ids.has(item.id));
  graph.nets = graph.nets.map((net) => ({ ...net, endpoints: net.endpoints.filter((endpoint) => !ids.has(endpoint.component)) })).filter((net) => net.endpoints.length >= 2);
  const netIds = new Set(graph.nets.map((net) => net.id)); graph.junctions = graph.junctions.filter((item) => netIds.has(item.net));
  return { ok: true, runtimeGraph: graph, displays };
}

export class Pcf8574LcdDecoder {
  constructor(address = PCF8574_LCD_ADDRESS) {
    if (address !== PCF8574_LCD_ADDRESS) throw new TypeError('PCF8574_LCD_ADDRESS');
    this.address = address;
    this.lcd = new CharacterLcd4BitDecoder({ RS: 'D2', E: 'D3', D4: 'D4', D5: 'D5', D6: 'D6', D7: 'D7' });
    this.levels = { RS: false, E: false, D4: false, D5: false, D6: false, D7: false };
    this.transactions = 0; this.lastIndex = 0; this.error = null;
  }
  consume(records, { i2cDrops = 0 } = {}) {
    if (i2cDrops) this.error = { code: 'PCF8574_LCD_TRACE_DROPPED', details: [i2cDrops] };
    if (!Array.isArray(records) || records.length < this.lastIndex) { this.lastIndex = 0; this.error = { code: 'PCF8574_LCD_TRACE_RESET', details: [] }; }
    const events = [];
    for (const record of records.slice(this.lastIndex)) {
      if (record.kind !== 'write' || record.address !== this.address || record.acknowledged !== true) continue;
      this.transactions += 1;
      if (record.value & (1 << PCF8574_LCD_MAPPING.RW)) { this.error = { code: 'PCF8574_LCD_READ_UNSUPPORTED', details: [record.value] }; continue; }
      for (const signal of Object.keys(this.levels)) {
        const level = Boolean(record.value & (1 << PCF8574_LCD_MAPPING[signal]));
        if (level !== this.levels[signal]) { this.levels[signal] = level; events.push({ cycle: record.cycle, pin: Number(signal === 'RS' ? 2 : signal === 'E' ? 3 : signal.slice(1)), level }); }
      }
    }
    this.lastIndex = records.length;
    const snapshot = this.lcd.consume(events);
    return { ...snapshot, ddramAddress: snapshot.address, protocol: 'i2c-pcf8574-fixed-0x27', address: this.address, transactions: this.transactions, error: this.error ?? snapshot.error };
  }
  snapshot() { const snapshot = this.lcd.snapshot(); return { ...snapshot, ddramAddress: snapshot.address, protocol: 'i2c-pcf8574-fixed-0x27', address: this.address, transactions: this.transactions, error: this.error ?? snapshot.error }; }
}

export const createPcf8574LcdDecoder = (address) => new Pcf8574LcdDecoder(address);
