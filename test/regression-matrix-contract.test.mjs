// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  X26_REGRESSION_MATRIX, createExpectationOverride, regressionMatrixIdentity,
  stableStringify, validateExpectationOverride, validateRegressionMatrix,
} from '../src/regression-matrix-contract.mjs';

const clone = (value) => structuredClone(value);

test('X26 checked-in matrix is exact, immutable, four-profile and fixture-bound', async () => {
  const checkedIn = JSON.parse(await readFile(new URL('../fixtures/x26-regression-matrix-v1.json', import.meta.url), 'utf8'));
  assert.equal(stableStringify(checkedIn), stableStringify(X26_REGRESSION_MATRIX));
  const matrix = await validateRegressionMatrix(checkedIn);
  assert.equal(Object.isFrozen(matrix), true);
  assert.deepEqual(matrix.cells.map((cell) => cell.profile), [
    'board.atmega328p-16mhz-v1', 'board.rp2040-pico-v1',
    'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1',
  ]);
  assert.equal(new Set(matrix.cells.map((cell) => cell.expected.kind)).size, 4);
  assert.match(await regressionMatrixIdentity(matrix), /^[0-9a-f]{64}$/u);
});

test('X26 rejects profile substitution, version drift, stale fixture hashes and duplicate cases', async () => {
  for (const mutate of [
    (value) => { value.cells[0].profile = value.cells[1].profile; },
    (value) => { value.cells[0].profileVersion = 'unreviewed-v2'; },
    (value) => { value.cells[0].fixtureSha256 = '0'.repeat(64); },
    (value) => { value.cells[1].caseId = value.cells[0].caseId; },
    (value) => { value.cells[0].expected = clone(value.cells[1].expected); },
  ]) {
    const candidate = clone(X26_REGRESSION_MATRIX); mutate(candidate);
    await assert.rejects(validateRegressionMatrix(candidate), /REGRESSION_MATRIX_/u);
  }
});

test('X26 expectation override is one exact stale-safe profile cell', async () => {
  const matrixSha256 = await regressionMatrixIdentity();
  const override = await createExpectationOverride('X26-RP2040-GPIO0-UART0', {
    kind: 'rp2040.gpio-uart', gpio0: false, uartText: 'PICO PUBLIC',
  });
  assert.equal(override.baseMatrixSha256, matrixSha256);
  assert.deepEqual(await validateExpectationOverride(override), override);
  await assert.rejects(createExpectationOverride('X26-RP2040-GPIO0-UART0', {
    kind: 'stm32.renode-pb0-usart3', pb0: true, uartText: 'PICO PUBLIC', bootEpochs: 2,
  }), /REGRESSION_EXPECTATION_OVERRIDE_INVALID/u);
  const stale = clone(override); stale.baseMatrixSha256 = '0'.repeat(64);
  await assert.rejects(validateExpectationOverride(stale), /REGRESSION_EXPECTATION_OVERRIDE_STALE/u);
});
