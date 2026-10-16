// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { CircuitRuntime } from '../src/circuit-engine.mjs';
import {
  canonicalContactPersistenceDraftJson,
  validateContactPersistenceDraft,
} from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import {
  LIGHT_ANALOGUE_SENSOR_DEFINITION,
  LIGHT_ANALOGUE_SENSOR_TYPE,
  createLightAnalogueSensorComponent,
  validateLightAnalogueSensorDefinition,
} from '../expansion-drafts/light-analogue-sensor-v1.mjs';
import {
  candidateContactControl,
  createCandidateUiComponent,
  openCandidateUiSession,
} from '../src/candidate-existing-ui-adapter.mjs';
import { openPortableEditorSession } from '../src/candidate-project-session.mjs';

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

function addSensor(session, lightLevel = 0.25) {
  apply(session, {
    type: 'component.add',
    component: createLightAnalogueSensorComponent('light-sensor-1', 'Desk light signal', { lightLevel }),
    position: { x: 0.62, y: 0.76 },
  });
}

function wireSensor(session, {
  vccNet = 'net-5v', groundNet = 'net-ground-branch', outputPin = 'A1',
} = {}) {
  apply(session, {
    type: 'wire.branch', netId: vccNet,
    endpoint: { component: 'light-sensor-1', pin: 'VCC' }, junctionId: 'junction-light-vcc',
  });
  apply(session, {
    type: 'wire.branch', netId: groundNet,
    endpoint: { component: 'light-sensor-1', pin: 'GND' }, junctionId: 'junction-light-ground',
  });
  apply(session, {
    type: 'wire.create', net: {
      id: 'net-light-aout',
      endpoints: [
        { component: 'light-sensor-1', pin: 'AOUT' },
        { component: 'board-1', pin: outputPin },
      ],
    },
  });
}

test('light module contract is original, exact and honest about the idealized transfer model', () => {
  assert.equal(validateLightAnalogueSensorDefinition(), true);
  assert.equal(LIGHT_ANALOGUE_SENSOR_DEFINITION.type, LIGHT_ANALOGUE_SENSOR_TYPE);
  assert.deepEqual(LIGHT_ANALOGUE_SENSOR_DEFINITION.pins.map((pin) => pin.id), ['VCC', 'GND', 'AOUT']);
  assert.deepEqual(LIGHT_ANALOGUE_SENSOR_DEFINITION.catalog.supplyVolts, { min: 5, max: 5 });
  assert.equal(LIGHT_ANALOGUE_SENSOR_DEFINITION.pins[2].constraints.voltageMin, 0);
  assert.equal(LIGHT_ANALOGUE_SENSOR_DEFINITION.pins[2].constraints.voltageMax, 5);
  assert.match(LIGHT_ANALOGUE_SENSOR_DEFINITION.support.limitations.join(' '), /No lux calibration/u);
  assert.match(LIGHT_ANALOGUE_SENSOR_DEFINITION.artwork.provenance, /Original IntentForce SVG/u);
  assert.deepEqual(createCandidateUiComponent(LIGHT_ANALOGUE_SENSOR_TYPE, 'light-sensor-2').controls, { lightLevel: 0.5 });
  assert.throws(() => createLightAnalogueSensorComponent('bad-sensor', 'Bad', { lightLevel: 1.01 }), /LIGHT_SENSOR_LEVEL_RANGE/u);
});

test('disconnected pins report one exact blocking diagnostic at each wiring step', () => {
  const session = openSession();
  addSensor(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_LIGHT_SENSOR_VCC_DISCONNECTED');
  apply(session, {
    type: 'wire.branch', netId: 'net-5v',
    endpoint: { component: 'light-sensor-1', pin: 'VCC' }, junctionId: 'junction-light-vcc',
  });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_LIGHT_SENSOR_GND_DISCONNECTED');
  apply(session, {
    type: 'wire.branch', netId: 'net-ground-branch',
    endpoint: { component: 'light-sensor-1', pin: 'GND' }, junctionId: 'junction-light-ground',
  });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_LIGHT_SENSOR_AOUT_DISCONNECTED');
  apply(session, {
    type: 'wire.create', net: {
      id: 'net-light-aout',
      endpoints: [
        { component: 'light-sensor-1', pin: 'AOUT' },
        { component: 'board-1', pin: 'D4' },
      ],
    },
  });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_LIGHT_SENSOR_AOUT_REQUIRES_ANALOGUE');
});

test('wrong supply, wrong ground and branched analogue output remain editable but unrunnable', () => {
  const wrongSupply = openSession();
  addSensor(wrongSupply);
  wireSensor(wrongSupply, { vccNet: 'net-ground-branch' });
  assert.equal(wrongSupply.runnable.code, 'PROJECT_CONTACT_LIGHT_SENSOR_VCC_REQUIRES_5V');
  assert.equal(validateContactPersistenceDraft(JSON.parse(wrongSupply.saveText())).ok, true);

  const wrongGround = openSession();
  addSensor(wrongGround);
  wireSensor(wrongGround, { groundNet: 'net-5v' });
  assert.equal(wrongGround.runnable.code, 'PROJECT_CONTACT_LIGHT_SENSOR_GND_REQUIRED');

  const branched = openSession();
  addSensor(branched);
  wireSensor(branched);
  apply(branched, {
    type: 'wire.branch', netId: 'net-light-aout',
    endpoint: { component: 'board-1', pin: 'A2' }, junctionId: 'junction-light-output',
  });
  assert.equal(branched.runnable.code, 'PROJECT_CONTACT_LIGHT_SENSOR_AOUT_UNSUPPORTED_TOPOLOGY');
});

test('valid sensor projects to AVR ADC, updates at runtime and survives canonical save/open', () => {
  const session = openSession();
  addSensor(session);
  wireSensor(session);
  assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
  const projected = session.runtimeProject.circuit.components.find((component) => component.id === 'light-sensor-1');
  assert.equal(projected.type, 'potentiometer.linear-v1');
  assert.deepEqual(projected.controls, { position: 0.25 });
  assert.equal(session.runtimeSupport.find((item) => item.componentId === 'light-sensor-1').runtimeAdapter, 'potentiometer.linear-v1');

  const adapterCalls = [];
  const runtime = new CircuitRuntime(session.runtimeProject.circuit);
  runtime.applyControls({
    setDigitalPin() {},
    setAnalogChannel(channel, voltage) { adapterCalls.push([channel, voltage]); },
  });
  assert.deepEqual(adapterCalls.find(([channel]) => channel === 1), [1, 1.25]);

  const prepared = candidateContactControl(session, 'light-sensor-1', 'lightLevel', 0.8);
  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.worker, {
    command: 'control', componentId: 'light-sensor-1', key: 'position', value: 0.8,
  });
  const changed = apply(session, prepared.command);
  assert.equal(changed.changeRelevance, 'runtime');
  assert.equal(session.runtimeProject.circuit.components.find(
    (component) => component.id === 'light-sensor-1',
  ).controls.position, 0.8);

  const saved = session.saveText();
  const reopened = openCandidateUiSession(saved);
  assert.equal(reopened.ok, true);
  assert.equal(reopened.session.visualProject.circuit.components.find(
    (component) => component.id === 'light-sensor-1',
  ).controls.lightLevel, 0.8);
  assert.equal(reopened.session.runtimeProject.circuit.components.find(
    (component) => component.id === 'light-sensor-1',
  ).controls.position, 0.8);
});

test('connected sensor delete is canonical and undo restores exact routes and level', () => {
  const session = openSession();
  addSensor(session, 0.37);
  wireSensor(session);
  const before = session.saveText();
  const removed = apply(session, { type: 'component.remove', componentId: 'light-sensor-1' });
  assert.equal(removed.changeRelevance, 'build');
  assert(!JSON.parse(session.saveText()).candidateCircuit.components.some(
    (component) => component.id === 'light-sensor-1',
  ));
  assert(!JSON.parse(session.saveText()).candidateCircuit.nets.some(
    (net) => net.endpoints.some((endpoint) => endpoint.component === 'light-sensor-1'),
  ));
  const undone = apply(session, { type: 'undo' });
  assert.equal(undone.changeRelevance, 'build');
  assert.equal(session.saveText(), before);
  assert.equal(session.visualProject.circuit.components.find(
    (component) => component.id === 'light-sensor-1',
  ).controls.lightLevel, 0.37);
});
