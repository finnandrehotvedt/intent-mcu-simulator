// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateX49PublicPreview, createX49PublicAuthoringOwner } from '../src/x49-public-authoring.mjs';

test('X49 public authoring is bounded, deterministic and transient', () => {
  const owner = createX49PublicAuthoringOwner();
  assert.equal(owner.snapshot().nativeEligible, true);
  assert.equal(owner.snapshot().persistence, 'none');
  assert.deepEqual(calculateX49PublicPreview(0).calculated,
    { modelVoltage: 2, adcCount: 409, firmwareIntegerC: 29, d13Level: true });
  assert.deepEqual(calculateX49PublicPreview(1).calculated,
    { modelVoltage: 2.025, adcCount: 414, firmwareIntegerC: 30, d13Level: false });
  for (const offset of [-2, -1, 0, 1, 2]) assert.equal(owner.select(offset).offsetC, offset);
  for (const offset of [-3, 3, 0.5, NaN]) {
    assert.throws(() => calculateX49PublicPreview(offset), { code: 'X49_PUBLIC_OFFSET_INVALID' });
  }
});
