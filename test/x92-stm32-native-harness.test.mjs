// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
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

test('native product path attests private target before producer and durably records before fulfillment', async () => {
  const text = await readFile(new URL('./x92-stm32-native-product-browser.cjs', import.meta.url), 'utf8');
  assert.match(text, /127\.0\.0\.1:18766/u);
  assert.doesNotMatch(text, /lab\.teachthecompany\.com/u);
  assert(text.indexOf('__private/x92-stm32-target') < text.indexOf("page.click('#quick-build')"));
  assert(text.indexOf('save();') < text.indexOf('route.fulfill'));
  assert.match(text, /blocked-extra-producer/u);
  assert.match(text, /transport-error/u);
  assert.match(text, /finally \{ save\(\); await browser\.close/u);
});
