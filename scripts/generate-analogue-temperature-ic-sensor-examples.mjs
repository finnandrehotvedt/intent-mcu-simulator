#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import {
  LM35_TEMPERATURE_TYPE,
  TMP36_TEMPERATURE_TYPE,
  createAnalogueTemperatureIcSensor,
} from '../expansion-drafts/analogue-temperature-ic-sensors-v1.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const ROOT = new URL('../examples/analogue-temperature-ic-sensors/', import.meta.url);
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
    '  float tmp36V = analogRead(A0) * (5.0 / 1023.0);',
    '  float lm35V = analogRead(A1) * (5.0 / 1023.0);',
    '  Serial.print("tmp36_c="); Serial.print((tmp36V - 0.5) * 100.0, 1);',
    '  Serial.print(",lm35_c="); Serial.println(lm35V * 100.0, 1);',
    '  delay(250);',
    '}',
    '',
  ].join('\n');
  const draft = createEditableContactDraft(source);
  if (!draft.ok) throw new Error(draft.code);
  draft.project.project.metadata.name = 'TMP36 and LM35 analogue temperature comparison';
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
  const tmp36 = createAnalogueTemperatureIcSensor(TMP36_TEMPERATURE_TYPE, 'tmp36-1');
  tmp36.controls.temperatureC = 30;
  const lm35 = createAnalogueTemperatureIcSensor(LM35_TEMPERATURE_TYPE, 'lm35-1');
  lm35.controls.temperatureC = 45;
  for (const [index, component] of [tmp36, lm35].entries()) {
    apply({ type: 'component.add', component,
      position: { x: 0.62 + index * 0.18, y: 0.58, rotation: 0 } });
  }
  apply({ type: 'wire.create', net: { id: 'net-5v', endpoints: [endpoint('board-1', '5V'), endpoint(tmp36.id, 'VCC')] } });
  apply({ type: 'wire.branch', netId: 'net-5v', endpoint: endpoint(lm35.id, 'VCC'), junctionId: 'junction-vcc-lm35' });
  apply({ type: 'wire.create', net: { id: 'net-ground-branch', endpoints: [endpoint('board-1', 'GND1'), endpoint(tmp36.id, 'GND')] } });
  apply({ type: 'wire.branch', netId: 'net-ground-branch', endpoint: endpoint(lm35.id, 'GND'), junctionId: 'junction-ground-lm35' });
  for (const [component, pin] of [[tmp36, 'A0'], [lm35, 'A1']]) {
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
  id: 'avr-analogue-temperature-ic-sensors',
  requirementIds: ['CMP-089', 'CMP-090'],
  file: 'avr-analogue-temperature-ic-sensors.intent-mcu.json',
  projectSha256: sha256(bytes),
  sourceSha256: sha256(project.project.source.files[0].content),
  expectedBehavior: 'A0 compares a TMP36-style 500 mV offset plus 10 mV/°C transfer with A1 using an LM35-style nonnegative 10 mV/°C transfer.',
  namedPins: { supply: 'VCC → 5V', ground: 'GND → GND1',
    tmp36: 'AOUT → A0', lm35: 'AOUT → A1' },
  profileBehavior: {
    [AVR]: 'authoring and executable ideal analogue adapters available after a fresh isolated Build',
    'board.rp2040-pico-v1': 'unavailable',
    'board.esp32-c3-devmodule-v1': 'unavailable',
    'board.stm32f429zi-nucleo144-v1': 'unavailable',
  },
  provenance: 'Original project-owned contracts, SVG artwork, deterministic transfer functions, firmware source and canonical project envelope.',
};
const manifest = {
  schema: 'intent-mcu-analogue-temperature-ic-sensor-example-manifest@1',
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
      throw new Error(`ANALOGUE_TEMPERATURE_IC_SENSOR_ARTIFACT_STALE:${file}`);
    }
  }
}
