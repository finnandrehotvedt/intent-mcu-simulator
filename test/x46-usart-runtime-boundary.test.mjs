// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptX46UsartRuntimeSnapshot } from '../src/x46-usart-runtime-boundary.mjs';

const hash = (character) => character.repeat(64);
const identity = (overrides = {}) => ({
  schema: 'intent-mcu-worker-runtime-identity@2',
  projectGeneration: 3,
  runtimeGeneration: 7,
  artifactIdentity: hash('a'),
  modelImplementationSha256: hash('b'),
  modelExecutionContextSha256: hash('c'),
  workerInitialization: 2,
  workerInstanceNonce: 'd'.repeat(32),
  ...overrides,
});

function source(runtimeIdentity = identity()) {
  return {
    schema: 'intent-mcu-usart-config@1',
    profile: 'board.atmega328p-16mhz-v1',
    channel: 'USART0',
    clockHertz: 16_000_000,
    runtimeIdentity,
    resetEpoch: 1,
    records: [{
      epoch: 1,
      cycle: 42,
      resetEpoch: 1,
      trigger: { register: 'UBRRL', value: 103 },
      registers: { UCSRA: 0, UCSRB: 0x18, UCSRC: 0x06, UBRRL: 103, UBRRH: 0 },
      configuration: {
        dataBits: 8, parity: 'none', stopBits: 1, mode: 'asynchronous',
        doubleSpeed: false, baud: 9_615, frameCycles: 16_640,
        receiverEnabled: true, transmitterEnabled: true, supported: true,
      },
    }],
    retention: { limit: 256, retained: 1, dropped: 0, truncated: false },
  };
}

test('actual-shaped current worker snapshot reaches authoritative state as a detached clone', () => {
  const runtimeIdentity = identity();
  const message = { kind: 'paused', paused: true, cycle: 42, runtimeIdentity,
    usartConfiguration: source(runtimeIdentity) };
  const accepted = acceptX46UsartRuntimeSnapshot(message, { currentModel: true });
  assert.deepEqual(accepted, message);
  assert.notEqual(accepted, message);
  assert.notEqual(accepted.usartConfiguration, message.usartConfiguration);
  message.usartConfiguration.records[0].registers.UBRRL = 1;
  assert.equal(accepted.usartConfiguration.records[0].registers.UBRRL, 103);
});

test('boundary rejects stale producer identity and missing current producer', () => {
  const runtimeIdentity = identity();
  const stale = source(identity({ runtimeGeneration: 8 }));
  assert.throws(() => acceptX46UsartRuntimeSnapshot({
    kind: 'paused', paused: true, cycle: 42, runtimeIdentity,
    usartConfiguration: stale,
  }, { currentModel: true }), { code: 'X46_USART_CONFIG_SOURCE_STALE' });
  assert.throws(() => acceptX46UsartRuntimeSnapshot({
    kind: 'paused', paused: true, cycle: 42, runtimeIdentity,
  }, { currentModel: true }), { code: 'X46_USART_RUNTIME_SOURCE_MISSING' });
});

test('retained snapshots may omit the new producer and non-snapshot control replies pass through', () => {
  const retained = { kind: 'paused', paused: true, cycle: 42, runtimeIdentity: identity() };
  assert.deepEqual(acceptX46UsartRuntimeSnapshot(retained, { currentModel: false }), retained);
  const control = { kind: 'x47-accepted', runtimeIdentity: identity() };
  assert.deepEqual(acceptX46UsartRuntimeSnapshot(control, { currentModel: true }), control);
});

test('current boundary validates enriched RX records while retained models gain no authority', () => {
  const runtimeIdentity = identity();
  const current = { kind: 'paused', paused: true, cycle: 20_000, runtimeIdentity,
    usartConfiguration: source(runtimeIdentity), retentionDrops: { serial: 0 },
    serial: [{ direction: 'rx-request', cycle: 100, targetCycle: 100, value: 0x41,
      startObservationLatenessCycles: 0,
      accepted: true, immediate: false, transferId: 'rx:1:1', resetEpoch: 1,
      baud: 9_615, frameCycles: 16_640, scheduledCompletionCycle: 16_740 },
    { direction: 'rx-complete', cycle: 16_742, transferId: 'rx:1:1', resetEpoch: 1,
      value: 0x41, startCycle: 100, scheduledCompletionCycle: 16_740,
      observationLatenessCycles: 2 }] };
  assert.deepEqual(acceptX46UsartRuntimeSnapshot(current, { currentModel: true }), current);
  const malformed = structuredClone(current);
  malformed.serial[1].observationLatenessCycles = 99;
  assert.throws(() => acceptX46UsartRuntimeSnapshot(malformed, { currentModel: true }),
    { code: 'X46_USART_RX_COMPLETION_INVALID' });
  assert.deepEqual(acceptX46UsartRuntimeSnapshot(malformed, { currentModel: false }), malformed,
    'retained old model data remains inert and is not upgraded into current RX authority');
});

test('current boundary preserves immediate RX compatibility without granting X46 eligibility', () => {
  const runtimeIdentity = identity();
  const immediate = { kind: 'paused', paused: true, cycle: 100, runtimeIdentity,
    usartConfiguration: source(runtimeIdentity), retentionDrops: { serial: 0 },
    serial: [{ direction: 'rx-request', cycle: 100, targetCycle: 100,
      startObservationLatenessCycles: 0, value: 0x41, accepted: true, immediate: true,
      transferId: 'rx:1:1', resetEpoch: 1, baud: 9_615, frameCycles: 16_640,
      scheduledCompletionCycle: 16_740 },
    { direction: 'rx-complete', cycle: 100, transferId: 'rx:1:1', resetEpoch: 1,
      value: 0x41, startCycle: 100, scheduledCompletionCycle: 16_740,
      observationLatenessCycles: -16_640 }] };
  assert.deepEqual(acceptX46UsartRuntimeSnapshot(immediate, { currentModel: true }), immediate,
    'structural boundary compatibility is not an X46 evidence claim');
  const mismatched = structuredClone(immediate);
  mismatched.serial[1].value = 0x42;
  assert.throws(() => acceptX46UsartRuntimeSnapshot(mismatched, { currentModel: true }),
    { code: 'X46_USART_RX_COMPLETION_CONFLICT' });
});
