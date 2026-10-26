// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { Esp32C3CircuitEditor } from '../src/esp32c3-public-circuit.mjs';
import {
  BOUNDED_COMPONENT_CATALOG_SCHEMA, BOUNDED_LED_TYPE, BOUNDED_RESISTOR_TYPE,
  GROUND_REFERENCE_3V3_TYPE, MOMENTARY_BUTTON_3V3_TYPE, POTENTIOMETER_3V3_TYPE, TOGGLE_SWITCH_3V3_TYPE,
} from '../src/named-series-led-circuit-editor.mjs';
import { Rp2040PicoCircuitEditor } from '../src/rp2040-pico-circuit.mjs';
import { Stm32CircuitEditor } from '../src/stm32-public-circuit.mjs';

const profiles = [
  { name: 'Pico', Editor: Rp2040PicoCircuitEditor, board: 'pico-1', boardType: 'board.rp2040-pico-v1', prefix: 'RP2040' },
  { name: 'ESP32-C3', Editor: Esp32C3CircuitEditor, board: 'c3-1', boardType: 'board.esp32-c3-devmodule-v1', prefix: 'C3' },
  { name: 'STM32', Editor: Stm32CircuitEditor, board: 'stm32-1', boardType: 'board.stm32f429zi-nucleo144-v1', prefix: 'STM32' },
];

for (const profile of profiles) {
  test(`${profile.name} exposes its fixed board plus bounded 3.3 V authoring catalogue`, () => {
    const editor = new profile.Editor();
    const catalog = editor.snapshot().catalog;
    assert.equal(catalog.schema, BOUNDED_COMPONENT_CATALOG_SCHEMA);
    assert.equal(catalog.profile, profile.boardType);
    assert.deepEqual(catalog.parts.map((part) => part.type), [
      profile.boardType, BOUNDED_RESISTOR_TYPE, BOUNDED_LED_TYPE,
      GROUND_REFERENCE_3V3_TYPE, MOMENTARY_BUTTON_3V3_TYPE, TOGGLE_SWITCH_3V3_TYPE, POTENTIOMETER_3V3_TYPE,
    ]);
    assert.equal(catalog.parts[0].fixed, true);
    assert.equal(catalog.parts[0].addable, false);
    assert(catalog.parts.slice(1, 3).every((part) => part.present && !part.addable));
    assert(catalog.parts.slice(3).every((part) => !part.present && part.addable));
    assert.equal(editor.addMissingComponent(profile.boardType).code, `${profile.prefix}_BOARD_FIXED`);
    assert.equal(editor.addMissingComponent('button.momentary-v1').code, `${profile.prefix}_COMPONENT_UNSUPPORTED`);
    assert.equal(editor.addMissingComponent(BOUNDED_RESISTOR_TYPE).code, `${profile.prefix}_COMPONENT_EXISTS`);
  });

  for (const [id, type, missingCode] of [
    ['resistor-1', BOUNDED_RESISTOR_TYPE, `${profile.prefix}_SERIES_RESISTOR_REQUIRED`],
    ['led-1', BOUNDED_LED_TYPE, `${profile.prefix}_PATH_OPEN`],
  ]) {
    test(`${profile.name} restores one deleted ${type} after history-free reopen`, () => {
      const replacementId = `${id.split('-')[0]}-2`;
      const editor = new profile.Editor();
      editor.select({ kind: 'component', id });
      const deleted = editor.deleteSelected();
      assert.equal(deleted.ok, true);
      assert.equal(deleted.validation.code, missingCode);

      const reopened = new profile.Editor(structuredClone(deleted.draft));
      assert.equal(reopened.snapshot().canUndo, false);
      assert.equal(reopened.snapshot().catalog.parts.find((part) => part.type === type).addable, true);
      const beforeAdd = reopened.snapshot();
      assert.equal(reopened.addMissingComponent(type, { x: Number.NaN, y: 0.4 }).code,
        `${profile.prefix}_COMPONENT_ADD_POSITION_INVALID`);
      assert.deepEqual(reopened.snapshot(), beforeAdd);
      const added = reopened.addMissingComponent(type, { x: 0.73, y: 0.61 });
      assert.equal(added.ok, true);
      assert.equal(added.componentId, replacementId);
      assert.equal(added.draft.components.filter((component) => component.type === type).length, 1);
      assert.equal(added.draft.nets.some((net) => net.endpoints.some((endpoint) => endpoint.component === id)), false);
      assert.equal(added.selection.id, replacementId);
      assert.deepEqual(added.draft.layout.positions[replacementId], { x: 0.73, y: 0.61, rotation: 0 });
      assert.equal(added.canUndo, true);
      assert.equal(reopened.addMissingComponent(type).code, `${profile.prefix}_COMPONENT_EXISTS`);
      assert.equal(reopened.undo().draft.components.some((component) => component.type === type), false);
      assert.equal(reopened.redo().draft.components.some((component) => component.id === replacementId), true);
    });
  }

  test(`${profile.name} bounds resistor and LED properties against its electrical model`, () => {
    const editor = new profile.Editor();
    const initial = editor.snapshot();
    let result = editor.setComponentProperty('resistor-1', 'ohms', 108);
    assert.equal(result.ok, false);
    assert.equal(result.code, `${profile.prefix}_COMPONENT_PROPERTY_ELECTRICAL_LIMIT`);
    assert.equal(editor.revision, initial.revision);
    assert.equal(editor.snapshot().draft.components.find((item) => item.id === 'resistor-1').properties.ohms, 220);

    result = editor.setComponentProperty('resistor-1', 'ohms', 109);
    assert.equal(result.ok, true);
    assert.equal(result.validation.ok, true);
    assert.equal(result.draft.components.find((item) => item.id === 'resistor-1').label, '109 Ω series resistor');

    result = editor.setComponentProperty('led-1', 'color', 'blue');
    assert.equal(result.ok, true);
    assert.equal(result.validation.ok, true);
    assert.equal(result.draft.components.find((item) => item.id === 'led-1').label, 'External blue LED');

    result = editor.setComponentProperty('resistor-1', 'ohms', 30);
    assert.equal(result.ok, true);
    assert.equal(result.validation.ok, true);
    assert.equal(editor.undo().draft.components.find((item) => item.id === 'resistor-1').properties.ohms, 109);
    assert.equal(editor.redo().draft.components.find((item) => item.id === 'resistor-1').properties.ohms, 30);

    const beforeInvalid = editor.snapshot();
    assert.equal(editor.setComponentProperty('led-1', 'color', 'violet').code,
      `${profile.prefix}_COMPONENT_PROPERTY_UNSUPPORTED`);
    assert.equal(editor.setComponentProperty('resistor-1', 'watts', 0.25).code,
      `${profile.prefix}_COMPONENT_PROPERTY_UNSUPPORTED`);
    assert.deepEqual(editor.snapshot().draft, beforeInvalid.draft);
    assert.equal(editor.revision, beforeInvalid.revision);
  });

  test(`${profile.name} rejects recovery defaults that conflict with the remaining bounded property`, () => {
    const editor = new profile.Editor();
    assert.equal(editor.setComponentProperty('led-1', 'color', 'blue').ok, true);
    assert.equal(editor.setComponentProperty('resistor-1', 'ohms', 30).ok, true);
    editor.select({ kind: 'component', id: 'led-1' });
    assert.equal(editor.deleteSelected().ok, true);
    const beforeRejectedAdd = editor.snapshot();
    const rejected = editor.addMissingComponent(BOUNDED_LED_TYPE);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, `${profile.prefix}_COMPONENT_PROPERTY_ELECTRICAL_LIMIT`);
    assert.equal(editor.snapshot().draft.components.some((item) => item.id === 'led-1'), false);
    assert.equal(editor.revision, beforeRejectedAdd.revision);
    assert.equal(editor.setComponentProperty('resistor-1', 'ohms', 109).ok, true);
    assert.equal(editor.addMissingComponent(BOUNDED_LED_TYPE).ok, true);
  });
}
