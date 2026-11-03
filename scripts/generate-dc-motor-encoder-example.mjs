#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { L298N_DRIVER_TYPE, createDcMotorL298nComponent } from '../expansion-drafts/dc-motor-l298n-v1.mjs';
import { createDcMotorEncoderComponent, projectDcMotorEncoders } from '../expansion-drafts/dc-motor-encoder-v1.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const target = new URL('../examples/indicators-actuators/avr-dc-motor-encoder.intent-mcu.json', import.meta.url);
const source = `byte previousEncoder = 3; int encoderQuarterSteps = 0; int encoderDetents = 0;
void setup() {
  pinMode(2, INPUT_PULLUP); pinMode(3, INPUT_PULLUP);
  pinMode(7, OUTPUT); pinMode(8, OUTPUT); pinMode(9, OUTPUT);
  digitalWrite(7, LOW); digitalWrite(8, LOW); digitalWrite(9, LOW);
  Serial.begin(115200); Serial.println("READY");
}
void loop() {
  byte a = digitalRead(2), b = digitalRead(3), currentEncoder = (a << 1) | b;
  if (currentEncoder != previousEncoder) {
    const signed char transition[16] = {0,-1,1,0, 1,0,0,-1, -1,0,0,1, 0,1,-1,0};
    encoderQuarterSteps += transition[(previousEncoder << 2) | currentEncoder];
    if (currentEncoder == 3 && encoderQuarterSteps != 0) {
      encoderDetents += encoderQuarterSteps / 4; encoderQuarterSteps = 0;
    }
    Serial.print("phase="); Serial.print(a); Serial.print(b);
    Serial.print(",count="); Serial.println(encoderDetents);
    previousEncoder = currentEncoder;
  }
  delayMicroseconds(100);
}
`;
const adapter = Object.freeze({ schemas: Object.freeze(['intent-mcu-project-contact-persistence@1']), prepare(value) {
  const opened = openCandidateUiSession(JSON.stringify(value));
  if (!opened.ok) throw new Error(opened.code);
  return { project: JSON.parse(opened.session.saveText()) };
} });
const adapters = Object.freeze({ [AVR]: adapter });
const draft = createEditableContactDraft(source);
if (!draft.ok) throw new Error(draft.code);
draft.project.project.metadata.name = 'DC motor command with independent encoder detents';
const opened = openCandidateUiSession(canonicalContactPersistenceDraftJson(draft.project));
if (!opened.ok) throw new Error(opened.code);
const session = opened.session;
const apply = (command) => {
  const result = session.apply({ ...command, revision: session.revision });
  if (!result.ok) throw new Error(`DC_MOTOR_ENCODER_EXAMPLE:${command.type}:${result.code}:${JSON.stringify(result.details)}`);
};
for (const component of session.visualProject.circuit.components) {
  if (component.id !== 'board-1') apply({ type: 'component.remove', componentId: component.id });
}
apply({ type: 'component.add', component: createDcMotorL298nComponent(L298N_DRIVER_TYPE, 'l298n-1'),
  position: { x: 0.58, y: 0.58, rotation: 0 } });
apply({ type: 'component.add', component: createDcMotorEncoderComponent('dc-motor-encoder-1'),
  position: { x: 0.82, y: 0.58, rotation: 0 } });
const wire = (id, left, right) => apply({ type: 'wire.create', net: { id, endpoints: [left, right] } });
const endpoint = (component, pin) => ({ component, pin });
wire('net-motor-encoder-driver-vcc', endpoint('l298n-1', 'VCC'), endpoint('board-1', '5V'));
wire('net-motor-encoder-driver-ground', endpoint('l298n-1', 'GND'), endpoint('board-1', 'GND1'));
wire('net-motor-encoder-in1', endpoint('l298n-1', 'IN1'), endpoint('board-1', 'D7'));
wire('net-motor-encoder-in2', endpoint('l298n-1', 'IN2'), endpoint('board-1', 'D8'));
wire('net-motor-encoder-enable', endpoint('l298n-1', 'ENA'), endpoint('board-1', 'D9'));
wire('net-motor-encoder-m1', endpoint('l298n-1', 'OUT1'), endpoint('dc-motor-encoder-1', 'M1'));
wire('net-motor-encoder-m2', endpoint('l298n-1', 'OUT2'), endpoint('dc-motor-encoder-1', 'M2'));
wire('net-motor-encoder-a', endpoint('dc-motor-encoder-1', 'EA'), endpoint('board-1', 'D2'));
wire('net-motor-encoder-b', endpoint('dc-motor-encoder-1', 'EB'), endpoint('board-1', 'D3'));
wire('net-motor-encoder-common', endpoint('dc-motor-encoder-1', 'ECOM'), endpoint('board-1', 'GND2'));
const projection = projectDcMotorEncoders(session.visualProject.circuit);
if (!projection.ok || projection.assemblies.length !== 1 || projection.encoders.length !== 1) {
  throw new Error(`DC_MOTOR_ENCODER_PROJECTION:${projection.code ?? 'COUNT'}`);
}
const project = JSON.parse(session.saveText());
const bytes = canonicalProjectEnvelope(AVR, project, adapters, emptyProjectBrief(), null, CURRENT_MODEL_LIBRARY_LOCK);
if (process.argv.includes('--write')) {
  await mkdir(new URL('../examples/indicators-actuators/', import.meta.url), { recursive: true });
  await writeFile(target, bytes);
} else if (await readFile(target, 'utf8') !== bytes) {
  throw new Error('DC_MOTOR_ENCODER_ARTIFACT_STALE');
}
console.log(JSON.stringify({ ok: true, component: 'CMP-069', runtimeEncoders: projection.encoders.length }));
