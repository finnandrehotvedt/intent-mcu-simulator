// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { FUSE_TYPE, RESETTABLE_FUSE_PTC_TYPE, CIRCUIT_PROTECTION_DEFINITIONS,
  createCircuitProtectionComponent,
  validateCircuitProtectionComponent } from '../expansion-drafts/circuit-protection-components-v1.mjs';
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
const TYPES = [FUSE_TYPE, RESETTABLE_FUSE_PTC_TYPE];
const IDS = ['fuse-1', 'ptc-1'];
function apply(session, command) {
  const result = session.apply({ ...command, revision: session.revision });
  assert.equal(result.ok, true, `${command.type}:${result.code}`); return result;
}
function emptyCandidateSession() {
  const draft = createEditableContactDraft(); assert.equal(draft.ok, true);
  const opened = openCandidateUiSession(canonicalContactPersistenceDraftJson(draft.project));
  assert.equal(opened.ok, true, opened.code);
  for (const component of opened.session.visualProject.circuit.components) {
    if (component.id !== 'board-1') apply(opened.session,
      { type: 'component.remove', componentId: component.id });
  }
  return opened.session;
}
function addCandidateNetwork(session) {
  TYPES.forEach((type, index) => apply(session, { type: 'component.add',
    component: createCandidateUiComponent(type, IDS[index]),
    position: { x: 0.42 + index * 0.2, y: 0.5, rotation: 0 } }));
  for (const [id, endpoints] of [
    ['net-protection-1', [{ component: 'board-1', pin: 'D2' }, { component: 'fuse-1', pin: 'A' }]],
    ['net-protection-2', [{ component: 'fuse-1', pin: 'B' }, { component: 'ptc-1', pin: 'A' }]],
    ['net-protection-3', [{ component: 'ptc-1', pin: 'B' }, { component: 'board-1', pin: 'GND1' }]],
  ]) apply(session, { type: 'wire.create', net: { id, endpoints } });
}

test('CMP-015/016 define two bounded authoring-only circuit-protection contracts', () => {
  assert.deepEqual(Object.keys(CIRCUIT_PROTECTION_DEFINITIONS).sort(), [...TYPES].sort());
  for (const type of TYPES) {
    const definition = CIRCUIT_PROTECTION_DEFINITIONS[type];
    assert.deepEqual(definition.pins.map(({ id }) => id), ['A', 'B']);
    assert.equal(definition.support.status, 'visual');
    assert.match(definition.artwork.provenance, /Original IntentForce SVG/u);
    assert.match(definition.support.limitations.join(' '), /No overcurrent trip execution/u);
    assert.equal(CANDIDATE_UI_COMPONENTS[type], definition);
    assert.equal(BOUNDED_3V3_UI_COMPONENTS[type], definition);
    assert.equal(validateCircuitProtectionComponent(
      createCircuitProtectionComponent(type, `unit-${type.split('.')[1]}`)), true);
  }
});

test('AVR candidate edits and reopens protection data while Build and Run fail closed', () => {
  const session = emptyCandidateSession(); addCandidateNetwork(session);
  assert.deepEqual(session.runnable, { ok: false, code: 'CIRCUIT_PROTECTION_MODEL_UNAVAILABLE',
    details: [...IDS].sort() });
  apply(session, { type: 'component.property.set', componentId: 'fuse-1',
    key: 'ratedCurrentAmps', value: 2 });
  apply(session, { type: 'component.property.set', componentId: 'ptc-1',
    key: 'tripCurrentAmps', value: 1.5 });
  const saved = session.saveText(); const reopened = openCandidateUiSession(saved);
  assert.equal(reopened.ok, true, reopened.code); assert.equal(reopened.session.saveText(), saved);
  assert.deepEqual(reopened.session.runnable, session.runnable);
  assert.equal(reopened.session.runtimeSupport.filter(({ componentId }) => IDS.includes(componentId)).length, 2);
  const before = session.saveText();
  const rejected = session.apply({ type: 'component.property.set', revision: session.revision,
    componentId: 'ptc-1', key: 'holdCurrentAmps', value: 2 });
  assert.equal(rejected.ok, false); assert.equal(rejected.code, 'PROJECT_CONTACT_CIRCUIT_PROTECTION_STATE');
  assert.equal(session.saveText(), before);
  apply(session, { type: 'component.remove', componentId: 'fuse-1' }); apply(session, { type: 'undo' });
  assert.equal(session.saveText(), before);
});

test('canonical API component.add creates complete protection data for AVR candidate', () => {
  const session = emptyCandidateSession();
  const commands = prepareApiBatch({ profile: AVR, circuit: session.visualProject.circuit },
    TYPES.map((type, index) => ({ command: 'component.add', id: IDS[index], type,
      position: { x: 0.4 + index * 0.2, y: 0.5, rotation: 0 } })));
  for (const command of commands) apply(session, command);
  assert.deepEqual(session.visualProject.circuit.components.filter(({ id }) => IDS.includes(id))
    .map(({ id, properties }) => ({ id, properties })), [
    { id: 'fuse-1', properties: { ratedCurrentAmps: 1, ratedVoltageVolts: 250,
      breakingCapacityAmps: 100 } },
    { id: 'ptc-1', properties: { holdCurrentAmps: 0.5, tripCurrentAmps: 1,
      maxVoltageVolts: 30 } },
  ]);
  assert.equal(session.runnable.code, 'CIRCUIT_PROTECTION_MODEL_UNAVAILABLE');
});

for (const profile of [
  { name: 'Pico', Editor: Rp2040PicoCircuitEditor, board: 'pico-1', source: 'GP1', ground: 'GND8' },
  { name: 'ESP32-C3', Editor: Esp32C3CircuitEditor, board: 'c3-1', source: 'GPIO3', ground: 'GND8' },
  { name: 'STM32F429ZI', Editor: Stm32CircuitEditor, board: 'stm32-1', source: 'PB1', ground: 'GND20' },
]) {
  test(`${profile.name} persists the exact two-part protection authoring chain`, () => {
    const editor = new profile.Editor();
    for (const componentId of ['resistor-1', 'led-1']) {
      editor.select({ kind: 'component', id: componentId }); assert.equal(editor.deleteSelected().ok, true);
    }
    TYPES.forEach((type) => assert.equal(editor.addMissingComponent(type).ok, true));
    for (const [left, right] of [
      [{ component: profile.board, pin: profile.source }, { component: 'fuse-1', pin: 'A' }],
      [{ component: 'fuse-1', pin: 'B' }, { component: 'ptc-1', pin: 'A' }],
      [{ component: 'ptc-1', pin: 'B' }, { component: profile.board, pin: profile.ground }],
    ]) assert.equal(editor.connectEndpoints(left, right).ok, true);
    assert.equal(editor.setComponentProperty('ptc-1', 'tripCurrentAmps', 1.5).ok, true);
    const saved = editor.snapshot().draft; const reopened = new profile.Editor(structuredClone(saved));
    assert.deepEqual(reopened.snapshot().draft, saved); assert.equal(reopened.snapshot().validation.ok, false);
    assert.match(reopened.snapshot().validation.code, /MODEL_LIBRARY_COMPONENT_UNAVAILABLE/u);
    const before = JSON.stringify(saved);
    assert.equal(editor.setComponentProperty('ptc-1', 'holdCurrentAmps', 2).ok, false);
    assert.equal(JSON.stringify(editor.snapshot().draft), before);
  });
}

test('all four profiles publish both protection parts as authoring-only and never executable', () => {
  for (const profile of COMPONENT_SUPPORT_PROFILES) for (const type of TYPES) {
    const cell = componentSupportCell(profile.id, type);
    assert.equal(cell.authoringAvailable, true, `${profile.id}:${type}`);
    assert.equal(cell.executableAvailable, false, `${profile.id}:${type}`);
    assert.equal(cell.status, 'visual', `${profile.id}:${type}`);
    assert.equal(cell.projectMode, 'authoring-only', `${profile.id}:${type}`);
    assert.match(cell.limitations.join(' '), /no trip\/interruption\/reset\/thermal model/u);
  }
});
