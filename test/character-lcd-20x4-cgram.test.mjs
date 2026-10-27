// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHARACTER_LCD_INITIALIZATION,
  CHARACTER_LCD_SIGNALS,
  CHARACTER_LCD_TIMING,
} from '../expansion-drafts/character-lcd-16x2-4bit-v1.mjs';
import {
  CHARACTER_LCD_20X4_DEFINITION,
  CHARACTER_LCD_20X4_GEOMETRY,
  CHARACTER_LCD_20X4_TYPE,
  createCharacterLcd20x4Component,
  createCharacterLcd20x4Decoder,
  validateCharacterLcd20x4Definition,
} from '../expansion-drafts/character-lcd-20x4-4bit-v1.mjs';

const MAPPING = Object.freeze({ RS: 'D3', E: 'D4', D4: 'D5', D5: 'D6', D6: 'D7', D7: 'D8' });

function initializedWriter() {
  const levels = Object.fromEntries(CHARACTER_LCD_SIGNALS.map((signal) => [signal, false]));
  const events = [];
  const set = (signal, level, cycle) => {
    if (levels[signal] === Boolean(level)) return;
    levels[signal] = Boolean(level);
    events.push({ cycle, pin: Number(MAPPING[signal].slice(1)), level: Boolean(level) });
  };
  const nibble = (value, rs, cycle) => {
    set('RS', rs, cycle);
    for (let bit = 0; bit < 4; bit += 1) set(`D${bit + 4}`, Boolean(value & (1 << bit)), cycle);
    set('E', true, cycle + 1); set('E', false, cycle + 9);
    return cycle + 9;
  };
  const byte = (value, rs, cycle) => nibble(value & 0x0f, rs, nibble(value >> 4, rs, cycle) + 16);
  let cycle = CHARACTER_LCD_TIMING.powerOnMinimumCycles;
  cycle = nibble(0x3, false, cycle);
  cycle = nibble(0x3, false, cycle + CHARACTER_LCD_TIMING.firstRepeatedInitGapCycles);
  cycle = nibble(0x3, false, cycle + CHARACTER_LCD_TIMING.laterInitGapCycles);
  cycle = nibble(0x2, false, cycle + CHARACTER_LCD_TIMING.laterInitGapCycles);
  for (const command of CHARACTER_LCD_INITIALIZATION.commands) {
    cycle = byte(command, false, cycle + CHARACTER_LCD_TIMING.instructionMinimumCycles);
    cycle += command === 0x01
      ? CHARACTER_LCD_TIMING.clearHomeMinimumCycles
      : CHARACTER_LCD_TIMING.instructionMinimumCycles;
  }
  return { events, byte, cycle };
}

function send(writer, value, rs = false) {
  writer.cycle = writer.byte(value, rs, writer.cycle + CHARACTER_LCD_TIMING.instructionMinimumCycles);
}

test('CMP-052 declares exact 20x4 geometry and the original nine-terminal AVR boundary', () => {
  assert.equal(validateCharacterLcd20x4Definition(), true);
  assert.equal(CHARACTER_LCD_20X4_DEFINITION.type, CHARACTER_LCD_20X4_TYPE);
  assert.deepEqual(CHARACTER_LCD_20X4_GEOMETRY.rowOffsets, [0x00, 0x40, 0x14, 0x54]);
  assert.deepEqual(CHARACTER_LCD_20X4_DEFINITION.pins.map(({ id }) => id),
    ['VCC', 'GND', 'RS', 'RW', 'E', 'D4', 'D5', 'D6', 'D7']);
  assert.equal(createCharacterLcd20x4Component('lcd-20x4-1').type, CHARACTER_LCD_20X4_TYPE);
  assert.match(CHARACTER_LCD_20X4_DEFINITION.artwork.provenance, /Original IntentForce SVG/u);
  assert.match(CHARACTER_LCD_20X4_DEFINITION.support.limitations.join(' '), /AVR-only/u);
});

test('CMP-052 uses exact four-row DDRAM starts and deterministic 20-column wrapping', () => {
  const writer = initializedWriter();
  const decoder = createCharacterLcd20x4Decoder(MAPPING);
  for (const [row, address] of CHARACTER_LCD_20X4_GEOMETRY.rowOffsets.entries()) {
    send(writer, 0x80 | address);
    for (const value of `ROW${row + 1}`) send(writer, value.charCodeAt(0), true);
  }
  send(writer, 0x80 | 0x13);
  send(writer, 'X'.charCodeAt(0), true);
  send(writer, 'Y'.charCodeAt(0), true);
  const snapshot = decoder.consume(writer.events);
  assert.deepEqual(snapshot.lines.map((line) => line.slice(0, 4)), ['ROW1', 'YOW2', 'ROW3', 'ROW4']);
  assert.equal(snapshot.lines[0][19], 'X');
  assert.equal(snapshot.lines[1][0], 'Y');
});

test('CMP-062 stores eight bounded 5x8 CGRAM glyphs and places custom code cells', () => {
  const writer = initializedWriter();
  const decoder = createCharacterLcd20x4Decoder(MAPPING);
  send(writer, 0x40 | 8);
  const heart = [0x00, 0x0a, 0x1f, 0x1f, 0x0e, 0x04, 0x00, 0x00];
  for (const row of heart) send(writer, row, true);
  send(writer, 0x80 | 0x54);
  send(writer, 1, true);
  const snapshot = decoder.consume(writer.events);
  assert.deepEqual(snapshot.customGlyphs[1], heart);
  assert.equal(snapshot.cellCodes[3][0], 1);
  assert.equal(snapshot.lines[3].charCodeAt(0), 1);
  assert.equal(snapshot.addressSpace, 'ddram');
  assert.deepEqual(snapshot.geometry, CHARACTER_LCD_20X4_GEOMETRY);
});
