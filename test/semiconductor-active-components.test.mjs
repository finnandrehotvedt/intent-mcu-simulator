// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { OPTOCOUPLER_TYPE, P_CHANNEL_MOSFET_TYPE,
  SEMICONDUCTOR_ACTIVE_DEFINITIONS, createSemiconductorActiveComponent,
  validateSemiconductorActiveComponent } from '../expansion-drafts/semiconductor-active-components-v1.mjs';
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
const TYPES = [P_CHANNEL_MOSFET_TYPE, OPTOCOUPLER_TYPE];
const IDS = ['pmos-1', 'optocoupler-1'];

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
    position: { x: 0.45 + index * 0.25, y: 0.5, rotation: 0 },
  }));
  for (const [id, endpoints] of [
    ['net-pmos-gate', [{ component: 'board-1', pin: 'D2' }, { component: 'pmos-1', pin: 'GATE' }]],
    ['net-output-collector', [{ component: 'pmos-1', pin: 'DRAIN' }, { component: 'optocoupler-1', pin: 'COLLECTOR' }]],
    ['net-output-emitter', [{ component: 'pmos-1', pin: 'SOURCE' }, { component: 'optocoupler-1', pin: 'EMITTER' }]],
    ['net-opto-anode', [{ component: 'board-1', pin: 'D3' }, { component: 'optocoupler-1', pin: 'ANODE' }]],
    ['net-opto-cathode', [{ component: 'board-1', pin: 'GND1' }, { component: 'optocoupler-1', pin: 'CATHODE' }]],
  ]) apply(session, { type: 'wire.create', net: { id, endpoints } });
}

test('CMP-013/014 define exact bounded authoring-only P-MOSFET and optocoupler contracts', () => {
  assert.deepEqual(Object.keys(SEMICONDUCTOR_ACTIVE_DEFINITIONS).sort(), [...TYPES].sort());
  assert.deepEqual(SEMICONDUCTOR_ACTIVE_DEFINITIONS[P_CHANNEL_MOSFET_TYPE].pins.map(({ id }) => id),
    ['GATE', 'DRAIN', 'SOURCE']);
  assert.deepEqual(SEMICONDUCTOR_ACTIVE_DEFINITIONS[OPTOCOUPLER_TYPE].pins.map(({ id }) => id),
    ['ANODE', 'CATHODE', 'COLLECTOR', 'EMITTER']);
  for (const type of TYPES) {
    const definition = SEMICONDUCTOR_ACTIVE_DEFINITIONS[type];
    assert.equal(definition.support.status, 'visual');
    assert.match(definition.artwork.provenance, /Original IntentForce SVG/u);
    assert.match(definition.support.limitations.join(' '), /No bias\/current network/u);
    assert.equal(CANDIDATE_UI_COMPONENTS[type], definition);
    assert.equal(BOUNDED_3V3_UI_COMPONENTS[type], definition);
    assert.equal(validateSemiconductorActiveComponent(
      createSemiconductorActiveComponent(type, `unit-${type.split('.')[1]}`)), true);
  }
});

test('AVR candidate edits and reopens active-semiconductor data while Build and Run fail closed', () => {
  const session = emptyCandidateSession();
  addCandidateNetwork(session);
  assert.deepEqual(session.runnable, {
    ok: false, code: 'SEMICONDUCTOR_ACTIVE_MODEL_UNAVAILABLE', details: [...IDS].sort(),
  });
  apply(session, { type: 'component.property.set', componentId: 'pmos-1',
    key: 'nominalGateThresholdMagnitudeVolts', value: 2.5 });
  apply(session, { type: 'component.property.set', componentId: 'optocoupler-1',
    key: 'nominalCurrentTransferRatioPercent', value: 125 });
  const saved = session.saveText();
  const reopened = openCandidateUiSession(saved);
  assert.equal(reopened.ok, true, reopened.code);
  assert.equal(reopened.session.saveText(), saved);
  assert.deepEqual(reopened.session.runnable, session.runnable);
  assert.equal(reopened.session.runtimeSupport.filter(({ componentId }) => IDS.includes(componentId)).length, 2);
  const before = session.saveText();
  const rejected = session.apply({ type: 'component.property.set', revision: session.revision,
    componentId: 'pmos-1', key: 'nominalGateThresholdMagnitudeVolts', value: 11 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'PROJECT_CONTACT_SEMICONDUCTOR_ACTIVE_STATE');
  assert.equal(session.saveText(), before);
  apply(session, { type: 'component.remove', componentId: 'optocoupler-1' });
  apply(session, { type: 'undo' });
  assert.equal(session.saveText(), before);
});

test('canonical API component.add creates complete active-semiconductor data for AVR candidate', () => {
  const session = emptyCandidateSession();
  const commands = prepareApiBatch({ profile: AVR, circuit: session.visualProject.circuit },
    TYPES.map((type, index) => ({ command: 'component.add', id: IDS[index], type,
      position: { x: 0.45 + index * 0.25, y: 0.5, rotation: 0 } })));
  for (const command of commands) apply(session, command);
  assert.deepEqual(session.visualProject.circuit.components.filter(({ id }) => IDS.includes(id))
    .map(({ id, properties }) => ({ id, properties })), [
    { id: 'optocoupler-1', properties: { nominalForwardVoltageVolts: 1.2,
      nominalCurrentTransferRatioPercent: 100, maxIsolationVoltageVolts: 3750 } },
    { id: 'pmos-1', properties: { nominalGateThresholdMagnitudeVolts: 2,
      maxDrainSourceVoltageVolts: 60, maxDrainCurrentAmps: 10 } },
  ]);
  assert.equal(session.runnable.code, 'SEMICONDUCTOR_ACTIVE_MODEL_UNAVAILABLE');
});

for (const profile of [
  { name: 'Pico', Editor: Rp2040PicoCircuitEditor, board: 'pico-1', controls: ['GP1', 'GP2'], ground: 'GND8' },
  { name: 'ESP32-C3', Editor: Esp32C3CircuitEditor, board: 'c3-1', controls: ['GPIO3', 'GPIO0'], ground: 'GND8' },
  { name: 'STM32F429ZI', Editor: Stm32CircuitEditor, board: 'stm32-1', controls: ['PB1', 'PB7'], ground: 'GND20' },
]) {
  test(`${profile.name} persists the exact two-part active-semiconductor authoring network`, () => {
    const editor = new profile.Editor();
    for (const componentId of ['resistor-1', 'led-1']) {
      editor.select({ kind: 'component', id: componentId });
      assert.equal(editor.deleteSelected().ok, true);
    }
    TYPES.forEach((type) => assert.equal(editor.addMissingComponent(type).ok, true));
    for (const [from, to] of [
      [{ component: profile.board, pin: profile.controls[0] }, { component: 'pmos-1', pin: 'GATE' }],
      [{ component: 'pmos-1', pin: 'DRAIN' }, { component: 'optocoupler-1', pin: 'COLLECTOR' }],
      [{ component: 'pmos-1', pin: 'SOURCE' }, { component: 'optocoupler-1', pin: 'EMITTER' }],
      [{ component: profile.board, pin: profile.controls[1] }, { component: 'optocoupler-1', pin: 'ANODE' }],
      [{ component: profile.board, pin: profile.ground }, { component: 'optocoupler-1', pin: 'CATHODE' }],
    ]) assert.equal(editor.connectEndpoints(from, to).ok, true);
    assert.equal(editor.setComponentProperty('pmos-1', 'maxDrainCurrentAmps', 12).ok, true);
    const saved = editor.snapshot().draft;
    const reopened = new profile.Editor(structuredClone(saved));
    assert.deepEqual(reopened.snapshot().draft, saved);
    assert.equal(reopened.snapshot().validation.ok, false);
    assert.match(reopened.snapshot().validation.code, /MODEL_LIBRARY_COMPONENT_UNAVAILABLE/u);
    const before = JSON.stringify(saved);
    assert.equal(editor.setComponentProperty('optocoupler-1', 'maxIsolationVoltageVolts', 10).ok, false);
    assert.equal(JSON.stringify(editor.snapshot().draft), before);
  });
}

test('all four profiles publish both active semiconductors as authoring-only and never executable', () => {
  for (const profile of COMPONENT_SUPPORT_PROFILES) for (const type of TYPES) {
    const cell = componentSupportCell(profile.id, type);
    assert.equal(cell.authoringAvailable, true, `${profile.id}:${type}`);
    assert.equal(cell.executableAvailable, false, `${profile.id}:${type}`);
    assert.equal(cell.status, 'visual', `${profile.id}:${type}`);
    assert.equal(cell.projectMode, 'authoring-only', `${profile.id}:${type}`);
    assert.match(cell.limitations.join(' '), /no switching\/optical-transfer\/isolation model/u);
  }
});
