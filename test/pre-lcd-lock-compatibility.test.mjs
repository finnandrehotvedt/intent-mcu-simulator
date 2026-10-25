// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CURRENT_MODEL_LIBRARY_LOCK, PRE_LCD_END_TO_END_CURRENT_MODEL_LIBRARY_LOCK,
  modelLibraryExecutionIdentity, modelLibraryMigrationPreview,
  normalizeModelLibraryLock, resolveModelLibrary,
} from '../src/model-library.mjs';

const profiles = [
  'board.atmega328p-16mhz-v1', 'board.rp2040-pico-v1',
  'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1',
];

test('accepted pre-LCD public lock remains an exact finite data-only migration anchor', () => {
  assert.equal(PRE_LCD_END_TO_END_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256,
    '3bbd95847c30be0de73e280b0eba7302dc6671d83775a535d36263e0d095efce');
  const raw = JSON.stringify(PRE_LCD_END_TO_END_CURRENT_MODEL_LIBRARY_LOCK);
  const reopened = normalizeModelLibraryLock(JSON.parse(raw));
  assert.equal(reopened.ok, true);
  assert.equal(JSON.stringify(reopened.lock), raw);
  const resolved = resolveModelLibrary(JSON.parse(raw));
  assert.equal(resolved.role, 'pre-lcd-end-to-end-current-migration');
  assert.equal(resolved.implementation.id, 'intent-mcu-model-bundle-current-thumbnail-artwork-1@46');
  assert.equal(modelLibraryExecutionIdentity(JSON.parse(raw)).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  assert.equal(modelLibraryExecutionIdentity(JSON.parse(raw), { allowMigrationOnly: true }).identity.executableAuthority, false);
  assert.equal(modelLibraryMigrationPreview(JSON.parse(raw), CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  for (const profile of profiles) {
    assert(resolved.manifest.entries.some((entry) => entry.profile === profile), profile);
  }
  assert.equal(normalizeModelLibraryLock({ ...JSON.parse(raw), manifestSha256: 'f'.repeat(64) }).code,
    'MODEL_LIBRARY_LOCK_UNTRUSTED');
});
