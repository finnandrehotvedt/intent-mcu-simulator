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
export const PCF8574_LCD_INIT_GAP_MINIMUM_CYCLES = 592;
export const PCF8574_LCD_GEOMETRY_16X2 = '16x2';
export const PCF8574_LCD_GEOMETRY_20X4 = '20x4';
export const PCF8574_LCD_GEOMETRIES = Object.freeze([
  PCF8574_LCD_GEOMETRY_16X2,
  PCF8574_LCD_GEOMETRY_20X4,
]);
const PCF8574_LCD_GEOMETRY_OPTIONS = Object.freeze({
  [PCF8574_LCD_GEOMETRY_16X2]: Object.freeze({
    columns: 16, rows: 2, rowOffsets: Object.freeze([0x00, 0x40]), customGlyphs: false,
  }),
  [PCF8574_LCD_GEOMETRY_20X4]: Object.freeze({
    columns: 20, rows: 4, rowOffsets: Object.freeze([0x00, 0x40, 0x14, 0x54]), customGlyphs: false,
  }),
});
const BOARD_TYPE = 'board.atmega328p-16mhz-v1';
const clone = (value) => structuredClone(value);
const fail = (code, details = []) => ({ ok: false, code, details });
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;
const deepFreeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; };
const pin = (id, label, role, signals, constraints, x) => ({ id, label, role, signals, capabilities: [...signals], constraints, anchor: { x, y: 124 / 130 } });

export const PCF8574_LCD_DEFINITION = deepFreeze({
  family: 'display.character-lcd', variant: 'ideal-16x2-or-20x4-pcf8574-fixed-0x27',
  type: PCF8574_LCD_TYPE, version: 2, displayName: 'Character LCD · PCF8574 backpack',
  manufacturer: 'Intent Learning', partNumber: 'IL-LCD-PCF8574-27',
  pins: [
    pin('VCC', '5 V supply', 'power-in', ['power.5v-reference'], { voltage: 5 }, 28 / 220),
    pin('GND', 'Logic ground', 'ground', ['ground.reference'], { voltage: 0 }, 82 / 220),
    pin('SDA', 'I2C data · AVR A4', 'bidirectional', ['digital.i2c-sda'], { boardPin: 'A4', openDrainIdealized: true }, 138 / 220),
    pin('SCL', 'I2C clock · AVR A5', 'digital-in', ['digital.i2c-scl'], { boardPin: 'A5', openDrainIdealized: true }, 192 / 220),
  ],
  propertyKeys: ['address', 'geometry'], propertySchema: {
    address: { kind: 'integer', minimum: PCF8574_LCD_ADDRESS, maximum: PCF8574_LCD_ADDRESS, default: PCF8574_LCD_ADDRESS },
    geometry: { kind: 'enum', values: [...PCF8574_LCD_GEOMETRIES], default: PCF8574_LCD_GEOMETRY_16X2 },
  },
  controlKeys: [], modelRef: PCF8574_LCD_MODEL, internalTerminalGroups: [], selectable: true,
  artwork: { renderer: PCF8574_LCD_RENDERER, thumbnail: PCF8574_LCD_RENDERER, viewBox: [0, 0, 220, 130], cssWidth: 220, cssHeight: 130,
    provenance: 'Original IntentForce SVG assembled from basic geometry; no traced board, photograph or third-party simulator artwork.', license: 'Apache-2.0' },
  catalog: { category: 'displays', aliases: ['i2c lcd', 'pcf8574 lcd', 'lcd backpack', '16x2 lcd', '20x4 lcd'], functions: ['two-line or four-line text display', 'bounded I2C character output'], interfaces: ['I2C write-only at 0x27'], supplyVolts: { min: 5, max: 5 }, package: 'original virtual LCD plus fixed PCF8574 mapping' },
  support: { status: 'partial', limitations: [
    'AVR-only fixed 7-bit address 0x27 on A4/SDA and A5/SCL, using mapping P0=RS, P1=RW, P2=E, P3=backlight, P4..P7=D4..D7.',
    'Only firmware writes observed through the bounded AVR TWI register protocol are accepted; arbitrary Wire-library compatibility, reads, clock stretching, arbitration, pull-up/current and physical bus timing are not modelled.',
    'The authored geometry is either legacy-default 16×2 or 20×4. The 20×4 path uses exact DDRAM row starts 0x00, 0x40, 0x14 and 0x54; both paths preserve write-only initialization, printable ASCII, clear/home, display-control, cursor and blink state.',
    'The PCF8574 path accepts repeated 4-bit initialization nibbles only when each falling E edge remains at least 592 AVR cycles apart; this bounded TWI-paced profile covers the measured Visuino/Mitov sequence without weakening the direct-GPIO LCD timing profile.',
    'The same bounded PCF8574 profile accepts both the established command order 0x28, 0x0C, 0x06, 0x01 and the measured Mitov order 0x28, 0x0C, 0x01, 0x06; the direct-GPIO profile retains only the established order.',
    'Busy reads, CGRAM/custom glyphs, shifts, 8-bit mode, arbitrary addresses, alternate backpack mappings and physical display behavior remain unsupported.',
  ] },
});

export function createPcf8574LcdComponent(
  id,
  label = 'Character LCD PCF8574',
  geometry = PCF8574_LCD_GEOMETRY_16X2,
) {
  if (!PCF8574_LCD_GEOMETRIES.includes(geometry)) throw new TypeError('PCF8574_LCD_GEOMETRY');
  return { id, type: PCF8574_LCD_TYPE, label,
    properties: { address: PCF8574_LCD_ADDRESS, geometry }, controls: {} };
}
export function validatePcf8574LcdComponent(component) {
  const propertyKeys = component?.properties && Object.keys(component.properties).sort();
  const legacy = JSON.stringify(propertyKeys) === JSON.stringify(['address']);
  const current = JSON.stringify(propertyKeys) === JSON.stringify(['address', 'geometry']);
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && component.type === PCF8574_LCD_TYPE && (legacy || current)
    && component.properties.address === PCF8574_LCD_ADDRESS
    && (legacy || PCF8574_LCD_GEOMETRIES.includes(component.properties.geometry))
    && exactKeys(component.controls, []);
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
    const geometry = component.properties.geometry ?? PCF8574_LCD_GEOMETRY_16X2;
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
    displays.push({ componentId: component.id, address: PCF8574_LCD_ADDRESS,
      geometry, sdaPin: 'A4', sclPin: 'A5', decoder: PCF8574_LCD_RUNTIME_ADAPTER,
      mapping: clone(PCF8574_LCD_MAPPING), supportedGeometry: clone(PCF8574_LCD_GEOMETRY_OPTIONS[geometry]) });
  }
  const ids = new Set(components.map((item) => item.id));
  graph.components = graph.components.filter((item) => !ids.has(item.id));
  graph.nets = graph.nets.map((net) => ({ ...net, endpoints: net.endpoints.filter((endpoint) => !ids.has(endpoint.component)) })).filter((net) => net.endpoints.length >= 2);
  const netIds = new Set(graph.nets.map((net) => net.id)); graph.junctions = graph.junctions.filter((item) => netIds.has(item.net));
  return { ok: true, runtimeGraph: graph, displays };
}

export class Pcf8574LcdDecoder {
  constructor(address = PCF8574_LCD_ADDRESS, geometry = PCF8574_LCD_GEOMETRY_16X2) {
    if (address !== PCF8574_LCD_ADDRESS) throw new TypeError('PCF8574_LCD_ADDRESS');
    if (!PCF8574_LCD_GEOMETRIES.includes(geometry)) throw new TypeError('PCF8574_LCD_GEOMETRY');
    this.address = address;
    this.geometry = geometry;
    this.lcd = new CharacterLcd4BitDecoder(
      { RS: 'D2', E: 'D3', D4: 'D4', D5: 'D5', D6: 'D6', D7: 'D7' },
      { ...PCF8574_LCD_GEOMETRY_OPTIONS[geometry],
        firstRepeatedInitGapCycles: PCF8574_LCD_INIT_GAP_MINIMUM_CYCLES,
        laterInitGapCycles: PCF8574_LCD_INIT_GAP_MINIMUM_CYCLES,
        initializationCommandSequences: [[0x28, 0x0c, 0x06, 0x01], [0x28, 0x0c, 0x01, 0x06]] },
    );
    this.levels = { RS: false, E: false, D4: false, D5: false, D6: false, D7: false };
    this.transactions = 0; this.nextAbsoluteIndex = 0; this.error = null;
  }
  consume(records, { i2cDrops = 0 } = {}) {
    const retained = Array.isArray(records) ? records : [];
    if (!Number.isSafeInteger(i2cDrops) || i2cDrops < 0) {
      this.error = { code: 'PCF8574_LCD_TRACE_DROPPED', details: [i2cDrops] };
      i2cDrops = 0;
    }
    const absoluteEnd = i2cDrops + retained.length;
    if (absoluteEnd < this.nextAbsoluteIndex) {
      this.nextAbsoluteIndex = i2cDrops;
      this.error = { code: 'PCF8574_LCD_TRACE_RESET', details: [] };
    }
    if (i2cDrops > this.nextAbsoluteIndex) {
      this.error = { code: 'PCF8574_LCD_TRACE_DROPPED', details: [i2cDrops - this.nextAbsoluteIndex] };
      this.nextAbsoluteIndex = i2cDrops;
    }
    const retainedStart = Math.max(0, this.nextAbsoluteIndex - i2cDrops);
    const events = [];
    for (const record of retained.slice(retainedStart)) {
      if (record.kind !== 'write' || record.address !== this.address || record.acknowledged !== true) continue;
      this.transactions += 1;
      if (record.value & (1 << PCF8574_LCD_MAPPING.RW)) { this.error = { code: 'PCF8574_LCD_READ_UNSUPPORTED', details: [record.value] }; continue; }
      // One PCF8574 byte changes every expander output atomically. Project the
      // register-select/data bits before E so a byte that raises E with new
      // data is observed as data-stable for the complete high pulse.
      for (const signal of ['RS', 'D4', 'D5', 'D6', 'D7', 'E']) {
        const level = Boolean(record.value & (1 << PCF8574_LCD_MAPPING[signal]));
        if (level !== this.levels[signal]) { this.levels[signal] = level; events.push({ cycle: record.cycle, pin: Number(signal === 'RS' ? 2 : signal === 'E' ? 3 : signal.slice(1)), level }); }
      }
    }
    this.nextAbsoluteIndex = absoluteEnd;
    const snapshot = this.lcd.consume(events);
    return { ...snapshot, ddramAddress: snapshot.address, protocol: 'i2c-pcf8574-fixed-0x27',
      address: this.address, geometry: this.geometry, transactions: this.transactions,
      error: this.error ?? snapshot.error };
  }
  snapshot() { const snapshot = this.lcd.snapshot(); return { ...snapshot,
    ddramAddress: snapshot.address, protocol: 'i2c-pcf8574-fixed-0x27', address: this.address,
    geometry: this.geometry, transactions: this.transactions, error: this.error ?? snapshot.error }; }
}

export const createPcf8574LcdDecoder = (address, geometry) => new Pcf8574LcdDecoder(address, geometry);
