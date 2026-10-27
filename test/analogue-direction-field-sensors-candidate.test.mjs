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
  ANALOGUE_DIRECTION_FIELD_DEFINITIONS,
  HALL_MAGNETIC_ANALOGUE_TYPE,
  WIND_DIRECTION_ANALOGUE_TYPE,
  analogueDirectionFieldValue,
  createAnalogueDirectionFieldSensor,
  validateAnalogueDirectionFieldSensor,
} from '../expansion-drafts/analogue-direction-field-sensors-v1.mjs';
import {
  CANDIDATE_UI_COMPONENTS, candidateContactControl, createCandidateUiComponent,
  openCandidateUiSession,
} from '../src/candidate-existing-ui-adapter.mjs';
import { openPortableEditorSession } from '../src/candidate-project-session.mjs';

const TYPES = [WIND_DIRECTION_ANALOGUE_TYPE, HALL_MAGNETIC_ANALOGUE_TYPE];

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
function addSensor(session, type = WIND_DIRECTION_ANALOGUE_TYPE, id = 'direction-field-1') {
  apply(session, { type: 'component.add', component: createAnalogueDirectionFieldSensor(type, id),
    position: { x: 0.76, y: 0.58, rotation: 0 } });
}
function wireSensor(session, id = 'direction-field-1', outputPin = 'A0') {
  apply(session, { type: 'wire.branch', netId: 'net-5v', endpoint: { component: id, pin: 'VCC' },
    junctionId: `junction-${id}-vcc` });
  apply(session, { type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: id, pin: 'GND' },
    junctionId: `junction-${id}-ground` });
  apply(session, { type: 'wire.create', net: { id: `net-${id}-aout`, endpoints: [
    { component: id, pin: 'AOUT' }, { component: 'board-1', pin: outputPin },
  ] } });
}

test('CMP113/CMP125 are exact original ideal analogue direction and field contracts', () => {
  assert(!TYPES.some((type) => Object.hasOwn(COMPONENT_CATALOG, type)));
  assert.equal(new Set(TYPES.map((type) => ANALOGUE_DIRECTION_FIELD_DEFINITIONS[type].modelRef)).size, 2);
  assert.equal(new Set(TYPES.map((type) => ANALOGUE_DIRECTION_FIELD_DEFINITIONS[type].artwork.renderer)).size, 2);
  for (const [index, type] of TYPES.entries()) {
    const definition = ANALOGUE_DIRECTION_FIELD_DEFINITIONS[type];
    assert.deepEqual(definition.pins.map(({ id }) => id), ['VCC', 'GND', 'AOUT']);
    assert.equal(definition.support.status, 'simulated');
    assert.match(definition.support.limitations.join(' '), /linearly to 0–5 V/u);
    assert.match(definition.support.limitations.join(' '), /A0–A5/u);
    assert.match(definition.artwork.provenance, /Original IntentForce SVG/u);
    assert.equal(CANDIDATE_UI_COMPONENTS[type], definition);
    const component = createCandidateUiComponent(type, `direction-field-${index}`);
    assert.equal(validateAnalogueDirectionFieldSensor(component), true);
    assert.equal(analogueDirectionFieldValue(component), index === 0 ? 180 : 0);
  }
  assert.match(ANALOGUE_DIRECTION_FIELD_DEFINITIONS[WIND_DIRECTION_ANALOGUE_TYPE].support.limitations.join(' '), /compass reference/u);
  assert.match(ANALOGUE_DIRECTION_FIELD_DEFINITIONS[HALL_MAGNETIC_ANALOGUE_TYPE].support.limitations.join(' '), /tesla or gauss/u);
});

test('missing module terminals and a digital output target fail exactly', () => {
  const session = openSession(); addSensor(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_ANALOGUE_DIRECTION_FIELD_SENSOR_VCC_DISCONNECTED');
  apply(session, { type: 'wire.branch', netId: 'net-5v', endpoint: { component: 'direction-field-1', pin: 'VCC' },
    junctionId: 'junction-direction-field-vcc' });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_ANALOGUE_DIRECTION_FIELD_SENSOR_GND_DISCONNECTED');
  apply(session, { type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: 'direction-field-1', pin: 'GND' },
    junctionId: 'junction-direction-field-ground' });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_ANALOGUE_DIRECTION_FIELD_SENSOR_AOUT_DISCONNECTED');
  apply(session, { type: 'wire.create', net: { id: 'net-direction-field-aout', endpoints: [
    { component: 'direction-field-1', pin: 'AOUT' }, { component: 'board-1', pin: 'D7' },
  ] } });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_ANALOGUE_DIRECTION_FIELD_SENSOR_AOUT_REQUIRES_ANALOGUE');
  assert.equal(validateContactPersistenceDraft(JSON.parse(session.saveText())).ok, true);
});

test('both models project their exact ranges through the AVR ADC adapter', () => {
  const cases = [
    [WIND_DIRECTION_ANALOGUE_TYPE, 'directionDegrees', 270, 0.75, 3.75, 'A4', 4],
    [HALL_MAGNETIC_ANALOGUE_TYPE, 'magneticFieldRatio', -0.6, 0.2, 1, 'A5', 5],
  ];
  for (const [index, [type, key, value, position, voltage, pin, channel]] of cases.entries()) {
    const session = openSession(); const id = `direction-field-${index}`;
    addSensor(session, type, id); wireSensor(session, id, pin);
    assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
    const support = session.runtimeSupport.find((item) => item.componentId === id);
    assert.equal(support.runtimeAdapter, 'potentiometer.linear-v1-ideal-analogue-sensor-adapter');
    const prepared = candidateContactControl(session, id, key, value);
    assert.deepEqual(prepared.worker, { command: 'control', componentId: id, key: 'position', value: position });
    assert.equal(apply(session, prepared.command).changeRelevance, 'runtime');
    const projected = session.runtimeProject.circuit.components.find((component) => component.id === id);
    assert.deepEqual(projected.controls, { position });
    assert.equal(session.runtimeSupport.find((item) => item.componentId === id).runtimeProjection.voltage, voltage);
    const calls = [];
    new CircuitRuntime(session.runtimeProject.circuit).applyControls({ setDigitalPin() {},
      setAnalogChannel(adcChannel, volts) { calls.push([adcChannel, volts]); } });
    assert.deepEqual(calls.find(([adcChannel]) => adcChannel === channel), [channel, voltage]);
    assert.deepEqual(session.evaluateModel(type, { [key]: value }), {
      ok: true, code: 'OK', result: { [key]: value, outputVolts: voltage },
    });
  }
});

test('range rejection is atomic and Save/Open plus remove/undo/redo preserve signed state', () => {
  const session = openSession();
  addSensor(session, HALL_MAGNETIC_ANALOGUE_TYPE, 'hall-field-1'); wireSensor(session, 'hall-field-1', 'A1');
  const beforeInvalid = session.saveText();
  assert.equal(candidateContactControl(session, 'hall-field-1', 'directionDegrees', 90).ok, false);
  const rejected = session.apply({ type: 'component.control.set', revision: session.revision,
    componentId: 'hall-field-1', key: 'magneticFieldRatio', value: 1.1 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'PROJECT_CONTACT_ANALOGUE_DIRECTION_FIELD_SENSOR_STATE');
  assert.equal(session.saveText(), beforeInvalid);
  apply(session, candidateContactControl(session, 'hall-field-1', 'magneticFieldRatio', -0.75).command);
  const activeText = session.saveText();
  const reopened = openCandidateUiSession(activeText); assert.equal(reopened.ok, true, reopened.code);
  assert.equal(reopened.session.visualProject.circuit.components.find(
    (component) => component.id === 'hall-field-1',
  ).controls.magneticFieldRatio, -0.75);
  assert.equal(reopened.session.runtimeProject.circuit.components.find(
    (component) => component.id === 'hall-field-1',
  ).controls.position, 0.125);
  apply(session, { type: 'component.remove', componentId: 'hall-field-1' });
  apply(session, { type: 'undo' }); assert.equal(session.saveText(), activeText);
  apply(session, { type: 'redo' });
  assert(!JSON.parse(session.saveText()).candidateCircuit.components.some(
    (component) => component.id === 'hall-field-1'));
});
