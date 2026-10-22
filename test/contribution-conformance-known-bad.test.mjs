// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_MODEL_LIBRARY_LOCK, normalizeModelLibraryLock } from '../src/model-library.mjs';
import { COMPONENT_SUPPORT_CELLS } from '../src/component-support-matrix.mjs';

test('known-bad forged model lock is not conformant', () => {
  const forged = { ...CURRENT_MODEL_LIBRARY_LOCK, manifestSha256: '0'.repeat(64) };
  assert.equal(normalizeModelLibraryLock(forged).ok, true,
    'intentional known-bad fixture must make this trusted test process fail');
});

test('known-bad truncated support matrix is not conformant', () => {
  const truncated = COMPONENT_SUPPORT_CELLS.slice(0, 1);
  assert.equal(truncated.length, 76,
    'intentional known-bad fixture must make this trusted test process fail');
});
