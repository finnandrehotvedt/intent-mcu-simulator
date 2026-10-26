#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { createAvrReferenceStarter } from '../src/avr-reference-starters.mjs';
import { createMechanicalInputComponent } from '../expansion-drafts/mechanical-inputs-v1.mjs';
import { DIP_SWITCH_4_TYPE, ROTARY_ENCODER_BUTTON_TYPE,
  createAdvancedSwitchInput } from '../expansion-drafts/advanced-switch-inputs-v1.mjs';
import { createSwitchContactComponent } from '../expansion-drafts/switch-contact-graph-v1.mjs';
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
const mechanicalSource = `void setup() { pinMode(4, INPUT); pinMode(5, INPUT_PULLUP); pinMode(6, INPUT); Serial.begin(115200); }
void loop() { Serial.print(digitalRead(4)); Serial.print(','); Serial.print(digitalRead(5)); Serial.print(','); Serial.println(digitalRead(6)); delay(120); }
`;
function mechanicalExample() {
  const draft = createEditableContactDraft(mechanicalSource);
  if (!draft.ok) throw new Error(draft.code);
  draft.project.project.metadata.name = 'Three mechanical input types';
  const session = openCandidateUiSession(canonicalContactPersistenceDraftJson(draft.project)).session;
  const apply = (command) => {
    const result = session.apply({ ...command, revision: session.revision });
    if (!result.ok) throw new Error(`MECHANICAL_EXAMPLE:${command.type}:${result.code}`);
  };
  const add = (type, id, position) => apply({ type: 'component.add',
    component: createMechanicalInputComponent(type, id), position });
  const wire = (id, component, pin, boardPin) => apply({ type: 'wire.create', net: { id,
    endpoints: [{ component, pin }, { component: 'board-1', pin: boardPin }] } });
  const branch = (netId, component, pin, junctionId) => apply({ type: 'wire.branch', netId,
    endpoint: { component, pin }, junctionId });
  add('switch.slide-spdt-v1', 'slide-switch-1', { x: 0.68, y: 0.38 });
  branch('net-ground-branch', 'slide-switch-1', 'A', 'junction-mechanical-slide-ground');
  branch('net-5v', 'slide-switch-1', 'B', 'junction-mechanical-slide-power');
  wire('net-mechanical-slide-d4', 'slide-switch-1', 'COM', 'D4');
  add('button.momentary-nc-v1', 'nc-button-1', { x: 0.68, y: 0.58 });
  branch('net-ground-branch', 'nc-button-1', 'B', 'junction-mechanical-button-ground');
  wire('net-mechanical-button-d5', 'nc-button-1', 'A', 'D5');
  add('switch.limit-spdt-v1', 'limit-switch-1', { x: 0.68, y: 0.78 });
  branch('net-ground-branch', 'limit-switch-1', 'NC', 'junction-mechanical-limit-ground');
  branch('net-5v', 'limit-switch-1', 'NO', 'junction-mechanical-limit-power');
  wire('net-mechanical-limit-d6', 'limit-switch-1', 'COM', 'D6');
  return JSON.parse(session.saveText());
}
const mechanical = mechanicalExample();
function advancedSwitchExample() {
  const source = `void setup() { for (byte p=2;p<=9;p++) pinMode(p, INPUT_PULLUP); Serial.begin(115200); }
void loop() { for (byte p=2;p<=9;p++) Serial.print(digitalRead(p)); Serial.println(); delay(120); }
`;
  const draft = createEditableContactDraft(source); if (!draft.ok) throw new Error(draft.code);
  draft.project.project.metadata.name = 'DIP, changeover and encoder button inputs';
  const session = openCandidateUiSession(canonicalContactPersistenceDraftJson(draft.project)).session;
  const apply = (command) => { const result = session.apply({ ...command, revision: session.revision });
    if (!result.ok) throw new Error(`ADVANCED_SWITCH_EXAMPLE:${command.type}:${result.code}`); };
  const add = (component, position) => apply({ type: 'component.add', component, position });
  const wire = (id, component, pin, boardPin) => apply({ type: 'wire.create', net: { id,
    endpoints: [{ component, pin }, { component: 'board-1', pin: boardPin }] } });
  const branch = (netId, component, pin, junctionId) => apply({ type: 'wire.branch', netId,
    endpoint: { component, pin }, junctionId });
  apply({ type: 'component.remove', componentId: 'button-1' });
  add(createAdvancedSwitchInput(ROTARY_ENCODER_BUTTON_TYPE, 'encoder-button-1'), { x: 0.74, y: 0.3 });
  wire('net-advanced-encoder-a', 'encoder-button-1', 'A', 'D2');
  wire('net-advanced-encoder-b', 'encoder-button-1', 'B', 'D3');
  branch('net-ground-branch', 'encoder-button-1', 'COM', 'junction-advanced-encoder-ground');
  wire('net-advanced-encoder-sw', 'encoder-button-1', 'SW', 'D4');
  branch('net-ground-branch', 'encoder-button-1', 'SWCOM', 'junction-advanced-button-ground');
  add(createAdvancedSwitchInput(DIP_SWITCH_4_TYPE, 'dip-switch-1'), { x: 0.72, y: 0.58 });
  [1, 2, 3, 4].forEach((channel) => {
    wire(`net-advanced-dip-${channel}`, 'dip-switch-1', `${channel}A`, `D${channel + 4}`);
    branch('net-ground-branch', 'dip-switch-1', `${channel}B`, `junction-advanced-dip-${channel}-ground`);
  });
  add(createSwitchContactComponent('changeover-1', 'SPDT changeover contact', { selectedThrow: 'A' }), { x: 0.74, y: 0.82 });
  wire('net-advanced-changeover', 'changeover-1', 'COM', 'D9');
  branch('net-ground-branch', 'changeover-1', 'A', 'junction-advanced-changeover-ground');
  branch('net-5v', 'changeover-1', 'B', 'junction-advanced-changeover-power');
  return JSON.parse(session.saveText());
}
const advancedSwitches = advancedSwitchExample();
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
  {
    id: 'avr-mechanical-inputs', requirementIds: ['CMP-023', 'CMP-025', 'CMP-032'],
    file: 'avr-mechanical-inputs.intent-mcu.json', project: mechanical,
    namedPins: { slideCom: 'D4', slideA: 'GND1', slideB: '5V', ncA: 'D5', ncB: 'GND1',
      limitCom: 'D6', limitNC: 'GND1', limitNO: '5V' },
    expectedBehavior: 'Slide selection changes D4, pressing the normally-closed button opens D5, and actuating the limit switch changes D6 from NC to NO.',
    firmwareLimits: 'Ideal AVR contact models only; no bounce, resistance, force, travel, current rating, arcing or wear.',
  },
  {
    id: 'avr-advanced-switch-inputs', requirementIds: ['CMP-024', 'CMP-026', 'CMP-027'],
    file: 'avr-advanced-switch-inputs.intent-mcu.json', project: advancedSwitches,
    namedPins: { encoderA: 'D2', encoderB: 'D3', encoderButton: 'D4', dip1: 'D5', dip2: 'D6',
      dip3: 'D7', dip4: 'D8', changeoverCom: 'D9', contactsCommon: 'GND1', changeoverB: '5V' },
    expectedBehavior: 'Turning and pressing the encoder changes D2–D4, four DIP positions change D5–D8, and the changeover contact selects GND or 5 V on D9.',
    firmwareLimits: 'Ideal AVR contact models only; no bounce, acceleration, resistance, missed edges, force, travel, arcing or wear.',
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
