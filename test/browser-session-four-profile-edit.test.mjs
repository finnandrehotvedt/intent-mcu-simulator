// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyProject, ProjectEditorReducer } from '../src/project-editor.mjs';
import { Esp32C3CircuitEditor } from '../src/esp32c3-public-circuit.mjs';
import { Rp2040PicoCircuitEditor } from '../src/rp2040-pico-circuit.mjs';
import { Stm32CircuitEditor } from '../src/stm32-public-circuit.mjs';

const profiles = [
  ['RP2040 Pico', () => new Rp2040PicoCircuitEditor()],
  ['ESP32-C3', () => new Esp32C3CircuitEditor()],
  ['STM32F429ZI', () => new Stm32CircuitEditor()],
];

for (const [label, create] of profiles) test(`${label} canonical API batch is atomic and exact-transaction undo works`, () => {
  const editor = create();
  const before = JSON.stringify(editor.snapshot().draft);
  const transactionId = `api-tx:test:${label}`;
  const applied = editor.applyApiBatch([{ command: 'component.property.set', component_id: 'resistor-1',
    key: 'ohms', value: 330 }], transactionId);
  assert.equal(applied.ok, true);
  assert.equal(editor.snapshot().draft.components.find((item) => item.id === 'resistor-1').properties.ohms, 330);
  assert.equal(editor.undoApi('wrong').ok, false);
  assert.equal(editor.undoApi(transactionId).ok, true);
  assert.equal(JSON.stringify(editor.snapshot().draft), before);

  const unchanged = JSON.stringify(editor.snapshot().draft);
  const rejected = editor.applyApiBatch([{ command: 'component.add', id: 'foreign-1',
    type: 'sensor.unsupported-v1', position: { x: 0.5, y: 0.5, rotation: 0 } }], 'api-tx:bad');
  assert.equal(rejected.ok, false);
  assert.equal(JSON.stringify(editor.snapshot().draft), unchanged);
});

test('AVR canonical owner remains a ProjectEditorReducer transaction path', () => {
  const editor = new ProjectEditorReducer(createEmptyProject());
  assert.equal(editor.revision, 0);
});
