#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { createAvrReferenceStarter } from '../src/avr-reference-starters.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import {
  canonicalProjectEnvelope, emptyProjectBrief, prepareProjectEnvelope,
} from '../src/project-envelope.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const ROOT = new URL('../examples/input-controls/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const PROFILE_BEHAVIOR = Object.freeze({
  [AVR]: 'authoring and executable adapter available after a fresh isolated Build',
  'board.rp2040-pico-v1': 'separate 3.3 V authoring component exists; this exact model is unavailable',
  'board.esp32-c3-devmodule-v1': 'separate 3.3 V authoring component exists; this exact model is unavailable',
  'board.stm32f429zi-nucleo144-v1': 'separate 3.3 V authoring component exists; this exact model is unavailable',
});
const ENCODER_PROFILE_BEHAVIOR = Object.freeze({
  [AVR]: 'authoring and executable adapter available after a fresh isolated Build',
  'board.rp2040-pico-v1': 'quadrature encoder is unavailable in the current bounded Parts catalogue',
  'board.esp32-c3-devmodule-v1': 'quadrature encoder is unavailable in the current bounded Parts catalogue',
  'board.stm32f429zi-nucleo144-v1': 'quadrature encoder is unavailable in the current bounded Parts catalogue',
});
const candidateAdapter = Object.freeze({
  schemas: Object.freeze(['intent-mcu-project-contact-persistence@1']),
  prepare(value) {
    const opened = openCandidateUiSession(JSON.stringify(value));
    if (!opened.ok) throw Object.assign(new Error(opened.code), opened);
    return { project: JSON.parse(opened.session.saveText()) };
  },
});
const adapters = Object.freeze({ [AVR]: candidateAdapter });

function envelope(project) {
  return canonicalProjectEnvelope(AVR, project, adapters, emptyProjectBrief(), null, CURRENT_MODEL_LIBRARY_LOCK);
}

const buttonSource = `void setup() { pinMode(2, INPUT_PULLUP); Serial.begin(9600); }
void loop() { Serial.println(digitalRead(2) == LOW ? "PRESSED" : "RELEASED"); delay(120); }
`;
const buttonDraft = createEditableContactDraft(buttonSource);
if (!buttonDraft.ok) throw new Error(buttonDraft.code);
buttonDraft.project.project.metadata.name = 'Momentary button input';
const button = { project: JSON.parse(canonicalContactPersistenceDraftJson(buttonDraft.project)) };
const toggle = createAvrReferenceStarter('avr-toggle-input');
const encoder = createAvrReferenceStarter('avr-rotary-encoder');
const definitions = [
  {
    id: 'avr-momentary-button-input', requirementIds: ['CMP-021'],
    file: 'avr-momentary-button-input.intent-mcu.json', project: button.project,
    namedPins: { A: 'D2', B: 'GND1' },
    expectedBehavior: 'Pressing the active-low button changes D2 and Serial from RELEASED to PRESSED.',
    firmwareLimits: 'Ideal normally-open contact with INPUT_PULLUP; no bounce, resistance, wear or physical timing model.',
  },
  {
    id: 'avr-spst-toggle-input', requirementIds: ['CMP-022'],
    file: 'avr-spst-toggle-input.intent-mcu.json', project: toggle.project,
    namedPins: { A: 'D3', B: 'GND1' },
    expectedBehavior: 'The maintained Open/Closed control changes compiled D3 input, D13 and Serial output.',
    firmwareLimits: 'Ideal AVR-only maintained SPST contact; no bounce, resistance, current rating, arcing or wear.',
  },
  {
    id: 'avr-quadrature-encoder', requirementIds: ['CMP-132'],
    file: 'avr-quadrature-encoder.intent-mcu.json', project: encoder.project,
    namedPins: { A: 'D2', B: 'D3', COM: 'GND2' },
    profileBehavior: ENCODER_PROFILE_BEHAVIOR,
    expectedBehavior: 'One detent produces ordered 01→00→10→11 clockwise phases and the exact reverse counter-clockwise.',
    firmwareLimits: 'CMP-132 only: ideal AVR quadrature phases at fixed 1 ms spacing. This is not CMP-027; it has no push switch, bounce, acceleration or physical detents.',
  },
];
const outputs = definitions.map((item) => {
  const bytes = envelope(item.project);
  const source = item.project.project?.source?.files?.[0]?.content ?? item.project.source?.files?.[0]?.content;
  if (typeof source !== 'string') throw new Error(`INPUT_CONTROL_SOURCE_MISSING:${item.id}`);
  const opened = prepareProjectEnvelope(bytes, adapters);
  if (!opened.ok) throw new Error(`${item.id}:${opened.code}`);
  return { ...item, bytes, sourceSha256: sha256(source), projectSha256: sha256(bytes) };
});
const manifest = {
  schema: 'intent-mcu-input-control-example-manifest@1', profile: AVR,
  modelLibrary: CURRENT_MODEL_LIBRARY_LOCK,
  entries: outputs.map(({ project, bytes, ...entry }) => ({
    ...entry, profileBehavior: entry.profileBehavior ?? PROFILE_BEHAVIOR,
    provenance: 'Original project-owned component, artwork, circuit factory and canonical project envelope.',
  })),
};
const expected = new Map(outputs.map((item) => [item.file, item.bytes]));
expected.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
if (process.argv.includes('--write')) {
  await mkdir(ROOT, { recursive: true });
  for (const [file, bytes] of expected) await writeFile(new URL(file, ROOT), bytes);
} else {
  for (const [file, bytes] of expected) {
    if (await readFile(new URL(file, ROOT), 'utf8') !== bytes) throw new Error(`INPUT_CONTROL_ARTIFACT_STALE:${file}`);
  }
}
