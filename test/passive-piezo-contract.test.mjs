// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import { PASSIVE_PIEZO_CONTRACT, PASSIVE_PIEZO_TYPE,
  validatePassivePiezoContract } from '../expansion-drafts/passive-piezo-contract-v1.mjs';

test('CMP-063 is a distinct two-terminal passive visual signal sink', () => {
  assert.equal(validatePassivePiezoContract(), true);
  assert.equal(PASSIVE_PIEZO_TYPE, 'output.passive-piezo-v1');
  assert.deepEqual(PASSIVE_PIEZO_CONTRACT.terminals, ['SIGNAL', 'GND']);
  assert(!PASSIVE_PIEZO_CONTRACT.terminals.includes('VCC'));
  assert(!PASSIVE_PIEZO_CONTRACT.terminals.includes('EN'));
  assert.deepEqual(PASSIVE_PIEZO_CONTRACT.supportedSignalPins,
    ['D3', 'D5', 'D6', 'D9', 'D10', 'D11']);
});

test('CMP-063 contract rejects active-buzzer and acoustic overclaims', () => {
  assert.equal(validatePassivePiezoContract({ ...PASSIVE_PIEZO_CONTRACT,
    terminals: ['VCC', 'GND', 'EN'] }), false);
  assert.equal(validatePassivePiezoContract({ ...PASSIVE_PIEZO_CONTRACT,
    runtime: { ...PASSIVE_PIEZO_CONTRACT.runtime, output: 'calibrated tone frequency' } }), false);
  assert(PASSIVE_PIEZO_CONTRACT.exclusions.includes('audio playback'));
  assert(PASSIVE_PIEZO_CONTRACT.exclusions.includes('loudness'));
});

