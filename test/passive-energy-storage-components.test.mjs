// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { canonicalContactPersistenceDraftJson } from '../expansion-drafts/project-v3-contact-persistence.mjs';
import {
  ELECTROLYTIC_CAPACITOR_TYPE,
  FIXED_INDUCTOR_TYPE,
  NONPOLAR_CAPACITOR_TYPE,
  PASSIVE_ENERGY_STORAGE_DEFINITIONS,
  createPassiveEnergyStorageComponent,
  validatePassiveEnergyStorageComponent,
} from '../expansion-drafts/passive-energy-storage-components-v1.mjs';
import {
  CANDIDATE_UI_COMPONENTS,
  createCandidateUiComponent,
  openCandidateUiSession,
} from '../src/candidate-existing-ui-adapter.mjs';
import { BOUNDED_3V3_UI_COMPONENTS } from '../src/bounded-3v3-authoring-contracts.mjs';
import { prepareApiBatch } from '../src/browser-session-edit.mjs';
import { COMPONENT_SUPPORT_PROFILES, componentSupportCell } from '../src/component-support-matrix.mjs';
import { Esp32C3CircuitEditor } from '../src/esp32c3-public-circuit.mjs';
import { Rp2040PicoCircuitEditor } from '../src/rp2040-pico-circuit.mjs';
import { Stm32CircuitEditor } from '../src/stm32-public-circuit.mjs';

const AVR = 'board.atmega328p-16mhz-v1';
const TYPES = [NONPOLAR_CAPACITOR_TYPE, ELECTROLYTIC_CAPACITOR_TYPE, FIXED_INDUCTOR_TYPE];
const IDS = ['capacitor-1', 'electrolytic-1', 'inductor-1'];

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

function addCandidateChain(session) {
  TYPES.forEach((type, index) => apply(session, {
    type: 'component.add', component: createCandidateUiComponent(type, IDS[index]),
    position: { x: 0.45 + index * 0.18, y: 0.52, rotation: 0 },
  }));
  for (const [id, from, to] of [
    ['net-passive-source', { component: 'board-1', pin: '5V' }, { component: IDS[0], pin: 'A' }],
    ['net-passive-capacitors', { component: IDS[0], pin: 'B' }, { component: IDS[1], pin: 'POSITIVE' }],
    ['net-passive-inductor', { component: IDS[1], pin: 'NEGATIVE' }, { component: IDS[2], pin: 'A' }],
    ['net-passive-ground', { component: IDS[2], pin: 'B' }, { component: 'board-1', pin: 'GND1' }],
  ]) apply(session, { type: 'wire.create', net: { id, endpoints: [from, to] } });
}

test('CMP-004/005/006 define three distinct original raw two-terminal authoring contracts', () => {
  assert.deepEqual(Object.keys(PASSIVE_ENERGY_STORAGE_DEFINITIONS).sort(), [...TYPES].sort());
  assert.deepEqual(PASSIVE_ENERGY_STORAGE_DEFINITIONS[NONPOLAR_CAPACITOR_TYPE].pins.map(({ id }) => id), ['A', 'B']);
  assert.deepEqual(PASSIVE_ENERGY_STORAGE_DEFINITIONS[ELECTROLYTIC_CAPACITOR_TYPE].pins.map(({ id }) => id),
    ['POSITIVE', 'NEGATIVE']);
  assert.deepEqual(PASSIVE_ENERGY_STORAGE_DEFINITIONS[FIXED_INDUCTOR_TYPE].pins.map(({ id }) => id), ['A', 'B']);
  for (const type of TYPES) {
    const definition = PASSIVE_ENERGY_STORAGE_DEFINITIONS[type];
    assert.equal(definition.support.status, 'visual');
    assert.match(definition.artwork.provenance, /Original IntentForce SVG/u);
    assert.match(definition.support.limitations.join(' '), /raw two-terminal/u);
    assert.match(definition.support.limitations.join(' '), /No transient or frequency-domain solver/u);
    assert.equal(CANDIDATE_UI_COMPONENTS[type], definition);
    assert.equal(BOUNDED_3V3_UI_COMPONENTS[type], definition);
    assert.equal(validatePassiveEnergyStorageComponent(createPassiveEnergyStorageComponent(type, `unit-${type.split('.')[1]}`)), true);
  }
});

test('AVR candidate authors, edits and reopens a passive chain but fails closed for Build and Run', () => {
  const session = emptyCandidateSession();
  addCandidateChain(session);
  assert.deepEqual(session.runnable, {
    ok: false, code: 'PASSIVE_TRANSIENT_MODEL_UNAVAILABLE', details: [...IDS].sort(),
  });
  apply(session, { type: 'component.property.set', componentId: 'capacitor-1',
    key: 'capacitanceFarads', value: 470e-9 });
  apply(session, { type: 'component.property.set', componentId: 'electrolytic-1',
    key: 'capacitanceFarads', value: 220e-6 });
  apply(session, { type: 'component.property.set', componentId: 'inductor-1',
    key: 'inductanceHenries', value: 0.0047 });
  const saved = session.saveText();
  const reopened = openCandidateUiSession(saved);
  assert.equal(reopened.ok, true, reopened.code);
  assert.equal(reopened.session.saveText(), saved);
  assert.deepEqual(reopened.session.runnable, session.runnable);
  assert.equal(reopened.session.runtimeSupport.filter(({ componentId }) => IDS.includes(componentId)).length, 3);

  const before = session.saveText();
  const rejected = session.apply({ type: 'component.property.set', revision: session.revision,
    componentId: 'capacitor-1', key: 'capacitanceFarads', value: 2 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'PROJECT_CONTACT_PASSIVE_ENERGY_STORAGE_STATE');
  assert.equal(session.saveText(), before);
  apply(session, { type: 'component.remove', componentId: 'inductor-1' });
  apply(session, { type: 'undo' });
  assert.equal(session.saveText(), before);
  apply(session, { type: 'redo' });
  assert.equal(session.visualProject.circuit.components.some(({ id }) => id === 'inductor-1'), false);
});

test('canonical API component.add creates complete passive data for AVR candidate', () => {
  const session = emptyCandidateSession();
  const commands = prepareApiBatch({ profile: AVR, circuit: session.visualProject.circuit }, TYPES.map((type, index) => ({
    command: 'component.add', id: IDS[index], type,
    position: { x: 0.4 + index * 0.2, y: 0.5, rotation: 0 },
  })));
  for (const command of commands) apply(session, command);
  assert.deepEqual(session.visualProject.circuit.components.filter(({ id }) => IDS.includes(id))
    .map(({ id, properties }) => ({ id, properties })), [
    { id: 'electrolytic-1', properties: { capacitanceFarads: 0.0001 } },
    { id: 'capacitor-1', properties: { capacitanceFarads: 1e-7 } },
    { id: 'inductor-1', properties: { inductanceHenries: 0.001 } },
  ]);
  assert.equal(session.runnable.code, 'PASSIVE_TRANSIENT_MODEL_UNAVAILABLE');
});

for (const profile of [
  { name: 'Pico', Editor: Rp2040PicoCircuitEditor, board: 'pico-1', source: 'GP1', ground: 'GND8' },
  { name: 'ESP32-C3', Editor: Esp32C3CircuitEditor, board: 'c3-1', source: 'GPIO3', ground: 'GND8' },
  { name: 'STM32F429ZI', Editor: Stm32CircuitEditor, board: 'stm32-1', source: 'PB1', ground: 'GND20' },
]) {
  test(`${profile.name} persists the exact three-part authoring-only chain`, () => {
    const editor = new profile.Editor();
    TYPES.forEach((type) => assert.equal(editor.addMissingComponent(type).ok, true));
    assert.equal(editor.connectEndpoints({ component: profile.board, pin: profile.source },
      { component: 'capacitor-1', pin: 'A' }).ok, true);
    assert.equal(editor.connectEndpoints({ component: 'capacitor-1', pin: 'B' },
      { component: 'electrolytic-1', pin: 'POSITIVE' }).ok, true);
    assert.equal(editor.connectEndpoints({ component: 'electrolytic-1', pin: 'NEGATIVE' },
      { component: 'inductor-1', pin: 'A' }).ok, true);
    assert.equal(editor.connectEndpoints({ component: 'inductor-1', pin: 'B' },
      { component: profile.board, pin: profile.ground }).ok, true);
    assert.equal(editor.setComponentProperty('capacitor-1', 'capacitanceFarads', 22e-9).ok, true);
    const saved = editor.snapshot().draft;
    const reopened = new profile.Editor(JSON.parse(JSON.stringify(saved)));
    assert.deepEqual(reopened.snapshot().draft, saved);
    assert.equal(reopened.snapshot().validation.ok, false);
    assert.match(reopened.snapshot().validation.code, /MODEL_LIBRARY_COMPONENT_UNAVAILABLE/u);
    const before = JSON.stringify(saved);
    assert.equal(editor.setComponentProperty('inductor-1', 'inductanceHenries', -1).ok, false);
    assert.equal(JSON.stringify(editor.snapshot().draft), before);
  });
}

test('all four support profiles publish raw passives as authoring-only, never executable', () => {
  for (const profile of COMPONENT_SUPPORT_PROFILES) for (const type of TYPES) {
    const cell = componentSupportCell(profile.id, type);
    assert.equal(cell.authoringAvailable, true, `${profile.id}:${type}`);
    assert.equal(cell.executableAvailable, false, `${profile.id}:${type}`);
    assert.equal(cell.status, 'visual', `${profile.id}:${type}`);
    assert.equal(cell.projectMode, 'authoring-only', `${profile.id}:${type}`);
    assert.match(cell.limitations.join(' '), /no transient\/frequency solver/u);
  }
});
