#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import {
  FLOW_PULSE_SENSOR_TYPE,
  WIND_SPEED_PULSE_SENSOR_TYPE,
  createDigitalPulseSensor,
} from '../expansion-drafts/digital-pulse-sensors-v1.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const ROOT = new URL('../examples/digital-pulse-sensors/', import.meta.url);
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
    'unsigned long flowEdges = 0, windEdges = 0;',
    'bool lastFlow = false, lastWind = false;',
    'void setup(){',
    '  Serial.begin(115200);',
    '  pinMode(4, INPUT); pinMode(5, INPUT);',
    '}',
    'void loop(){',
    '  bool flowLevel = digitalRead(4); bool windLevel = digitalRead(5);',
    '  if (flowLevel && !lastFlow) flowEdges++;',
    '  if (windLevel && !lastWind) windEdges++;',
    '  Serial.print("flow_level="); Serial.print(flowLevel);',
    '  Serial.print(",flow_edges="); Serial.print(flowEdges);',
    '  Serial.print(",wind_level="); Serial.print(windLevel);',
    '  Serial.print(",wind_edges="); Serial.println(windEdges);',
    '  lastFlow = flowLevel; lastWind = windLevel;',
    '  delay(20);',
    '}',
    '',
  ].join('\n');
  const draft = createEditableContactDraft(source);
  if (!draft.ok) throw new Error(draft.code);
  draft.project.project.metadata.name = 'Manual digital pulse sensor levels';
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
  const flow = createDigitalPulseSensor(FLOW_PULSE_SENSOR_TYPE, 'flow-pulse-1');
  const wind = createDigitalPulseSensor(WIND_SPEED_PULSE_SENSOR_TYPE, 'wind-pulse-1');
  for (const [index, component] of [flow, wind].entries()) {
    apply({ type: 'component.add', component,
      position: { x: 0.6 + index * 0.2, y: 0.58, rotation: 0 } });
  }
  apply({ type: 'wire.create', net: { id: 'net-5v', endpoints: [
    endpoint('board-1', '5V'), endpoint(flow.id, 'VCC'),
  ] } });
  apply({ type: 'wire.branch', netId: 'net-5v', endpoint: endpoint(wind.id, 'VCC'),
    junctionId: 'junction-vcc-wind' });
  apply({ type: 'wire.create', net: { id: 'net-ground-branch', endpoints: [
    endpoint('board-1', 'GND1'), endpoint(flow.id, 'GND'),
  ] } });
  apply({ type: 'wire.branch', netId: 'net-ground-branch', endpoint: endpoint(wind.id, 'GND'),
    junctionId: 'junction-ground-wind' });
  for (const [component, pin] of [[flow, 'D4'], [wind, 'D5']]) {
    apply({ type: 'wire.create', net: { id: `net-${component.id}-out`, endpoints: [
      endpoint(component.id, 'OUT'), endpoint('board-1', pin),
    ] } });
  }
  if (!session.runnable.ok) throw new Error(`${session.runnable.code}:${JSON.stringify(session.runnable.details)}`);
  return JSON.parse(session.saveText());
}

const project = buildProject();
const bytes = canonicalProjectEnvelope(AVR, project, { [AVR]: adapter }, emptyProjectBrief(), null,
  CURRENT_MODEL_LIBRARY_LOCK);
const entry = {
  id: 'avr-digital-pulse-sensors',
  requirementIds: ['CMP-106', 'CMP-112'],
  file: 'avr-digital-pulse-sensors.intent-mcu.json',
  projectSha256: sha256(bytes),
  sourceSha256: sha256(project.project.source.files[0].content),
  expectedBehavior: 'Manual LOW→HIGH changes on D4 and D5 are counted as independent rising edges; no automatic pulse train, flow rate or wind speed is generated.',
  namedPins: { supply: 'VCC → 5V', ground: 'GND → GND1',
    flow: 'OUT → D4', wind: 'OUT → D5' },
  profileBehavior: {
    [AVR]: 'authoring and bounded executable active-high level adapter available after a fresh isolated Build',
    'board.rp2040-pico-v1': 'unavailable',
    'board.esp32-c3-devmodule-v1': 'unavailable',
    'board.stm32f429zi-nucleo144-v1': 'unavailable',
  },
  provenance: 'Original project-owned contracts, SVG artwork, deterministic manual active-high projection, firmware source and canonical project envelope.',
};
const manifest = {
  schema: 'intent-mcu-digital-pulse-sensor-example-manifest@1',
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
      throw new Error(`DIGITAL_PULSE_SENSOR_ARTIFACT_STALE:${file}`);
    }
  }
}
