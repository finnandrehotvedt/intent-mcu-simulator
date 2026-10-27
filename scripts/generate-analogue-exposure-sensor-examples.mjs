#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import {
  CO2_ANALOGUE_TYPE,
  MQ_GAS_ANALOGUE_TYPE,
  UV_ANALOGUE_TYPE,
  createAnalogueDetectionSensor,
} from '../expansion-drafts/analogue-detection-sensors-v1.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const ROOT = new URL('../examples/analogue-exposure-sensors/', import.meta.url);
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
    '  Serial.print("mq_response="); Serial.print(analogRead(A2));',
    '  Serial.print(",co2_response="); Serial.print(analogRead(A3));',
    '  Serial.print(",uv_response="); Serial.println(analogRead(A4));',
    '  delay(120);',
    '}',
    '',
  ].join('\n');
  const draft = createEditableContactDraft(source);
  if (!draft.ok) throw new Error(draft.code);
  draft.project.project.metadata.name = 'Analogue gas CO2 and UV response models';
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
  const gas = createAnalogueDetectionSensor(MQ_GAS_ANALOGUE_TYPE, 'mq-gas-1');
  gas.controls.gasResponseRatio = 0.3;
  const co2 = createAnalogueDetectionSensor(CO2_ANALOGUE_TYPE, 'co2-sensor-1');
  co2.controls.co2ResponseRatio = 0.65;
  const uv = createAnalogueDetectionSensor(UV_ANALOGUE_TYPE, 'uv-sensor-1');
  uv.controls.uvResponseRatio = 0.9;
  for (const [index, component] of [gas, co2, uv].entries()) {
    apply({ type: 'component.add', component,
      position: { x: 0.55 + index * 0.15, y: 0.58, rotation: 0 } });
  }
  apply({ type: 'wire.create', net: { id: 'net-5v', endpoints: [endpoint('board-1', '5V'), endpoint(gas.id, 'VCC')] } });
  apply({ type: 'wire.branch', netId: 'net-5v', endpoint: endpoint(co2.id, 'VCC'), junctionId: 'junction-vcc-co2' });
  apply({ type: 'wire.branch', netId: 'net-5v', endpoint: endpoint(uv.id, 'VCC'), junctionId: 'junction-vcc-uv' });
  apply({ type: 'wire.create', net: { id: 'net-ground-branch', endpoints: [endpoint('board-1', 'GND1'), endpoint(gas.id, 'GND')] } });
  apply({ type: 'wire.branch', netId: 'net-ground-branch', endpoint: endpoint(co2.id, 'GND'), junctionId: 'junction-ground-co2' });
  apply({ type: 'wire.branch', netId: 'net-ground-branch', endpoint: endpoint(uv.id, 'GND'), junctionId: 'junction-ground-uv' });
  for (const [component, pin] of [[gas, 'A2'], [co2, 'A3'], [uv, 'A4']]) {
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
  id: 'avr-analogue-exposure-sensors',
  requirementIds: ['CMP-107', 'CMP-108', 'CMP-111'],
  file: 'avr-analogue-exposure-sensors.intent-mcu.json',
  projectSha256: sha256(bytes),
  sourceSha256: sha256(project.project.source.files[0].content),
  expectedBehavior: 'A2, A3 and A4 report independent idealized 0–5 V MQ gas, CO2 and UV response ratios.',
  namedPins: { supply: 'VCC → 5V', ground: 'GND → GND1',
    mqGas: 'AOUT → A2', co2: 'AOUT → A3', uv: 'AOUT → A4' },
  profileBehavior: {
    [AVR]: 'authoring and executable ideal analogue adapter available after a fresh isolated Build',
    'board.rp2040-pico-v1': 'unavailable',
    'board.esp32-c3-devmodule-v1': 'unavailable',
    'board.stm32f429zi-nucleo144-v1': 'unavailable',
  },
  provenance: 'Original project-owned contracts, SVG artwork, deterministic analogue projection, firmware source and canonical project envelope.',
};
const manifest = {
  schema: 'intent-mcu-analogue-exposure-sensor-example-manifest@1',
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
      throw new Error(`ANALOGUE_EXPOSURE_SENSOR_ARTIFACT_STALE:${file}`);
    }
  }
}

