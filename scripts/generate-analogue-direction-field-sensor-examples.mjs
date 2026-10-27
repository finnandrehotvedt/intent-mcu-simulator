#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import {
  HALL_MAGNETIC_ANALOGUE_TYPE,
  WIND_DIRECTION_ANALOGUE_TYPE,
  createAnalogueDirectionFieldSensor,
} from '../expansion-drafts/analogue-direction-field-sensors-v1.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const ROOT = new URL('../examples/analogue-direction-field-sensors/', import.meta.url);
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
    'void setup(){ Serial.begin(115200); }',
    'void loop(){',
    '  Serial.print("wind_direction_adc="); Serial.print(analogRead(A0));',
    '  Serial.print(",hall_field_adc="); Serial.println(analogRead(A1));',
    '  delay(120);',
    '}',
    '',
  ].join('\n');
  const draft = createEditableContactDraft(source);
  if (!draft.ok) throw new Error(draft.code);
  draft.project.project.metadata.name = 'Analogue wind direction and Hall field signals';
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
  const wind = createAnalogueDirectionFieldSensor(WIND_DIRECTION_ANALOGUE_TYPE, 'wind-direction-1');
  wind.controls.directionDegrees = 90;
  const hall = createAnalogueDirectionFieldSensor(HALL_MAGNETIC_ANALOGUE_TYPE, 'hall-field-1');
  hall.controls.magneticFieldRatio = -0.4;
  for (const [index, component] of [wind, hall].entries()) {
    apply({ type: 'component.add', component,
      position: { x: 0.62 + index * 0.18, y: 0.58, rotation: 0 } });
  }
  apply({ type: 'wire.create', net: { id: 'net-5v', endpoints: [endpoint('board-1', '5V'), endpoint(wind.id, 'VCC')] } });
  apply({ type: 'wire.branch', netId: 'net-5v', endpoint: endpoint(hall.id, 'VCC'), junctionId: 'junction-vcc-hall' });
  apply({ type: 'wire.create', net: { id: 'net-ground-branch', endpoints: [endpoint('board-1', 'GND1'), endpoint(wind.id, 'GND')] } });
  apply({ type: 'wire.branch', netId: 'net-ground-branch', endpoint: endpoint(hall.id, 'GND'), junctionId: 'junction-ground-hall' });
  for (const [component, pin] of [[wind, 'A0'], [hall, 'A1']]) {
    apply({ type: 'wire.create', net: { id: `net-${component.id}-aout`,
      endpoints: [endpoint(component.id, 'AOUT'), endpoint('board-1', pin)] } });
  }
  if (!session.runnable.ok) throw new Error(`${session.runnable.code}:${JSON.stringify(session.runnable.details)}`);
  return JSON.parse(session.saveText());
}

const project = buildProject();
const bytes = canonicalProjectEnvelope(AVR, project, { [AVR]: adapter }, emptyProjectBrief(), null,
  CURRENT_MODEL_LIBRARY_LOCK);
const entry = {
  id: 'avr-analogue-direction-field-sensors',
  requirementIds: ['CMP-113', 'CMP-125'],
  file: 'avr-analogue-direction-field-sensors.intent-mcu.json',
  projectSha256: sha256(bytes),
  sourceSha256: sha256(project.project.source.files[0].content),
  expectedBehavior: 'A0 reports an ideal 0–360 degree direction signal and A1 reports an ideal signed bipolar Hall field ratio, each as 0–5 V.',
  namedPins: { supply: 'VCC → 5V', ground: 'GND → GND1',
    windDirection: 'AOUT → A0', hallField: 'AOUT → A1' },
  profileBehavior: {
    [AVR]: 'authoring and executable ideal analogue adapter available after a fresh isolated Build',
    'board.rp2040-pico-v1': 'unavailable',
    'board.esp32-c3-devmodule-v1': 'unavailable',
    'board.stm32f429zi-nucleo144-v1': 'unavailable',
  },
  provenance: 'Original project-owned contracts, SVG artwork, deterministic analogue projection, firmware source and canonical project envelope.',
};
const manifest = {
  schema: 'intent-mcu-analogue-direction-field-sensor-example-manifest@1',
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
      throw new Error(`ANALOGUE_DIRECTION_FIELD_SENSOR_ARTIFACT_STALE:${file}`);
    }
  }
}
