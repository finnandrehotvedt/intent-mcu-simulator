// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createComponent } from '../src/circuit-engine.mjs';
import { createEmptyProject, ProjectEditorReducer } from '../src/project-editor.mjs';
import { prepareApiBatch } from '../src/browser-session-edit.mjs';
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
  assert.equal(editor.snapshot().draft.components.find((item) => item.id === 'resistor-1').label,
    '330 Ω series resistor');
  assert.equal(editor.undoApi('wrong').ok, false);
  assert.equal(editor.undoApi(transactionId).ok, true);
  assert.equal(JSON.stringify(editor.snapshot().draft), before);

  const rejectedProperty = editor.applyApiBatch([
    { command: 'component.property.set', component_id: 'resistor-1', key: 'ohms', value: 330 },
    { command: 'component.property.set', component_id: 'resistor-1', key: 'ohms', value: 0 },
  ], `${transactionId}:negative-property`);
  assert.equal(rejectedProperty.ok, false);
  assert.match(rejectedProperty.code, /(?:RP2040|C3|STM32)_API_PROPERTY_INVALID/u);
  assert.equal(JSON.stringify(editor.snapshot().draft), before);

  const ledTransaction = `${transactionId}:led`;
  assert.equal(editor.applyApiBatch([{ command: 'component.property.set', component_id: 'led-1',
    key: 'color', value: 'blue' }], ledTransaction).ok, true);
  assert.equal(editor.snapshot().draft.components.find((item) => item.id === 'led-1').label,
    'External blue LED');
  assert.equal(editor.undoApi(ledTransaction).ok, true);
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

test('documented resistor property example is canonical and exactly undoable on all four profiles', async () => {
  const protocol = await readFile(new URL('../docs/API-SESSION-V1-PUBLIC.txt', import.meta.url), 'utf8');
  const source = protocol.match(/\{"command":"component\.property\.set"[^}]+\}/u)?.[0];
  assert.ok(source, 'documented property example missing');
  const operation = JSON.parse(source);
  assert.deepEqual(operation, { command: 'component.property.set', component_id: 'resistor-1',
    key: 'ohms', value: 470 });
  assert.match(protocol, /Read components\.catalog[\s\S]+exact propertyKeys and\s+propertySchema/u);
  assert.doesNotMatch(protocol, /resistance_ohms/u);

  const avr = new ProjectEditorReducer(createEmptyProject());
  const endpoint = (component, pin) => ({ component, pin });
  assert.equal(avr.apply({ type: 'edit.batch', revision: 0, transactionId: 'api-doc-setup', commands: [
    { type: 'component.add', component: createComponent('board-1', 'board.atmega328p-16mhz-v1'),
      position: { x: 0.2, y: 0.4, rotation: 0 } },
    { type: 'component.add', component: createComponent('resistor-1', 'resistor.fixed-v1'),
      position: { x: 0.5, y: 0.4, rotation: 0 } },
    { type: 'component.add', component: createComponent('led-1', 'led.basic-v1'),
      position: { x: 0.8, y: 0.4, rotation: 0 } },
    { type: 'wire.create', net: { id: 'net-drive', endpoints: [endpoint('board-1', 'D13'), endpoint('resistor-1', 'A')] } },
    { type: 'wire.create', net: { id: 'net-series', endpoints: [endpoint('resistor-1', 'B'), endpoint('led-1', 'ANODE')] } },
    { type: 'wire.create', net: { id: 'net-ground', endpoints: [endpoint('led-1', 'CATHODE'), endpoint('board-1', 'GND1')] } },
  ] }).ok, true);
  const avrBefore = JSON.stringify(avr.project); const avrTransaction = 'api-doc-avr';
  assert.equal(avr.project.circuit.components.find(({ id }) => id === 'resistor-1').properties.ohms, 220);
  const avrApplied = avr.apply({ type: 'edit.batch', revision: 1, transactionId: avrTransaction,
    commands: prepareApiBatch(avr.project, [operation]) });
  assert.equal(avrApplied.ok, true); assert.equal(avrApplied.project.circuit.components
    .find(({ id }) => id === 'resistor-1').properties.ohms, 470);
  assert.equal(avr.apply({ type: 'edit.undo', revision: 2, transactionId: avrTransaction }).ok, true);
  assert.equal(JSON.stringify(avr.project), avrBefore);

  for (const [label, create] of profiles) {
    const editor = create(); const before = JSON.stringify(editor.snapshot().draft);
    assert.equal(editor.snapshot().draft.components.find(({ id }) => id === 'resistor-1').properties.ohms, 220);
    const transactionId = `api-doc-${label}`;
    const applied = editor.applyApiBatch([operation], transactionId);
    assert.equal(applied.ok, true, `${label}: ${applied.code}`);
    assert.equal(applied.draft.components.find(({ id }) => id === 'resistor-1').properties.ohms, 470);
    assert.equal(editor.undoApi(transactionId).ok, true);
    assert.equal(JSON.stringify(editor.snapshot().draft), before);
  }
});
