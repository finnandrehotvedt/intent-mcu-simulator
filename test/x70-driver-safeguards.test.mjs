// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  ACTIVE_EXPORT_REJECTION_STATUS,
  EXPECTED_PICO_NATIVE_IDENTITY,
  DriverDeadlineError,
  assertPicoNativeIdentity,
  hardDeadline,
} = require('./x70-native-driver-safeguards.cjs');

test('hard driver deadline resolves normal work and rejects a never-settling operation', async () => {
  assert.equal(await hardDeadline(() => Promise.resolve('ready'), 100, 'normal work'), 'ready');
  const started = Date.now();
  await assert.rejects(
    hardDeadline(() => new Promise(() => {}), 40, 'stalled work'),
    (error) => {
      assert(error instanceof DriverDeadlineError);
      assert.equal(error.code, 'X70_DRIVER_DEADLINE');
      assert.equal(error.timeoutMs, 40);
      return true;
    },
  );
  assert(Date.now() - started < 500, 'deadline did not enforce a short wall bound');
});

test('active rejection contract is one exact stable status, not a regex alternative', () => {
  assert.equal(
    ACTIVE_EXPORT_REJECTION_STATUS,
    'Pause the current AVR/Pico runtime or wait for C3/STM32 completion before exporting a stable measurement snapshot.',
  );
});

test('native Pico identity requires the new manifest, implementation, runtime and presentation tuple', () => {
  const artifactIdentity = 'a'.repeat(64);
  const state = {
    profile: EXPECTED_PICO_NATIVE_IDENTITY.profile,
    artifact: { artifactIdentity: 'b'.repeat(64), uf2Sha256: artifactIdentity,
      sourceSha256: 'c'.repeat(64) },
    modelLibrary: structuredClone(EXPECTED_PICO_NATIVE_IDENTITY.modelLibrary),
    runtime: { artifactIdentity,
      runtimeEngine: structuredClone(EXPECTED_PICO_NATIVE_IDENTITY.runtimeEngine),
      cycle: 500, instructions: 1, paused: false,
      presentation: { schema: 'intent-mcu-rp2040-presentation@1', artifactIdentity,
        generation: 2, sequence: 1, final: false } },
  };
  assert.equal(assertPicoNativeIdentity(state).artifactIdentity, artifactIdentity);
  assert.equal(assertPicoNativeIdentity(state).compileArtifactIdentity, 'b'.repeat(64));
  state.modelLibrary.version = '2.0.0-x56-current';
  assert.throws(() => assertPicoNativeIdentity(state), /X70_PICO_MODEL_IDENTITY_version/u);
});
