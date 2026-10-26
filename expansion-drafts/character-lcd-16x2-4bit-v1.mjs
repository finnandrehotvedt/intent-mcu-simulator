// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';

export const CHARACTER_LCD_TYPE = 'output.character-lcd-16x2-4bit-v1';
export const CHARACTER_LCD_MODEL = 'model.character-lcd-16x2-write-only-4bit-v1';
export const CHARACTER_LCD_RENDERER = 'output-character-lcd-16x2-4bit';
export const CHARACTER_LCD_RUNTIME_ADAPTER = 'avr-gpio-hd44780-write-only-decoder-v1';
export const AVR_CHARACTER_LCD_PINS = Object.freeze(
  Array.from({ length: 12 }, (_, index) => `D${index + 2}`),
);
export const CHARACTER_LCD_SIGNALS = Object.freeze(['RS', 'E', 'D4', 'D5', 'D6', 'D7']);
export const CHARACTER_LCD_TIMING = Object.freeze({
  clockHz: 16_000_000,
  powerOnMinimumCycles: 240_000,
  firstRepeatedInitGapCycles: 65_600,
  laterInitGapCycles: 1_600,
  enableHighMinimumCycles: 8,
  instructionMinimumCycles: 592,
  clearHomeMinimumCycles: 24_000,
});
export const CHARACTER_LCD_INITIALIZATION = Object.freeze({
  nibbles: Object.freeze([0x3, 0x3, 0x3, 0x2]),
  commands: Object.freeze([0x28, 0x0c, 0x06, 0x01]),
});

const BOARD_TYPE = 'board.atmega328p-16mhz-v1';
const GROUND_PIN = /^GND[123]$/u;
const DIGITAL_PIN = /^D(?:[0-9]|1[0-3])$/u;
const SUPPORTED_PINS = new Set(AVR_CHARACTER_LCD_PINS);
const clone = (value) => structuredClone(value);
const TERMINAL_X = Object.freeze({
  VCC: 10 / 220, GND: 35 / 220, RS: 60 / 220, RW: 85 / 220, E: 110 / 220,
  D4: 135 / 220, D5: 160 / 220, D6: 185 / 220, D7: 210 / 220,
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function pin(id, label, role, signals, constraints) {
  return {
    id, label, role, signals: [...signals], capabilities: [...signals],
    constraints: { ...constraints }, anchor: { x: TERMINAL_X[id], y: 124 / 130 },
  };
}

export const CHARACTER_LCD_DEFINITION = deepFreeze({
  family: 'display.character-lcd',
  variant: 'ideal-16x2-write-only-4bit-nine-terminal',
  type: CHARACTER_LCD_TYPE,
  version: 1,
  displayName: '16×2 character LCD · 4-bit GPIO',
  manufacturer: 'Intent Learning',
  partNumber: 'IL-LCD-1602-GPIO4',
  pins: [
    pin('VCC', '5 V logic supply', 'power-in', ['power.5v-reference'], { voltage: 5 }),
    pin('GND', 'Logic ground', 'ground', ['ground.reference'], { voltage: 0 }),
    pin('RS', 'Register select', 'digital-in', ['digital.hd44780-register-select'], { voltageMin: 0, voltageMax: 5 }),
    pin('RW', 'Read/write · ground for supported write-only mode', 'ground', ['ground.reference'], { requiredLevel: 'LOW', writeOnly: true }),
    pin('E', 'Enable · data latched on falling edge', 'digital-in', ['digital.hd44780-enable'], { voltageMin: 0, voltageMax: 5, latchEdge: 'falling' }),
    ...['D4', 'D5', 'D6', 'D7'].map((id) => pin(
      id, `${id} data`, 'digital-in', ['digital.hd44780-data-4bit'],
      { voltageMin: 0, voltageMax: 5, bit: Number(id.slice(1)) },
    )),
  ],
  propertyKeys: [],
  propertySchema: {},
  controlKeys: [],
  modelRef: CHARACTER_LCD_MODEL,
  internalTerminalGroups: [],
  selectable: true,
  artwork: {
    renderer: CHARACTER_LCD_RENDERER,
    thumbnail: CHARACTER_LCD_RENDERER,
    viewBox: [0, 0, 220, 130], cssWidth: 220, cssHeight: 130,
    provenance: 'Original IntentForce SVG assembled from basic geometric shapes; no traced package, photograph or third-party simulator artwork.',
    license: 'Apache-2.0',
  },
  catalog: {
    category: 'displays',
    aliases: ['character lcd', '16x2 lcd', '1602 display', '4 bit gpio display'],
    functions: ['two-line text display', 'gpio character output'],
    interfaces: ['GPIO 4-bit write-only'],
    supplyVolts: { min: 5, max: 5 },
    package: 'original virtual 16×2 nine-terminal teaching display',
  },
  support: {
    status: 'partial',
    limitations: [
      'Bounded HD44780-style write-only 4-bit decoder for one 16×2 display. VCC requires 5 V, GND and RW require ground, and RS, E and D4–D7 require six unique direct AVR D2–D13 outputs.',
      'Supported initialization is 0x3,0x3,0x3,0x2 followed by commands 0x28,0x0C,0x06,0x01 with enforced power-on, enable-pulse and instruction timing. Supported runtime commands are clear, home, 4-bit/2-line function set, display-on, increment entry mode and visible DDRAM addresses.',
      'Printable ASCII 0x20–0x7E, clear/home, visible DDRAM addressing, deterministic 16×2 wrapping, display on/off, cursor and blink state are rendered. Reads, busy flag, RW-high operation, custom glyphs/CGRAM, display shifts, 8-bit mode, I²C, backpacks, contrast, backlight, current and physical timing tolerances are unsupported.',
    ],
  },
});

export function validateCharacterLcdDefinition(definition = CHARACTER_LCD_DEFINITION) {
  return exactKeys(definition, [
    'family', 'variant', 'type', 'version', 'displayName', 'manufacturer', 'partNumber',
    'pins', 'propertyKeys', 'propertySchema', 'controlKeys', 'modelRef',
    'internalTerminalGroups', 'selectable', 'artwork', 'catalog', 'support',
  ]) && JSON.stringify(definition) === JSON.stringify(CHARACTER_LCD_DEFINITION);
}

export function createCharacterLcdComponent(id, label = '16×2 character LCD 4-bit GPIO') {
  const component = {
    id,
    type: CHARACTER_LCD_TYPE,
    label,
    properties: {},
    controls: {},
  };
  if (!validateCharacterLcdComponent(component)) throw new TypeError('CHARACTER_LCD_STATE');
  return component;
}

export function validateCharacterLcdComponent(component) {
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && component.type === CHARACTER_LCD_TYPE
    && exactKeys(component.properties, [])
    && exactKeys(component.controls, []);
}

function fail(code, details = []) { return { ok: false, code, details }; }
function endpointKey(endpoint) { return `${endpoint.component}.${endpoint.pin}`; }

function indexes(graph) {
  const components = new Map(graph.components.map((component) => [component.id, component]));
  const nets = new Map(graph.nets.map((net) => [net.id, net]));
  const endpointToNet = new Map();
  for (const net of graph.nets) {
    for (const endpoint of net.endpoints) endpointToNet.set(endpointKey(endpoint), net.id);
  }
  return { components, nets, endpointToNet };
}

function boardEndpoints(index, netId) {
  return (index.nets.get(netId)?.endpoints ?? []).filter(
    (endpoint) => index.components.get(endpoint.component)?.type === BOARD_TYPE,
  );
}

function inspectPower(index, component, pinId, netId) {
  if (!netId) return fail(`CHARACTER_LCD_${pinId}_DISCONNECTED`, [component.id, pinId]);
  const boards = boardEndpoints(index, netId);
  if (pinId === 'VCC') {
    if (!boards.some((endpoint) => endpoint.pin === '5V')) {
      return fail('CHARACTER_LCD_VCC_REQUIRES_5V', [component.id, netId]);
    }
    if (boards.some((endpoint) => endpoint.pin !== '5V')) {
      return fail('CHARACTER_LCD_VCC_UNSUPPORTED_TOPOLOGY', [component.id, netId]);
    }
  } else {
    if (!boards.some((endpoint) => GROUND_PIN.test(endpoint.pin))) {
      return fail(`CHARACTER_LCD_${pinId}_REQUIRES_GROUND`, [component.id, netId]);
    }
    if (boards.some((endpoint) => !GROUND_PIN.test(endpoint.pin))) {
      return fail(`CHARACTER_LCD_${pinId}_UNSUPPORTED_TOPOLOGY`, [component.id, netId]);
    }
  }
  return { ok: true };
}

function inspectSignal(index, component, signal, netId) {
  if (!netId) return fail(`CHARACTER_LCD_${signal}_DISCONNECTED`, [component.id, signal]);
  const endpoints = index.nets.get(netId)?.endpoints ?? [];
  const boards = boardEndpoints(index, netId);
  if (endpoints.length !== 2 || boards.length !== 1) {
    return fail(`CHARACTER_LCD_${signal}_UNSUPPORTED_TOPOLOGY`, [component.id, netId]);
  }
  const sourcePin = boards[0].pin;
  if (sourcePin === '5V' || GROUND_PIN.test(sourcePin)) {
    return fail(`CHARACTER_LCD_${signal}_REQUIRES_DIGITAL_OUTPUT`, [component.id, sourcePin]);
  }
  if (!DIGITAL_PIN.test(sourcePin) || !SUPPORTED_PINS.has(sourcePin)) {
    return fail(`CHARACTER_LCD_${signal}_UNSUPPORTED_OUTPUT`, [component.id, sourcePin]);
  }
  return { ok: true, signal, netId, sourcePin };
}

export function projectCharacterLcdDisplays(value, options = {}) {
  const componentType = options.componentType ?? CHARACTER_LCD_TYPE;
  const validateComponent = options.validateComponent ?? validateCharacterLcdComponent;
  const supportedGeometry = options.supportedGeometry ?? { columns: 16, rows: 2 };
  const decoder = options.decoder ?? CHARACTER_LCD_RUNTIME_ADAPTER;
  const graph = clone(value);
  const components = graph.components.filter((component) => component.type === componentType);
  if (!components.length) return { ok: true, runtimeGraph: graph, displays: [] };
  const index = indexes(graph);
  const displays = [];
  for (const component of components) {
    if (!validateComponent(component)) return fail('CHARACTER_LCD_STATE', [component.id]);
    const vccNet = index.endpointToNet.get(`${component.id}.VCC`) ?? null;
    const groundNet = index.endpointToNet.get(`${component.id}.GND`) ?? null;
    const rwNet = index.endpointToNet.get(`${component.id}.RW`) ?? null;
    const vcc = inspectPower(index, component, 'VCC', vccNet);
    if (!vcc.ok) return vcc;
    const ground = inspectPower(index, component, 'GND', groundNet);
    if (!ground.ok) return ground;
    const rw = inspectPower(index, component, 'RW', rwNet);
    if (!rw.ok) return rw;
    if (vccNet === groundNet || vccNet === rwNet) {
      return fail('CHARACTER_LCD_POWER_SHORT', [component.id, vccNet]);
    }
    if (rwNet !== groundNet) {
      return fail('CHARACTER_LCD_RW_REQUIRES_SHARED_GROUND', [component.id, rwNet, groundNet]);
    }
    const signals = {};
    for (const signal of CHARACTER_LCD_SIGNALS) {
      const inspected = inspectSignal(
        index, component, signal,
        index.endpointToNet.get(`${component.id}.${signal}`) ?? null,
      );
      if (!inspected.ok) return inspected;
      signals[signal] = inspected;
    }
    if (new Set(Object.values(signals).map((signal) => signal.netId)).size !== CHARACTER_LCD_SIGNALS.length) {
      return fail('CHARACTER_LCD_SIGNAL_SHORT', [component.id]);
    }
    if (new Set(Object.values(signals).map((signal) => signal.sourcePin)).size !== CHARACTER_LCD_SIGNALS.length) {
      return fail('CHARACTER_LCD_UNIQUE_OUTPUTS_REQUIRED', [component.id]);
    }
    displays.push({
      componentId: component.id,
      vccNet,
      groundNet,
      rwNet,
      signals: clone(signals),
      busMode: 'write-only-4-bit',
      decoder,
      supportedGeometry: clone(supportedGeometry),
      timing: clone(CHARACTER_LCD_TIMING),
    });
  }
  const ids = new Set(components.map((component) => component.id));
  graph.components = graph.components.filter((component) => !ids.has(component.id));
  graph.nets = graph.nets.map((net) => ({
    id: net.id,
    endpoints: net.endpoints.filter((endpoint) => !ids.has(endpoint.component)),
  })).filter((net) => net.endpoints.length >= 2);
  const netIds = new Set(graph.nets.map((net) => net.id));
  graph.junctions = graph.junctions.filter((junction) => netIds.has(junction.net));
  return { ok: true, runtimeGraph: graph, displays };
}

function validSignalMap(mapping) {
  return exactKeys(mapping, CHARACTER_LCD_SIGNALS)
    && CHARACTER_LCD_SIGNALS.every((signal) => /^D(?:[2-9]|1[0-3])$/u.test(mapping[signal]))
    && new Set(Object.values(mapping)).size === CHARACTER_LCD_SIGNALS.length;
}

function normalizeLcdOptions(options = {}) {
  const columns = options.columns ?? 16;
  const rows = options.rows ?? 2;
  const rowOffsets = options.rowOffsets ?? [0x00, 0x40];
  const customGlyphs = options.customGlyphs ?? false;
  if (!Number.isInteger(columns) || columns < 1 || columns > 40
      || !Number.isInteger(rows) || rows < 1 || rows > 4
      || !Array.isArray(rowOffsets) || rowOffsets.length !== rows
      || rowOffsets.some((offset) => !Number.isInteger(offset) || offset < 0 || offset > 0x7f)
      || new Set(rowOffsets).size !== rows || typeof customGlyphs !== 'boolean') {
    throw new TypeError('CHARACTER_LCD_GEOMETRY');
  }
  return Object.freeze({ columns, rows, rowOffsets: Object.freeze([...rowOffsets]), customGlyphs });
}

function blankRows(geometry) {
  return Array.from({ length: geometry.rows }, () => Array(geometry.columns).fill(0x20));
}

export class CharacterLcd4BitDecoder {
  constructor(mapping, options = {}) {
    if (!validSignalMap(mapping)) throw new TypeError('CHARACTER_LCD_SIGNAL_MAP');
    this.mapping = Object.freeze({ ...mapping });
    this.geometry = normalizeLcdOptions(options);
    this.reverse = new Map(Object.entries(mapping).map(([signal, pin]) => [Number(pin.slice(1)), signal]));
    this.reset();
  }

  reset() {
    this.levels = Object.fromEntries(CHARACTER_LCD_SIGNALS.map((signal) => [signal, false]));
    this.rows = blankRows(this.geometry);
    this.cgram = Array.from({ length: 8 }, () => Array(8).fill(0));
    this.addressSpace = 'ddram';
    this.address = 0;
    this.displayOn = false;
    this.cursorOn = false;
    this.blinkOn = false;
    this.status = 'awaiting-initialization';
    this.error = null;
    this.initNibbleIndex = 0;
    this.initCommandIndex = 0;
    this.lastInitCycle = null;
    this.readyCycle = 0;
    this.enableRiseCycle = null;
    this.enableDirty = false;
    this.pendingNibble = null;
    this.lastTraceCycle = -1;
    this.latchedNibbles = 0;
    this.latchedBytes = 0;
    return this.snapshot();
  }

  #reject(code, details = []) {
    if (!this.error) this.error = { code, details: clone(details) };
    this.status = 'error';
    return false;
  }

  #minimumInitGap() {
    if (this.initNibbleIndex === 1) return CHARACTER_LCD_TIMING.firstRepeatedInitGapCycles;
    return CHARACTER_LCD_TIMING.laterInitGapCycles;
  }

  #latchNibble(cycle) {
    const nibble = Number(this.levels.D4)
      | Number(this.levels.D5) << 1
      | Number(this.levels.D6) << 2
      | Number(this.levels.D7) << 3;
    const rs = this.levels.RS;
    this.latchedNibbles += 1;
    if (this.initNibbleIndex < CHARACTER_LCD_INITIALIZATION.nibbles.length) {
      if (rs) return this.#reject('CHARACTER_LCD_INIT_RS_HIGH', [cycle]);
      const expected = CHARACTER_LCD_INITIALIZATION.nibbles[this.initNibbleIndex];
      if (nibble !== expected) {
        return this.#reject('CHARACTER_LCD_INIT_SEQUENCE', [this.initNibbleIndex, expected, nibble]);
      }
      if (this.initNibbleIndex === 0) {
        if (cycle < CHARACTER_LCD_TIMING.powerOnMinimumCycles) {
          return this.#reject('CHARACTER_LCD_POWER_ON_TIMING', [cycle]);
        }
      } else if (cycle - this.lastInitCycle < this.#minimumInitGap()) {
        return this.#reject('CHARACTER_LCD_INIT_TIMING', [this.initNibbleIndex, cycle - this.lastInitCycle]);
      }
      this.lastInitCycle = cycle;
      this.initNibbleIndex += 1;
      if (this.initNibbleIndex === CHARACTER_LCD_INITIALIZATION.nibbles.length) {
        this.status = 'initializing-commands';
        this.readyCycle = cycle + CHARACTER_LCD_TIMING.instructionMinimumCycles;
      }
      return true;
    }
    if (!this.pendingNibble) {
      if (cycle < this.readyCycle) {
        return this.#reject('CHARACTER_LCD_INSTRUCTION_TIMING', [cycle, this.readyCycle]);
      }
      this.pendingNibble = { value: nibble, rs, cycle };
      return true;
    }
    if (this.pendingNibble.rs !== rs) {
      return this.#reject('CHARACTER_LCD_RS_CHANGED_BETWEEN_NIBBLES', [this.pendingNibble.cycle, cycle]);
    }
    const byte = (this.pendingNibble.value << 4) | nibble;
    const byteRs = rs;
    this.pendingNibble = null;
    this.latchedBytes += 1;
    return byteRs ? this.#writeData(byte, cycle) : this.#writeCommand(byte, cycle);
  }

  #writeCommand(command, cycle) {
    if (this.initCommandIndex < CHARACTER_LCD_INITIALIZATION.commands.length) {
      const expected = CHARACTER_LCD_INITIALIZATION.commands[this.initCommandIndex];
      if (command !== expected) {
        return this.#reject('CHARACTER_LCD_INIT_COMMAND', [this.initCommandIndex, expected, command]);
      }
      this.initCommandIndex += 1;
      if ((command & 0xf8) === 0x08) {
        this.displayOn = Boolean(command & 0x04);
        this.cursorOn = Boolean(command & 0x02);
        this.blinkOn = Boolean(command & 0x01);
      }
      if (command === 0x01) { this.rows = blankRows(this.geometry); this.address = 0; this.addressSpace = 'ddram'; }
      this.readyCycle = cycle + (command === 0x01
        ? CHARACTER_LCD_TIMING.clearHomeMinimumCycles
        : CHARACTER_LCD_TIMING.instructionMinimumCycles);
      if (this.initCommandIndex === CHARACTER_LCD_INITIALIZATION.commands.length) {
        this.status = 'ready';
      }
      return true;
    }
    if (command === 0x01) {
      this.rows = blankRows(this.geometry); this.address = 0; this.addressSpace = 'ddram';
      this.readyCycle = cycle + CHARACTER_LCD_TIMING.clearHomeMinimumCycles;
      return true;
    }
    if (command === 0x02) {
      this.address = 0; this.addressSpace = 'ddram';
      this.readyCycle = cycle + CHARACTER_LCD_TIMING.clearHomeMinimumCycles;
      return true;
    }
    if (command === 0x28 || command === 0x06 || (command & 0xf8) === 0x08) {
      if ((command & 0xf8) === 0x08) {
        this.displayOn = Boolean(command & 0x04);
        this.cursorOn = Boolean(command & 0x02);
        this.blinkOn = Boolean(command & 0x01);
      }
      this.readyCycle = cycle + CHARACTER_LCD_TIMING.instructionMinimumCycles;
      return true;
    }
    if (command & 0x80) {
      const address = command & 0x7f;
      if (!this.#visiblePosition(address)) {
        return this.#reject('CHARACTER_LCD_DDRAM_ADDRESS_UNSUPPORTED', [address]);
      }
      this.address = address; this.addressSpace = 'ddram';
      this.readyCycle = cycle + CHARACTER_LCD_TIMING.instructionMinimumCycles;
      return true;
    }
    if ((command & 0xc0) === 0x40) {
      if (!this.geometry.customGlyphs) return this.#reject('CHARACTER_LCD_COMMAND_UNSUPPORTED', [command]);
      this.address = command & 0x3f; this.addressSpace = 'cgram';
      this.readyCycle = cycle + CHARACTER_LCD_TIMING.instructionMinimumCycles;
      return true;
    }
    return this.#reject('CHARACTER_LCD_COMMAND_UNSUPPORTED', [command]);
  }

  #visiblePosition(address) {
    for (let row = 0; row < this.geometry.rows; row += 1) {
      const offset = this.geometry.rowOffsets[row];
      if (address >= offset && address < offset + this.geometry.columns) {
        return { row, column: address - offset };
      }
    }
    return null;
  }

  #nextDdramAddress(row, column) {
    if (column + 1 < this.geometry.columns) return this.geometry.rowOffsets[row] + column + 1;
    return this.geometry.rowOffsets[(row + 1) % this.geometry.rows];
  }

  #writeData(value, cycle) {
    if (this.status !== 'ready') return this.#reject('CHARACTER_LCD_DATA_BEFORE_READY', [value]);
    if (this.addressSpace === 'cgram') {
      const slot = Math.floor(this.address / 8);
      const row = this.address % 8;
      this.cgram[slot][row] = value & 0x1f;
      this.address = (this.address + 1) & 0x3f;
      this.readyCycle = cycle + CHARACTER_LCD_TIMING.instructionMinimumCycles;
      return true;
    }
    if ((value < 0x20 || value > 0x7e) && !(this.geometry.customGlyphs && value >= 0 && value <= 7)) {
      return this.#reject('CHARACTER_LCD_CHARACTER_UNSUPPORTED', [value]);
    }
    const position = this.#visiblePosition(this.address);
    if (!position) {
      return this.#reject('CHARACTER_LCD_DDRAM_ADDRESS_UNSUPPORTED', [this.address]);
    }
    this.rows[position.row][position.column] = value;
    this.address = this.#nextDdramAddress(position.row, position.column);
    this.readyCycle = cycle + CHARACTER_LCD_TIMING.instructionMinimumCycles;
    return true;
  }

  consume(trace, { logicDrops = 0 } = {}) {
    if (this.error) return this.snapshot();
    if (!Array.isArray(trace) || !Number.isInteger(logicDrops) || logicDrops < 0) {
      this.#reject('CHARACTER_LCD_TRACE_SHAPE');
      return this.snapshot();
    }
    if (logicDrops > 0) {
      this.#reject('CHARACTER_LCD_TRACE_DROPPED', [logicDrops]);
      return this.snapshot();
    }
    for (const event of trace) {
      if (!event || !Number.isSafeInteger(event.cycle) || typeof event.pin !== 'number'
          || typeof event.level !== 'boolean') {
        this.#reject('CHARACTER_LCD_TRACE_EVENT');
        break;
      }
      if (event.cycle < this.lastTraceCycle) {
        this.#reject('CHARACTER_LCD_TRACE_ORDER', [this.lastTraceCycle, event.cycle]);
        break;
      }
      this.lastTraceCycle = event.cycle;
      const signal = this.reverse.get(event.pin);
      if (!signal || this.levels[signal] === event.level) continue;
      if (signal === 'E') {
        if (event.level) {
          this.enableRiseCycle = event.cycle;
          this.enableDirty = false;
          this.levels.E = true;
        } else {
          if (this.enableRiseCycle === null) {
            this.#reject('CHARACTER_LCD_ENABLE_EDGE', [event.cycle]);
            break;
          }
          const highCycles = event.cycle - this.enableRiseCycle;
          if (highCycles < CHARACTER_LCD_TIMING.enableHighMinimumCycles) {
            this.#reject('CHARACTER_LCD_ENABLE_PULSE', [highCycles]);
            break;
          }
          if (this.enableDirty) {
            this.#reject('CHARACTER_LCD_DATA_CHANGED_WHILE_ENABLED', [this.enableRiseCycle, event.cycle]);
            break;
          }
          if (!this.#latchNibble(event.cycle)) break;
          this.levels.E = false;
          this.enableRiseCycle = null;
        }
      } else {
        if (this.levels.E) this.enableDirty = true;
        this.levels[signal] = event.level;
      }
    }
    return this.snapshot();
  }

  snapshot() {
    return clone({
      status: this.status,
      error: this.error,
      lines: this.rows.map((row) => row.map((value) => String.fromCharCode(value)).join('')),
      cellCodes: this.rows,
      customGlyphs: this.cgram,
      addressSpace: this.addressSpace,
      geometry: this.geometry,
      address: this.address,
      displayOn: this.displayOn,
      cursorOn: this.cursorOn,
      blinkOn: this.blinkOn,
      initialized: this.initCommandIndex === CHARACTER_LCD_INITIALIZATION.commands.length,
      initNibbleIndex: this.initNibbleIndex,
      initCommandIndex: this.initCommandIndex,
      readyCycle: this.readyCycle,
      latchedNibbles: this.latchedNibbles,
      latchedBytes: this.latchedBytes,
    });
  }
}

export function createCharacterLcd4BitDecoder(mapping, options = {}) {
  return new CharacterLcd4BitDecoder(mapping, options);
}
