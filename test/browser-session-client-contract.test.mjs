// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  publicSessionErrorCode,
  validateDiscoveredPlan,
} from '../src/browser-session-client-contract.mjs';

const profiles = [
  'board.atmega328p-16mhz-v1',
  'board.rp2040-pico-v1',
  'board.esp32-c3-devmodule-v1',
  'board.stm32f429zi-nucleo144-v1',
];
const components = { components: [{ id: 'resistor-1', type: 'resistor.fixed-v1' }] };
const catalog = { components: { 'resistor.fixed-v1': {
  propertyKeys: ['ohms'], pins: [{ id: 'A' }, { id: 'B' }],
} } };

test('discovered property contract accepts the canonical operation on all four profiles', () => {
  for (const profile of profiles) assert.doesNotThrow(() => validateDiscoveredPlan({ commands: [{
    command: 'component.property.set', component_id: 'resistor-1', key: 'ohms', value: 0,
  }] }, components, { ...catalog, profile }), profile);
});

test('discovered property contract rejects invented component and property names before submission', () => {
  assert.throws(() => validateDiscoveredPlan({ commands: [{ command: 'component.property.set',
    component_id: 'missing-1', key: 'ohms', value: 330 }] }, components, catalog), /API_PLAN_COMPONENT_UNKNOWN/u);
  assert.throws(() => validateDiscoveredPlan({ commands: [{ command: 'component.property.set',
    component_id: 'resistor-1', key: 'resistance_ohms', value: 330 }] }, components, catalog), /API_PLAN_PROPERTY_UNKNOWN/u);
});

test('safe server validation namespaces remain actionable while arbitrary errors stay masked', () => {
  for (const code of ['MODEL_LIBRARY_PROPERTY_VALUE', 'PROJECT_CONTACT_PCF8574_LCD_STATE',
    'RP2040_CIRCUIT_RESISTOR_INVALID', 'C3_CIRCUIT_RESISTOR_INVALID',
    'STM32_CIRCUIT_RESISTOR_INVALID', 'EDITOR_PROPERTY_UNSUPPORTED']) {
    assert.equal(publicSessionErrorCode(new Error(code)), code);
  }
  assert.equal(publicSessionErrorCode(new Error('/private/path secret-value')), 'API_SESSION_FAILED');
});
