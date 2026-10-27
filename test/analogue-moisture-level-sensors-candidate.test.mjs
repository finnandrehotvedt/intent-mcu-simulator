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
  ANALOGUE_MOISTURE_LEVEL_DEFINITIONS,
  ANALOGUE_WATER_LEVEL_TYPE,
  CAPACITIVE_SOIL_MOISTURE_TYPE,
  RESISTIVE_SOIL_MOISTURE_TYPE,
  analogueMoistureLevelRatio,
  createAnalogueMoistureLevelSensor,
  validateAnalogueMoistureLevelSensor,
} from '../expansion-drafts/analogue-moisture-level-sensors-v1.mjs';
import {
  CANDIDATE_UI_COMPONENTS, candidateContactControl, createCandidateUiComponent,
  openCandidateUiSession,
} from '../src/candidate-existing-ui-adapter.mjs';
import { openPortableEditorSession } from '../src/candidate-project-session.mjs';

const TYPES = [RESISTIVE_SOIL_MOISTURE_TYPE, CAPACITIVE_SOIL_MOISTURE_TYPE,
  ANALOGUE_WATER_LEVEL_TYPE];

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
function addSensor(session, type = RESISTIVE_SOIL_MOISTURE_TYPE, id = 'environment-1') {
  apply(session, { type: 'component.add', component: createAnalogueMoistureLevelSensor(type, id),
    position: { x: 0.76, y: 0.58, rotation: 0 } });
}
function wireSensor(session, id = 'environment-1', outputPin = 'A2') {
  apply(session, { type: 'wire.branch', netId: 'net-5v', endpoint: { component: id, pin: 'VCC' },
    junctionId: `junction-${id}-vcc` });
  apply(session, { type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: id, pin: 'GND' },
    junctionId: `junction-${id}-ground` });
  apply(session, { type: 'wire.create', net: { id: `net-${id}-aout`, endpoints: [
    { component: id, pin: 'AOUT' }, { component: 'board-1', pin: outputPin },
  ] } });
}

test('CMP101/CMP102/CMP104 are three exact original ideal analogue contracts', () => {
  assert(!TYPES.some((type) => Object.hasOwn(COMPONENT_CATALOG, type)));
  assert.equal(new Set(TYPES.map((type) => ANALOGUE_MOISTURE_LEVEL_DEFINITIONS[type].modelRef)).size, 3);
  assert.equal(new Set(TYPES.map((type) => ANALOGUE_MOISTURE_LEVEL_DEFINITIONS[type].artwork.renderer)).size, 3);
  for (const [index, type] of TYPES.entries()) {
    const definition = ANALOGUE_MOISTURE_LEVEL_DEFINITIONS[type];
    assert.deepEqual(definition.pins.map(({ id }) => id), ['VCC', 'GND', 'AOUT']);
    assert.equal(definition.support.status, 'simulated');
    assert.match(definition.support.limitations.join(' '), /linearly to 0–5 V/u);
    assert.match(definition.support.limitations.join(' '), /A0–A5/u);
    assert.match(definition.artwork.provenance, /Original IntentForce SVG/u);
    assert.equal(CANDIDATE_UI_COMPONENTS[type], definition);
    const component = createCandidateUiComponent(type, `environment-${index}`);
    assert.equal(validateAnalogueMoistureLevelSensor(component), true);
    assert.equal(analogueMoistureLevelRatio(component), 0.5);
  }
});

test('missing environment-module terminals and a digital output target fail exactly', () => {
  const session = openSession(); addSensor(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_ANALOGUE_MOISTURE_LEVEL_SENSOR_VCC_DISCONNECTED');
  apply(session, { type: 'wire.branch', netId: 'net-5v', endpoint: { component: 'environment-1', pin: 'VCC' },
    junctionId: 'junction-environment-vcc' });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_ANALOGUE_MOISTURE_LEVEL_SENSOR_GND_DISCONNECTED');
  apply(session, { type: 'wire.branch', netId: 'net-ground-branch', endpoint: { component: 'environment-1', pin: 'GND' },
    junctionId: 'junction-environment-ground' });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_ANALOGUE_MOISTURE_LEVEL_SENSOR_AOUT_DISCONNECTED');
  apply(session, { type: 'wire.create', net: { id: 'net-environment-aout', endpoints: [
    { component: 'environment-1', pin: 'AOUT' }, { component: 'board-1', pin: 'D7' },
  ] } });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_ANALOGUE_MOISTURE_LEVEL_SENSOR_AOUT_REQUIRES_ANALOGUE');
  assert.equal(validateContactPersistenceDraft(JSON.parse(session.saveText())).ok, true);
});

test('all three modules project independent ratios through the executable AVR ADC adapter', () => {
  for (const [index, type] of TYPES.entries()) {
    const session = openSession(); const id = `environment-${index}`; const channel = index + 2;
    addSensor(session, type, id); wireSensor(session, id, `A${channel}`);
    assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
    const projected = session.runtimeProject.circuit.components.find((component) => component.id === id);
    assert.equal(projected.type, 'potentiometer.linear-v1');
    assert.deepEqual(projected.controls, { position: 0.5 });
    const support = session.runtimeSupport.find((item) => item.componentId === id);
    assert.equal(support.runtimeAdapter, 'potentiometer.linear-v1-ideal-analogue-sensor-adapter');
    assert.equal(support.runtimeProjection.voltage, 2.5);

    const calls = [];
    new CircuitRuntime(session.runtimeProject.circuit).applyControls({ setDigitalPin() {},
      setAnalogChannel(adcChannel, voltage) { calls.push([adcChannel, voltage]); } });
    assert.deepEqual(calls.find(([adcChannel]) => adcChannel === channel), [channel, 2.5]);
    const key = ANALOGUE_MOISTURE_LEVEL_DEFINITIONS[type].controlKeys[0];
    const prepared = candidateContactControl(session, id, key, 0.8);
    assert.deepEqual(prepared.worker, { command: 'control', componentId: id, key: 'position', value: 0.8 });
    assert.equal(apply(session, prepared.command).changeRelevance, 'runtime');
    assert.deepEqual(session.evaluateModel(type, { ratio: 0.8 }), {
      ok: true, code: 'OK', result: { ratio: 0.8, outputVolts: 4 },
    });
    assert.equal(session.runtimeProject.circuit.components.find(
      (component) => component.id === id,
    ).controls.position, 0.8);
  }
});

test('analogue control rejection is atomic and Save/Open plus remove/undo/redo preserve state', () => {
  const session = openSession();
  addSensor(session, ANALOGUE_WATER_LEVEL_TYPE, 'water-level-1'); wireSensor(session, 'water-level-1', 'A4');
  const beforeInvalid = session.saveText();
  assert.equal(candidateContactControl(session, 'water-level-1', 'moistureRatio', 0.9).ok, false);
  const rejected = session.apply({ type: 'component.control.set', revision: session.revision,
    componentId: 'water-level-1', key: 'waterLevelRatio', value: 1.1 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'PROJECT_CONTACT_ANALOGUE_MOISTURE_LEVEL_SENSOR_STATE');
  assert.equal(session.saveText(), beforeInvalid);
  apply(session, candidateContactControl(session, 'water-level-1', 'waterLevelRatio', 0.75).command);
  const activeText = session.saveText();
  const reopened = openCandidateUiSession(activeText); assert.equal(reopened.ok, true, reopened.code);
  assert.equal(reopened.session.visualProject.circuit.components.find(
    (component) => component.id === 'water-level-1',
  ).controls.waterLevelRatio, 0.75);
  assert.equal(reopened.session.runtimeProject.circuit.components.find(
    (component) => component.id === 'water-level-1',
  ).controls.position, 0.75);
  apply(session, { type: 'component.remove', componentId: 'water-level-1' });
  apply(session, { type: 'undo' }); assert.equal(session.saveText(), activeText);
  apply(session, { type: 'redo' });
  assert(!JSON.parse(session.saveText()).candidateCircuit.components.some(
    (component) => component.id === 'water-level-1'));
});

