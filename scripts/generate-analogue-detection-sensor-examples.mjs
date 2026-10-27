#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import {
  FLAME_ANALOGUE_TYPE,
  RAIN_ANALOGUE_TYPE,
  SOUND_LEVEL_ANALOGUE_TYPE,
  createAnalogueDetectionSensor,
} from '../expansion-drafts/analogue-detection-sensors-v1.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const ROOT = new URL('../examples/analogue-detection-sensors/', import.meta.url);
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
    '  Serial.print("rain="); Serial.print(analogRead(A0));',
    '  Serial.print(",sound="); Serial.print(analogRead(A1));',
    '  Serial.print(",flame="); Serial.println(analogRead(A5));',
    '  delay(120);',
    '}',
    '',
  ].join('\n');
  const draft = createEditableContactDraft(source);
  if (!draft.ok) throw new Error(draft.code);
  draft.project.project.metadata.name = 'Analogue rain sound and flame sensors';
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
  const rain = createAnalogueDetectionSensor(RAIN_ANALOGUE_TYPE, 'rain-sensor-1');
  rain.controls.wetnessRatio = 0.2;
  const sound = createAnalogueDetectionSensor(SOUND_LEVEL_ANALOGUE_TYPE, 'sound-level-1');
  sound.controls.soundLevelRatio = 0.55;
  const flame = createAnalogueDetectionSensor(FLAME_ANALOGUE_TYPE, 'flame-sensor-1');
  flame.controls.flameIntensityRatio = 0.85;
  for (const [index, component] of [rain, sound, flame].entries()) {
    apply({ type: 'component.add', component,
      position: { x: 0.55 + index * 0.15, y: 0.58, rotation: 0 } });
  }
  apply({ type: 'wire.create', net: { id: 'net-5v', endpoints: [endpoint('board-1', '5V'), endpoint(rain.id, 'VCC')] } });
  apply({ type: 'wire.branch', netId: 'net-5v', endpoint: endpoint(sound.id, 'VCC'), junctionId: 'junction-vcc-sound' });
  apply({ type: 'wire.branch', netId: 'net-5v', endpoint: endpoint(flame.id, 'VCC'), junctionId: 'junction-vcc-flame' });
  apply({ type: 'wire.create', net: { id: 'net-ground-branch', endpoints: [endpoint('board-1', 'GND1'), endpoint(rain.id, 'GND')] } });
  apply({ type: 'wire.branch', netId: 'net-ground-branch', endpoint: endpoint(sound.id, 'GND'), junctionId: 'junction-ground-sound' });
  apply({ type: 'wire.branch', netId: 'net-ground-branch', endpoint: endpoint(flame.id, 'GND'), junctionId: 'junction-ground-flame' });
  for (const [component, pin] of [[rain, 'A0'], [sound, 'A1'], [flame, 'A5']]) {
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
  id: 'avr-analogue-detection-sensors',
  requirementIds: ['CMP-103', 'CMP-109', 'CMP-110'],
  file: 'avr-analogue-detection-sensors.intent-mcu.json',
  projectSha256: sha256(bytes),
  sourceSha256: sha256(project.project.source.files[0].content),
  expectedBehavior: 'A0, A1 and A5 report independent idealized 0–5 V wetness, sound-level and flame-response signals.',
  namedPins: { supply: 'VCC → 5V', ground: 'GND → GND1',
    rain: 'AOUT → A0', soundLevel: 'AOUT → A1', flame: 'AOUT → A5' },
  profileBehavior: {
    [AVR]: 'authoring and executable ideal analogue adapter available after a fresh isolated Build',
    'board.rp2040-pico-v1': 'unavailable',
    'board.esp32-c3-devmodule-v1': 'unavailable',
    'board.stm32f429zi-nucleo144-v1': 'unavailable',
  },
  provenance: 'Original project-owned contracts, SVG artwork, deterministic analogue projection, firmware source and canonical project envelope.',
};
const manifest = {
  schema: 'intent-mcu-analogue-detection-sensor-example-manifest@1',
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
      throw new Error(`ANALOGUE_DETECTION_SENSOR_ARTIFACT_STALE:${file}`);
    }
  }
}

