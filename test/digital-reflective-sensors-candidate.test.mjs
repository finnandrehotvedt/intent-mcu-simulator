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
  DIGITAL_REFLECTIVE_SENSOR_DEFINITIONS,
  IR_OBSTACLE_SENSOR_TYPE,
  LINE_TRACKING_SENSOR_TYPE,
  createDigitalReflectiveSensor,
  digitalReflectiveSensorActive,
  validateDigitalReflectiveSensor,
} from '../expansion-drafts/digital-reflective-sensors-v1.mjs';
import {
  CANDIDATE_UI_COMPONENTS,
  candidateContactControl,
  createCandidateUiComponent,
  openCandidateUiSession,
} from '../src/candidate-existing-ui-adapter.mjs';
import { openPortableEditorSession } from '../src/candidate-project-session.mjs';

const TYPES = [IR_OBSTACLE_SENSOR_TYPE, LINE_TRACKING_SENSOR_TYPE];

function openSession() {
  const draft = createEditableContactDraft();
  assert.equal(draft.ok, true);
  const opened = openPortableEditorSession(canonicalContactPersistenceDraftJson(draft.project));
  assert.equal(opened.ok, true);
  return opened.session;
}

function apply(session, command) {
  const result = session.apply({ ...command, revision: session.revision });
  assert.equal(result.ok, true, `${command.type}: ${result.code} ${JSON.stringify(result.details)}`);
  return result;
}

function addSensor(session, type = IR_OBSTACLE_SENSOR_TYPE, id = 'reflective-1') {
  apply(session, { type: 'component.add', component: createDigitalReflectiveSensor(type, id),
    position: { x: 0.76, y: 0.62, rotation: 0 } });
}

function wireSensor(session, id = 'reflective-1', outputPin = 'D7') {
  apply(session, { type: 'wire.branch', netId: 'net-5v', endpoint: { component: id, pin: 'VCC' },
    junctionId: `junction-${id}-vcc` });
  apply(session, { type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: id, pin: 'GND' },
    junctionId: `junction-${id}-ground` });
  apply(session, { type: 'wire.create', net: { id: `net-${id}-out`, endpoints: [
    { component: id, pin: 'OUT' }, { component: 'board-1', pin: outputPin },
  ] } });
}

test('CMP122/CMP123 remain two exact active-low reflective contracts with original artwork claims', () => {
  assert(!TYPES.some((type) => Object.hasOwn(COMPONENT_CATALOG, type)));
  assert.equal(new Set(TYPES.map((type) => DIGITAL_REFLECTIVE_SENSOR_DEFINITIONS[type].modelRef)).size, 2);
  assert.equal(new Set(TYPES.map((type) => DIGITAL_REFLECTIVE_SENSOR_DEFINITIONS[type].artwork.renderer)).size, 2);
  for (const [index, type] of TYPES.entries()) {
    const definition = DIGITAL_REFLECTIVE_SENSOR_DEFINITIONS[type];
    assert.deepEqual(definition.pins.map(({ id }) => id), ['VCC', 'GND', 'OUT']);
    assert.equal(definition.support.status, 'simulated');
    assert.match(definition.support.limitations.join(' '), /active LOW/u);
    assert.match(definition.support.limitations.join(' '), /D2–D12/u);
    assert.match(definition.artwork.provenance, /Original IntentForce SVG/u);
    assert.equal(CANDIDATE_UI_COMPONENTS[type], definition);
    const component = createCandidateUiComponent(type, `reflective-${index}`);
    assert.equal(validateDigitalReflectiveSensor(component), true);
    const key = definition.controlKeys[0];
    component.controls[key] = true;
    assert.equal(digitalReflectiveSensorActive(component), true);
  }
});

test('each missing reflective terminal and a wrong output pin has one exact blocking diagnostic', () => {
  const session = openSession();
  addSensor(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_DIGITAL_REFLECTIVE_SENSOR_VCC_DISCONNECTED');
  apply(session, { type: 'wire.branch', netId: 'net-5v', endpoint: { component: 'reflective-1', pin: 'VCC' },
    junctionId: 'junction-reflective-vcc' });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_DIGITAL_REFLECTIVE_SENSOR_GND_DISCONNECTED');
  apply(session, { type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: 'reflective-1', pin: 'GND' },
    junctionId: 'junction-reflective-ground' });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_DIGITAL_REFLECTIVE_SENSOR_OUT_DISCONNECTED');
  apply(session, { type: 'wire.create', net: { id: 'net-reflective-out', endpoints: [
    { component: 'reflective-1', pin: 'OUT' }, { component: 'board-1', pin: 'A1' },
  ] } });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_DIGITAL_REFLECTIVE_SENSOR_OUT_REQUIRES_DIGITAL_INPUT');
  assert.equal(validateContactPersistenceDraft(JSON.parse(session.saveText())).ok, true);
});

test('both reflective sensors project independent active-low states onto executable AVR digital inputs', () => {
  for (const [index, type] of TYPES.entries()) {
    const session = openSession(); const id = `reflective-${index}`; const pin = index + 7;
    addSensor(session, type, id); wireSensor(session, id, `D${pin}`);
    assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
    const projected = session.runtimeProject.circuit.components.find((component) => component.id === id);
    assert.equal(projected.type, 'button.momentary-v1');
    assert.deepEqual(projected.controls, { pressed: false });
    const support = session.runtimeSupport.find((item) => item.componentId === id);
    assert.equal(support.runtimeAdapter, 'button.momentary-v1-active-low-adapter');
    assert.equal(support.runtimeProjection.outputLevel, 'HIGH');
    const highCalls = [];
    new CircuitRuntime(session.runtimeProject.circuit).applyControls({
      setDigitalPin(boardPin, level) { highCalls.push([boardPin, level]); }, setAnalogChannel() {},
    });
    assert.deepEqual(highCalls.find(([boardPin]) => boardPin === pin), [pin, true]);

    const key = DIGITAL_REFLECTIVE_SENSOR_DEFINITIONS[type].controlKeys[0];
    const prepared = candidateContactControl(session, id, key, true);
    assert.deepEqual(prepared.worker, { command: 'control', componentId: id, key: 'pressed', value: true });
    const changed = apply(session, prepared.command);
    assert.equal(changed.changeRelevance, 'runtime');
    assert.deepEqual(session.evaluateModel(type, { active: true }), {
      ok: true, code: 'OK', result: { active: true, digitalLevel: false },
    });
    const lowCalls = [];
    new CircuitRuntime(session.runtimeProject.circuit).applyControls({
      setDigitalPin(boardPin, level) { lowCalls.push([boardPin, level]); }, setAnalogChannel() {},
    });
    assert.deepEqual(lowCalls.find(([boardPin]) => boardPin === pin), [pin, false]);
  }
});

test('reflective control rejection is atomic and Save/Open plus remove/undo/redo preserve exact state', () => {
  const session = openSession();
  addSensor(session, LINE_TRACKING_SENSOR_TYPE, 'line-tracker-1'); wireSensor(session, 'line-tracker-1', 'D8');
  const beforeInvalid = session.saveText();
  assert.equal(candidateContactControl(session, 'line-tracker-1', 'obstacleDetected', true).ok, false);
  const rejected = session.apply({ type: 'component.control.set', revision: session.revision,
    componentId: 'line-tracker-1', key: 'lineDetected', value: 'yes' });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'PROJECT_CONTACT_DIGITAL_REFLECTIVE_SENSOR_STATE');
  assert.equal(session.saveText(), beforeInvalid);

  const prepared = candidateContactControl(session, 'line-tracker-1', 'lineDetected', true);
  apply(session, prepared.command);
  const activeText = session.saveText();
  const reopened = openCandidateUiSession(activeText);
  assert.equal(reopened.ok, true, reopened.code);
  assert.equal(reopened.session.visualProject.circuit.components.find(
    (component) => component.id === 'line-tracker-1',
  ).controls.lineDetected, true);
  assert.deepEqual(reopened.session.runtimeProject.circuit.components.find(
    (component) => component.id === 'line-tracker-1',
  ).controls, { pressed: true });

  apply(session, { type: 'component.remove', componentId: 'line-tracker-1' });
  assert(!JSON.parse(session.saveText()).candidateCircuit.components.some((component) => component.id === 'line-tracker-1'));
  apply(session, { type: 'undo' });
  assert.equal(session.saveText(), activeText);
  apply(session, { type: 'redo' });
  assert(!JSON.parse(session.saveText()).candidateCircuit.components.some((component) => component.id === 'line-tracker-1'));
});
