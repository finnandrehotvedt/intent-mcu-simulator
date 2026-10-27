// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { createEditableContactDraft } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import { MINI_BREADBOARD_TYPE, TERMINAL_BLOCK_2_POSITION_TYPE,
  CONNECTION_HARDWARE_DEFINITIONS, createConnectionHardwareComponent,
  validateConnectionHardwareAuthoringGraph,
  validateConnectionHardwareComponent } from '../expansion-drafts/connection-hardware-components-v1.mjs';
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
const TYPES = [MINI_BREADBOARD_TYPE, TERMINAL_BLOCK_2_POSITION_TYPE];
const IDS = ['breadboard-1', 'terminal-block-1'];
function apply(session, command) {
  const result = session.apply({ ...command, revision: session.revision });
  assert.equal(result.ok, true, command.type + ':' + result.code); return result;
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
    position: { x: 0.38 + index * 0.3, y: 0.5, rotation: 0 } }));
  apply(session, { type: 'wire.create', net: { id: 'net-hardware-source',
    endpoints: [{ component: 'board-1', pin: 'D2' }, { component: 'breadboard-1', pin: 'L1' }] } });
  apply(session, { type: 'wire.branch', netId: 'net-hardware-source',
    endpoint: { component: 'terminal-block-1', pin: 'P1' }, junctionId: 'junction-hardware-source' });
  apply(session, { type: 'wire.create', net: { id: 'net-hardware-ground',
    endpoints: [{ component: 'board-1', pin: 'GND1' }, { component: 'breadboard-1', pin: 'R1' }] } });
  apply(session, { type: 'wire.branch', netId: 'net-hardware-ground',
    endpoint: { component: 'terminal-block-1', pin: 'P2' }, junctionId: 'junction-hardware-ground' });
}

test('CMP-017/018 define exact isolated physical contact groups', () => {
  const breadboard = CONNECTION_HARDWARE_DEFINITIONS[MINI_BREADBOARD_TYPE];
  const terminalBlock = CONNECTION_HARDWARE_DEFINITIONS[TERMINAL_BLOCK_2_POSITION_TYPE];
  assert.deepEqual(breadboard.pins.map(({ id }) => id),
    ['L1', 'R1', 'L2', 'R2', 'L3', 'R3', 'L4', 'R4']);
  assert.deepEqual(breadboard.internalTerminalGroups[0],
    { pin: 'L1', terminals: ['A1', 'B1', 'C1', 'D1', 'E1'] });
  assert.deepEqual(breadboard.internalTerminalGroups[1],
    { pin: 'R1', terminals: ['F1', 'G1', 'H1', 'I1', 'J1'] });
  assert.equal(new Set(breadboard.internalTerminalGroups.flatMap(({ terminals }) => terminals)).size, 40);
  breadboard.pins.forEach((pin, index) => {
    assert.equal(pin.anchor.x, index % 2 === 0 ? 6 / 240 : 234 / 240);
    assert.equal(pin.anchor.y, (29 + Math.floor(index / 2) * 25) / 130);
  });
  assert.deepEqual(terminalBlock.internalTerminalGroups, [
    { pin: 'P1', terminals: ['P1-WIRE', 'P1-PCB'] },
    { pin: 'P2', terminals: ['P2-WIRE', 'P2-PCB'] },
  ]);
  assert.deepEqual(terminalBlock.pins.map(({ anchor }) => anchor),
    [{ x: 38 / 150, y: 93 / 100 }, { x: 112 / 150, y: 93 / 100 }]);
  for (const type of TYPES) {
    const definition = CONNECTION_HARDWARE_DEFINITIONS[type];
    assert.equal(definition.support.status, 'visual');
    assert.match(definition.artwork.provenance, /Original IntentForce SVG/u);
    assert.equal(CANDIDATE_UI_COMPONENTS[type], definition);
    assert.equal(BOUNDED_3V3_UI_COMPONENTS[type], definition);
    assert.equal(validateConnectionHardwareComponent(
      createConnectionHardwareComponent(type, 'unit-' + type.split('.')[1])), true);
  }
  const unknown = validateConnectionHardwareAuthoringGraph({ components: [
    createConnectionHardwareComponent(MINI_BREADBOARD_TYPE, 'breadboard-1'),
  ], nets: [{ id: 'bad', endpoints: [{ component: 'breadboard-1', pin: 'POWER-RAIL' }] }] });
  assert.deepEqual(unknown, { ok: false, code: 'CONNECTION_HARDWARE_AUTHORING_PIN_UNKNOWN',
    details: ['breadboard-1', 'POWER-RAIL'] });
});

test('AVR candidate branches exact groups, reopens them and fails Build/Run closed', () => {
  const session = emptyCandidateSession(); addCandidateNetwork(session);
  assert.deepEqual(session.runnable, { ok: false, code: 'CONNECTION_HARDWARE_MODEL_UNAVAILABLE',
    details: [...IDS].sort() });
  assert.deepEqual(session.visualProject.circuit.nets.map(({ endpoints }) => endpoints.length), [3, 3]);
  const saved = session.saveText(); const reopened = openCandidateUiSession(saved);
  assert.equal(reopened.ok, true, reopened.code); assert.equal(reopened.session.saveText(), saved);
  assert.deepEqual(reopened.session.runnable, session.runnable);
  assert.equal(reopened.session.runtimeSupport.filter(({ componentId }) => IDS.includes(componentId)).length, 2);
  const before = session.saveText();
  const rejected = session.apply({ type: 'component.property.set', revision: session.revision,
    componentId: 'breadboard-1', key: 'powerRails', value: true });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'EDITOR_PROPERTY_UNSUPPORTED');
  assert.equal(session.saveText(), before);
  apply(session, { type: 'component.remove', componentId: 'breadboard-1' });
  apply(session, { type: 'undo' }); assert.equal(session.saveText(), before);
});

test('canonical API component.add creates immutable connection-hardware data', () => {
  const session = emptyCandidateSession();
  const commands = prepareApiBatch({ profile: AVR, circuit: session.visualProject.circuit },
    TYPES.map((type, index) => ({ command: 'component.add', id: IDS[index], type,
      position: { x: 0.38 + index * 0.3, y: 0.5, rotation: 0 } })));
  for (const command of commands) apply(session, command);
  assert.deepEqual(session.visualProject.circuit.components.filter(({ id }) => IDS.includes(id))
    .map(({ id, properties, controls }) => ({ id, properties, controls }))
    .sort((left, right) => left.id.localeCompare(right.id)), [
    { id: 'breadboard-1', properties: {}, controls: {} },
    { id: 'terminal-block-1', properties: {}, controls: {} },
  ]);
  assert.equal(session.runnable.code, 'CONNECTION_HARDWARE_MODEL_UNAVAILABLE');
});

for (const profile of [
  { name: 'Pico', Editor: Rp2040PicoCircuitEditor, board: 'pico-1', source: 'GP1', ground: 'GND8' },
  { name: 'ESP32-C3', Editor: Esp32C3CircuitEditor, board: 'c3-1', source: 'GPIO3', ground: 'GND8' },
  { name: 'STM32F429ZI', Editor: Stm32CircuitEditor, board: 'stm32-1', source: 'PB1', ground: 'GND20' },
]) {
  test(profile.name + ' persists two three-endpoint connection groups', () => {
    const editor = new profile.Editor();
    for (const componentId of ['resistor-1', 'led-1']) {
      editor.select({ kind: 'component', id: componentId });
      assert.equal(editor.deleteSelected().ok, true);
    }
    TYPES.forEach((type) => assert.equal(editor.addMissingComponent(type).ok, true));
    const source = editor.connectEndpoints({ component: profile.board, pin: profile.source },
      { component: 'breadboard-1', pin: 'L1' });
    assert.equal(source.ok, true); assert.equal(editor.branchEndpoint(source.netId,
      { component: 'terminal-block-1', pin: 'P1' }).ok, true);
    const ground = editor.connectEndpoints({ component: profile.board, pin: profile.ground },
      { component: 'breadboard-1', pin: 'R1' });
    assert.equal(ground.ok, true); assert.equal(editor.branchEndpoint(ground.netId,
      { component: 'terminal-block-1', pin: 'P2' }).ok, true);
    const saved = editor.snapshot().draft; const reopened = new profile.Editor(structuredClone(saved));
    assert.deepEqual(reopened.snapshot().draft, saved);
    assert.deepEqual(saved.nets.map(({ endpoints }) => endpoints.length), [3, 3]);
    assert.equal(reopened.snapshot().validation.ok, false);
    assert.match(reopened.snapshot().validation.code, /MODEL_LIBRARY_COMPONENT_UNAVAILABLE/u);
  });
}

test('all four profiles publish both connection parts as authoring-only', () => {
  for (const profile of COMPONENT_SUPPORT_PROFILES) for (const type of TYPES) {
    const cell = componentSupportCell(profile.id, type);
    assert.equal(cell.authoringAvailable, true, profile.id + ':' + type);
    assert.equal(cell.executableAvailable, false, profile.id + ':' + type);
    assert.equal(cell.status, 'visual', profile.id + ':' + type);
    assert.equal(cell.projectMode, 'authoring-only', profile.id + ':' + type);
    assert.match(cell.limitations.join(' '), /explicit contact groups only/u);
  }
});
