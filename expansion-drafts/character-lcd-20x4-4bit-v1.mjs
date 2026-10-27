// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from '../src/strict-json.mjs';
import {
  CHARACTER_LCD_DEFINITION,
  CHARACTER_LCD_RUNTIME_ADAPTER,
  createCharacterLcd4BitDecoder,
  projectCharacterLcdDisplays,
} from './character-lcd-16x2-4bit-v1.mjs';

export const CHARACTER_LCD_20X4_TYPE = 'output.character-lcd-20x4-4bit-v1';
export const CHARACTER_LCD_20X4_MODEL = 'model.character-lcd-20x4-cgram-write-only-4bit-v1';
export const CHARACTER_LCD_20X4_RENDERER = 'output-character-lcd-20x4-4bit';
export const CHARACTER_LCD_20X4_RUNTIME_ADAPTER = `${CHARACTER_LCD_RUNTIME_ADAPTER}-20x4-cgram`;
export const CHARACTER_LCD_20X4_GEOMETRY = Object.freeze({
  columns: 20,
  rows: 4,
  rowOffsets: Object.freeze([0x00, 0x40, 0x14, 0x54]),
  customGlyphs: true,
});

const definition = structuredClone(CHARACTER_LCD_DEFINITION);
definition.variant = 'ideal-20x4-write-only-4bit-cgram-nine-terminal';
definition.type = CHARACTER_LCD_20X4_TYPE;
definition.displayName = '20×4 character LCD · 4-bit GPIO';
definition.partNumber = 'IL-LCD-2004-GPIO4-CGRAM';
definition.modelRef = CHARACTER_LCD_20X4_MODEL;
for (const [index, pin] of definition.pins.entries()) {
  pin.anchor = { x: (12 + index * 29) / 260, y: 175 / 180 };
}
definition.artwork = {
  ...definition.artwork,
  renderer: CHARACTER_LCD_20X4_RENDERER,
  thumbnail: CHARACTER_LCD_20X4_RENDERER,
  viewBox: [0, 0, 260, 180],
  cssWidth: 260,
  cssHeight: 180,
};
definition.catalog = {
  ...definition.catalog,
  aliases: ['character lcd', '20x4 lcd', '2004 display', '4 bit gpio display', 'custom glyph lcd'],
  functions: ['four-line text display', 'gpio character output', 'eight custom CGRAM glyphs'],
  package: 'original virtual 20×4 nine-terminal teaching display',
};
definition.support = {
  status: 'partial',
  limitations: [
    'Bounded AVR-only HD44780-style write-only 4-bit decoder for one 20×4 display. It uses the same exact 5 V, shared-ground RW and six unique direct GPIO requirements as the qualified 16×2 path.',
    'Visible DDRAM uses exact row starts 0x00, 0x40, 0x14 and 0x54 with deterministic 20-column wrapping. Clear, home, display on/off, cursor, blink and increment entry mode are supported.',
    'CGRAM addresses 0x00–0x3F define eight 5×8 custom glyph slots. Character codes 0–7 render those exact five-bit rows. Reads, busy flag, RW-high operation, shifts, 8-bit mode, I²C, contrast, backlight, current and physical timing tolerances remain unsupported.',
  ],
};

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const CHARACTER_LCD_20X4_DEFINITION = deepFreeze(definition);

export function validateCharacterLcd20x4Definition(value = CHARACTER_LCD_20X4_DEFINITION) {
  return exactKeys(value, [
    'family', 'variant', 'type', 'version', 'displayName', 'manufacturer', 'partNumber',
    'pins', 'propertyKeys', 'propertySchema', 'controlKeys', 'modelRef',
    'internalTerminalGroups', 'selectable', 'artwork', 'catalog', 'support',
  ]) && JSON.stringify(value) === JSON.stringify(CHARACTER_LCD_20X4_DEFINITION);
}

export function createCharacterLcd20x4Component(id, label = '20×4 character LCD with CGRAM') {
  const component = { id, type: CHARACTER_LCD_20X4_TYPE, label, properties: {}, controls: {} };
  if (!validateCharacterLcd20x4Component(component)) throw new TypeError('CHARACTER_LCD_20X4_STATE');
  return component;
}

export function validateCharacterLcd20x4Component(component) {
  return exactKeys(component, ['id', 'type', 'label', 'properties', 'controls'])
    && component.type === CHARACTER_LCD_20X4_TYPE
    && exactKeys(component.properties, []) && exactKeys(component.controls, []);
}

export function projectCharacterLcd20x4Displays(value) {
  return projectCharacterLcdDisplays(value, {
    componentType: CHARACTER_LCD_20X4_TYPE,
    validateComponent: validateCharacterLcd20x4Component,
    supportedGeometry: CHARACTER_LCD_20X4_GEOMETRY,
    decoder: CHARACTER_LCD_20X4_RUNTIME_ADAPTER,
  });
}

export function createCharacterLcd20x4Decoder(mapping) {
  return createCharacterLcd4BitDecoder(mapping, CHARACTER_LCD_20X4_GEOMETRY);
}
