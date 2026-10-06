// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const digitalPins = Array.from({ length: 14 }, (_, index) => `D${index}`);
const analoguePins = Array.from({ length: 6 }, (_, index) => `A${index}`);

function pin(id, role, signals, side, order) {
  return Object.freeze({ id, role, signals: Object.freeze(signals), anchor: Object.freeze({ side, order }) });
}

const boardPins = Object.freeze([
  ...digitalPins.map((id, index) => pin(id, 'digital-io', ['digital.bidirectional', 'digital.input', 'digital.pull-up'], 'top', index)),
  ...analoguePins.map((id, index) => pin(id, 'analogue-in', ['analogue.scalar-0-5v'], 'bottom', index)),
  pin('5V', 'power-out', ['power.5v-reference'], 'bottom', 6),
  pin('GND1', 'ground', ['ground.reference'], 'bottom', 7),
  pin('GND2', 'ground', ['ground.reference'], 'bottom', 8),
  pin('GND3', 'ground', ['ground.reference'], 'bottom', 9),
]);

export const COMPONENT_CATALOG = Object.freeze({
  'board.atmega328p-16mhz-v1': Object.freeze({
    type: 'board.atmega328p-16mhz-v1', version: 1, displayName: 'ATmega328P 16 MHz board',
    pins: boardPins, propertyKeys: Object.freeze([]), controlKeys: Object.freeze([]), visualKey: 'board-avr-v1',
  }),
  'led.basic-v1': Object.freeze({
    type: 'led.basic-v1', version: 1, displayName: 'LED',
    pins: Object.freeze([
      pin('ANODE', 'passive', ['passive.two-terminal'], 'left', 0),
      pin('CATHODE', 'passive', ['passive.two-terminal'], 'right', 0),
    ]),
    propertyKeys: Object.freeze(['color']), controlKeys: Object.freeze([]), visualKey: 'led-basic-v1',
  }),
  'resistor.fixed-v1': Object.freeze({
    type: 'resistor.fixed-v1', version: 1, displayName: 'Fixed resistor',
    pins: Object.freeze([
      pin('A', 'passive', ['passive.two-terminal'], 'left', 0),
      pin('B', 'passive', ['passive.two-terminal'], 'right', 0),
    ]),
    propertyKeys: Object.freeze(['ohms']), controlKeys: Object.freeze([]), visualKey: 'resistor-fixed-v1',
  }),
  'button.momentary-v1': Object.freeze({
    type: 'button.momentary-v1', version: 1, displayName: 'Momentary button',
    pins: Object.freeze([
      pin('A', 'passive', ['passive.two-terminal'], 'left', 0),
      pin('B', 'passive', ['passive.two-terminal'], 'right', 0),
    ]),
    propertyKeys: Object.freeze(['normallyOpen']), controlKeys: Object.freeze(['pressed']), visualKey: 'button-momentary-v1',
  }),
  'potentiometer.linear-v1': Object.freeze({
    type: 'potentiometer.linear-v1', version: 1, displayName: 'Linear potentiometer',
    pins: Object.freeze([
      pin('HIGH', 'passive', ['power.5v-reference'], 'left', 0),
      pin('WIPER', 'passive', ['analogue.scalar-0-5v'], 'top', 0),
      pin('LOW', 'passive', ['ground.reference'], 'right', 0),
    ]),
    propertyKeys: Object.freeze(['ohms', 'taper']), controlKeys: Object.freeze(['position']), visualKey: 'pot-linear-v1',
  }),
  'terminal.serial-uart-v1': Object.freeze({
    type: 'terminal.serial-uart-v1', version: 1, displayName: 'USART0 serial instrument',
    pins: Object.freeze([]), propertyKeys: Object.freeze(['baud', 'encoding', 'historyLimit']),
    controlKeys: Object.freeze([]), visualKey: 'instrument-serial-v1',
  }),
});

export const CIRCUIT_LIMITS = Object.freeze({ components: 64, nets: 128, endpoints: 256 });
export const LED_FORWARD_VOLTS = Object.freeze({ red: 2, yellow: 2.1, green: 2.2, blue: 3 });

export function catalogType(type) { return COMPONENT_CATALOG[type] ?? null; }
export function catalogPin(type, id) { return catalogType(type)?.pins.find((item) => item.id === id) ?? null; }

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
