// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareApiBatch } from '../src/browser-session-edit.mjs';
import { BOUNDED_3V3_UI_COMPONENTS, POTENTIOMETER_3V3_TYPE } from '../src/bounded-3v3-authoring-contracts.mjs';
import { Esp32C3CircuitEditor, ESP32C3_BOARD_DEFINITION } from '../src/esp32c3-public-circuit.mjs';
import { Rp2040PicoCircuitEditor, RP2040_PICO_BOARD_DEFINITION } from '../src/rp2040-pico-circuit.mjs';
import { Stm32CircuitEditor, STM32_BOARD_DEFINITION } from '../src/stm32-public-circuit.mjs';

const profiles = [
  { name: 'Pico', Editor: Rp2040PicoCircuitEditor, board: RP2040_PICO_BOARD_DEFINITION,
    boardId: 'pico-1', analoguePin: 'GP26' },
  { name: 'ESP32-C3', Editor: Esp32C3CircuitEditor, board: ESP32C3_BOARD_DEFINITION,
    boardId: 'c3-1', analoguePin: 'GPIO0' },
  { name: 'STM32', Editor: Stm32CircuitEditor, board: STM32_BOARD_DEFINITION,
    boardId: 'stm32-1', analoguePin: 'PB0', occupiedNet: 'net-pb0' },
];

for (const profile of profiles) {
  test(`${profile.name} authors, persists and reverses a named-pin 3.3 V potentiometer`, () => {
    const analoguePin = profile.board.pins.find(({ id }) => id === profile.analoguePin);
    assert(analoguePin.signals.includes('analogue.input'));

    const editor = new profile.Editor();
    const added = editor.addMissingComponent(POTENTIOMETER_3V3_TYPE, { x: 0.44, y: 0.72 });
    assert.equal(added.ok, true);
    const catalogPart = added.catalog.parts.find(({ type }) => type === POTENTIOMETER_3V3_TYPE);
    assert.deepEqual(BOUNDED_3V3_UI_COMPONENTS[POTENTIOMETER_3V3_TYPE].pins.map(({ id }) => id),
      ['HIGH', 'WIPER', 'LOW']);
    assert.match(catalogPart.limitation, /Authoring-only/u);
    assert.equal(editor.setComponentProperty('potentiometer-1', 'ohms', 47_000).ok, true);

    if (profile.occupiedNet) {
      editor.select({ kind: 'net', id: profile.occupiedNet });
      assert.equal(editor.deleteSelected().ok, true);
    }
    const connected = editor.connectEndpoints(
      { component: profile.boardId, pin: profile.analoguePin },
      { component: 'potentiometer-1', pin: 'WIPER' },
    );
    assert.equal(connected.ok, true);

    const reopened = new profile.Editor(structuredClone(editor.snapshot().draft));
    const restored = reopened.snapshot().draft.components.find(({ id }) => id === 'potentiometer-1');
    assert.deepEqual(restored.properties, { ohms: 47_000, taper: 'linear' });
    assert(reopened.snapshot().draft.nets.some(({ endpoints }) => endpoints.some(
      ({ component, pin }) => component === 'potentiometer-1' && pin === 'WIPER')));

    const beforeInvalid = reopened.snapshot();
    assert.equal(reopened.setComponentProperty('potentiometer-1', 'ohms', 0).ok, false);
    assert.deepEqual(reopened.snapshot().draft, beforeInvalid.draft);
    reopened.select({ kind: 'component', id: 'potentiometer-1' });
    assert.equal(reopened.deleteSelected().ok, true);
    assert.equal(reopened.undo().draft.components.some(({ id }) => id === 'potentiometer-1'), true);
    assert.equal(reopened.redo().draft.components.some(({ id }) => id === 'potentiometer-1'), false);
  });

  test(`${profile.name} canonical API can add and configure the same potentiometer atomically`, () => {
    const editor = new profile.Editor();
    const project = editor.snapshot().draft;
    const request = [
      { command: 'component.add', id: 'potentiometer-1', type: POTENTIOMETER_3V3_TYPE,
        position: { x: 0.45, y: 0.7, rotation: 0 } },
      { command: 'component.property.set', component_id: 'potentiometer-1', key: 'ohms', value: 22_000 },
    ];
    const prepared = prepareApiBatch({ boardProfile: project.boardProfile, circuit: project }, request);
    assert.equal(prepared[0].component.type, POTENTIOMETER_3V3_TYPE);
    assert.equal(prepared[1].value, 22_000);
    const result = editor.applyApiBatch(request, `pot-api-${profile.name.toLowerCase()}`);
    assert.equal(result.ok, true);
    assert.equal(result.draft.components.find(({ id }) => id === 'potentiometer-1').properties.ohms, 22_000);
    assert.equal(editor.undoApi(result.transactionId).draft.components.some(({ id }) => id === 'potentiometer-1'), false);
    assert.equal(editor.redoApi(result.transactionId).draft.components.some(({ id }) => id === 'potentiometer-1'), true);
  });
}
