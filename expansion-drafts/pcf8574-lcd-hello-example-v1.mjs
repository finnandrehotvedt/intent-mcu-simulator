// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { createEditableContactDraft } from './contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from './project-v3-contact-persistence.mjs';
import { PCF8574_LCD_TYPE, createPcf8574LcdComponent } from './pcf8574-lcd-backpack-v1.mjs';

export const PCF8574_LCD_HELLO_EXAMPLE_ID = 'avr-pcf8574-lcd-hello';
export const PCF8574_LCD_HELLO_SOURCE_SHA256 = '4fdce12246f4eb202259a492795ac93f5b59ce56678c357dbb30120ca3e6c809';
export const PCF8574_LCD_HELLO_CARD = Object.freeze({
  id: PCF8574_LCD_HELLO_EXAMPLE_ID, name: 'I2C character LCD',
  description: 'Drive a fixed 0x27 PCF8574 backpack from compiled AVR TWI writes.',
  focus: 'Compiled AVR → A4/A5 I2C → visible 16×2 text',
  partsLabel: 'ATmega328P controller · fixed 0x27 PCF8574 LCD',
  learn: 'How acknowledged I2C bytes become validated HD44780 commands and characters.',
  try: 'Build and Run, then inspect the two display lines and the fixed named pins.',
  observe: 'The display reads I2C LCD ready and Address 0x27 only after accepted writes.',
  limits: 'Partial: AVR-only, fixed address and mapping, write-only ASCII subset; no arbitrary Wire compatibility.',
  next: 'Change only the printable text while preserving the fixed address, mapping and initialization timing.',
  requirementIds: Object.freeze(['CMP-050', 'CMP-051']),
  componentTypes: Object.freeze(['board.atmega328p-16mhz-v1', PCF8574_LCD_TYPE]),
  namedPins: Object.freeze({ VCC: '5V', GND: 'GND1', SDA: 'A4', SCL: 'A5' }),
  sourceSha256: PCF8574_LCD_HELLO_SOURCE_SHA256,
});

export const PCF8574_LCD_HELLO_SOURCE = `#include <Arduino.h>
#include <avr/io.h>

static const uint8_t LCD_ADDRESS = 0x27;
static const uint8_t BACKLIGHT = 0x08;

static void twi_wait() { while (!(TWCR & _BV(TWINT))) {} }
static void twi_start() {
  TWCR = _BV(TWINT) | _BV(TWSTA) | _BV(TWEN); twi_wait();
  TWDR = LCD_ADDRESS << 1; TWCR = _BV(TWINT) | _BV(TWEN); twi_wait();
}
static void twi_write(uint8_t value) { TWDR = value; TWCR = _BV(TWINT) | _BV(TWEN); twi_wait(); }
static void twi_stop() { TWCR = _BV(TWINT) | _BV(TWEN) | _BV(TWSTO); }
static void expander(uint8_t value) { twi_start(); twi_write(value | BACKLIGHT); twi_stop(); delayMicroseconds(2); }
static void nibble(uint8_t value, bool data) {
  uint8_t base = (uint8_t)((value << 4) | (data ? 1 : 0));
  expander(base); expander(base | 0x04); expander(base);
}
static void lcd_byte(uint8_t value, bool data) {
  nibble(value >> 4, data); nibble(value & 0x0f, data); delayMicroseconds(50);
}
static void command(uint8_t value) { lcd_byte(value, false); if (value == 1 || value == 2) delay(2); }
static void text(const char* value) { while (*value) lcd_byte((uint8_t)*value++, true); }

void setup() {
  TWSR = 0; TWBR = 72; delay(20);
  nibble(3, false); delayMicroseconds(4100); nibble(3, false); delayMicroseconds(100);
  nibble(3, false); delayMicroseconds(100); nibble(2, false); delayMicroseconds(50);
  command(0x28); command(0x0c); command(0x06); command(0x01);
  command(0x80); text("I2C LCD ready");
  command(0xc0); text("Address 0x27");
}
void loop() {}
`;

function apply(session, command) {
  const result = session.apply({ ...command, revision: session.revision });
  if (!result.ok) throw new Error(`${command.type}:${result.code}`);
}

export function createPcf8574LcdHelloExample() {
  const draft = createEditableContactDraft(PCF8574_LCD_HELLO_SOURCE);
  if (!draft.ok) throw new Error(draft.code);
  draft.project.project.metadata.name = PCF8574_LCD_HELLO_CARD.name;
  const opened = openCandidateUiSession(canonicalContactPersistenceDraftJson(draft.project));
  if (!opened.ok) throw new Error(opened.code);
  const session = opened.session;
  apply(session, { type: 'component.add', component: createPcf8574LcdComponent('pcf8574-lcd-1'), position: { x: 0.72, y: 0.58 } });
  apply(session, { type: 'wire.branch', netId: 'net-5v', endpoint: { component: 'pcf8574-lcd-1', pin: 'VCC' }, junctionId: 'junction-pcf-example-vcc' });
  apply(session, { type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: 'pcf8574-lcd-1', pin: 'GND' }, junctionId: 'junction-pcf-example-ground' });
  for (const [suffix, pin, boardPin] of [['sda', 'SDA', 'A4'], ['scl', 'SCL', 'A5']]) {
    apply(session, { type: 'wire.create', net: { id: `net-pcf-example-${suffix}`, endpoints: [{ component: 'pcf8574-lcd-1', pin }, { component: 'board-1', pin: boardPin }] } });
  }
  if (!session.runnable.ok) throw new Error(session.runnable.code);
  return { ...PCF8574_LCD_HELLO_CARD, text: session.saveText(), project: JSON.parse(session.saveText()) };
}
