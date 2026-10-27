#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import {
  IR_OBSTACLE_SENSOR_TYPE,
  LINE_TRACKING_SENSOR_TYPE,
  createDigitalReflectiveSensor,
} from '../expansion-drafts/digital-reflective-sensors-v1.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const ROOT = new URL('../examples/digital-reflective-sensors/', import.meta.url);
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
    '  pinMode(7, INPUT_PULLUP); pinMode(8, INPUT_PULLUP);',
    '}',
    'void loop(){',
    '  bool obstacle = digitalRead(7) == LOW;',
    '  bool line = digitalRead(8) == LOW;',
    '  Serial.print("obstacle="); Serial.print(obstacle);',
    '  Serial.print(",line="); Serial.println(line);',
    '  delay(120);',
    '}',
    '',
  ].join('\n');
  const draft = createEditableContactDraft(source);
  if (!draft.ok) throw new Error(draft.code);
  draft.project.project.metadata.name = 'Digital reflective sensors';
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
  const obstacle = createDigitalReflectiveSensor(IR_OBSTACLE_SENSOR_TYPE, 'ir-obstacle-1');
  obstacle.controls.obstacleDetected = true;
  const line = createDigitalReflectiveSensor(LINE_TRACKING_SENSOR_TYPE, 'line-tracker-1');
  for (const [index, component] of [obstacle, line].entries()) {
    apply({ type: 'component.add', component,
      position: { x: 0.64 + index * 0.17, y: 0.62, rotation: 0 } });
  }
  apply({ type: 'wire.create', net: { id: 'net-5v', endpoints: [endpoint('board-1', '5V'), endpoint(obstacle.id, 'VCC')] } });
  apply({ type: 'wire.branch', netId: 'net-5v', endpoint: endpoint(line.id, 'VCC'), junctionId: 'junction-vcc-line' });
  apply({ type: 'wire.create', net: { id: 'net-ground-branch', endpoints: [endpoint('board-1', 'GND1'), endpoint(obstacle.id, 'GND')] } });
  apply({ type: 'wire.branch', netId: 'net-ground-branch', endpoint: endpoint(line.id, 'GND'), junctionId: 'junction-ground-line' });
  for (const [component, pin] of [[obstacle, 'D7'], [line, 'D8']]) {
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
  id: 'avr-digital-reflective-sensors',
  requirementIds: ['CMP-122', 'CMP-123'],
  file: 'avr-digital-reflective-sensors.intent-mcu.json',
  projectSha256: sha256(bytes),
  sourceSha256: sha256(project.project.source.files[0].content),
  expectedBehavior: 'D7 and D8 report independent active-low reflected-obstacle and dark-line states.',
  namedPins: { supply: 'VCC → 5V', ground: 'GND → GND1',
    obstacle: 'OUT → D7', line: 'OUT → D8' },
  profileBehavior: {
    [AVR]: 'authoring and executable active-low INPUT_PULLUP adapter available after a fresh isolated Build',
    'board.rp2040-pico-v1': 'unavailable',
    'board.esp32-c3-devmodule-v1': 'unavailable',
    'board.stm32f429zi-nucleo144-v1': 'unavailable',
  },
  provenance: 'Original project-owned contracts, SVG artwork, deterministic active-low projection, firmware source and canonical project envelope.',
};
const manifest = {
  schema: 'intent-mcu-digital-reflective-sensor-example-manifest@1',
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
      throw new Error(`DIGITAL_REFLECTIVE_SENSOR_ARTIFACT_STALE:${file}`);
    }
  }
}
