// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { createComponent } from '../src/circuit-engine.mjs';
import { createEmptyProject, ProjectEditorReducer } from '../src/project-editor.mjs';

const endpoint = (component, pin) => ({ component, pin });
const transaction = 'transaction-api03-0001';
const commands = [
  { type: 'component.add', component: createComponent('board-1', 'board.atmega328p-16mhz-v1'),
    position: { x: 0.2, y: 0.3, rotation: 0 } },
  { type: 'component.add', component: createComponent('resistor-1', 'resistor.fixed-v1'),
    position: { x: 0.5, y: 0.3, rotation: 0 } },
  { type: 'component.add', component: createComponent('led-1', 'led.basic-v1'),
    position: { x: 0.75, y: 0.3, rotation: 0 } },
  { type: 'wire.create', net: { id: 'net-drive', endpoints: [endpoint('board-1', 'D13'), endpoint('resistor-1', 'A')] } },
  { type: 'wire.create', net: { id: 'net-series', endpoints: [endpoint('resistor-1', 'B'), endpoint('led-1', 'ANODE')] } },
  { type: 'wire.create', net: { id: 'net-ground', endpoints: [endpoint('led-1', 'CATHODE'), endpoint('board-1', 'GND1')] } },
];

test('API batch commits once and exact head undo/redo is safe', () => {
  const editor = new ProjectEditorReducer(createEmptyProject());
  const before = structuredClone(editor.project);
  const applied = editor.apply({ type: 'edit.batch', revision: 0, transactionId: transaction, commands });
  assert.equal(applied.ok, true); assert.equal(applied.revision, 1);
  assert.equal(applied.project.circuit.components.length, 3);
  assert.equal(applied.project.circuit.nets.length, 3);
  const undone = editor.apply({ type: 'edit.undo', revision: 1, transactionId: transaction });
  assert.equal(undone.ok, true); assert.deepEqual(undone.project, before);
  const redone = editor.apply({ type: 'edit.redo', revision: 2, transactionId: transaction });
  assert.equal(redone.ok, true); assert.equal(redone.project.circuit.components.length, 3);
  editor.apply({ type: 'project.rename', revision: 3, name: 'Manual later edit' });
  assert.equal(editor.apply({ type: 'edit.undo', revision: 4,
    transactionId: transaction }).code, 'API_UNDO_CONFLICT');
});

test('invalid or stale batch preserves exact bytes and revision', () => {
  const editor = new ProjectEditorReducer(createEmptyProject());
  const before = JSON.stringify(editor.project);
  const invalid = editor.apply({ type: 'edit.batch', revision: 0, transactionId: transaction,
    commands: commands.slice(0, -1) });
  assert.equal(invalid.ok, false); assert.equal(editor.revision, 0);
  assert.equal(JSON.stringify(editor.project), before);
  assert.equal(editor.apply({ type: 'edit.batch', revision: 1,
    transactionId: transaction, commands }).code, 'EDITOR_STALE_REVISION');
  assert.equal(JSON.stringify(editor.project), before);
});

test('AVR duplicate honors the exact API-requested position', () => {
  const editor = new ProjectEditorReducer(createEmptyProject());
  const position = { x: 0.81, y: 0.67, rotation: 90 };
  assert.equal(editor.apply({ type: 'component.add', revision: 0,
    component: createComponent('resistor-1', 'resistor.fixed-v1'),
    position: { x: 0.4, y: 0.4, rotation: 0 } }).ok, true);
  const result = editor.apply({ type: 'component.duplicate', revision: 1,
    sourceId: 'resistor-1', newId: 'resistor-2', position });
  assert.equal(result.ok, true);
  assert.deepEqual(result.project.layout.positions['resistor-2'], position);
});
