// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { COMPONENT_CATALOG } from '../src/component-catalog.mjs';
import { CircuitRuntime } from '../src/circuit-engine.mjs';
import {
  canonicalContactPersistenceDraftJson,
  validateContactPersistenceDraft,
} from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import {
  DIGITAL_LIGHT_THRESHOLD_DEFINITION,
  DIGITAL_LIGHT_THRESHOLD_TYPE,
  createDigitalLightThresholdComponent,
  nextDigitalLightThresholdActive,
  updateDigitalLightThresholdControl,
  validateDigitalLightThresholdDefinition,
} from '../expansion-drafts/digital-light-threshold-module-v1.mjs';
import {
  CANDIDATE_UI_COMPONENTS,
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

function addModule(session, controls = {}) {
  apply(session, {
    type: 'component.add',
    component: createDigitalLightThresholdComponent(
      'light-threshold-1', 'Workshop light threshold', controls,
    ),
    position: { x: 0.78, y: 0.72 },
  });
}

function wireModule(session, {
  vccNet = 'net-5v', groundNet = 'net-ground-branch', outputPin = 'D7',
} = {}) {
  apply(session, {
    type: 'wire.branch', netId: vccNet,
    endpoint: { component: 'light-threshold-1', pin: 'VCC' },
    junctionId: 'junction-threshold-vcc',
  });
  apply(session, {
    type: 'wire.branch', netId: groundNet,
    endpoint: { component: 'light-threshold-1', pin: 'GND' },
    junctionId: 'junction-threshold-ground',
  });
  apply(session, {
    type: 'wire.create', net: {
      id: 'net-threshold-dout',
      endpoints: [
        { component: 'light-threshold-1', pin: 'DOUT' },
        { component: 'board-1', pin: outputPin },
      ],
    },
  });
}

test('digital light threshold is a distinct generic contract with exact active-low hysteresis boundaries', () => {
  assert.equal(validateDigitalLightThresholdDefinition(), true);
  assert.equal(DIGITAL_LIGHT_THRESHOLD_DEFINITION.type, DIGITAL_LIGHT_THRESHOLD_TYPE);
  assert.deepEqual(DIGITAL_LIGHT_THRESHOLD_DEFINITION.pins.map((pin) => pin.id), ['VCC', 'GND', 'DOUT']);
  assert.deepEqual(DIGITAL_LIGHT_THRESHOLD_DEFINITION.catalog.supplyVolts, { min: 5, max: 5 });
  assert.match(DIGITAL_LIGHT_THRESHOLD_DEFINITION.support.limitations.join(' '), /active LOW/u);
  assert.match(DIGITAL_LIGHT_THRESHOLD_DEFINITION.support.limitations.join(' '), /percentage points/u);
  assert.match(DIGITAL_LIGHT_THRESHOLD_DEFINITION.support.limitations.join(' '), /No lux calibration/u);
  assert.match(DIGITAL_LIGHT_THRESHOLD_DEFINITION.artwork.provenance, /Original IntentForce SVG/u);
  assert(!Object.hasOwn(COMPONENT_CATALOG, DIGITAL_LIGHT_THRESHOLD_TYPE));
  assert.equal(Object.values(COMPONENT_CATALOG).filter((definition) => definition.selectable).length, 5);
  assert.equal(Object.values(CANDIDATE_UI_COMPONENTS).filter((definition) => definition.selectable).length, 54);

  const contract = {
    thresholdPercent: 50,
    hysteresisPercentagePoints: 5,
  };
  assert.equal(nextDigitalLightThresholdActive({ ...contract, currentActive: false, lightLevelPercent: 49 }), false);
  assert.equal(nextDigitalLightThresholdActive({ ...contract, currentActive: false, lightLevelPercent: 50 }), true);
  assert.equal(nextDigitalLightThresholdActive({ ...contract, currentActive: true, lightLevelPercent: 49 }), true);
  assert.equal(nextDigitalLightThresholdActive({ ...contract, currentActive: true, lightLevelPercent: 46 }), true);
  assert.equal(nextDigitalLightThresholdActive({ ...contract, currentActive: true, lightLevelPercent: 45 }), false);
  assert.equal(nextDigitalLightThresholdActive({ ...contract, currentActive: false, lightLevelPercent: 46 }), false);

  const defaultComponent = createCandidateUiComponent(DIGITAL_LIGHT_THRESHOLD_TYPE, 'light-threshold-2');
  assert.deepEqual(defaultComponent.controls, {
    lightLevelPercent: 40,
    thresholdPercent: 50,
    hysteresisPercentagePoints: 5,
    outputActive: false,
  });
  assert.throws(() => createDigitalLightThresholdComponent('bad', 'Bad', { thresholdPercent: 9 }),
    /DIGITAL_LIGHT_THRESHOLD_RANGE/u);
  assert.throws(() => updateDigitalLightThresholdControl(defaultComponent, 'outputActive', true),
    /DIGITAL_LIGHT_THRESHOLD_CONTROL/u);
});

test('disconnected terminals report one exact blocking diagnostic at each wiring step', () => {
  const session = openSession();
  addModule(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_DIGITAL_LIGHT_THRESHOLD_VCC_DISCONNECTED');
  apply(session, {
    type: 'wire.branch', netId: 'net-5v',
    endpoint: { component: 'light-threshold-1', pin: 'VCC' },
    junctionId: 'junction-threshold-vcc',
  });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_DIGITAL_LIGHT_THRESHOLD_GND_DISCONNECTED');
  apply(session, {
    type: 'wire.branch', netId: 'net-ground-branch',
    endpoint: { component: 'light-threshold-1', pin: 'GND' },
    junctionId: 'junction-threshold-ground',
  });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_DIGITAL_LIGHT_THRESHOLD_DOUT_DISCONNECTED');
  apply(session, {
    type: 'wire.create', net: {
      id: 'net-threshold-dout',
      endpoints: [
        { component: 'light-threshold-1', pin: 'DOUT' },
        { component: 'board-1', pin: 'A1' },
      ],
    },
  });
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_DIGITAL_LIGHT_THRESHOLD_DOUT_REQUIRES_DIGITAL_INPUT');
});

test('wrong power, unsupported digital pins and branched DOUT stay editable but unrunnable', () => {
  const shorted = openSession();
  addModule(shorted);
  const beforeShort = shorted.saveText();
  const shortResult = shorted.apply({
    type: 'wire.branch', revision: shorted.revision, netId: 'net-5v',
    endpoint: { component: 'board-1', pin: 'GND2' }, junctionId: 'junction-direct-short',
  });
  assert.equal(shortResult.ok, false);
  assert.equal(shortResult.code, 'PROJECT_CONTACT_POWER_SHORT');
  assert.equal(shorted.saveText(), beforeShort);

  const wrongSupply = openSession();
  addModule(wrongSupply);
  wireModule(wrongSupply, { vccNet: 'net-ground-branch' });
  assert.equal(wrongSupply.runnable.code, 'PROJECT_CONTACT_DIGITAL_LIGHT_THRESHOLD_VCC_REQUIRES_5V');
  assert.equal(validateContactPersistenceDraft(JSON.parse(wrongSupply.saveText())).ok, true);

  const wrongGround = openSession();
  addModule(wrongGround);
  wireModule(wrongGround, { groundNet: 'net-5v' });
  assert.equal(wrongGround.runnable.code, 'PROJECT_CONTACT_DIGITAL_LIGHT_THRESHOLD_GND_REQUIRED');

  for (const pin of ['D0', 'D1']) {
    const unsupported = openSession();
    addModule(unsupported);
    wireModule(unsupported, { outputPin: pin });
    assert.equal(unsupported.runnable.code,
      'PROJECT_CONTACT_DIGITAL_LIGHT_THRESHOLD_DOUT_REQUIRES_DIGITAL_INPUT');
  }

  const branched = openSession();
  addModule(branched);
  wireModule(branched);
  apply(branched, {
    type: 'wire.branch', netId: 'net-threshold-dout',
    endpoint: { component: 'board-1', pin: 'D8' },
    junctionId: 'junction-threshold-output',
  });
  assert.equal(branched.runnable.code,
    'PROJECT_CONTACT_DIGITAL_LIGHT_THRESHOLD_DOUT_UNSUPPORTED_TOPOLOGY');
});

test('accepted module projects onto the established active-low digital-input path', () => {
  const session = openSession();
  addModule(session);
  wireModule(session);
  assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
  const projected = session.runtimeProject.circuit.components.find(
    (component) => component.id === 'light-threshold-1',
  );
  assert.equal(projected.type, 'button.momentary-v1');
  assert.deepEqual(projected.controls, { pressed: false });
  assert.equal(session.runtimeSupport.find(
    (item) => item.componentId === 'light-threshold-1',
  ).runtimeAdapter, 'button.momentary-v1');

  const digitalCalls = [];
  const runtime = new CircuitRuntime(session.runtimeProject.circuit);
  runtime.applyControls({
    setDigitalPin(pin, level) { digitalCalls.push([pin, level]); },
    setAnalogChannel() {},
  });
  assert.deepEqual(digitalCalls.find(([pin]) => pin === 7), [7, true]);
});

test('control updates cross exact boundaries once and retain state throughout the hysteresis band', () => {
  const session = openSession();
  addModule(session);
  wireModule(session);
  const sequence = [50, 49, 46, 45, 46, 49, 50];
  const expectedActive = [true, true, true, false, false, false, true];
  for (const [index, lightLevelPercent] of sequence.entries()) {
    const prepared = candidateContactControl(
      session, 'light-threshold-1', 'lightLevelPercent', lightLevelPercent,
    );
    assert.equal(prepared.ok, true);
    assert.deepEqual(prepared.worker, {
      command: 'control', componentId: 'light-threshold-1', key: 'pressed',
      value: expectedActive[index],
    });
    const changed = apply(session, prepared.command);
    assert.equal(changed.changeRelevance, 'runtime');
    const controls = session.visualProject.circuit.components.find(
      (component) => component.id === 'light-threshold-1',
    ).controls;
    assert.equal(controls.outputActive, expectedActive[index]);
    assert.equal(session.runtimeProject.circuit.components.find(
      (component) => component.id === 'light-threshold-1',
    ).controls.pressed, expectedActive[index]);
  }

  const threshold = candidateContactControl(session, 'light-threshold-1', 'thresholdPercent', 60);
  assert.equal(threshold.ok, true);
  assert.equal(threshold.worker.value, false);
  apply(session, threshold.command);
  const hysteresis = candidateContactControl(
    session, 'light-threshold-1', 'hysteresisPercentagePoints', 10,
  );
  assert.equal(hysteresis.ok, true);
  apply(session, hysteresis.command);
  assert.equal(candidateContactControl(session, 'light-threshold-1', 'thresholdPercent', 9).ok, false);
  assert.equal(candidateContactControl(
    session, 'light-threshold-1', 'hysteresisPercentagePoints', 11,
  ).ok, false);
});

test('canonical save/open preserves the retained state and connected delete/undo is exact', () => {
  const session = openSession();
  addModule(session);
  wireModule(session);
  for (const lightLevelPercent of [50, 48]) {
    const prepared = candidateContactControl(
      session, 'light-threshold-1', 'lightLevelPercent', lightLevelPercent,
    );
    apply(session, prepared.command);
  }
  const before = session.saveText();
  const reopened = openCandidateUiSession(before);
  assert.equal(reopened.ok, true);
  assert.deepEqual(reopened.session.visualProject.circuit.components.find(
    (component) => component.id === 'light-threshold-1',
  ).controls, {
    lightLevelPercent: 48,
    thresholdPercent: 50,
    hysteresisPercentagePoints: 5,
    outputActive: true,
  });
  assert.deepEqual(reopened.session.runtimeProject.circuit.components.find(
    (component) => component.id === 'light-threshold-1',
  ).controls, { pressed: true });

  const removed = apply(session, { type: 'component.remove', componentId: 'light-threshold-1' });
  assert.equal(removed.changeRelevance, 'build');
  assert(!JSON.parse(session.saveText()).candidateCircuit.nets.some(
    (net) => net.endpoints.some((endpoint) => endpoint.component === 'light-threshold-1'),
  ));
  const undone = apply(session, { type: 'undo' });
  assert.equal(undone.changeRelevance, 'build');
  assert.equal(session.saveText(), before);
});
