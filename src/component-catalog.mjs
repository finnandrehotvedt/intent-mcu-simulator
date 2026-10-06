// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const CATALOG_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'controllers', label: 'Controllers and development boards' }),
  Object.freeze({ id: 'passives', label: 'Passive components' }),
  Object.freeze({ id: 'power', label: 'Power and regulation' }),
  Object.freeze({ id: 'inputs', label: 'Inputs and switches' }),
  Object.freeze({ id: 'sensors', label: 'Sensors' }),
  Object.freeze({ id: 'displays', label: 'Displays and indicators' }),
  Object.freeze({ id: 'communication', label: 'Communication modules' }),
  Object.freeze({ id: 'drivers', label: 'Drivers and actuators' }),
  Object.freeze({ id: 'connectors', label: 'Connectors and prototyping' }),
]);

export const SUPPORT_STATUS = Object.freeze({
  simulated: 'Simulated', partial: 'Partial', visual: 'Visual only',
});

const digitalPins = Array.from({ length: 14 }, (_, index) => `D${index}`);
const analoguePins = Array.from({ length: 6 }, (_, index) => `A${index}`);

function pin(id, label, role, signals, x, y, constraints = {}) {
  return Object.freeze({
    id, label, role,
    signals: Object.freeze(signals),
    capabilities: Object.freeze([...signals]),
    constraints: Object.freeze({ ...constraints }),
    anchor: Object.freeze({ x, y }),
  });
}

const boardPins = Object.freeze([
  ...digitalPins.map((id, index) => pin(
    id, id, 'digital-io',
    ['digital.bidirectional', 'digital.input', 'digital.pull-up'],
    0.17 + index * (0.76 / 13), 0.085,
    { voltageMin: 0, voltageMax: 5 },
  )),
  ...analoguePins.map((id, index) => pin(
    id, id, 'analogue-in', ['analogue.scalar-0-5v'],
    0.54 + index * 0.07, 0.915,
    { voltageMin: 0, voltageMax: 5 },
  )),
  pin('5V', '5 V', 'power-out', ['power.5v-reference'], 0.17, 0.915, { voltage: 5 }),
  pin('GND1', 'GND', 'ground', ['ground.reference'], 0.25, 0.915),
  pin('GND2', 'GND', 'ground', ['ground.reference'], 0.32, 0.915),
  pin('GND3', 'GND', 'ground', ['ground.reference'], 0.39, 0.915),
]);

function freezeDefinition(definition) {
  return Object.freeze({
    ...definition,
    propertyKeys: Object.freeze(definition.propertyKeys),
    controlKeys: Object.freeze(definition.controlKeys),
    pins: Object.freeze(definition.pins),
    internalTerminalGroups: Object.freeze((definition.internalTerminalGroups ?? []).map((group) => Object.freeze({
      ...group, terminals: Object.freeze(group.terminals),
    }))),
    artwork: Object.freeze({ ...definition.artwork, viewBox: Object.freeze(definition.artwork.viewBox) }),
    catalog: Object.freeze({
      ...definition.catalog,
      aliases: Object.freeze(definition.catalog.aliases),
      functions: Object.freeze(definition.catalog.functions),
      interfaces: Object.freeze(definition.catalog.interfaces),
      supplyVolts: Object.freeze({ ...definition.catalog.supplyVolts }),
    }),
    support: Object.freeze({ ...definition.support, limitations: Object.freeze(definition.support.limitations) }),
  });
}

const commonArtwork = Object.freeze({
  provenance: 'Original project SVG assembled from basic geometry; no third-party simulator artwork or traced image.',
  license: 'Apache-2.0',
});

export const COMPONENT_CATALOG = Object.freeze({
  'board.atmega328p-16mhz-v1': freezeDefinition({
    family: 'board.atmega328p-learning', variant: '16mhz-5v',
    type: 'board.atmega328p-16mhz-v1', version: 1,
    displayName: 'ATmega328P 16 MHz learning board', manufacturer: 'Intent Learning', partNumber: 'IL-328P-16-5V',
    pins: boardPins, propertyKeys: [], controlKeys: [], modelRef: 'model.atmega328p-board-v1',
    internalTerminalGroups: [], selectable: true,
    artwork: { ...commonArtwork, renderer: 'board-atmega328p', thumbnail: 'board-atmega328p', viewBox: [0, 0, 160, 80], cssWidth: 300, cssHeight: 150 },
    catalog: {
      category: 'controllers', aliases: ['avr board', 'microcontroller', 'development board', '328p'],
      functions: ['firmware execution', 'gpio controller', 'analogue input'],
      interfaces: ['GPIO', 'analogue', 'PWM', 'UART'], supplyVolts: { min: 5, max: 5 }, package: 'development board',
    },
    support: { status: 'simulated', limitations: ['Tested ATmega328P subset only; not complete physical-board equivalence.'] },
  }),
  'led.basic-v1': freezeDefinition({
    family: 'indicator.led-through-hole', variant: '5mm-basic',
    type: 'led.basic-v1', version: 1, displayName: '5 mm through-hole LED', manufacturer: 'Generic', partNumber: 'LED-5MM-BASIC',
    pins: [
      pin('ANODE', 'Anode (+)', 'passive', ['passive.two-terminal'], 0.38, 0.93, { polarity: 'anode' }),
      pin('CATHODE', 'Cathode (−)', 'passive', ['passive.two-terminal'], 0.66, 0.93, { polarity: 'cathode' }),
    ],
    propertyKeys: ['color'], controlKeys: [], modelRef: 'model.led-current-v1', internalTerminalGroups: [], selectable: true,
    artwork: { ...commonArtwork, renderer: 'led-through-hole', thumbnail: 'led-through-hole', viewBox: [0, 0, 70, 100], cssWidth: 70, cssHeight: 100 },
    catalog: {
      category: 'displays', aliases: ['light emitting diode', 'indicator light'], functions: ['indicator', 'light output'],
      interfaces: ['GPIO'], supplyVolts: { min: 1.8, max: 3.4 }, package: '5 mm through-hole',
    },
    support: { status: 'simulated', limitations: ['Bounded polarity, current and relative-brightness model; requires validated series resistor.'] },
  }),
  'resistor.fixed-v1': freezeDefinition({
    family: 'passive.resistor-axial', variant: 'quarter-watt',
    type: 'resistor.fixed-v1', version: 1, displayName: 'Axial fixed resistor', manufacturer: 'Generic', partNumber: 'RES-AXIAL-025W',
    pins: [
      pin('A', 'Lead A', 'passive', ['passive.two-terminal'], 0.03, 0.5),
      pin('B', 'Lead B', 'passive', ['passive.two-terminal'], 0.97, 0.5),
    ],
    propertyKeys: ['ohms'], controlKeys: [], modelRef: 'model.resistor-fixed-v1', internalTerminalGroups: [], selectable: true,
    artwork: { ...commonArtwork, renderer: 'resistor-axial', thumbnail: 'resistor-axial', viewBox: [0, 0, 150, 48], cssWidth: 150, cssHeight: 48 },
    catalog: {
      category: 'passives', aliases: ['resistance', 'current limiting resistor'], functions: ['current limiting', 'series resistance'],
      interfaces: ['passive'], supplyVolts: { min: 0, max: 5 }, package: 'axial through-hole',
    },
    support: { status: 'simulated', limitations: ['Bounded ideal resistance in supported teaching topologies; no thermal model.'] },
  }),
  'button.momentary-v1': freezeDefinition({
    family: 'input.tactile-switch', variant: 'four-terminal-no',
    type: 'button.momentary-v1', version: 1, displayName: 'Four-terminal tactile button', manufacturer: 'Generic', partNumber: 'SW-TACT-4-NO',
    pins: [
      pin('A', 'Terminal group A · attach A1', 'passive', ['passive.two-terminal'], 0.08, 20 / 78, { terminals: ['A1', 'A2'], attachmentTerminal: 'A1' }),
      pin('B', 'Terminal group B · attach B1', 'passive', ['passive.two-terminal'], 0.92, 20 / 78, { terminals: ['B1', 'B2'], attachmentTerminal: 'B1' }),
    ],
    propertyKeys: ['normallyOpen'], controlKeys: ['pressed'], modelRef: 'model.button-momentary-no-v1',
    internalTerminalGroups: [
      { pin: 'A', terminals: ['A1', 'A2'] }, { pin: 'B', terminals: ['B1', 'B2'] },
    ],
    selectable: true,
    artwork: { ...commonArtwork, renderer: 'button-tactile', thumbnail: 'button-tactile', viewBox: [0, 0, 100, 78], cssWidth: 100, cssHeight: 78 },
    catalog: {
      category: 'inputs', aliases: ['pushbutton', 'tact switch', 'momentary switch'], functions: ['digital input', 'user switch'],
      interfaces: ['GPIO'], supplyVolts: { min: 0, max: 5 }, package: 'four-terminal through-hole',
    },
    support: { status: 'simulated', limitations: ['Normally-open ideal contact; A1/A2 and B1/B2 are explicit internally common terminal groups.'] },
  }),
  'potentiometer.linear-v1': freezeDefinition({
    family: 'input.potentiometer-rotary', variant: 'linear-three-terminal',
    type: 'potentiometer.linear-v1', version: 1, displayName: 'Linear rotary potentiometer', manufacturer: 'Generic', partNumber: 'POT-ROT-LIN-3',
    pins: [
      pin('HIGH', 'High terminal', 'passive', ['power.5v-reference'], 0.19, 0.91),
      pin('WIPER', 'Wiper', 'passive', ['analogue.scalar-0-5v'], 0.5, 0.96),
      pin('LOW', 'Low terminal', 'passive', ['ground.reference'], 0.81, 0.91),
    ],
    propertyKeys: ['ohms', 'taper'], controlKeys: ['position'], modelRef: 'model.pot-divider-v1', internalTerminalGroups: [], selectable: true,
    artwork: { ...commonArtwork, renderer: 'potentiometer-rotary', thumbnail: 'potentiometer-rotary', viewBox: [0, 0, 110, 100], cssWidth: 110, cssHeight: 100 },
    catalog: {
      category: 'inputs', aliases: ['pot', 'variable resistor', 'rotary control'], functions: ['analogue input', 'voltage divider'],
      interfaces: ['analogue'], supplyVolts: { min: 0, max: 5 }, package: 'three-terminal rotary through-hole',
    },
    support: { status: 'simulated', limitations: ['Linear 5 V divider only; no loading, tolerance or non-linear taper model.'] },
  }),
  'terminal.serial-uart-v1': freezeDefinition({
    family: 'instrument.serial-terminal', variant: 'uart0',
    type: 'terminal.serial-uart-v1', version: 1, displayName: 'USART0 serial instrument', manufacturer: 'Intent Learning', partNumber: 'INSTR-UART0',
    pins: [], propertyKeys: ['baud', 'encoding', 'historyLimit'], controlKeys: [], modelRef: 'model.usart0-instrument-v1',
    internalTerminalGroups: [], selectable: false,
    artwork: { ...commonArtwork, renderer: 'instrument-serial', thumbnail: 'instrument-serial', viewBox: [0, 0, 100, 60], cssWidth: 100, cssHeight: 60 },
    catalog: {
      category: 'communication', aliases: ['serial terminal', 'uart console'], functions: ['serial inspection'],
      interfaces: ['UART'], supplyVolts: { min: 0, max: 5 }, package: 'virtual instrument',
    },
    support: { status: 'simulated', limitations: ['Virtual USART0 instrument; not a placed physical component.'] },
  }),
});

export const CIRCUIT_LIMITS = Object.freeze({ components: 64, nets: 128, endpoints: 256 });
export const LED_FORWARD_VOLTS = Object.freeze({ red: 2, yellow: 2.1, green: 2.2, blue: 3 });

export function catalogType(type) { return COMPONENT_CATALOG[type] ?? null; }
export function catalogPin(type, id) { return catalogType(type)?.pins.find((item) => item.id === id) ?? null; }
export function catalogEntries({ selectableOnly = false } = {}) {
  const entries = Object.values(COMPONENT_CATALOG);
  return selectableOnly ? entries.filter((entry) => entry.selectable) : entries;
}

export function catalogSearchText(definition) {
  const metadata = definition.catalog;
  return [
    definition.displayName, definition.manufacturer, definition.partNumber,
    definition.type, definition.family, definition.variant, metadata.category,
    metadata.package, definition.support.status, SUPPORT_STATUS[definition.support.status],
    ...metadata.aliases, ...metadata.functions, ...metadata.interfaces,
    metadata.supplyVolts.min, metadata.supplyVolts.max,
  ].join(' ').toLocaleLowerCase('en');
}

export function filterCatalog(records, filters = {}) {
  const tokens = String(filters.query ?? '').trim().toLocaleLowerCase('en').split(/\s+/u).filter(Boolean);
  return records.filter((definition) => {
    if (filters.category && filters.category !== 'all' && definition.catalog.category !== filters.category) return false;
    if (filters.status && filters.status !== 'all' && definition.support.status !== filters.status) return false;
    if (filters.interface && filters.interface !== 'all' && !definition.catalog.interfaces.includes(filters.interface)) return false;
    const search = catalogSearchText(definition);
    return tokens.every((token) => search.includes(token));
  });
}

export function validateCatalogDefinition(definition) {
  const categories = new Set(CATALOG_CATEGORIES.map((category) => category.id));
  if (!definition || typeof definition !== 'object' || !definition.family || !definition.variant
      || !definition.type || !Number.isInteger(definition.version) || !definition.modelRef
      || !categories.has(definition.catalog?.category) || !Object.hasOwn(SUPPORT_STATUS, definition.support?.status)
      || definition.artwork?.license !== 'Apache-2.0' || !definition.artwork?.provenance
      || !Array.isArray(definition.artwork?.viewBox) || definition.artwork.viewBox.length !== 4) return false;
  return definition.pins.every((item) => item.id && item.label && item.role
    && Array.isArray(item.capabilities) && item.anchor.x >= 0 && item.anchor.x <= 1
    && item.anchor.y >= 0 && item.anchor.y <= 1);
}

export function defaultProperties(type) {
  if (type === 'board.atmega328p-16mhz-v1') return {};
  if (type === 'led.basic-v1') return { color: 'red' };
  if (type === 'resistor.fixed-v1') return { ohms: 220 };
  if (type === 'button.momentary-v1') return { normallyOpen: true };
  if (type === 'potentiometer.linear-v1') return { ohms: 10_000, taper: 'linear' };
  if (type === 'terminal.serial-uart-v1') return { baud: 9_600, encoding: 'utf-8', historyLimit: 512 };
  throw new Error(`Unknown component type: ${type}`);
}

export function defaultControls(type) {
  if (type === 'button.momentary-v1') return { pressed: false };
  if (type === 'potentiometer.linear-v1') return { position: 0.5 };
  if (catalogType(type)) return {};
  throw new Error(`Unknown component type: ${type}`);
}
