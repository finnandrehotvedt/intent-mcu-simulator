// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCircuit } from '../src/circuit-engine.mjs';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { EXISTING_GRAPH_EDIT_SAFETY_CONTRACT as contract } from '../src/existing-graph-edit-safety-contract.mjs';
import { ProjectEditorReducer, projectFromCircuit } from '../src/project-editor.mjs';
import {
  Rp2040PicoCircuitEditor, createRp2040PicoCircuitDraft, validateRp2040PicoCircuit,
} from '../src/rp2040-pico-circuit.mjs';
import {
  Esp32C3CircuitEditor, createEsp32C3CircuitDraft, validateEsp32C3Circuit,
} from '../src/esp32c3-public-circuit.mjs';
import {
  Stm32CircuitEditor, createStm32CircuitDraft, validateStm32Circuit,
} from '../src/stm32-public-circuit.mjs';

const clone = (value) => structuredClone(value);
const endpointKey = (endpoint) => `${endpoint.component}.${endpoint.pin}`;

const narrowProfiles = Object.freeze([
  { id: 'rp2040', Editor: Rp2040PicoCircuitEditor, create: createRp2040PicoCircuitDraft,
    validate: validateRp2040PicoCircuit, prefix: 'RP2040', groundNet: 'net-ground' },
  { id: 'esp32c3', Editor: Esp32C3CircuitEditor, create: createEsp32C3CircuitDraft,
    validate: validateEsp32C3Circuit, prefix: 'C3', groundNet: 'net-ground' },
  { id: 'stm32', Editor: Stm32CircuitEditor, create: createStm32CircuitDraft,
    validate: validateStm32Circuit, prefix: 'STM32', groundNet: 'net-ground' },
]);

test('contract names the four workflows and both AVR graph editors without widening narrow profiles', () => {
  assert.equal(contract.schema, 'intent-mcu-existing-graph-edit-safety@3');
  assert.deepEqual(Object.keys(contract.profiles), ['avr', 'avrCandidate', 'rp2040', 'esp32c3', 'stm32']);
  assert.deepEqual(contract.requirements, ['W06', 'W07', 'W08', 'W10']);
  assert.deepEqual(Object.keys(contract.completion), ['w06', 'w07', 'w08', 'w10']);
  for (const id of ['rp2040', 'esp32c3', 'stm32']) {
    assert.equal(contract.profiles[id].operations.branchDelete.status, 'unavailable');
    assert.equal(contract.profiles[id].operations.duplicate.status, 'unavailable');
    assert.equal(contract.profiles[id].safety.outputContention.status, 'unavailable');
    assert.equal(contract.profiles[id].safety.arbitraryVoltageShort.status, 'unavailable');
  }
  assert.equal(contract.profiles.avrCandidate.operations.branchReconnect.status, 'supported');
  assert.equal(contract.profiles.avrCandidate.operations.duplicate.status, 'supported');
  assert.match(contract.completion.w06, /^complete:/u);
  assert.match(contract.completion.w07, /^complete:/u);
  assert.match(contract.completion.w08, /^complete:/u);
  assert.match(contract.completion.w10, /^partial:/u);
});

test('AVR branch delete, whole-net delete and duplicate remain distinct reversible transactions', () => {
  const editor = new ProjectEditorReducer(projectFromCircuit(DEFAULT_CIRCUIT));
  const apply = (command) => editor.apply({ ...command, revision: editor.revision });
  const ground = editor.project.circuit.nets.find((net) => net.id === 'net-ground-branch');
  const detached = { component: 'pot-1', pin: 'LOW' };
  const unaffected = ground.endpoints.filter((endpoint) => endpointKey(endpoint) !== endpointKey(detached))
    .map(endpointKey).sort();

  const branch = apply({ type: 'wire.branch.delete', netId: ground.id, endpoint: detached });
  assert.equal(branch.ok, true);
  assert.deepEqual(editor.project.circuit.nets.find((net) => net.id === ground.id).endpoints
    .map(endpointKey).sort(), unaffected);
  assert.equal(apply({ type: 'undo' }).ok, true);
  assert.equal(apply({ type: 'redo' }).ok, true);
  assert.equal(apply({ type: 'undo' }).ok, true);

  const whole = apply({ type: 'wire.delete', netId: ground.id });
  assert.equal(whole.ok, true);
  assert.equal(editor.project.circuit.nets.some((net) => net.id === ground.id), false);
  assert.equal(apply({ type: 'undo' }).ok, true);

  const duplicate = apply({ type: 'component.duplicate', sourceId: 'led-1', newId: 'led-proof' });
  assert.equal(duplicate.ok, true);
  assert.equal(editor.project.circuit.components.some((item) => item.id === 'led-proof'), true);
  assert.equal(editor.project.circuit.nets.some((net) => net.endpoints.some((endpoint) => endpoint.component === 'led-proof')), false);
  assert.equal(apply({ type: 'undo' }).ok, true);
  assert.equal(apply({ type: 'redo' }).ok, true);

  const before = JSON.stringify(editor.project);
  const revision = editor.revision;
  const rejected = apply({ type: 'component.duplicate', sourceId: 'led-1', newId: 'led-proof' });
  assert.equal(rejected.ok, false);
  assert.equal(editor.revision, revision);
  assert.equal(JSON.stringify(editor.project), before);
});

test('narrow fixed graphs expose no branch or duplicate operation and reject unsafe properties atomically', () => {
  for (const profile of narrowProfiles) {
    const editor = new profile.Editor();
    assert.equal(editor.snapshot().draft.nets.every((net) => net.endpoints.length === 2), true, profile.id);
    assert.equal(typeof editor.deleteBranch, 'undefined', profile.id);
    assert.equal(typeof editor.duplicateComponent, 'undefined', profile.id);
    const before = JSON.stringify(editor.snapshot());
    const revision = editor.revision;
    const rejected = editor.setComponentProperty('resistor-1', 'ohms', 1);
    assert.equal(rejected.ok, false, profile.id);
    assert.equal(rejected.code, `${profile.prefix}_COMPONENT_PROPERTY_ELECTRICAL_LIMIT`, profile.id);
    assert.equal(editor.revision, revision, profile.id);
    assert.equal(JSON.stringify(editor.snapshot()), before, profile.id);
  }
});

test('narrow move and rotate history is layout-only while electrical deletion remains build-relevant', () => {
  for (const profile of narrowProfiles) {
    const editor = new profile.Editor();
    const moved = editor.moveComponent('resistor-1', 0.55, 0.45);
    assert.equal(moved.ok, true, profile.id);
    assert.equal(moved.changeKind, 'layout', profile.id);
    const rotated = editor.rotateComponent('resistor-1');
    assert.equal(rotated.changeKind, 'layout', profile.id);
    assert.equal(editor.undo().changeKind, 'layout', profile.id);
    assert.equal(editor.redo().changeKind, 'layout', profile.id);

    editor.select({ kind: 'net', id: profile.groundNet });
    const deleted = editor.deleteSelected();
    assert.equal(deleted.ok, true, profile.id);
    assert.equal(deleted.changeKind, 'electrical', profile.id);
    assert.equal(deleted.validation.code, `${profile.prefix}_GROUND_REQUIRED`, profile.id);
    assert.equal(editor.undo().validation.ok, true, profile.id);
  }
});

test('W10 uses only representable faults and keeps authored invalid drafts fail-closed', () => {
  const shorted = clone(DEFAULT_CIRCUIT);
  shorted.nets.find((net) => net.id === 'net-5v').endpoints[1] = { component: 'board-1', pin: 'GND2' };
  assert.equal(validateCircuit(shorted).code, 'POWER_SHORT');

  const contention = clone(DEFAULT_CIRCUIT);
  contention.nets.push({ id: 'net-output-conflict', endpoints: [
    { component: 'board-1', pin: 'D3' }, { component: 'board-1', pin: 'D4' },
  ] });
  assert.equal(validateCircuit(contention, { drivers: {
    'board-1.D3': 'HIGH', 'board-1.D4': 'LOW',
  } }).code, 'OUTPUT_CONTENTION');

  for (const profile of narrowProfiles) {
    const ground = profile.create();
    ground.nets = ground.nets.filter((net) => net.id !== profile.groundNet);
    delete ground.layout.wireStyles[profile.groundNet];
    delete ground.layout.wireRoutes[profile.groundNet];
    assert.equal(profile.validate(ground).code, `${profile.prefix}_GROUND_REQUIRED`, profile.id);

    const overcurrent = profile.create();
    overcurrent.components.find((item) => item.id === 'resistor-1').properties.ohms = 1;
    assert.equal(profile.validate(overcurrent).code, `${profile.prefix}_LED_OVERCURRENT`, profile.id);
  }
});
