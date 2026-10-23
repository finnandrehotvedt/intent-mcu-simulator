// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);

test('native harness is immutable, exact and default-disarmed with zero producer contact', async () => {
  const { stdout } = await execute(process.execPath, ['scripts/x92-stm32-native-harness.mjs']);
  const value = JSON.parse(stdout);
  assert.equal(value.status, 'ready-not-armed');
  assert.equal(value.producerContacts, 0);
  assert.deepEqual(value.allowance, { builds: 1, runs: 1, scenarios: 0, retries: 0 });
});

test('execute mode rejects before network without a separately frozen authority', async () => {
  await assert.rejects(execute(process.execPath,
    ['scripts/x92-stm32-native-harness.mjs', '--execute']), /X92_STM32_NATIVE_HARNESS_DISARMED/u);
});
