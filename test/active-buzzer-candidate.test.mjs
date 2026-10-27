// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { COMPONENT_CATALOG } from '../src/component-catalog.mjs';
import {
  canonicalContactPersistenceDraftJson,
} from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import {
  ACTIVE_BUZZER_DEFINITION,
  ACTIVE_BUZZER_RUNTIME_ADAPTER,
  ACTIVE_BUZZER_TYPE,
  AVR_ACTIVE_BUZZER_PINS,
  createActiveBuzzerComponent,
  validateActiveBuzzerDefinition,
} from '../expansion-drafts/active-buzzer-module-v1.mjs';
import {
  CANDIDATE_UI_COMPONENTS,
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

function addBuzzer(session) {
  apply(session, {
    type: 'component.add',
    component: createActiveBuzzerComponent('active-buzzer-1', 'Workshop alarm'),
    position: { x: 0.78, y: 0.68 },
  });
}

function wireVcc(session) {
  apply(session, {
    type: 'wire.branch', netId: 'net-5v',
    endpoint: { component: 'active-buzzer-1', pin: 'VCC' },
    junctionId: 'junction-buzzer-vcc',
  });
}

function wireGround(session) {
  apply(session, {
    type: 'wire.branch', netId: 'net-ground-branch',
    endpoint: { component: 'active-buzzer-1', pin: 'GND' },
    junctionId: 'junction-buzzer-ground',
  });
}

function wireEnable(session, sourcePin = 'D8') {
  apply(session, {
    type: 'wire.create',
    net: {
      id: 'net-buzzer-enable',
      endpoints: [
        { component: 'active-buzzer-1', pin: 'EN' },
        { component: 'board-1', pin: sourcePin },
      ],
    },
  });
}

function wireAccepted(session) {
  wireVcc(session);
  wireGround(session);
  wireEnable(session);
}

test('active buzzer is an original silent logical three-terminal contract', () => {
  assert.equal(validateActiveBuzzerDefinition(), true);
  assert.equal(ACTIVE_BUZZER_DEFINITION.type, ACTIVE_BUZZER_TYPE);
  assert.deepEqual(ACTIVE_BUZZER_DEFINITION.pins.map((pin) => pin.id), ['VCC', 'GND', 'EN']);
  assert.deepEqual(AVR_ACTIVE_BUZZER_PINS, ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13']);
  assert.match(ACTIVE_BUZZER_DEFINITION.artwork.provenance, /Original IntentForce SVG/u);
  assert.match(ACTIVE_BUZZER_DEFINITION.support.limitations.join(' '), /silent visual/u);
  assert.match(ACTIVE_BUZZER_DEFINITION.support.limitations.join(' '), /No oscillator/u);
  assert(!Object.hasOwn(COMPONENT_CATALOG, ACTIVE_BUZZER_TYPE));
  assert.equal(Object.values(COMPONENT_CATALOG).length, 6);
  assert.equal(Object.values(COMPONENT_CATALOG).filter((definition) => definition.selectable).length, 5);
  assert.equal(Object.values(CANDIDATE_UI_COMPONENTS).filter((definition) => definition.selectable).length, 46);
  assert.equal(5 + Object.values(CANDIDATE_UI_COMPONENTS).filter((definition) => definition.selectable).length, 51);
  assert.deepEqual(createCandidateUiComponent(ACTIVE_BUZZER_TYPE, 'active-buzzer-2'), {
    id: 'active-buzzer-2', type: ACTIVE_BUZZER_TYPE,
    label: 'Active buzzer module', properties: {}, controls: {},
  });
});

test('VCC, GND and EN advance one deterministic draft diagnostic', () => {
  const session = openSession();
  addBuzzer(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_ACTIVE_BUZZER_VCC_DISCONNECTED');
  wireVcc(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_ACTIVE_BUZZER_GND_DISCONNECTED');
  wireGround(session);
  assert.equal(session.runnable.code, 'PROJECT_CONTACT_ACTIVE_BUZZER_EN_DISCONNECTED');
  wireEnable(session);
  assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
});

test('wrong power, terminal shorts, unsupported drive and branched EN fail closed', () => {
  const wrongPower = openSession();
  addBuzzer(wrongPower);
  apply(wrongPower, {
    type: 'wire.create', net: {
      id: 'net-buzzer-wrong-vcc', endpoints: [
        { component: 'active-buzzer-1', pin: 'VCC' }, { component: 'board-1', pin: 'GND3' },
      ],
    },
  });
  assert.equal(wrongPower.runnable.code, 'PROJECT_CONTACT_ACTIVE_BUZZER_VCC_REQUIRES_5V');

  const shorted = openSession();
  addBuzzer(shorted); wireVcc(shorted);
  apply(shorted, {
    type: 'wire.branch', netId: 'net-5v',
    endpoint: { component: 'active-buzzer-1', pin: 'GND' },
    junctionId: 'junction-buzzer-short',
  });
  assert.equal(shorted.runnable.code, 'PROJECT_CONTACT_ACTIVE_BUZZER_TERMINAL_SHORT');

  const groundDrive = openSession();
  addBuzzer(groundDrive); wireVcc(groundDrive); wireGround(groundDrive);
  wireEnable(groundDrive, 'GND3');
  assert.equal(groundDrive.runnable.code, 'PROJECT_CONTACT_ACTIVE_BUZZER_EN_REQUIRES_DIGITAL_OUTPUT');

  const uartDrive = openSession();
  addBuzzer(uartDrive); wireVcc(uartDrive); wireGround(uartDrive); wireEnable(uartDrive, 'D1');
  assert.equal(uartDrive.runnable.code, 'PROJECT_CONTACT_ACTIVE_BUZZER_EN_UNSUPPORTED_DRIVE');

  const branched = openSession();
  addBuzzer(branched); wireVcc(branched); wireGround(branched); wireEnable(branched, 'D8');
  apply(branched, {
    type: 'wire.branch', netId: 'net-buzzer-enable',
    endpoint: { component: 'board-1', pin: 'D9' }, junctionId: 'junction-buzzer-enable',
  });
  assert.equal(branched.runnable.code, 'PROJECT_CONTACT_ACTIVE_BUZZER_EN_UNSUPPORTED_TOPOLOGY');

  const beforePowerShort = branched.saveText();
  const rejected = branched.apply({
    type: 'wire.branch', revision: branched.revision, netId: 'net-5v',
    endpoint: { component: 'board-1', pin: 'GND2' }, junctionId: 'junction-power-short',
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'PROJECT_CONTACT_POWER_SHORT');
  assert.equal(branched.saveText(), beforePowerShort);
});

test('accepted buzzer observes compiled GPIO without inventing an electrical or acoustic load', () => {
  const session = openSession();
  addBuzzer(session); wireAccepted(session);
  assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
  const support = session.runtimeSupport.find((item) => item.componentId === 'active-buzzer-1');
  assert.equal(support.runtimeAdapter, ACTIVE_BUZZER_RUNTIME_ADAPTER);
  assert.equal(support.runtimeProjection.sourcePin, 'D8');
  assert.equal(support.runtimeProjection.activeLevel, 'HIGH');
  assert.equal(support.runtimeProjection.electricalModel, 'ideal-high-impedance-enable-input-only');
  assert.equal(support.runtimeProjection.displayModel, 'silent-logical-on-off-indicator-only');
  assert(!session.runtimeProject.circuit.components.some((component) => component.id === 'active-buzzer-1'));
  assert(!session.runtimeProject.circuit.nets.some((net) => net.endpoints.some(
    (endpoint) => endpoint.component === 'active-buzzer-1',
  )));
});

test('save/open, movement and connected delete/undo preserve the exact buzzer project', () => {
  const session = openSession();
  addBuzzer(session); wireAccepted(session);
  apply(session, { type: 'component.move', componentId: 'active-buzzer-1', x: 0.7, y: 0.64 });
  const before = session.saveText();
  const reopened = openCandidateUiSession(before);
  assert.equal(reopened.ok, true);
  assert.equal(reopened.session.runnable.ok, true);
  assert.deepEqual(reopened.session.visualProject.layout.positions['active-buzzer-1'], {
    x: 0.7, y: 0.64, rotation: 0,
  });
  assert.equal(reopened.session.runtimeSupport.find(
    (item) => item.componentId === 'active-buzzer-1',
  ).runtimeProjection.sourcePin, 'D8');

  const removed = apply(session, { type: 'component.remove', componentId: 'active-buzzer-1' });
  assert.equal(removed.changeRelevance, 'build');
  assert(!JSON.parse(session.saveText()).candidateCircuit.nets.some(
    (net) => net.endpoints.some((endpoint) => endpoint.component === 'active-buzzer-1'),
  ));
  const undone = apply(session, { type: 'undo' });
  assert.equal(undone.changeRelevance, 'build');
  assert.equal(session.saveText(), before);
});
