#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import './generate-resistive-divider-sensor-examples.mjs';

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { BALL_VIBRATION_SWITCH_TYPE, FLOAT_SWITCH_TYPE, TILT_SWITCH_TYPE,
  createContactSensor } from '../expansion-drafts/contact-sensors-v1.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const ROOT = new URL('../examples/contact-sensors/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const endpoint = (component, pin) => ({ component, pin });
const adapter = Object.freeze({ schemas: Object.freeze(['intent-mcu-project-contact-persistence@1']),
  prepare(value) { const opened = openCandidateUiSession(JSON.stringify(value));
    if (!opened.ok) throw new Error(opened.code); return { project: JSON.parse(opened.session.saveText()) }; } });

function buildProject() {
  const source = [
    'void setup(){', '  Serial.begin(115200);',
    '  pinMode(4, INPUT_PULLUP); pinMode(5, INPUT_PULLUP); pinMode(6, INPUT_PULLUP);', '}',
    'void loop(){',
    '  Serial.print("float="); Serial.print(digitalRead(4) == LOW ? "active" : "clear");',
    '  Serial.print(",tilt="); Serial.print(digitalRead(5) == LOW ? "active" : "clear");',
    '  Serial.print(",vibration="); Serial.println(digitalRead(6) == LOW ? "active" : "clear");',
    '  delay(120);', '}', '',
  ].join('\n');
  const draft = createEditableContactDraft(source); if (!draft.ok) throw new Error(draft.code);
  draft.project.project.metadata.name = 'Normally-open contact sensors';
  const opened = openCandidateUiSession(canonicalContactPersistenceDraftJson(draft.project));
  if (!opened.ok) throw new Error(opened.code); const session = opened.session;
  const apply = (command) => { const result = session.apply({ ...command, revision: session.revision });
    if (!result.ok) throw new Error(`${command.type}:${result.code}:${JSON.stringify(result.details)}`); };
  for (const component of session.visualProject.circuit.components) {
    if (component.id !== 'board-1') apply({ type: 'component.remove', componentId: component.id });
  }
  const sensors = [
    createContactSensor(FLOAT_SWITCH_TYPE, 'float-switch-1'),
    createContactSensor(TILT_SWITCH_TYPE, 'tilt-switch-1'),
    createContactSensor(BALL_VIBRATION_SWITCH_TYPE, 'vibration-switch-1'),
  ];
  sensors.forEach((component, index) => apply({ type: 'component.add', component,
    position: { x: 0.56 + index * 0.14, y: 0.62, rotation: 0 } }));
  sensors.forEach((component, index) => {
    apply({ type: 'wire.create', net: { id: `net-${component.id}-input`,
      endpoints: [endpoint(component.id, 'A'), endpoint('board-1', `D${index + 4}`)] } });
    apply({ type: 'wire.create', net: { id: `net-${component.id}-ground`,
      endpoints: [endpoint(component.id, 'B'), endpoint('board-1', `GND${index + 1}`)] } });
  });
  if (!session.runnable.ok) throw new Error(`${session.runnable.code}:${JSON.stringify(session.runnable.details)}`);
  return JSON.parse(session.saveText());
}

const project = buildProject();
const bytes = canonicalProjectEnvelope(AVR, project, { [AVR]: adapter }, emptyProjectBrief(), null,
  CURRENT_MODEL_LIBRARY_LOCK);
const entry = { id: 'avr-contact-sensors', requirementIds: ['CMP-105', 'CMP-130', 'CMP-131'],
  file: 'avr-contact-sensors.intent-mcu.json', projectSha256: sha256(bytes),
  sourceSha256: sha256(project.project.source.files[0].content),
  expectedBehavior: 'D4, D5 and D6 independently report active-low float, tilt and vibration contacts using INPUT_PULLUP.',
  namedPins: { float: 'A → D4, B → GND1', tilt: 'A → D5, B → GND2',
    vibration: 'A → D6, B → GND3' },
  profileBehavior: { [AVR]: 'authoring and bounded executable contact projection available after a fresh isolated Build',
    'board.rp2040-pico-v1': 'unavailable', 'board.esp32-c3-devmodule-v1': 'unavailable',
    'board.stm32f429zi-nucleo144-v1': 'unavailable' },
  provenance: 'Original project-owned contracts, SVG artwork, deterministic passive-contact projection, firmware source and canonical project envelope.' };
const manifest = { schema: 'intent-mcu-contact-sensor-example-manifest@1', profile: AVR,
  modelLibrary: CURRENT_MODEL_LIBRARY_LOCK, entries: [entry] };
const files = new Map([[entry.file, bytes], ['manifest.json', `${JSON.stringify(manifest, null, 2)}\n`]]);
if (process.argv.includes('--write')) { await mkdir(ROOT, { recursive: true });
  for (const [file, content] of files) await writeFile(new URL(file, ROOT), content); }
else for (const [file, content] of files) if (await readFile(new URL(file, ROOT), 'utf8') !== content) {
  throw new Error(`CONTACT_SENSOR_ARTIFACT_STALE:${file}`); }
