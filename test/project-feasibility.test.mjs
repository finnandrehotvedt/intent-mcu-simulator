// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { ESP32C3_PROFILE, RP2040_PROFILE } from '../src/compile-targets.mjs';
import { evaluateProjectFeasibility } from '../src/project-feasibility.mjs';

const need = (id, kind, target) => ({ id, kind, target, requirementIds: ['REQ-1'] });

test('X04 resolves available unsupported unknown and unresolved only from current authorities', () => {
  const result = evaluateProjectFeasibility(RP2040_PROFILE, [
    need('NEED-GPIO', 'peripheral', 'gpio'),
    need('NEED-ADC', 'peripheral', 'adc'),
    need('NEED-MYSTERY', 'component', 'sensor.mystery-v1'),
    need('NEED-DETAIL', 'component', '?'),
  ]);
  assert.deepEqual(result.items.map((item) => item.state), ['available', 'unsupported', 'unknown', 'unresolved']);
  assert.deepEqual(result.counts, { available: 1, unsupported: 1, unknown: 1, unresolved: 1 });
  assert.equal(result.evaluated, false);
  assert.equal(result.buildAuthority, false);
  assert.equal(result.ready, false);
});

test('X04 preserves project-model truth and profile-specific component availability', () => {
  const result = evaluateProjectFeasibility(ESP32C3_PROFILE, [
    need('NEED-GPIO', 'peripheral', 'gpio'),
    need('NEED-LED', 'component', 'led.basic-v1'),
    need('NEED-BUTTON', 'component', 'button.momentary-v1'),
  ]);
  assert.equal(result.items[0].state, 'available');
  assert.equal(result.items[0].authorityStatus, 'project-model');
  assert.equal(result.items[1].state, 'available');
  assert.equal(result.items[2].state, 'unsupported');
  assert.match(result.items[2].reason, /fixed board, resistor and LED/u);
});
