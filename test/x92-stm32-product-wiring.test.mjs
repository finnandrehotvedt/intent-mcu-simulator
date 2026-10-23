// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('STM32 product Run awaits source-bound session admission and uses only the strict adapter', async () => {
  const source = await readFile(new URL('../staging/main.mjs', import.meta.url), 'utf8');
  assert.match(source, /request\?\.profile === STM32F429ZI_PROFILE && request\.action === 'runtime\.run'[\s\S]*await x92BudgetStartPending/u);
  assert.match(source, /const result = await x92Stm32Integration\.executeBudgeted\(source\)/u);
  assert.match(source, /executeBudgetProducer:[\s\S]*withX92Stm32Permit\([\s\S]*boundedActionRouter\.execute\(source\)/u);
  assert.match(source, /retireCurrentOwner: \(\{ binding, completion \}\) => stm32PublicWorkbench\.quiesceForX92\(binding, completion\)/u);
  assert.doesNotMatch(source, /\['board\.atmega328p-16mhz-v1', 'board\.rp2040-pico-v1', 'board\.stm32f429zi-nucleo144-v1'\]/u);
});
