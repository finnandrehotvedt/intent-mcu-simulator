// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { DIODE_COMPONENT_DEFINITIONS, SCHOTTKY_DIODE_TYPE, SILICON_DIODE_TYPE,
  ZENER_DIODE_TYPE, createDiodeComponent,
  validateDiodeComponent } from '../expansion-drafts/diode-components-v1.mjs';
import { FOUNDATION_PRIMITIVE_DRAFTS } from '../expansion-drafts/foundation-primitives-v3.mjs';
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
const TYPES = [SILICON_DIODE_TYPE, SCHOTTKY_DIODE_TYPE, ZENER_DIODE_TYPE];
const IDS = ['diode-1', 'schottky-1', 'zener-1'];

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
    ['net-diode-source', { component: 'board-1', pin: '5V' }, { component: IDS[0], pin: 'ANODE' }],
    ['net-diode-silicon-schottky', { component: IDS[0], pin: 'CATHODE' }, { component: IDS[1], pin: 'ANODE' }],
    ['net-diode-schottky-zener', { component: IDS[1], pin: 'CATHODE' }, { component: IDS[2], pin: 'ANODE' }],
    ['net-diode-ground', { component: IDS[2], pin: 'CATHODE' }, { component: 'board-1', pin: 'GND1' }],
  ]) apply(session, { type: 'wire.create', net: { id, endpoints: [from, to] } });
}

test('CMP-007 promotes the existing rectifier draft and CMP-008/009 add distinct diode contracts', () => {
  assert.deepEqual(Object.keys(DIODE_COMPONENT_DEFINITIONS).sort(), [...TYPES].sort());
  const draft = FOUNDATION_PRIMITIVE_DRAFTS.find(({ type }) => type === SILICON_DIODE_TYPE);
  const silicon = DIODE_COMPONENT_DEFINITIONS[SILICON_DIODE_TYPE];
  assert.ok(draft);
  assert.deepEqual(silicon.pins.map(({ id }) => id), draft.pins.map(({ id }) => id));
  assert.deepEqual(silicon.propertyKeys, draft.properties.map(({ key }) => key));
  for (const property of draft.properties) {
    assert.deepEqual({ default: silicon.propertySchema[property.key].default,
      minimum: silicon.propertySchema[property.key].minimum,
      maximum: silicon.propertySchema[property.key].maximum },
    { default: property.default, minimum: property.minimum, maximum: property.maximum });
  }
  for (const type of TYPES) {
    const definition = DIODE_COMPONENT_DEFINITIONS[type];
    assert.deepEqual(definition.pins.map(({ id }) => id), ['ANODE', 'CATHODE']);
    assert.equal(definition.support.status, 'visual');
    assert.match(definition.artwork.provenance, /Original IntentForce SVG/u);
    assert.match(definition.support.limitations.join(' '), /No nonlinear I-V curve/u);
    assert.equal(CANDIDATE_UI_COMPONENTS[type], definition);
    assert.equal(BOUNDED_3V3_UI_COMPONENTS[type], definition);
    assert.equal(validateDiodeComponent(createDiodeComponent(type, `unit-${type.split('.')[1]}`)), true);
  }
});

test('AVR candidate edits and reopens the diode chain while Build and Run fail closed', () => {
  const session = emptyCandidateSession();
  addCandidateChain(session);
  assert.deepEqual(session.runnable, {
    ok: false, code: 'DIODE_NONLINEAR_MODEL_UNAVAILABLE', details: [...IDS].sort(),
  });
  apply(session, { type: 'component.property.set', componentId: 'diode-1',
    key: 'nominalForwardVoltageVolts', value: 0.65 });
  apply(session, { type: 'component.property.set', componentId: 'schottky-1',
    key: 'maxReverseVoltageVolts', value: 60 });
  apply(session, { type: 'component.property.set', componentId: 'zener-1',
    key: 'zenerVoltageVolts', value: 6.2 });
  const saved = session.saveText();
  const reopened = openCandidateUiSession(saved);
  assert.equal(reopened.ok, true, reopened.code);
  assert.equal(reopened.session.saveText(), saved);
  assert.deepEqual(reopened.session.runnable, session.runnable);
  assert.equal(reopened.session.runtimeSupport.filter(({ componentId }) => IDS.includes(componentId)).length, 3);

  const before = session.saveText();
  const rejected = session.apply({ type: 'component.property.set', revision: session.revision,
    componentId: 'zener-1', key: 'zenerVoltageVolts', value: 201 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'PROJECT_CONTACT_DIODE_STATE');
  assert.equal(session.saveText(), before);
  apply(session, { type: 'component.remove', componentId: 'schottky-1' });
  apply(session, { type: 'undo' });
  assert.equal(session.saveText(), before);
});

test('canonical API component.add creates complete diode data for AVR candidate', () => {
  const session = emptyCandidateSession();
  const commands = prepareApiBatch({ profile: AVR, circuit: session.visualProject.circuit },
    TYPES.map((type, index) => ({ command: 'component.add', id: IDS[index], type,
      position: { x: 0.4 + index * 0.2, y: 0.5, rotation: 0 } })));
  for (const command of commands) apply(session, command);
  assert.deepEqual(session.visualProject.circuit.components.filter(({ id }) => IDS.includes(id))
    .map(({ id, properties }) => ({ id, properties })), [
    { id: 'diode-1', properties: { nominalForwardVoltageVolts: 0.7, maxReverseVoltageVolts: 50 } },
    { id: 'schottky-1', properties: { nominalForwardVoltageVolts: 0.3, maxReverseVoltageVolts: 40 } },
    { id: 'zener-1', properties: { nominalForwardVoltageVolts: 0.7, zenerVoltageVolts: 5.1, maxPowerWatts: 0.5 } },
  ]);
  assert.equal(session.runnable.code, 'DIODE_NONLINEAR_MODEL_UNAVAILABLE');
});

for (const profile of [
  { name: 'Pico', Editor: Rp2040PicoCircuitEditor, board: 'pico-1', source: 'GP1', ground: 'GND8' },
  { name: 'ESP32-C3', Editor: Esp32C3CircuitEditor, board: 'c3-1', source: 'GPIO3', ground: 'GND8' },
  { name: 'STM32F429ZI', Editor: Stm32CircuitEditor, board: 'stm32-1', source: 'PB1', ground: 'GND20' },
]) {
  test(`${profile.name} persists the exact three-diode authoring-only chain`, () => {
    const editor = new profile.Editor();
    TYPES.forEach((type) => assert.equal(editor.addMissingComponent(type).ok, true));
    assert.equal(editor.connectEndpoints({ component: profile.board, pin: profile.source },
      { component: 'diode-1', pin: 'ANODE' }).ok, true);
    assert.equal(editor.connectEndpoints({ component: 'diode-1', pin: 'CATHODE' },
      { component: 'schottky-1', pin: 'ANODE' }).ok, true);
    assert.equal(editor.connectEndpoints({ component: 'schottky-1', pin: 'CATHODE' },
      { component: 'zener-1', pin: 'ANODE' }).ok, true);
    assert.equal(editor.connectEndpoints({ component: 'zener-1', pin: 'CATHODE' },
      { component: profile.board, pin: profile.ground }).ok, true);
    assert.equal(editor.setComponentProperty('zener-1', 'zenerVoltageVolts', 12).ok, true);
    const saved = editor.snapshot().draft;
    const reopened = new profile.Editor(structuredClone(saved));
    assert.deepEqual(reopened.snapshot().draft, saved);
    assert.equal(reopened.snapshot().validation.ok, false);
    assert.match(reopened.snapshot().validation.code, /MODEL_LIBRARY_COMPONENT_UNAVAILABLE/u);
    const before = JSON.stringify(saved);
    assert.equal(editor.setComponentProperty('schottky-1', 'nominalForwardVoltageVolts', 0.9).ok, false);
    assert.equal(JSON.stringify(editor.snapshot().draft), before);
  });
}

test('all four profiles publish all three diodes as authoring-only and never executable', () => {
  for (const profile of COMPONENT_SUPPORT_PROFILES) for (const type of TYPES) {
    const cell = componentSupportCell(profile.id, type);
    assert.equal(cell.authoringAvailable, true, `${profile.id}:${type}`);
    assert.equal(cell.executableAvailable, false, `${profile.id}:${type}`);
    assert.equal(cell.status, 'visual', `${profile.id}:${type}`);
    assert.equal(cell.projectMode, 'authoring-only', `${profile.id}:${type}`);
    assert.match(cell.limitations.join(' '), /no nonlinear I-V\/reverse-breakdown model/u);
  }
});

