// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { pinTargetGuidance } from '../src/pin-target-guidance.mjs';

test('passive LED and resistor paths remain possible in both directions', () => {
  assert.equal(pinTargetGuidance('passive', 'ground'), 'possible');
  assert.equal(pinTargetGuidance('ground', 'passive'), 'possible');
  assert.equal(pinTargetGuidance('passive', 'power-out'), 'possible');
  assert.equal(pinTargetGuidance('power-out', 'passive'), 'possible');
});

test('only unambiguous rail pairs are recommended before final validation', () => {
  assert.equal(pinTargetGuidance('ground', 'ground'), 'recommended');
  assert.equal(pinTargetGuidance('power-out', 'power-in'), 'recommended');
  assert.equal(pinTargetGuidance('power-in', 'power-out'), 'recommended');
});

test('two active outputs are blocked from being suggested as targets', () => {
  assert.equal(pinTargetGuidance('power-out', 'power-out'), 'blocked');
  assert.equal(pinTargetGuidance('digital-out', 'digital-out'), 'blocked');
  assert.equal(pinTargetGuidance('analogue-out', 'analogue-out'), 'blocked');
});
