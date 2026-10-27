// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPONENT_CATALOG } from '../src/component-catalog.mjs';
import { CircuitRuntime } from '../src/circuit-engine.mjs';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson,
  validateContactPersistenceDraft } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import {
  ANALOGUE_DETECTION_DEFINITIONS,
  CO2_ANALOGUE_TYPE,
  MQ_GAS_ANALOGUE_TYPE,
  UV_ANALOGUE_TYPE,
  analogueDetectionRatio,
  createAnalogueDetectionSensor,
  validateAnalogueDetectionSensor,
} from '../expansion-drafts/analogue-detection-sensors-v1.mjs';
import {
  CANDIDATE_UI_COMPONENTS, candidateContactControl, createCandidateUiComponent,
  openCandidateUiSession,
} from '../src/candidate-existing-ui-adapter.mjs';
import { openPortableEditorSession } from '../src/candidate-project-session.mjs';

const TYPES = [MQ_GAS_ANALOGUE_TYPE, CO2_ANALOGUE_TYPE, UV_ANALOGUE_TYPE];

function openSession() {
  const draft = createEditableContactDraft(); assert.equal(draft.ok, true);
  const opened = openPortableEditorSession(canonicalContactPersistenceDraftJson(draft.project));
  assert.equal(opened.ok, true); return opened.session;
}
function apply(session, command) {
  const result = session.apply({ ...command, revision: session.revision });
  assert.equal(result.ok, true, `${command.type}: ${result.code} ${JSON.stringify(result.details)}`);
  return result;
}
function addSensor(session, type = MQ_GAS_ANALOGUE_TYPE, id = 'exposure-1') {
  apply(session, { type: 'component.add', component: createAnalogueDetectionSensor(type, id),
    position: { x: 0.76, y: 0.58, rotation: 0 } });
}
function wireSensor(session, id = 'exposure-1', outputPin = 'A2') {
  apply(session, { type: 'wire.branch', netId: 'net-5v', endpoint: { component: id, pin: 'VCC' },
    junctionId: `junction-${id}-vcc` });
  apply(session, { type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: id, pin: 'GND' },
    junctionId: `junction-${id}-ground` });
  apply(session, { type: 'wire.create', net: { id: `net-${id}-aout`, endpoints: [
    { component: id, pin: 'AOUT' }, { component: 'board-1', pin: outputPin },
  ] } });
}

test('CMP107/CMP108/CMP111 are exact original normalized analogue response contracts', () => {
  assert(!TYPES.some((type) => Object.hasOwn(COMPONENT_CATALOG, type)));
  assert.equal(new Set(TYPES.map((type) => ANALOGUE_DETECTION_DEFINITIONS[type].modelRef)).size, 3);
  assert.equal(new Set(TYPES.map((type) => ANALOGUE_DETECTION_DEFINITIONS[type].artwork.renderer)).size, 3);
  for (const [index, type] of TYPES.entries()) {
    const definition = ANALOGUE_DETECTION_DEFINITIONS[type];
    assert.deepEqual(definition.pins.map(({ id }) => id), ['VCC', 'GND', 'AOUT']);
    assert.equal(definition.support.status, 'simulated');
    assert.match(definition.support.limitations.join(' '), /linearly to 0–5 V/u);
    assert.match(definition.support.limitations.join(' '), /A0–A5/u);
    assert.match(definition.artwork.provenance, /Original IntentForce SVG/u);
    assert.equal(CANDIDATE_UI_COMPONENTS[type], definition);
    const component = createCandidateUiComponent(type, `exposure-${index}`);
    assert.equal(validateAnalogueDetectionSensor(component), true);
    assert.equal(analogueDetectionRatio(component), 0.5);
  }
  assert.match(ANALOGUE_DETECTION_DEFINITIONS[MQ_GAS_ANALOGUE_TYPE].support.limitations.join(' '), /gas identity, concentration or ppm/u);
  assert.match(ANALOGUE_DETECTION_DEFINITIONS[CO2_ANALOGUE_TYPE].support.limitations.join(' '), /CO2 concentration or ppm/u);
  assert.match(ANALOGUE_DETECTION_DEFINITIONS[UV_ANALOGUE_TYPE].support.limitations.join(' '), /UV index or irradiance/u);
});

test('missing exposure-module terminals and a digital output target fail exactly', () => {
  const session = openSession(); addSensor(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_ANALOGUE_DETECTION_SENSOR_VCC_DISCONNECTED');
  apply(session, { type: 'wire.branch', netId: 'net-5v', endpoint: { component: 'exposure-1', pin: 'VCC' },
    junctionId: 'junction-exposure-vcc' });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_ANALOGUE_DETECTION_SENSOR_GND_DISCONNECTED');
  apply(session, { type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: 'exposure-1', pin: 'GND' },
    junctionId: 'junction-exposure-ground' });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_ANALOGUE_DETECTION_SENSOR_AOUT_DISCONNECTED');
  apply(session, { type: 'wire.create', net: { id: 'net-exposure-aout', endpoints: [
    { component: 'exposure-1', pin: 'AOUT' }, { component: 'board-1', pin: 'D7' },
  ] } });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_ANALOGUE_DETECTION_SENSOR_AOUT_REQUIRES_ANALOGUE');
  assert.equal(validateContactPersistenceDraft(JSON.parse(session.saveText())).ok, true);
});

test('all three exposure models project independent ratios through the AVR ADC adapter', () => {
  const pins = ['A2', 'A3', 'A4'];
  for (const [index, type] of TYPES.entries()) {
    const session = openSession(); const id = `exposure-${index}`;
    addSensor(session, type, id); wireSensor(session, id, pins[index]);
    assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
    const projected = session.runtimeProject.circuit.components.find((component) => component.id === id);
    assert.equal(projected.type, 'potentiometer.linear-v1');
    assert.deepEqual(projected.controls, { position: 0.5 });
    const support = session.runtimeSupport.find((item) => item.componentId === id);
    assert.equal(support.runtimeAdapter, 'potentiometer.linear-v1-ideal-analogue-sensor-adapter');
    assert.equal(support.runtimeProjection.voltage, 2.5);
    const calls = [];
    new CircuitRuntime(session.runtimeProject.circuit).applyControls({ setDigitalPin() {},
      setAnalogChannel(channel, voltage) { calls.push([channel, voltage]); } });
    assert.deepEqual(calls.find(([channel]) => channel === [2, 3, 4][index]), [[2, 3, 4][index], 2.5]);
    const key = ANALOGUE_DETECTION_DEFINITIONS[type].controlKeys[0];
    const prepared = candidateContactControl(session, id, key, 0.8);
    assert.deepEqual(prepared.worker, { command: 'control', componentId: id, key: 'position', value: 0.8 });
    assert.equal(apply(session, prepared.command).changeRelevance, 'runtime');
    assert.deepEqual(session.evaluateModel(type, { ratio: 0.8 }), {
      ok: true, code: 'OK', result: { ratio: 0.8, outputVolts: 4 },
    });
  }
});

test('exposure control rejection is atomic and Save/Open plus undo/redo preserve state', () => {
  const session = openSession();
  addSensor(session, UV_ANALOGUE_TYPE, 'uv-sensor-1'); wireSensor(session, 'uv-sensor-1', 'A4');
  const beforeInvalid = session.saveText();
  assert.equal(candidateContactControl(session, 'uv-sensor-1', 'co2ResponseRatio', 0.9).ok, false);
  const rejected = session.apply({ type: 'component.control.set', revision: session.revision,
    componentId: 'uv-sensor-1', key: 'uvResponseRatio', value: 1.1 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'PROJECT_CONTACT_ANALOGUE_DETECTION_SENSOR_STATE');
  assert.equal(session.saveText(), beforeInvalid);
  apply(session, candidateContactControl(session, 'uv-sensor-1', 'uvResponseRatio', 0.75).command);
  const activeText = session.saveText();
  const reopened = openCandidateUiSession(activeText); assert.equal(reopened.ok, true, reopened.code);
  assert.equal(reopened.session.visualProject.circuit.components.find(
    (component) => component.id === 'uv-sensor-1',
  ).controls.uvResponseRatio, 0.75);
  apply(session, { type: 'component.remove', componentId: 'uv-sensor-1' });
  apply(session, { type: 'undo' }); assert.equal(session.saveText(), activeText);
  apply(session, { type: 'redo' });
  assert(!JSON.parse(session.saveText()).candidateCircuit.components.some(
    (component) => component.id === 'uv-sensor-1'));
});

