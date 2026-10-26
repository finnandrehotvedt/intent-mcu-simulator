#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief, prepareProjectEnvelope } from '../src/project-envelope.mjs';
import {
  PCF8574_LCD_HELLO_CARD, PCF8574_LCD_HELLO_SOURCE_SHA256, createPcf8574LcdHelloExample,
} from '../expansion-drafts/pcf8574-lcd-hello-example-v1.mjs';
import {
  TEMPERATURE_LCD_PIN_MAP, TEMPERATURE_LCD_THRESHOLD_CARD, TEMPERATURE_LCD_THRESHOLD_SOURCE,
  createTemperatureLcdThresholdExample,
} from '../expansion-drafts/temperature-lcd-threshold-example-v1.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const ROOT = new URL('../examples/lcd/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const adapter = Object.freeze({ schemas: Object.freeze(['intent-mcu-project-contact-persistence@1']),
  prepare(value) {
    const opened = openCandidateUiSession(JSON.stringify(value));
    if (!opened.ok) throw Object.assign(new Error(opened.code), opened);
    return { project: JSON.parse(opened.session.saveText()) };
  } });
const adapters = Object.freeze({ [AVR]: adapter });
function envelope(example) {
  return canonicalProjectEnvelope(AVR, example.project, adapters, emptyProjectBrief(), null, CURRENT_MODEL_LIBRARY_LOCK);
}
const directSourceSha256 = sha256(TEMPERATURE_LCD_THRESHOLD_SOURCE);
const lcd20x4Envelope = JSON.parse(await readFile(new URL(
  'parallel-hd44780-20x4-cgram.intent-mcu.json', ROOT), 'utf8'));
const definitions = [
  {
    id: 'character-lcd-16x2-4bit', requirementIds: ['CMP-050'],
    file: 'parallel-hd44780-16x2.intent-mcu.json', previousProjectSha256: 'ad89013c070a7b4b41639a2d725255dd79459ba427838c491a98fa4b8a94ed7b',
    example: createTemperatureLcdThresholdExample(), sourceSha256: directSourceSha256,
    namedPins: { VCC: '5V', GND: 'GND1', RW: 'GND1', ...TEMPERATURE_LCD_PIN_MAP.lcd },
    expectedBehavior: TEMPERATURE_LCD_THRESHOLD_CARD.observe,
    profileBehavior: { [AVR]: 'authoring and executable adapter available after a fresh isolated Build',
      'board.rp2040-pico-v1': 'component unavailable', 'board.esp32-c3-devmodule-v1': 'component unavailable',
      'board.stm32f429zi-nucleo144-v1': 'component unavailable' },
    firmwareLimits: TEMPERATURE_LCD_THRESHOLD_CARD.limits,
    provenance: 'Original project-owned direct 4-bit LCD example generated from the committed factory and canonical common project envelope.',
  },
  {
    id: 'pcf8574-lcd-backpack', requirementIds: ['CMP-051'],
    file: 'pcf8574-0x27-lcd.intent-mcu.json', previousProjectSha256: '6d4c8d6a1f42a251c441ec6bc811066397c0a17be731be52a63c60e80d1e3e75',
    example: createPcf8574LcdHelloExample(), sourceSha256: PCF8574_LCD_HELLO_SOURCE_SHA256,
    namedPins: PCF8574_LCD_HELLO_CARD.namedPins, expectedBehavior: PCF8574_LCD_HELLO_CARD.observe,
    profileBehavior: { [AVR]: 'authoring and executable adapter available after a fresh isolated Build',
      'board.rp2040-pico-v1': 'component unavailable', 'board.esp32-c3-devmodule-v1': 'component unavailable',
      'board.stm32f429zi-nucleo144-v1': 'component unavailable' },
    firmwareLimits: PCF8574_LCD_HELLO_CARD.limits,
    provenance: 'Original project-owned fixed 0x27 PCF8574 example generated from the committed factory and canonical common project envelope.',
  },
  {
    id: 'avr-character-lcd-20x4-cgram', requirementIds: ['CMP-052', 'CMP-062'],
    file: 'parallel-hd44780-20x4-cgram.intent-mcu.json',
    example: { project: lcd20x4Envelope.project },
    sourceSha256: '4950c66f1669022ffa91528ee5e557bd789833caa08e961bd374c1a8eea63f3e',
    namedPins: { VCC: '5V', GND: 'GND1', RW: 'GND1', RS: 'D3', E: 'D4',
      D4: 'D7', D5: 'D8', D6: 'D10', D7: 'D12' },
    expectedBehavior: 'Four exact 20-column rows render from DDRAM offsets 0x00, 0x40, 0x14 and 0x54, with custom character code 1 showing the programmed 5x8 heart.',
    profileBehavior: { [AVR]: 'authoring and executable adapter available after a fresh isolated Build',
      'board.rp2040-pico-v1': 'component unavailable', 'board.esp32-c3-devmodule-v1': 'component unavailable',
      'board.stm32f429zi-nucleo144-v1': 'component unavailable' },
    firmwareLimits: 'Partial: AVR-only write-only 4-bit GPIO, eight bounded CGRAM slots; no reads, busy flag, shifts, 8-bit mode, I2C, contrast, backlight or physical timing accuracy.',
    provenance: 'Original project-owned 20x4/CGRAM example generated through the committed canonical envelope generator.',
  },
];
const outputs = definitions.map((item) => ({ ...item, bytes: envelope(item.example) }));
const manifest = { schema: 'intent-mcu-lcd-example-manifest@2', profile: AVR,
  modelLibrary: CURRENT_MODEL_LIBRARY_LOCK,
  entries: outputs.map(({ example, bytes, ...item }) => ({ ...item, projectSha256: sha256(bytes) })) };
for (const item of outputs) {
  const opened = prepareProjectEnvelope(item.bytes, adapters);
  if (!opened.ok) throw new Error(`${item.id}:${opened.code}`);
}
const expected = new Map(outputs.map((item) => [item.file, item.bytes]));
expected.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
if (process.argv.includes('--write')) {
  for (const [file, bytes] of expected) await writeFile(new URL(file, ROOT), bytes);
} else {
  for (const [file, bytes] of expected) {
    if (await readFile(new URL(file, ROOT), 'utf8') !== bytes) throw new Error(`LCD_EXAMPLE_ARTIFACT_STALE:${file}`);
  }
}
