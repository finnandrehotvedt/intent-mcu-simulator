// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ELECTROLYTIC_CAPACITOR_TYPE, FIXED_INDUCTOR_TYPE, NONPOLAR_CAPACITOR_TYPE,
} from '../expansion-drafts/passive-energy-storage-components-v1.mjs';
import {
  SCHOTTKY_DIODE_TYPE, SILICON_DIODE_TYPE, ZENER_DIODE_TYPE,
} from '../expansion-drafts/diode-components-v1.mjs';
import {
  BOUNDED_3V3_AUTHORING_CONTRACTS, GROUND_REFERENCE_3V3_TYPE,
  MOMENTARY_BUTTON_3V3_TYPE, POTENTIOMETER_3V3_TYPE, TOGGLE_SWITCH_3V3_TYPE, validateBounded3v3AuthoringGraph,
} from '../src/bounded-3v3-authoring-contracts.mjs';
import { RP2040_PICO_BOARD_DEFINITION, RP2040_PICO_PROFILE } from '../src/rp2040-pico-circuit.mjs';
import { ESP32C3_BOARD_DEFINITION, ESP32C3_PUBLIC_PROFILE } from '../src/esp32c3-public-circuit.mjs';
import { STM32_BOARD_DEFINITION, STM32_PUBLIC_PROFILE } from '../src/stm32-public-circuit.mjs';
import { defaultControls, defaultProperties } from '../src/component-catalog.mjs';

test('ten explicit 3.3 V contracts are separately versioned and authoring-only', () => {
  assert.equal(BOUNDED_3V3_AUTHORING_CONTRACTS.schema, 'intent-mcu-bounded-3v3-authoring@1');
  assert.equal(BOUNDED_3V3_AUTHORING_CONTRACTS.execution, 'authoring-only');
  assert.deepEqual(Object.keys(BOUNDED_3V3_AUTHORING_CONTRACTS.components).sort(),
    [GROUND_REFERENCE_3V3_TYPE, MOMENTARY_BUTTON_3V3_TYPE, POTENTIOMETER_3V3_TYPE,
      TOGGLE_SWITCH_3V3_TYPE, NONPOLAR_CAPACITOR_TYPE, ELECTROLYTIC_CAPACITOR_TYPE,
      FIXED_INDUCTOR_TYPE, SILICON_DIODE_TYPE, SCHOTTKY_DIODE_TYPE, ZENER_DIODE_TYPE].sort());
  for (const definition of Object.values(BOUNDED_3V3_AUTHORING_CONTRACTS.components)) {
    assert.equal(definition.version, 1);
    assert.equal(definition.pins.every(({ voltageMin, voltageMax }) => voltageMin >= 0 && voltageMax <= 3.3), true);
  }
});

test('potentiometer contract requires bounded resistance and a linear taper', () => {
  assert.deepEqual(defaultProperties(POTENTIOMETER_3V3_TYPE), { ohms: 10_000, taper: 'linear' });
  assert.deepEqual(defaultControls(POTENTIOMETER_3V3_TYPE), {});
  const board = RP2040_PICO_BOARD_DEFINITION;
  const graph = (properties) => validateBounded3v3AuthoringGraph({ board, components: [
    { id: 'pico-1', type: RP2040_PICO_PROFILE },
    { id: 'potentiometer-1', type: POTENTIOMETER_3V3_TYPE, properties },
  ], nets: [{ id: 'analogue', endpoints: [
    { component: 'pico-1', pin: 'GP26' }, { component: 'potentiometer-1', pin: 'WIPER' },
  ] }] });
  assert.equal(graph({ ohms: 10_000, taper: 'linear' }).ok, true);
  assert.equal(graph({ ohms: 0, taper: 'linear' }).code, 'AUTHORING_POTENTIOMETER_PROPERTIES_UNSUPPORTED');
  assert.equal(graph({ ohms: 10_000, taper: 'logarithmic' }).code, 'AUTHORING_POTENTIOMETER_PROPERTIES_UNSUPPORTED');
});

for (const profile of [
  { board: RP2040_PICO_BOARD_DEFINITION, type: RP2040_PICO_PROFILE, id: 'pico-1', source: 'GP0', source2: 'GP1', ground: 'GND3', ground2: 'GND8' },
  { board: ESP32C3_BOARD_DEFINITION, type: ESP32C3_PUBLIC_PROFILE, id: 'c3-1', source: 'GPIO2', source2: 'GPIO3', ground: 'GND', ground2: 'GND8' },
  { board: STM32_BOARD_DEFINITION, type: STM32_PUBLIC_PROFILE, id: 'stm32-1', source: 'PB0', source2: 'PB1', ground: 'GND', ground2: 'GND20' },
]) {
  test(`${profile.type} mixed authoring graph validates structurally and rejects a direct short`, () => {
    const components = [{ id: profile.id, type: profile.type },
      { id: 'button-1', type: MOMENTARY_BUTTON_3V3_TYPE },
      { id: 'ground-1', type: GROUND_REFERENCE_3V3_TYPE }];
    const accepted = validateBounded3v3AuthoringGraph({ board: profile.board, components, nets: [
      { id: 'signal', endpoints: [{ component: profile.id, pin: profile.source }, { component: 'button-1', pin: 'A' }] },
      { id: 'return', endpoints: [{ component: 'button-1', pin: 'B' }, { component: 'ground-1', pin: 'GND' }] },
    ] });
    assert.deepEqual(accepted, { ok: true, code: 'AUTHORING_GRAPH_ACCEPTED_DATA_ONLY', executable: false,
      schema: 'intent-mcu-bounded-3v3-authoring@1' });
    const shorted = validateBounded3v3AuthoringGraph({ board: profile.board, components, nets: [
      { id: 'short', endpoints: [{ component: profile.id, pin: profile.source }, { component: profile.id, pin: profile.ground }] },
    ] });
    assert.equal(shorted.code, 'AUTHORING_DIRECT_SOURCE_GROUND_SHORT');
    const conflict = validateBounded3v3AuthoringGraph({ board: profile.board, components, nets: [
      { id: 'conflict', endpoints: [{ component: profile.id, pin: profile.source }, { component: profile.id, pin: profile.source2 }] },
    ] });
    assert.equal(conflict.code, 'AUTHORING_OUTPUT_CONFLICT');
    const tiedGrounds = validateBounded3v3AuthoringGraph({ board: profile.board, components, nets: [
      { id: 'grounds', endpoints: [{ component: profile.id, pin: profile.ground }, { component: profile.id, pin: profile.ground2 }] },
    ] });
    assert.equal(tiedGrounds.ok, true);
  });
}

test('unknown models, pins, reused endpoints and over-voltage definitions fail closed', () => {
  const board = RP2040_PICO_BOARD_DEFINITION;
  const base = [{ id: 'pico-1', type: RP2040_PICO_PROFILE }, { id: 'switch-1', type: TOGGLE_SWITCH_3V3_TYPE }];
  assert.equal(validateBounded3v3AuthoringGraph({ board, components: [...base, { id: 'x', type: 'unknown' }], nets: [] }).code,
    'AUTHORING_COMPONENT_UNSUPPORTED');
  assert.equal(validateBounded3v3AuthoringGraph({ board, components: base, nets: [
    { id: 'bad', endpoints: [{ component: 'pico-1', pin: 'GP0' }, { component: 'switch-1', pin: 'NOPE' }] },
  ] }).code, 'AUTHORING_ENDPOINT_UNSUPPORTED');
  assert.equal(validateBounded3v3AuthoringGraph({ board, components: base, nets: [
    { id: 'one', endpoints: [{ component: 'pico-1', pin: 'GP0' }, { component: 'switch-1', pin: 'A' }] },
    { id: 'two', endpoints: [{ component: 'pico-1', pin: 'GP0' }, { component: 'switch-1', pin: 'B' }] },
  ] }).code, 'AUTHORING_ENDPOINT_REUSED');
  const closed = [{ id: 'pico-1', type: RP2040_PICO_PROFILE },
    { id: 'switch-1', type: TOGGLE_SWITCH_3V3_TYPE, properties: { defaultClosed: true } }];
  assert.equal(validateBounded3v3AuthoringGraph({ board, components: closed, nets: [
    { id: 'source', endpoints: [{ component: 'pico-1', pin: 'GP0' }, { component: 'switch-1', pin: 'A' }] },
    { id: 'ground', endpoints: [{ component: 'switch-1', pin: 'B' }, { component: 'pico-1', pin: 'GND3' }] },
  ] }).code, 'AUTHORING_CLOSED_CONTACT_UNSUPPORTED');
});
