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
  LIGHT_ANALOGUE_SENSOR_TYPE,
  createLightAnalogueSensorComponent,
} from '../expansion-drafts/light-analogue-sensor-v1.mjs';
import {
  TEMPERATURE_ANALOGUE_SENSOR_DEFINITION,
  TEMPERATURE_ANALOGUE_SENSOR_TYPE,
  createTemperatureAnalogueSensorComponent,
  temperatureCToVoltage,
  validateTemperatureAnalogueSensorDefinition,
  voltageToTemperatureC,
} from '../expansion-drafts/temperature-analogue-sensor-v1.mjs';
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

function addTemperatureModule(session, temperatureC = 25) {
  apply(session, {
    type: 'component.add',
    component: createTemperatureAnalogueSensorComponent(
      'temperature-sensor-1', 'Room temperature signal', { temperatureC },
    ),
    position: { x: 0.78, y: 0.76 },
  });
}

function wireTemperatureModule(session, {
  vccNet = 'net-5v', groundNet = 'net-ground-branch', outputPin = 'A1',
} = {}) {
  apply(session, {
    type: 'wire.branch', netId: vccNet,
    endpoint: { component: 'temperature-sensor-1', pin: 'VCC' },
    junctionId: 'junction-temperature-vcc',
  });
  apply(session, {
    type: 'wire.branch', netId: groundNet,
    endpoint: { component: 'temperature-sensor-1', pin: 'GND' },
    junctionId: 'junction-temperature-ground',
  });
  apply(session, {
    type: 'wire.create', net: {
      id: 'net-temperature-aout',
      endpoints: [
        { component: 'temperature-sensor-1', pin: 'AOUT' },
        { component: 'board-1', pin: outputPin },
      ],
    },
  });
}

test('generic temperature module contract and transfer boundaries are exact and honest', () => {
  assert.equal(validateTemperatureAnalogueSensorDefinition(), true);
  assert.equal(TEMPERATURE_ANALOGUE_SENSOR_DEFINITION.type, TEMPERATURE_ANALOGUE_SENSOR_TYPE);
  assert.deepEqual(TEMPERATURE_ANALOGUE_SENSOR_DEFINITION.pins.map((pin) => pin.id), ['VCC', 'GND', 'AOUT']);
  assert.deepEqual(TEMPERATURE_ANALOGUE_SENSOR_DEFINITION.catalog.supplyVolts, { min: 5, max: 5 });
  assert.match(TEMPERATURE_ANALOGUE_SENSOR_DEFINITION.displayName, /^Analogue temperature module$/u);
  assert.doesNotMatch(JSON.stringify(TEMPERATURE_ANALOGUE_SENSOR_DEFINITION), /LM35|TMP36|MCP9700/u);
  assert.match(TEMPERATURE_ANALOGUE_SENSOR_DEFINITION.support.limitations.join(' '), /No physical-sensor accuracy/u);
  assert.match(TEMPERATURE_ANALOGUE_SENSOR_DEFINITION.artwork.provenance, /Original IntentForce SVG/u);

  assert.equal(temperatureCToVoltage(-50), 0);
  assert.equal(temperatureCToVoltage(25), 1.875);
  assert.equal(temperatureCToVoltage(100), 3.75);
  assert.equal(temperatureCToVoltage(150), 5);
  assert.equal(voltageToTemperatureC(0), -50);
  assert.equal(voltageToTemperatureC(1.875), 25);
  assert.equal(voltageToTemperatureC(3.75), 100);
  assert.equal(voltageToTemperatureC(5), 150);
  assert.throws(() => temperatureCToVoltage(-50.01), /TEMPERATURE_SENSOR_RANGE/u);
  assert.throws(() => temperatureCToVoltage(150.01), /TEMPERATURE_SENSOR_RANGE/u);
  assert.throws(() => voltageToTemperatureC(-0.01), /TEMPERATURE_SENSOR_VOLTAGE_RANGE/u);
  assert.throws(() => voltageToTemperatureC(5.01), /TEMPERATURE_SENSOR_VOLTAGE_RANGE/u);
  assert.deepEqual(
    createCandidateUiComponent(TEMPERATURE_ANALOGUE_SENSOR_TYPE, 'temperature-sensor-2').controls,
    { temperatureC: 25 },
  );
});

test('disconnected temperature-module terminals report one exact diagnostic at each wiring step', () => {
  const session = openSession();
  addTemperatureModule(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_TEMPERATURE_SENSOR_VCC_DISCONNECTED');
  apply(session, {
    type: 'wire.branch', netId: 'net-5v',
    endpoint: { component: 'temperature-sensor-1', pin: 'VCC' },
    junctionId: 'junction-temperature-vcc',
  });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_TEMPERATURE_SENSOR_GND_DISCONNECTED');
  apply(session, {
    type: 'wire.branch', netId: 'net-ground-branch',
    endpoint: { component: 'temperature-sensor-1', pin: 'GND' },
    junctionId: 'junction-temperature-ground',
  });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_TEMPERATURE_SENSOR_AOUT_DISCONNECTED');
  apply(session, {
    type: 'wire.create', net: {
      id: 'net-temperature-aout',
      endpoints: [
        { component: 'temperature-sensor-1', pin: 'AOUT' },
        { component: 'board-1', pin: 'D4' },
      ],
    },
  });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_TEMPERATURE_SENSOR_AOUT_REQUIRES_ANALOGUE');
});

test('wrong supply, wrong ground and branched output stay editable but unrunnable', () => {
  const wrongSupply = openSession();
  addTemperatureModule(wrongSupply);
  wireTemperatureModule(wrongSupply, { vccNet: 'net-ground-branch' });
  assert.equal(wrongSupply.runnable.code, 'PROJECT_CONTACT_TEMPERATURE_SENSOR_VCC_REQUIRES_5V');
  assert.equal(validateContactPersistenceDraft(JSON.parse(wrongSupply.saveText())).ok, true);

  const wrongGround = openSession();
  addTemperatureModule(wrongGround);
  wireTemperatureModule(wrongGround, { groundNet: 'net-5v' });
  assert.equal(wrongGround.runnable.code, 'PROJECT_CONTACT_TEMPERATURE_SENSOR_GND_REQUIRED');

  const branched = openSession();
  addTemperatureModule(branched);
  wireTemperatureModule(branched);
  apply(branched, {
    type: 'wire.branch', netId: 'net-temperature-aout',
    endpoint: { component: 'board-1', pin: 'A2' },
    junctionId: 'junction-temperature-output',
  });
  assert.equal(branched.runnable.code, 'PROJECT_CONTACT_TEMPERATURE_SENSOR_AOUT_UNSUPPORTED_TOPOLOGY');
});

test('valid temperature module projects through the existing AVR ADC adapter and persists', () => {
  const session = openSession();
  addTemperatureModule(session);
  wireTemperatureModule(session);
  assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
  const projected = session.runtimeProject.circuit.components.find(
    (component) => component.id === 'temperature-sensor-1',
  );
  assert.equal(projected.type, 'potentiometer.linear-v1');
  assert.deepEqual(projected.controls, { position: 0.375 });
  const support = session.runtimeSupport.find((item) => item.componentId === 'temperature-sensor-1');
  assert.equal(support.runtimeAdapter, 'potentiometer.linear-v1');
  assert.match(support.limitation, /-50 to 150 °C/u);

  const adapterCalls = [];
  const runtime = new CircuitRuntime(session.runtimeProject.circuit);
  runtime.applyControls({
    setDigitalPin() {},
    setAnalogChannel(channel, voltage) { adapterCalls.push([channel, voltage]); },
  });
  assert.deepEqual(adapterCalls.find(([channel]) => channel === 1), [1, 1.875]);

  const prepared = candidateContactControl(session, 'temperature-sensor-1', 'temperatureC', 100);
  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.worker, {
    command: 'control', componentId: 'temperature-sensor-1', key: 'position', value: 0.75,
  });
  const changed = apply(session, prepared.command);
  assert.equal(changed.changeRelevance, 'runtime');
  assert.equal(session.runtimeProject.circuit.components.find(
    (component) => component.id === 'temperature-sensor-1',
  ).controls.position, 0.75);
  assert.equal(candidateContactControl(session, 'temperature-sensor-1', 'temperatureC', -51).ok, false);
  assert.equal(candidateContactControl(session, 'temperature-sensor-1', 'temperatureC', 151).ok, false);

  const reopened = openCandidateUiSession(session.saveText());
  assert.equal(reopened.ok, true);
  assert.equal(reopened.session.visualProject.circuit.components.find(
    (component) => component.id === 'temperature-sensor-1',
  ).controls.temperatureC, 100);
  assert.equal(reopened.session.runtimeProject.circuit.components.find(
    (component) => component.id === 'temperature-sensor-1',
  ).controls.position, 0.75);
});

test('light and temperature modules coexist without changing the established light projection', () => {
  const session = openSession();
  apply(session, {
    type: 'component.add',
    component: createLightAnalogueSensorComponent('light-sensor-1', 'Desk light signal', { lightLevel: 0.2 }),
    position: { x: 0.58, y: 0.76 },
  });
  for (const [pin, netId, junctionId] of [
    ['VCC', 'net-5v', 'junction-light-vcc'],
    ['GND', 'net-ground-branch', 'junction-light-ground'],
  ]) apply(session, {
    type: 'wire.branch', netId,
    endpoint: { component: 'light-sensor-1', pin }, junctionId,
  });
  apply(session, {
    type: 'wire.create',
    net: {
      id: 'net-light-aout',
      endpoints: [
        { component: 'light-sensor-1', pin: 'AOUT' },
        { component: 'board-1', pin: 'A1' },
      ],
    },
  });
  addTemperatureModule(session, 100);
  wireTemperatureModule(session, { outputPin: 'A2' });
  assert.equal(session.runnable.ok, true);
  const light = session.runtimeProject.circuit.components.find((item) => item.id === 'light-sensor-1');
  const temperature = session.runtimeProject.circuit.components.find((item) => item.id === 'temperature-sensor-1');
  assert.deepEqual(light.controls, { position: 0.2 });
  assert.deepEqual(temperature.controls, { position: 0.75 });
  assert.equal(session.runtimeSupport.find((item) => item.type === LIGHT_ANALOGUE_SENSOR_TYPE).runtimeAdapter,
    'potentiometer.linear-v1');
});

test('connected temperature-module delete is canonical and undo restores exact state', () => {
  const session = openSession();
  addTemperatureModule(session, 37);
  wireTemperatureModule(session);
  const before = session.saveText();
  const removed = apply(session, { type: 'component.remove', componentId: 'temperature-sensor-1' });
  assert.equal(removed.changeRelevance, 'build');
  assert(!JSON.parse(session.saveText()).candidateCircuit.components.some(
    (component) => component.id === 'temperature-sensor-1',
  ));
  assert(!JSON.parse(session.saveText()).candidateCircuit.nets.some(
    (net) => net.endpoints.some((endpoint) => endpoint.component === 'temperature-sensor-1'),
  ));
  const undone = apply(session, { type: 'undo' });
  assert.equal(undone.changeRelevance, 'build');
  assert.equal(session.saveText(), before);
  assert.equal(session.visualProject.circuit.components.find(
    (component) => component.id === 'temperature-sensor-1',
  ).controls.temperatureC, 37);
});
