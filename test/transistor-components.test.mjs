// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { NPN_BJT_TYPE, PNP_BJT_TYPE, N_CHANNEL_MOSFET_TYPE,
  TRANSISTOR_COMPONENT_DEFINITIONS, createTransistorComponent,
  validateTransistorComponent } from '../expansion-drafts/transistor-components-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import { BOUNDED_3V3_UI_COMPONENTS } from '../src/bounded-3v3-authoring-contracts.mjs';
import { prepareApiBatch } from '../src/browser-session-edit.mjs';
import { CANDIDATE_UI_COMPONENTS, createCandidateUiComponent,
  openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { COMPONENT_SUPPORT_PROFILES, componentSupportCell } from '../src/component-support-matrix.mjs';
import { Esp32C3CircuitEditor } from '../src/esp32c3-public-circuit.mjs';
import { Rp2040PicoCircuitEditor } from '../src/rp2040-pico-circuit.mjs';
import { Stm32CircuitEditor } from '../src/stm32-public-circuit.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const TYPES = [NPN_BJT_TYPE, PNP_BJT_TYPE, N_CHANNEL_MOSFET_TYPE];
const IDS = ['npn-1', 'pnp-1', 'nmos-1'];

function apply(session, command) {
  const result = session.apply({ ...command, revision: session.revision });
  assert.equal(result.ok, true, `${command.type}:${result.code}`);
  return result;
}

function emptyCandidateSession() {
  const draft = createEditableContactDraft();
  assert.equal(draft.ok, true);
  const opened = openCandidateUiSession(canonicalContactPersistenceDraftJson(draft.project));
  assert.equal(opened.ok, true, opened.code);
  for (const component of opened.session.visualProject.circuit.components) {
    if (component.id !== 'board-1') apply(opened.session,
      { type: 'component.remove', componentId: component.id });
  }
  return opened.session;
}

function addCandidateNetwork(session) {
  TYPES.forEach((type, index) => apply(session, {
    type: 'component.add', component: createCandidateUiComponent(type, IDS[index]),
    position: { x: 0.42 + index * 0.2, y: 0.5, rotation: 0 },
  }));
  for (const [id, endpoints] of [
    ['net-npn-base', [{ component: 'board-1', pin: 'D2' }, { component: 'npn-1', pin: 'BASE' }]],
    ['net-pnp-base', [{ component: 'board-1', pin: 'D3' }, { component: 'pnp-1', pin: 'BASE' }]],
    ['net-nmos-gate', [{ component: 'board-1', pin: 'D4' }, { component: 'nmos-1', pin: 'GATE' }]],
    ['net-bjt-collectors', [{ component: 'npn-1', pin: 'COLLECTOR' }, { component: 'pnp-1', pin: 'COLLECTOR' }]],
    ['net-upper', [{ component: 'pnp-1', pin: 'EMITTER' }, { component: 'nmos-1', pin: 'DRAIN' }]],
    ['net-return', [{ component: 'board-1', pin: 'GND1' }, { component: 'npn-1', pin: 'EMITTER' }]],
  ]) apply(session, { type: 'wire.create', net: { id, endpoints } });
  apply(session, { type: 'wire.branch', netId: 'net-return',
    endpoint: { component: 'nmos-1', pin: 'SOURCE' }, junctionId: 'junction-transistor-return' });
}

test('CMP-010/011/012 define three distinct bounded authoring-only transistor contracts', () => {
  assert.deepEqual(Object.keys(TRANSISTOR_COMPONENT_DEFINITIONS).sort(), [...TYPES].sort());
  assert.deepEqual(TRANSISTOR_COMPONENT_DEFINITIONS[NPN_BJT_TYPE].pins.map(({ id }) => id),
    ['BASE', 'COLLECTOR', 'EMITTER']);
  assert.deepEqual(TRANSISTOR_COMPONENT_DEFINITIONS[PNP_BJT_TYPE].pins.map(({ id }) => id),
    ['BASE', 'COLLECTOR', 'EMITTER']);
  assert.deepEqual(TRANSISTOR_COMPONENT_DEFINITIONS[N_CHANNEL_MOSFET_TYPE].pins.map(({ id }) => id),
    ['GATE', 'DRAIN', 'SOURCE']);
  for (const type of TYPES) {
    const definition = TRANSISTOR_COMPONENT_DEFINITIONS[type];
    assert.equal(definition.support.status, 'visual');
    assert.match(definition.artwork.provenance, /Original IntentForce SVG/u);
    assert.match(definition.support.limitations.join(' '), /No bias network/u);
    assert.equal(CANDIDATE_UI_COMPONENTS[type], definition);
    assert.equal(BOUNDED_3V3_UI_COMPONENTS[type], definition);
    assert.equal(validateTransistorComponent(createTransistorComponent(type, `unit-${type.split('.')[1]}`)), true);
  }
});

test('AVR candidate edits and reopens transistor data while Build and Run fail closed', () => {
  const session = emptyCandidateSession();
  addCandidateNetwork(session);
  assert.deepEqual(session.runnable, {
    ok: false, code: 'TRANSISTOR_SWITCHING_MODEL_UNAVAILABLE', details: [...IDS].sort(),
  });
  apply(session, { type: 'component.property.set', componentId: 'npn-1',
    key: 'nominalCurrentGain', value: 120 });
  apply(session, { type: 'component.property.set', componentId: 'pnp-1',
    key: 'maxCollectorEmitterVoltageVolts', value: 55 });
  apply(session, { type: 'component.property.set', componentId: 'nmos-1',
    key: 'nominalGateThresholdVoltageVolts', value: 2.4 });
  const saved = session.saveText();
  const reopened = openCandidateUiSession(saved);
  assert.equal(reopened.ok, true, reopened.code);
  assert.equal(reopened.session.saveText(), saved);
  assert.deepEqual(reopened.session.runnable, session.runnable);
  assert.equal(reopened.session.runtimeSupport.filter(({ componentId }) => IDS.includes(componentId)).length, 3);
  const before = session.saveText();
  const rejected = session.apply({ type: 'component.property.set', revision: session.revision,
    componentId: 'nmos-1', key: 'nominalGateThresholdVoltageVolts', value: 11 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'PROJECT_CONTACT_TRANSISTOR_STATE');
  assert.equal(session.saveText(), before);
  apply(session, { type: 'component.remove', componentId: 'pnp-1' });
  apply(session, { type: 'undo' });
  assert.equal(session.saveText(), before);
});

test('canonical API component.add creates complete transistor data for AVR candidate', () => {
  const session = emptyCandidateSession();
  const commands = prepareApiBatch({ profile: AVR, circuit: session.visualProject.circuit },
    TYPES.map((type, index) => ({ command: 'component.add', id: IDS[index], type,
      position: { x: 0.4 + index * 0.2, y: 0.5, rotation: 0 } })));
  for (const command of commands) apply(session, command);
  assert.deepEqual(session.visualProject.circuit.components.filter(({ id }) => IDS.includes(id))
    .map(({ id, properties }) => ({ id, properties })), [
    { id: 'npn-1', properties: { nominalCurrentGain: 100,
      maxCollectorEmitterVoltageVolts: 40, maxCollectorCurrentAmps: 0.6 } },
    { id: 'pnp-1', properties: { nominalCurrentGain: 100,
      maxCollectorEmitterVoltageVolts: 40, maxCollectorCurrentAmps: 0.6 } },
    { id: 'nmos-1', properties: { nominalGateThresholdVoltageVolts: 2,
      maxDrainSourceVoltageVolts: 60, maxDrainCurrentAmps: 10 } },
  ]);
  assert.equal(session.runnable.code, 'TRANSISTOR_SWITCHING_MODEL_UNAVAILABLE');
});

for (const profile of [
  { name: 'Pico', Editor: Rp2040PicoCircuitEditor, board: 'pico-1', controls: ['GP1', 'GP2', 'GP3'], ground: 'GND8' },
  { name: 'ESP32-C3', Editor: Esp32C3CircuitEditor, board: 'c3-1', controls: ['GPIO3', 'GPIO0', 'GPIO1'], ground: 'GND8' },
  { name: 'STM32F429ZI', Editor: Stm32CircuitEditor, board: 'stm32-1', controls: ['PB1', 'PB7', 'PB0'], ground: 'GND20' },
]) {
  test(`${profile.name} persists the exact three-transistor authoring-only network`, () => {
    const editor = new profile.Editor();
    for (const componentId of ['resistor-1', 'led-1']) {
      editor.select({ kind: 'component', id: componentId });
      assert.equal(editor.deleteSelected().ok, true);
    }
    TYPES.forEach((type) => assert.equal(editor.addMissingComponent(type).ok, true));
    for (const [pin, component, terminal] of [
      [profile.controls[0], 'npn-1', 'BASE'], [profile.controls[1], 'pnp-1', 'BASE'],
      [profile.controls[2], 'nmos-1', 'GATE'],
    ]) assert.equal(editor.connectEndpoints({ component: profile.board, pin },
      { component, pin: terminal }).ok, true);
    assert.equal(editor.connectEndpoints({ component: 'npn-1', pin: 'COLLECTOR' },
      { component: 'pnp-1', pin: 'COLLECTOR' }).ok, true);
    assert.equal(editor.connectEndpoints({ component: 'pnp-1', pin: 'EMITTER' },
      { component: 'nmos-1', pin: 'DRAIN' }).ok, true);
    const groundNet = editor.connectEndpoints({ component: profile.board, pin: profile.ground },
      { component: 'npn-1', pin: 'EMITTER' });
    assert.equal(groundNet.ok, true);
    assert.equal(editor.branchEndpoint(groundNet.netId, { component: 'nmos-1', pin: 'SOURCE' }).ok, true);
    assert.equal(editor.setComponentProperty('nmos-1', 'maxDrainCurrentAmps', 12).ok, true);
    const saved = editor.snapshot().draft;
    const reopened = new profile.Editor(structuredClone(saved));
    assert.deepEqual(reopened.snapshot().draft, saved);
    assert.equal(reopened.snapshot().validation.ok, false);
    assert.match(reopened.snapshot().validation.code, /MODEL_LIBRARY_COMPONENT_UNAVAILABLE/u);
    const before = JSON.stringify(saved);
    assert.equal(editor.setComponentProperty('npn-1', 'nominalCurrentGain', 1).ok, false);
    assert.equal(JSON.stringify(editor.snapshot().draft), before);
  });
}

test('all four profiles publish all three transistors as authoring-only and never executable', () => {
  for (const profile of COMPONENT_SUPPORT_PROFILES) for (const type of TYPES) {
    const cell = componentSupportCell(profile.id, type);
    assert.equal(cell.authoringAvailable, true, `${profile.id}:${type}`);
    assert.equal(cell.executableAvailable, false, `${profile.id}:${type}`);
    assert.equal(cell.status, 'visual', `${profile.id}:${type}`);
    assert.equal(cell.projectMode, 'authoring-only', `${profile.id}:${type}`);
    assert.match(cell.limitations.join(' '), /no bias\/switching\/current model/u);
  }
});
