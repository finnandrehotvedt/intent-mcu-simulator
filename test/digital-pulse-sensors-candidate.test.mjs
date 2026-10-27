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
  DIGITAL_PULSE_SENSOR_DEFINITIONS,
  FLOW_PULSE_SENSOR_TYPE,
  WIND_SPEED_PULSE_SENSOR_TYPE,
  createDigitalPulseSensor,
  digitalPulseLevel,
  validateDigitalPulseSensor,
} from '../expansion-drafts/digital-pulse-sensors-v1.mjs';
import {
  CANDIDATE_UI_COMPONENTS,
  candidateContactControl,
  createCandidateUiComponent,
  openCandidateUiSession,
} from '../src/candidate-existing-ui-adapter.mjs';
import { openPortableEditorSession } from '../src/candidate-project-session.mjs';

const TYPES = [FLOW_PULSE_SENSOR_TYPE, WIND_SPEED_PULSE_SENSOR_TYPE];

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
function addSensor(session, type = FLOW_PULSE_SENSOR_TYPE, id = 'pulse-1') {
  apply(session, { type: 'component.add', component: createDigitalPulseSensor(type, id),
    position: { x: 0.76, y: 0.7, rotation: 0 } });
}
function wireSensor(session, id = 'pulse-1', outputPin = 'D7') {
  apply(session, { type: 'wire.branch', netId: 'net-5v', endpoint: { component: id, pin: 'VCC' },
    junctionId: `junction-${id}-vcc` });
  apply(session, { type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: id, pin: 'GND' },
    junctionId: `junction-${id}-ground` });
  apply(session, { type: 'wire.create', net: { id: `net-${id}-out`, endpoints: [
    { component: id, pin: 'OUT' }, { component: 'board-1', pin: outputPin },
  ] } });
}

test('CMP106/CMP112 are two exact partial manual pulse-level contracts with original artwork', () => {
  assert(!TYPES.some((type) => Object.hasOwn(COMPONENT_CATALOG, type)));
  assert.equal(new Set(TYPES.map((type) => DIGITAL_PULSE_SENSOR_DEFINITIONS[type].modelRef)).size, 2);
  assert.equal(new Set(TYPES.map((type) => DIGITAL_PULSE_SENSOR_DEFINITIONS[type].artwork.renderer)).size, 2);
  for (const [index, type] of TYPES.entries()) {
    const definition = DIGITAL_PULSE_SENSOR_DEFINITIONS[type];
    assert.deepEqual(definition.pins.map(({ id }) => id), ['VCC', 'GND', 'OUT']);
    assert.deepEqual(definition.controlKeys, ['pulseHigh']);
    assert.equal(definition.support.status, 'partial');
    const limitations = definition.support.limitations.join(' ');
    assert.match(limitations, /instantaneous active-high/u);
    assert.match(limitations, /does not generate a pulse train, frequency/u);
    assert.match(limitations, /D2–D12/u);
    assert.match(definition.artwork.provenance, /Original IntentForce SVG/u);
    assert.equal(CANDIDATE_UI_COMPONENTS[type], definition);
    const component = createCandidateUiComponent(type, `pulse-${index}`);
    assert.equal(validateDigitalPulseSensor(component), true);
    component.controls.pulseHigh = true; assert.equal(digitalPulseLevel(component), true);
  }
  assert.match(DIGITAL_PULSE_SENSOR_DEFINITIONS[FLOW_PULSE_SENSOR_TYPE].support.limitations.join(' '),
    /No liquid type, flow rate, litres/u);
  assert.match(DIGITAL_PULSE_SENSOR_DEFINITIONS[WIND_SPEED_PULSE_SENSOR_TYPE].support.limitations.join(' '),
    /No wind speed, metres per second/u);
});

test('missing terminals and a non-digital output pin produce exact blocking diagnostics', () => {
  const session = openSession(); addSensor(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_DIGITAL_PULSE_SENSOR_VCC_DISCONNECTED');
  apply(session, { type: 'wire.branch', netId: 'net-5v', endpoint: { component: 'pulse-1', pin: 'VCC' },
    junctionId: 'junction-pulse-vcc' });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_DIGITAL_PULSE_SENSOR_GND_DISCONNECTED');
  apply(session, { type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: 'pulse-1', pin: 'GND' },
    junctionId: 'junction-pulse-ground' });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_DIGITAL_PULSE_SENSOR_OUT_DISCONNECTED');
  apply(session, { type: 'wire.create', net: { id: 'net-pulse-out', endpoints: [
    { component: 'pulse-1', pin: 'OUT' }, { component: 'board-1', pin: 'A1' },
  ] } });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_DIGITAL_PULSE_SENSOR_OUT_REQUIRES_DIGITAL_INPUT');
  assert.equal(validateContactPersistenceDraft(JSON.parse(session.saveText())).ok, true);
});

test('both sensors project manually authored LOW/HIGH levels onto AVR digital inputs', () => {
  for (const [index, type] of TYPES.entries()) {
    const session = openSession(); const id = `pulse-${index}`; const pin = index + 4;
    addSensor(session, type, id); wireSensor(session, id, `D${pin}`);
    assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
    const projected = session.runtimeProject.circuit.components.find((component) => component.id === id);
    assert.equal(projected.type, 'button.momentary-v1'); assert.deepEqual(projected.controls, { pressed: true });
    const support = session.runtimeSupport.find((item) => item.componentId === id);
    assert.equal(support.runtimeAdapter, 'button.momentary-v1-active-high-inverted-manual-pulse-level-adapter');
    assert.equal(support.runtimeProjection.outputLevel, 'LOW');
    const lowCalls = [];
    new CircuitRuntime(session.runtimeProject.circuit).applyControls({
      setDigitalPin(boardPin, level) { lowCalls.push([boardPin, level]); }, setAnalogChannel() {},
    });
    assert.deepEqual(lowCalls.find(([boardPin]) => boardPin === pin), [pin, false]);
    const prepared = candidateContactControl(session, id, 'pulseHigh', true);
    assert.deepEqual(prepared.worker, { command: 'control', componentId: id, key: 'pressed', value: false });
    assert.equal(apply(session, prepared.command).changeRelevance, 'runtime');
    assert.deepEqual(session.evaluateModel(type, { pulseHigh: true }), {
      ok: true, code: 'OK', result: { pulseHigh: true, digitalLevel: true },
    });
    const highCalls = [];
    new CircuitRuntime(session.runtimeProject.circuit).applyControls({
      setDigitalPin(boardPin, level) { highCalls.push([boardPin, level]); }, setAnalogChannel() {},
    });
    assert.deepEqual(highCalls.find(([boardPin]) => boardPin === pin), [pin, true]);
  }
});

test('invalid control edits are atomic and save/open plus remove/undo/redo preserve pulse state', () => {
  const session = openSession();
  addSensor(session, WIND_SPEED_PULSE_SENSOR_TYPE, 'wind-pulse-1'); wireSensor(session, 'wind-pulse-1', 'D5');
  const beforeInvalid = session.saveText();
  assert.equal(candidateContactControl(session, 'wind-pulse-1', 'frequencyHz', 12).ok, false);
  const rejected = session.apply({ type: 'component.control.set', revision: session.revision,
    componentId: 'wind-pulse-1', key: 'pulseHigh', value: 'yes' });
  assert.equal(rejected.ok, false); assert.equal(rejected.code, 'PROJECT_CONTACT_DIGITAL_PULSE_SENSOR_STATE');
  assert.equal(session.saveText(), beforeInvalid);
  apply(session, candidateContactControl(session, 'wind-pulse-1', 'pulseHigh', true).command);
  const highText = session.saveText(); const reopened = openCandidateUiSession(highText);
  assert.equal(reopened.ok, true, reopened.code);
  assert.equal(reopened.session.visualProject.circuit.components.find(
    (component) => component.id === 'wind-pulse-1').controls.pulseHigh, true);
  assert.deepEqual(reopened.session.runtimeProject.circuit.components.find(
    (component) => component.id === 'wind-pulse-1').controls, { pressed: false });
  apply(session, { type: 'component.remove', componentId: 'wind-pulse-1' });
  assert(!JSON.parse(session.saveText()).candidateCircuit.components.some((component) => component.id === 'wind-pulse-1'));
  apply(session, { type: 'undo' }); assert.equal(session.saveText(), highText);
  apply(session, { type: 'redo' });
  assert(!JSON.parse(session.saveText()).candidateCircuit.components.some((component) => component.id === 'wind-pulse-1'));
});
