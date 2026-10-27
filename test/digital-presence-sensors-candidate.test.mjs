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
  CAPACITIVE_TOUCH_TYPE,
  DIGITAL_PRESENCE_SENSOR_DEFINITIONS,
  HALL_SWITCH_TYPE,
  PIR_MOTION_TYPE,
  createDigitalPresenceSensor,
  digitalPresenceActive,
  validateDigitalPresenceSensor,
} from '../expansion-drafts/digital-presence-sensors-v1.mjs';
import {
  CANDIDATE_UI_COMPONENTS,
  candidateContactControl,
  createCandidateUiComponent,
  openCandidateUiSession,
} from '../src/candidate-existing-ui-adapter.mjs';
import { openPortableEditorSession } from '../src/candidate-project-session.mjs';

const TYPES = [CAPACITIVE_TOUCH_TYPE, PIR_MOTION_TYPE, HALL_SWITCH_TYPE];

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

function addSensor(session, type = CAPACITIVE_TOUCH_TYPE, id = 'presence-1') {
  apply(session, { type: 'component.add', component: createDigitalPresenceSensor(type, id),
    position: { x: 0.76, y: 0.7, rotation: 0 } });
}

function wireSensor(session, id = 'presence-1', outputPin = 'D7') {
  apply(session, { type: 'wire.branch', netId: 'net-5v', endpoint: { component: id, pin: 'VCC' },
    junctionId: `junction-${id}-vcc` });
  apply(session, { type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: id, pin: 'GND' },
    junctionId: `junction-${id}-ground` });
  apply(session, { type: 'wire.create', net: { id: `net-${id}-out`, endpoints: [
    { component: id, pin: 'OUT' }, { component: 'board-1', pin: outputPin },
  ] } });
}

test('CMP031/CMP121/CMP124 remain three exact active-high contracts with original artwork claims', () => {
  assert(!TYPES.some((type) => Object.hasOwn(COMPONENT_CATALOG, type)));
  assert.equal(new Set(TYPES.map((type) => DIGITAL_PRESENCE_SENSOR_DEFINITIONS[type].modelRef)).size, 3);
  assert.equal(new Set(TYPES.map((type) => DIGITAL_PRESENCE_SENSOR_DEFINITIONS[type].artwork.renderer)).size, 3);
  for (const [index, type] of TYPES.entries()) {
    const definition = DIGITAL_PRESENCE_SENSOR_DEFINITIONS[type];
    assert.deepEqual(definition.pins.map(({ id }) => id), ['VCC', 'GND', 'OUT']);
    assert.equal(definition.support.status, 'simulated');
    assert.match(definition.support.limitations.join(' '), /active-high/u);
    assert.match(definition.support.limitations.join(' '), /D2–D12/u);
    assert.match(definition.artwork.provenance, /Original IntentForce SVG/u);
    assert.equal(CANDIDATE_UI_COMPONENTS[type], definition);
    const component = createCandidateUiComponent(type, `presence-${index}`);
    assert.equal(validateDigitalPresenceSensor(component), true);
    const key = definition.controlKeys[0];
    component.controls[key] = true;
    assert.equal(digitalPresenceActive(component), true);
  }
});

test('each missing terminal and a wrong output pin has one exact blocking diagnostic', () => {
  const session = openSession();
  addSensor(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_DIGITAL_PRESENCE_SENSOR_VCC_DISCONNECTED');
  apply(session, { type: 'wire.branch', netId: 'net-5v', endpoint: { component: 'presence-1', pin: 'VCC' },
    junctionId: 'junction-presence-vcc' });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_DIGITAL_PRESENCE_SENSOR_GND_DISCONNECTED');
  apply(session, { type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: 'presence-1', pin: 'GND' },
    junctionId: 'junction-presence-ground' });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_DIGITAL_PRESENCE_SENSOR_OUT_DISCONNECTED');
  apply(session, { type: 'wire.create', net: { id: 'net-presence-out', endpoints: [
    { component: 'presence-1', pin: 'OUT' }, { component: 'board-1', pin: 'A1' },
  ] } });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_DIGITAL_PRESENCE_SENSOR_OUT_REQUIRES_DIGITAL_INPUT');
  assert.equal(validateContactPersistenceDraft(JSON.parse(session.saveText())).ok, true);
});

test('all three sensors project independent active-high states onto executable AVR digital inputs', () => {
  for (const [index, type] of TYPES.entries()) {
    const session = openSession(); const id = `presence-${index}`;
    addSensor(session, type, id); wireSensor(session, id, `D${index + 4}`);
    assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
    const projected = session.runtimeProject.circuit.components.find((component) => component.id === id);
    assert.equal(projected.type, 'button.momentary-v1');
    assert.deepEqual(projected.controls, { pressed: true });
    const support = session.runtimeSupport.find((item) => item.componentId === id);
    assert.equal(support.runtimeAdapter, 'button.momentary-v1-active-high-inverted-adapter');
    assert.equal(support.runtimeProjection.outputLevel, 'LOW');
    const lowCalls = [];
    new CircuitRuntime(session.runtimeProject.circuit).applyControls({
      setDigitalPin(pin, level) { lowCalls.push([pin, level]); }, setAnalogChannel() {},
    });
    assert.deepEqual(lowCalls.find(([pin]) => pin === index + 4), [index + 4, false]);

    const key = DIGITAL_PRESENCE_SENSOR_DEFINITIONS[type].controlKeys[0];
    const prepared = candidateContactControl(session, id, key, true);
    assert.deepEqual(prepared.worker, { command: 'control', componentId: id, key: 'pressed', value: false });
    const changed = apply(session, prepared.command);
    assert.equal(changed.changeRelevance, 'runtime');
    assert.deepEqual(session.evaluateModel(type, { active: true }), {
      ok: true, code: 'OK', result: { active: true, digitalLevel: true },
    });
    const highCalls = [];
    new CircuitRuntime(session.runtimeProject.circuit).applyControls({
      setDigitalPin(pin, level) { highCalls.push([pin, level]); }, setAnalogChannel() {},
    });
    assert.deepEqual(highCalls.find(([pin]) => pin === index + 4), [index + 4, true]);
  }
});

test('control rejection is atomic and save/open plus remove/undo/redo preserve exact state', () => {
  const session = openSession();
  addSensor(session, PIR_MOTION_TYPE, 'pir-motion-1'); wireSensor(session, 'pir-motion-1', 'D5');
  const beforeInvalid = session.saveText();
  assert.equal(candidateContactControl(session, 'pir-motion-1', 'touched', true).ok, false);
  const rejected = session.apply({ type: 'component.control.set', revision: session.revision,
    componentId: 'pir-motion-1', key: 'motionDetected', value: 'yes' });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'PROJECT_CONTACT_DIGITAL_PRESENCE_SENSOR_STATE');
  assert.equal(session.saveText(), beforeInvalid);

  const prepared = candidateContactControl(session, 'pir-motion-1', 'motionDetected', true);
  apply(session, prepared.command);
  const activeText = session.saveText();
  const reopened = openCandidateUiSession(activeText);
  assert.equal(reopened.ok, true, reopened.code);
  assert.equal(reopened.session.visualProject.circuit.components.find(
    (component) => component.id === 'pir-motion-1',
  ).controls.motionDetected, true);
  assert.deepEqual(reopened.session.runtimeProject.circuit.components.find(
    (component) => component.id === 'pir-motion-1',
  ).controls, { pressed: false });

  apply(session, { type: 'component.remove', componentId: 'pir-motion-1' });
  assert(!JSON.parse(session.saveText()).candidateCircuit.components.some((component) => component.id === 'pir-motion-1'));
  apply(session, { type: 'undo' });
  assert.equal(session.saveText(), activeText);
  apply(session, { type: 'redo' });
  assert(!JSON.parse(session.saveText()).candidateCircuit.components.some((component) => component.id === 'pir-motion-1'));
});
