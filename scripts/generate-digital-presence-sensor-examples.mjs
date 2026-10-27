#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import {
  CAPACITIVE_TOUCH_TYPE,
  HALL_SWITCH_TYPE,
  PIR_MOTION_TYPE,
  createDigitalPresenceSensor,
} from '../expansion-drafts/digital-presence-sensors-v1.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const ROOT = new URL('../examples/digital-presence-sensors/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const endpoint = (component, pin) => ({ component, pin });
const adapter = Object.freeze({
  schemas: Object.freeze(['intent-mcu-project-contact-persistence@1']),
  prepare(value) {
    const opened = openCandidateUiSession(JSON.stringify(value));
    if (!opened.ok) throw new Error(opened.code);
    return { project: JSON.parse(opened.session.saveText()) };
  },
});

function buildProject() {
  const source = [
    'void setup(){',
    '  Serial.begin(115200);',
    '  pinMode(4, INPUT); pinMode(5, INPUT); pinMode(6, INPUT);',
    '}',
    'void loop(){',
    '  Serial.print("touch="); Serial.print(digitalRead(4));',
    '  Serial.print(",motion="); Serial.print(digitalRead(5));',
    '  Serial.print(",hall="); Serial.println(digitalRead(6));',
    '  delay(120);',
    '}',
    '',
  ].join('\n');
  const draft = createEditableContactDraft(source);
  if (!draft.ok) throw new Error(draft.code);
  draft.project.project.metadata.name = 'Digital presence sensors';
  const opened = openCandidateUiSession(canonicalContactPersistenceDraftJson(draft.project));
  if (!opened.ok) throw new Error(opened.code);
  const session = opened.session;
  const apply = (command) => {
    const result = session.apply({ ...command, revision: session.revision });
    if (!result.ok) throw new Error(`${command.type}:${result.code}:${JSON.stringify(result.details)}`);
  };
  for (const component of session.visualProject.circuit.components) {
    if (component.id !== 'board-1') apply({ type: 'component.remove', componentId: component.id });
  }
  const touch = createDigitalPresenceSensor(CAPACITIVE_TOUCH_TYPE, 'touch-button-1');
  touch.controls.touched = true;
  const pir = createDigitalPresenceSensor(PIR_MOTION_TYPE, 'pir-motion-1');
  const hall = createDigitalPresenceSensor(HALL_SWITCH_TYPE, 'hall-switch-1');
  hall.controls.magnetPresent = true;
  for (const [index, component] of [touch, pir, hall].entries()) {
    apply({ type: 'component.add', component,
      position: { x: 0.56 + index * 0.14, y: 0.62, rotation: 0 } });
  }
  apply({ type: 'wire.create', net: { id: 'net-5v', endpoints: [endpoint('board-1', '5V'), endpoint(touch.id, 'VCC')] } });
  apply({ type: 'wire.branch', netId: 'net-5v', endpoint: endpoint(pir.id, 'VCC'), junctionId: 'junction-vcc-pir' });
  apply({ type: 'wire.branch', netId: 'net-5v', endpoint: endpoint(hall.id, 'VCC'), junctionId: 'junction-vcc-hall' });
  apply({ type: 'wire.create', net: { id: 'net-ground-branch', endpoints: [endpoint('board-1', 'GND1'), endpoint(touch.id, 'GND')] } });
  apply({ type: 'wire.branch', netId: 'net-ground-branch', endpoint: endpoint(pir.id, 'GND'), junctionId: 'junction-ground-pir' });
  apply({ type: 'wire.branch', netId: 'net-ground-branch', endpoint: endpoint(hall.id, 'GND'), junctionId: 'junction-ground-hall' });
  for (const [component, pin] of [[touch, 'D4'], [pir, 'D5'], [hall, 'D6']]) {
    apply({ type: 'wire.create', net: { id: `net-${component.id}-out`,
      endpoints: [endpoint(component.id, 'OUT'), endpoint('board-1', pin)] } });
  }
  if (!session.runnable.ok) throw new Error(`${session.runnable.code}:${JSON.stringify(session.runnable.details)}`);
  return JSON.parse(session.saveText());
}

const project = buildProject();
const bytes = canonicalProjectEnvelope(AVR, project, { [AVR]: adapter }, emptyProjectBrief(), null,
  CURRENT_MODEL_LIBRARY_LOCK);
const entry = {
  id: 'avr-digital-presence-sensors',
  requirementIds: ['CMP-031', 'CMP-121', 'CMP-124'],
  file: 'avr-digital-presence-sensors.intent-mcu.json',
  projectSha256: sha256(bytes),
  sourceSha256: sha256(project.project.source.files[0].content),
  expectedBehavior: 'D4, D5 and D6 report independent active-high touch, motion and magnet-presence states.',
  namedPins: { supply: 'VCC → 5V', ground: 'GND → GND1',
    touch: 'OUT → D4', motion: 'OUT → D5', hall: 'OUT → D6' },
  profileBehavior: {
    [AVR]: 'authoring and executable active-high adapter available after a fresh isolated Build',
    'board.rp2040-pico-v1': 'unavailable',
    'board.esp32-c3-devmodule-v1': 'unavailable',
    'board.stm32f429zi-nucleo144-v1': 'unavailable',
  },
  provenance: 'Original project-owned contracts, SVG artwork, deterministic active-high projection, firmware source and canonical project envelope.',
};
const manifest = {
  schema: 'intent-mcu-digital-presence-sensor-example-manifest@1',
  profile: AVR,
  modelLibrary: CURRENT_MODEL_LIBRARY_LOCK,
  entries: [entry],
};
const files = new Map([
  [entry.file, bytes],
  ['manifest.json', `${JSON.stringify(manifest, null, 2)}\n`],
]);
if (process.argv.includes('--write')) {
  await mkdir(ROOT, { recursive: true });
  for (const [file, content] of files) await writeFile(new URL(file, ROOT), content);
} else {
  for (const [file, content] of files) {
    if (await readFile(new URL(file, ROOT), 'utf8') !== content) {
      throw new Error(`DIGITAL_PRESENCE_SENSOR_ARTIFACT_STALE:${file}`);
    }
  }
}
