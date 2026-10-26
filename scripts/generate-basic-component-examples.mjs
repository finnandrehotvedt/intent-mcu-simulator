#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createExampleProject } from '../src/example-projects.mjs';
import { canonicalProjectJson, parseProjectV2 } from '../src/project-v2.mjs';

const ROOT = new URL('../examples/basic-components/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const profiles = Object.freeze({
  'board.atmega328p-16mhz-v1': 'authoring and executable adapter available after a fresh isolated Build',
  'board.rp2040-pico-v1': 'bounded LED and resistor authoring/execution available; potentiometer unavailable',
  'board.esp32-c3-devmodule-v1': 'bounded LED and resistor authoring/model output available; potentiometer unavailable',
  'board.stm32f429zi-nucleo144-v1': 'bounded LED and resistor authoring/execution available; potentiometer unavailable',
});
const projects = Object.freeze({ blink: createExampleProject('blink'), adc: createExampleProject('adc') });
const files = new Map(Object.entries(projects).map(([id, value]) => [`avr-${id}.intent-mcu.json`, canonicalProjectJson(value.project)]));
const definitions = [
  { id: 'avr-series-resistor', requirementIds: ['CMP-001'], file: 'avr-blink.intent-mcu.json',
    componentType: 'resistor.fixed-v1', namedPins: { A: 'D13', B: 'LED.ANODE' }, value: '220 Ω',
    expectedBehavior: 'The validated 220 Ω series path limits the ideal D13 LED model.',
    limits: 'Ideal resistance in supported low-voltage teaching topologies; no tolerance, power or thermal model.' },
  { id: 'avr-analogue-potentiometer', requirementIds: ['CMP-002'], file: 'avr-adc.intent-mcu.json',
    componentType: 'potentiometer.linear-v1', namedPins: { HIGH: '5V', WIPER: 'A0', LOW: 'GND1' }, value: '10 kΩ linear',
    expectedBehavior: 'Turning the control maps linearly from 0–5 V to AVR ADC counts 0–1023.',
    limits: 'Ideal unloaded linear divider; no tolerance, contact noise, loading or logarithmic taper.' },
  { id: 'avr-series-led', requirementIds: ['CMP-037'], file: 'avr-blink.intent-mcu.json',
    componentType: 'led.basic-v1', namedPins: { ANODE: '220Ω.B', CATHODE: 'GND1' }, value: 'red 5 mm',
    expectedBehavior: 'Compiled D13 HIGH/LOW changes the visible LED and logic trace together.',
    limits: 'Bounded polarity, series-current and relative-brightness model; no physical optical or thermal accuracy.' },
];
for (const bytes of files.values()) if (!parseProjectV2(bytes).ok) throw new Error('BASIC_COMPONENT_PROJECT_INVALID');
const manifest = { schema: 'intent-mcu-basic-component-example-manifest@1',
  entries: definitions.map((entry) => {
    const bytes = files.get(entry.file); const parsed = JSON.parse(bytes);
    return { ...entry, sourceSha256: sha256(parsed.source.files[0].content), projectSha256: sha256(bytes),
      profileBehavior: profiles,
      provenance: 'Original project-owned component artwork, circuit factory, firmware example and canonical project format.' };
  }) };
files.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
if (process.argv.includes('--write')) {
  await mkdir(ROOT, { recursive: true });
  for (const [file, bytes] of files) await writeFile(new URL(file, ROOT), bytes);
} else {
  for (const [file, bytes] of files) if (await readFile(new URL(file, ROOT), 'utf8') !== bytes) throw new Error(`BASIC_COMPONENT_ARTIFACT_STALE:${file}`);
}
