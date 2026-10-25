// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { openPortableEditorSession } from '../src/candidate-project-session.mjs';
import { Atmega328PAdapter } from '../src/atmega328p-adapter.mjs';
import { componentSupportCell } from '../src/component-support-matrix.mjs';
import {
  PCF8574_LCD_ADDRESS, PCF8574_LCD_DEFINITION, PCF8574_LCD_TYPE,
  createPcf8574LcdComponent, createPcf8574LcdDecoder,
} from '../expansion-drafts/pcf8574-lcd-backpack-v1.mjs';
import {
  PCF8574_LCD_HELLO_CARD, PCF8574_LCD_HELLO_SOURCE, PCF8574_LCD_HELLO_SOURCE_SHA256,
  createPcf8574LcdHelloExample,
} from '../expansion-drafts/pcf8574-lcd-hello-example-v1.mjs';

function writer() {
  const records = []; let cycle = 240_000;
  const push = (value, delta = 20) => { cycle += delta; records.push({ cycle, kind: 'write', address: 0x27, value, acknowledged: true }); };
  const nibble = (value, rs = false, gap = 600) => { cycle += gap; const base = (value << 4) | (rs ? 1 : 0) | 0x08; push(base); push(base | 0x04, 10); push(base, 10); };
  const byte = (value, rs = false, gap = 600) => { nibble(value >> 4, rs, gap); nibble(value & 0x0f, rs); };
  return { records, nibble, byte, setCycle(value) { cycle = value; }, advance(value) { cycle += value; } };
}

function initialized() {
  const out = writer(); out.setCycle(240_000); out.nibble(3, false, 0); out.nibble(3, false, 65_600);
  out.nibble(3, false, 1_600); out.nibble(2, false, 1_600);
  for (const value of [0x28, 0x0c, 0x06, 0x01]) out.byte(value, false, 600);
  out.advance(24_000);
  return out;
}

test('CMP-051 declares one exact fixed-address backpack rather than a generic expander', () => {
  assert.equal(PCF8574_LCD_DEFINITION.type, PCF8574_LCD_TYPE);
  assert.equal(PCF8574_LCD_ADDRESS, 0x27);
  assert.deepEqual(PCF8574_LCD_DEFINITION.pins.map((pin) => pin.id), ['VCC', 'GND', 'SDA', 'SCL']);
  assert.match(PCF8574_LCD_DEFINITION.support.limitations.join(' '), /P0=RS.*P4\.\.P7=D4\.\.D7/u);
  assert.match(PCF8574_LCD_DEFINITION.support.limitations.join(' '), /arbitrary Wire-library compatibility/u);
});

test('four-profile matrix exposes CMP-051 only on the 5 V AVR profile', () => {
  const profiles = [
    'board.atmega328p-16mhz-v1', 'board.rp2040-pico-v1',
    'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1',
  ];
  assert.deepEqual(profiles.map((profile) => componentSupportCell(profile, PCF8574_LCD_TYPE)?.available),
    [true, false, false, false]);
  assert.match(componentSupportCell(profiles[0], PCF8574_LCD_TYPE).limitations.join(' '), /fixed 7-bit address 0x27/u);
  for (const profile of profiles.slice(1)) {
    assert.match(componentSupportCell(profile, PCF8574_LCD_TYPE).limitations.join(' '), /does not yet admit/u);
  }
});

test('openable starter preserves exact pins, source identity and CMP requirements', () => {
  assert.deepEqual(PCF8574_LCD_HELLO_CARD.requirementIds, ['CMP-050', 'CMP-051']);
  assert.deepEqual(PCF8574_LCD_HELLO_CARD.namedPins, { VCC: '5V', GND: 'GND1', SDA: 'A4', SCL: 'A5' });
  assert.equal(createHash('sha256').update(PCF8574_LCD_HELLO_SOURCE).digest('hex'), PCF8574_LCD_HELLO_SOURCE_SHA256);
  const example = createPcf8574LcdHelloExample();
  assert.equal(example.project.project.source.files[0].content, PCF8574_LCD_HELLO_SOURCE);
  assert.equal(openPortableEditorSession(example.text).session.runnable.ok, true);
});

test('acknowledged 0x27 bytes drive the reused HD44780 state machine to visible text', () => {
  const trace = initialized();
  trace.byte(0x80, false); for (const char of 'I2C LCD ready'.padEnd(16)) trace.byte(char.charCodeAt(0), true);
  trace.byte(0xc0, false); for (const char of 'Address 0x27'.padEnd(16)) trace.byte(char.charCodeAt(0), true);
  const snapshot = createPcf8574LcdDecoder().consume(trace.records);
  assert.equal(snapshot.status, 'ready'); assert.equal(snapshot.displayOn, true);
  assert.deepEqual(snapshot.lines, ['I2C LCD ready   ', 'Address 0x27    ']);
  assert(snapshot.transactions > 100);
});

test('clear, home, DDRAM line addressing and line boundaries remain deterministic', () => {
  const trace = initialized();
  trace.byte(0x80, false); for (const char of 'ABCDEFGHIJKLMNOP') trace.byte(char.charCodeAt(0), true);
  trace.byte(0xc0, false); for (const char of 'qrstuvwxyz012345') trace.byte(char.charCodeAt(0), true);
  trace.byte(0x02, false); trace.advance(24_000); trace.byte('H'.charCodeAt(0), true);
  let snapshot = createPcf8574LcdDecoder().consume(trace.records);
  assert.equal(snapshot.status, 'ready');
  assert.deepEqual(snapshot.lines, ['HBCDEFGHIJKLMNOP', 'qrstuvwxyz012345']);

  trace.byte(0x01, false); trace.advance(24_000);
  trace.byte(0xc0, false); trace.byte('U'.charCodeAt(0), true);
  snapshot = createPcf8574LcdDecoder().consume(trace.records);
  assert.deepEqual(snapshot.lines, ['                ', 'U               ']);

  const overflow = initialized(); overflow.byte(0x8f, false);
  overflow.byte('X'.charCodeAt(0), true); overflow.byte('Y'.charCodeAt(0), true);
  const rejected = createPcf8574LcdDecoder().consume(overflow.records);
  assert.equal(rejected.error.code, 'CHARACTER_LCD_DDRAM_ADDRESS_UNSUPPORTED');
});

test('wrong address, RW-high and dropped traces fail closed', () => {
  const wrong = createPcf8574LcdDecoder();
  assert.equal(wrong.consume([{ cycle: 300_000, kind: 'write', address: 0x26, value: 0 }]).status, 'awaiting-initialization');
  const read = createPcf8574LcdDecoder().consume([{ cycle: 300_000, kind: 'write', address: 0x27, value: 0x02, acknowledged: true }]);
  assert.equal(read.error.code, 'PCF8574_LCD_READ_UNSUPPORTED');
  assert.equal(createPcf8574LcdDecoder().consume([], { i2cDrops: 1 }).error.code, 'PCF8574_LCD_TRACE_DROPPED');
  const nack = initialized(); nack.records.forEach((record) => { record.acknowledged = false; });
  assert.equal(createPcf8574LcdDecoder().consume(nack.records).status, 'awaiting-initialization');
});

test('AVR TWI acknowledges 0x27 only when one validated backpack is bound', () => {
  const empty = new Atmega328PAdapter(':00000001FF');
  empty.twi.eventHandler.connectToSlave(0x27, true);
  assert.equal(empty.i2c.at(-1).acknowledged, false);
  const bound = new Atmega328PAdapter(':00000001FF', { i2cDevices: [{ type: 'pcf8574-lcd', address: 0x27 }] });
  bound.twi.eventHandler.connectToSlave(0x27, true);
  assert.equal(bound.i2c.at(-1).acknowledged, true);
  bound.twi.eventHandler.connectToSlave(0x26, true);
  assert.equal(bound.i2c.at(-1).acknowledged, false);
  assert.throws(() => new Atmega328PAdapter(':00000001FF', { i2cDevices: [
    { type: 'pcf8574-lcd', address: 0x27 }, { type: 'pcf8574-lcd', address: 0x27 },
  ] }), /I2C_DEVICE_CONFIGURATION/u);
});

test('candidate editor validates named 5V, GND, A4 and A5 and preserves exact undo/save/open', () => {
  const draft = createEditableContactDraft(); assert.equal(draft.ok, true);
  const opened = openPortableEditorSession(canonicalContactPersistenceDraftJson(draft.project)); assert.equal(opened.ok, true);
  const session = opened.session;
  const apply = (command) => { const result = session.apply({ ...command, revision: session.revision }); assert.equal(result.ok, true, JSON.stringify(result)); return result; };
  apply({ type: 'component.add', component: createPcf8574LcdComponent('pcf8574-lcd-1'), position: { x: 0.7, y: 0.6 } });
  apply({ type: 'wire.branch', netId: 'net-5v', endpoint: { component: 'pcf8574-lcd-1', pin: 'VCC' }, junctionId: 'junction-pcf-vcc' });
  apply({ type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: 'pcf8574-lcd-1', pin: 'GND' }, junctionId: 'junction-pcf-ground' });
  for (const [id, pin, boardPin] of [['sda', 'SDA', 'A4'], ['scl', 'SCL', 'A5']]) apply({ type: 'wire.create', net: { id: `net-pcf-${id}`, endpoints: [{ component: 'pcf8574-lcd-1', pin }, { component: 'board-1', pin: boardPin }] } });
  assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
  const support = session.runtimeSupport.find((item) => item.componentId === 'pcf8574-lcd-1');
  assert.equal(support.runtimeProjection.address, 0x27); assert.equal(support.runtimeProjection.sdaPin, 'A4');
  apply({ type: 'component.move', componentId: 'pcf8574-lcd-1', x: 0.65, y: 0.55 });
  const saved = session.saveText(); const reopened = openPortableEditorSession(saved); assert.equal(reopened.ok, true); assert.equal(reopened.session.saveText(), saved);
  apply({ type: 'component.remove', componentId: 'pcf8574-lcd-1' });
  assert.equal(session.apply({ type: 'undo', revision: session.revision }).ok, true);
  assert.equal(session.saveText(), saved);
});
