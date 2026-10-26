#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createAvrReferenceStarter } from '../src/avr-reference-starters.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief, prepareProjectEnvelope } from '../src/project-envelope.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const ROOT = new URL('../examples/indicators-actuators/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const adapter = Object.freeze({ schemas: Object.freeze(['intent-mcu-project-contact-persistence@1']), prepare(value) {
  const opened = openCandidateUiSession(JSON.stringify(value));
  if (!opened.ok) throw Object.assign(new Error(opened.code), opened);
  return { project: JSON.parse(opened.session.saveText()) };
} });
const adapters = Object.freeze({ [AVR]: adapter });
const envelope = (project) => canonicalProjectEnvelope(AVR, project, adapters, emptyProjectBrief(), null, CURRENT_MODEL_LIBRARY_LOCK);
const sourceEnvelope = JSON.parse(await readFile(new URL('../examples/lcd/parallel-hd44780-16x2.intent-mcu.json', import.meta.url), 'utf8'));
const profileBehavior = Object.freeze({
  [AVR]: 'authoring and executable adapter available after a fresh isolated Build',
  'board.rp2040-pico-v1': 'this exact component model is unavailable',
  'board.esp32-c3-devmodule-v1': 'this exact component model is unavailable',
  'board.stm32f429zi-nucleo144-v1': 'this exact component model is unavailable',
});
const starter = (id) => createAvrReferenceStarter(id).project;
const definitions = [
  { id: 'avr-common-cathode-rgb-led', requirementIds: ['CMP-038'], file: 'avr-rgb-temperature.intent-mcu.json',
    bytes: JSON.stringify(sourceEnvelope), componentType: 'output.rgb-led-common-cathode-v1',
    namedPins: { R: 'D3 through 220 Ω', G: 'D5 through 220 Ω', B: 'D6 through 220 Ω', COM: 'GND1' },
    expectedBehavior: 'Three independently current-limited compiled PWM outputs produce a visible relative RGB mix.',
    firmwareLimits: 'Ideal common-cathode relative PWM colour only; no wavelength, luminous intensity, current matching or thermal accuracy.' },
  { id: 'avr-single-seven-segment', requirementIds: ['CMP-042'], file: 'avr-seven-segment.intent-mcu.json',
    bytes: envelope(starter('avr-seven-segment')), componentType: 'output.seven-segment-common-cathode-v1',
    namedPins: { a: 'D3 through 220 Ω', b: 'D4 through 220 Ω', c: 'D5 through 220 Ω', d: 'D6 through 220 Ω', e: 'D7 through 220 Ω', f: 'D8 through 220 Ω', g: 'D9 through 220 Ω', COM: 'GND1' },
    expectedBehavior: 'Compiled segment patterns display 0, 1, 2 and 8 and agree with Serial labels.',
    firmwareLimits: 'One ideal common-cathode digit; no decimal point, multiplexing, driver IC or physical brightness.' },
  { id: 'avr-active-buzzer', requirementIds: ['CMP-064'], file: 'avr-active-buzzer.intent-mcu.json',
    bytes: envelope(starter('avr-active-buzzer')), componentType: 'output.active-buzzer-module-v1',
    namedPins: { VCC: '5V', GND: 'GND1', EN: 'D8' },
    expectedBehavior: 'Compiled D8 alternates the visible enabled/disabled state and matching Serial BUZZER ON/OFF lines.',
    firmwareLimits: 'Silent logical indicator only; no browser audio, oscillator, frequency, sound pressure or physical current model.' },
];
for (const item of definitions) {
  const opened = prepareProjectEnvelope(item.bytes, adapters);
  if (!opened.ok) throw new Error(`${item.id}:${opened.code}`);
}
const manifest = { schema: 'intent-mcu-indicator-actuator-example-manifest@1', profile: AVR,
  modelLibrary: CURRENT_MODEL_LIBRARY_LOCK,
  entries: definitions.map(({ bytes, ...item }) => {
    const parsed = JSON.parse(bytes); const source = parsed.project.project.source.files[0].content;
    return { ...item, sourceSha256: sha256(source), projectSha256: sha256(bytes), profileBehavior,
      provenance: 'Original project-owned artwork, validated circuit factory, firmware source and canonical project envelope.' };
  }) };
const files = new Map(definitions.map((item) => [item.file, item.bytes]));
files.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
if (process.argv.includes('--write')) {
  await mkdir(ROOT, { recursive: true });
  for (const [file, bytes] of files) await writeFile(new URL(file, ROOT), bytes);
} else {
  for (const [file, bytes] of files) if (await readFile(new URL(file, ROOT), 'utf8') !== bytes) throw new Error(`INDICATOR_ACTUATOR_ARTIFACT_STALE:${file}`);
}
