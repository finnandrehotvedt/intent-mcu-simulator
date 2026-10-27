#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { FLEX_DIVIDER_TYPE, LDR_DIVIDER_TYPE, NTC_DIVIDER_TYPE,
  createResistiveDividerSensor } from '../expansion-drafts/resistive-divider-sensors-v1.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const ROOT = new URL('../examples/resistive-divider-sensors/', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const source = `void setup() { Serial.begin(115200); }
void loop() {
  Serial.print("LDR="); Serial.print(analogRead(A0));
  Serial.print(",NTC="); Serial.print(analogRead(A1));
  Serial.print(",FLEX="); Serial.println(analogRead(A2));
  delay(150);
}
`;
const draft = createEditableContactDraft(source);
if (!draft.ok) throw new Error(draft.code);
draft.project.project.metadata.name = 'LDR, NTC and flex voltage dividers';
const session = openCandidateUiSession(canonicalContactPersistenceDraftJson(draft.project)).session;
const apply = (command) => { const result = session.apply({ ...command, revision: session.revision });
  if (!result.ok) throw new Error(`RESISTIVE_DIVIDER_EXAMPLE:${command.type}:${result.code}`); };
const cases = [
  [LDR_DIVIDER_TYPE, 'ldr-divider-1', 'A0', { lightLevel: 0.6 }, 0.58],
  [NTC_DIVIDER_TYPE, 'ntc-divider-1', 'A1', { temperatureC: 30 }, 0.72],
  [FLEX_DIVIDER_TYPE, 'flex-divider-1', 'A2', { bendRatio: 0.4 }, 0.86],
];
for (const component of session.visualProject.circuit.components) {
  if (component.id !== 'board-1') apply({ type: 'component.remove', componentId: component.id });
}
for (const [index, [type, id, boardPin, controls, x]] of cases.entries()) {
  const component = createResistiveDividerSensor(type, id); component.controls = controls;
  apply({ type: 'component.add', component, position: { x, y: 0.56, rotation: 0 } });
  if (index === 0) {
    apply({ type: 'wire.create', net: { id: 'net-5v', endpoints: [
      { component: 'board-1', pin: '5V' }, { component: id, pin: 'VCC' }] } });
    apply({ type: 'wire.create', net: { id: 'net-ground-branch', endpoints: [
      { component: 'board-1', pin: 'GND1' }, { component: id, pin: 'GND' }] } });
  } else {
    apply({ type: 'wire.branch', netId: 'net-5v', endpoint: { component: id, pin: 'VCC' },
      junctionId: `junction-${id}-vcc` });
    apply({ type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: id, pin: 'GND' },
      junctionId: `junction-${id}-ground` });
  }
  apply({ type: 'wire.create', net: { id: `net-${id}-aout`, endpoints: [
    { component: id, pin: 'AOUT' }, { component: 'board-1', pin: boardPin },
  ] } });
}
const project = JSON.parse(session.saveText());
const adapters = { [AVR]: { schemas: ['intent-mcu-project-contact-persistence@1'],
  prepare(value) { const opened = openCandidateUiSession(JSON.stringify(value));
    if (!opened.ok) throw new Error(opened.code); return { project: JSON.parse(opened.session.saveText()) }; } } };
const bytes = canonicalProjectEnvelope(AVR, project, adapters, emptyProjectBrief(), null,
  CURRENT_MODEL_LIBRARY_LOCK);
const entry = {
  id: 'avr-resistive-divider-sensors', requirementIds: ['CMP-085', 'CMP-088', 'CMP-116'],
  file: 'avr-resistive-divider-sensors.intent-mcu.json',
  namedPins: { supply: 'VCC → 5V', ground: 'GND → GND1', ldr: 'AOUT → A0',
    ntc: 'AOUT → A1', flex: 'AOUT → A2' },
  values: { fixedLowSideOhms: 10000, ldrLightLevel: 0.6, ntcTemperatureC: 30,
    flexBendRatio: 0.4 },
  expectedBehavior: 'Compiled firmware prints three ADC readings while each original control applies its declared integrated divider transfer.',
  firmwareLimits: 'AVR-only integrated 5 V dividers. No raw two-terminal network solver, lux or angle calibration, tolerance, hysteresis, thermal dynamics or physical equivalence.',
  profileBehavior: { [AVR]: 'authoring and executable integrated-divider adapter available after a fresh isolated Build',
    'board.rp2040-pico-v1': 'unavailable', 'board.esp32-c3-devmodule-v1': 'unavailable',
    'board.stm32f429zi-nucleo144-v1': 'unavailable' },
  sourceSha256: sha256(source), projectSha256: sha256(bytes),
  provenance: 'Original project-owned contracts, SVG artwork, deterministic divider transfer models, firmware source and canonical project envelope.',
};
const manifest = { schema: 'intent-mcu-resistive-divider-sensor-example-manifest@1', profile: AVR,
  modelLibrary: CURRENT_MODEL_LIBRARY_LOCK, entries: [entry] };
const expected = new Map([[entry.file, bytes], ['manifest.json', `${JSON.stringify(manifest, null, 2)}\n`]]);
if (process.argv.includes('--write')) {
  await mkdir(ROOT, { recursive: true });
  for (const [file, value] of expected) await writeFile(new URL(file, ROOT), value);
} else {
  for (const [file, value] of expected) {
    if (await readFile(new URL(file, ROOT), 'utf8') !== value) throw new Error(`RESISTIVE_DIVIDER_ARTIFACT_STALE:${file}`);
  }
}
