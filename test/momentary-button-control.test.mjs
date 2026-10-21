// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createThermostatExperiment,
  openThermostatExperiment,
} from '../src/thermostat-experiment.mjs';

const BUTTON_ID = 'enable-button-1';

function buttonState(project) {
  return project.circuit.components.find((component) => component.id === BUTTON_ID).controls.pressed;
}

function canonicalButtonStates(session) {
  const saved = JSON.parse(session.saveText());
  return {
    candidate: saved.candidateCircuit.components.find(
      (component) => component.id === BUTTON_ID,
    ).controls.pressed,
    base: saved.project.circuit.components.find(
      (component) => component.id === BUTTON_ID,
    ).controls.pressed,
  };
}

function openSession() {
  const opened = openThermostatExperiment(createThermostatExperiment().text);
  assert.equal(opened.ok, true, `${opened.code} ${JSON.stringify(opened.details ?? [])}`);
  return opened.session;
}

test('momentary button press and release update candidate, base projection, and runtime atomically', () => {
  const session = openSession();
  const pressed = session.apply({
    type: 'component.control.set',
    revision: 0,
    componentId: BUTTON_ID,
    key: 'pressed',
    value: true,
  });
  assert.equal(pressed.ok, true);
  assert.equal(pressed.revision, 1);
  assert.equal(pressed.runtimeDirty, true);
  assert.equal(pressed.changeRelevance, 'runtime');
  assert.equal(buttonState(session.project), true);
  assert.equal(buttonState(session.runtimeProject), true);
  assert.deepEqual(canonicalButtonStates(session), { candidate: true, base: true });

  const reopened = openThermostatExperiment(session.saveText());
  assert.equal(reopened.ok, true, `${reopened.code} ${JSON.stringify(reopened.details ?? [])}`);
  assert.deepEqual(canonicalButtonStates(reopened.session), { candidate: true, base: true });

  const released = session.apply({
    type: 'component.control.set',
    revision: 1,
    componentId: BUTTON_ID,
    key: 'pressed',
    value: false,
  });
  assert.equal(released.ok, true);
  assert.equal(released.revision, 2);
  assert.equal(buttonState(session.runtimeProject), false);
  assert.deepEqual(canonicalButtonStates(session), { candidate: false, base: false });
});

test('momentary button rejects invalid values and stale revisions without partial mutation', () => {
  const session = openSession();
  const initial = session.saveText();
  const invalid = session.apply({
    type: 'component.control.set',
    revision: 0,
    componentId: BUTTON_ID,
    key: 'pressed',
    value: 'true',
  });
  assert.deepEqual(invalid, {
    ok: false,
    code: 'PROJECT_CONTACT_BUTTON_STATE',
    revision: 0,
    details: [],
  });
  assert.equal(session.saveText(), initial);

  const pressed = session.apply({
    type: 'component.control.set',
    revision: 0,
    componentId: BUTTON_ID,
    key: 'pressed',
    value: true,
  });
  assert.equal(pressed.ok, true);
  const accepted = session.saveText();
  const stale = session.apply({
    type: 'component.control.set',
    revision: 0,
    componentId: BUTTON_ID,
    key: 'pressed',
    value: false,
  });
  assert.deepEqual(stale, {
    ok: false,
    code: 'EDITOR_STALE_REVISION',
    revision: 1,
    details: [],
  });
  assert.equal(session.saveText(), accepted);
  assert.deepEqual(canonicalButtonStates(session), { candidate: true, base: true });
});
