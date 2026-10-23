// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { usart0Config } from 'avr8js';
import { Atmega328PAdapter, SERIAL_LIMIT, USART_RX_OBSERVATION_LATENESS_LIMIT,
  boundedPush } from '../src/atmega328p-adapter.mjs';
import { X46_USART_RX_SCHEMA, deriveX46UsartRxFromPausedSnapshot } from '../src/x46-usart-rx-contract.mjs';
import { acceptX46UsartRuntimeSnapshot } from '../src/x46-usart-runtime-boundary.mjs';

const hash = (character) => character.repeat(64);
const runtimeIdentity = Object.freeze({
  schema: 'intent-mcu-worker-runtime-identity@2',
  projectGeneration: 3,
  runtimeGeneration: 7,
  artifactIdentity: hash('a'),
  modelImplementationSha256: hash('b'),
  modelExecutionContextSha256: hash('c'),
  workerInitialization: 2,
  workerInstanceNonce: 'd'.repeat(32),
});

function configuredAdapter() {
  const adapter = new Atmega328PAdapter(':00000001FF', { runtimeIdentity });
  adapter.cpu.writeData(usart0Config.UCSRB, 0x18);
  adapter.cpu.writeData(usart0Config.UCSRC, 0x06);
  adapter.cpu.writeData(usart0Config.UBRRL, 103);
  adapter.runUntilCycle(10);
  return adapter;
}

function paused(adapter) {
  adapter.pause();
  return { kind: 'paused', runtimeIdentity, ...adapter.snapshot() };
}

test('actual pinned USART model pairs one scheduled RX request with observed completion timing', () => {
  const adapter = configuredAdapter();
  adapter.scheduleUartRx(adapter.cpu.cycles, 0x41);
  adapter.runUntilCycle(adapter.cpu.cycles + 17_000);
  const input = paused(adapter);
  const request = input.serial.find((record) => record.direction === 'rx-request');
  const completion = input.serial.find((record) => record.direction === 'rx-complete');
  assert.equal(request.accepted, true);
  assert.equal(completion.transferId, request.transferId);
  assert.equal(completion.scheduledCompletionCycle, request.cycle + request.frameCycles);
  assert.equal(completion.cycle,
    completion.scheduledCompletionCycle + completion.observationLatenessCycles);
  assert(completion.observationLatenessCycles >= 0);
  assert(completion.observationLatenessCycles <= USART_RX_OBSERVATION_LATENESS_LIMIT);

  const result = deriveX46UsartRxFromPausedSnapshot(input);
  assert.equal(result.schema, X46_USART_RX_SCHEMA);
  assert.equal(result.status, 'model-rx-complete');
  assert.equal(result.transfers[0].value, 0x41);
  assert.equal(result.transfers[0].observedCompletionCycle, completion.cycle);
  assert.equal(result.clock.completionObservation,
    'first-instruction-boundary-at-or-after-avr8js-clock-event');
  assert.deepEqual(result.authority, { apply: false, build: false, run: false, verdict: false });
  assert.match(result.support.lineSignal, /no D0 edge/u);
  assert.match(result.support.parity, /cannot supply or validate parity/u);
});

test('non-aligned target retains requested cycle and bounded actual start boundary', () => {
  const adapter = configuredAdapter();
  adapter.program.fill(0xcfff); // RJMP -1, two AVR cycles
  const targetCycle = adapter.cpu.cycles + 1;
  adapter.scheduleUartRx(targetCycle, 0x41);
  adapter.runUntilCycle(targetCycle + 17_000);
  const request = adapter.serial.find((record) => record.direction === 'rx-request');
  assert.equal(request.targetCycle, targetCycle);
  assert(request.cycle > request.targetCycle);
  assert.equal(request.cycle,
    request.targetCycle + request.startObservationLatenessCycles);
  assert(request.startObservationLatenessCycles <= USART_RX_OBSERVATION_LATENESS_LIMIT);
  assert.equal(deriveX46UsartRxFromPausedSnapshot(paused(adapter)).transfers.length, 1);
});

test('disabled and busy requests are retained as rejected and never gain completion authority', () => {
  const disabled = new Atmega328PAdapter(':00000001FF', { runtimeIdentity });
  disabled.scheduleUartRx(0, 0x41); disabled.runUntilCycle(1);
  assert.equal(disabled.serial[0].accepted, false);
  assert.equal(disabled.serial.some((record) => record.direction === 'rx-complete'), false);

  const busy = configuredAdapter(); const start = busy.cpu.cycles;
  busy.scheduleUartRx(start, 0x41); busy.scheduleUartRx(start, 0x42);
  busy.runUntilCycle(start + 17_000);
  const requests = busy.serial.filter((record) => record.direction === 'rx-request');
  assert.deepEqual(requests.map((record) => record.accepted), [true, false]);
  const completions = busy.serial.filter((record) => record.direction === 'rx-complete');
  assert.equal(completions.length, 1);
  assert.equal(completions[0].transferId, requests[0].transferId);
  const result = deriveX46UsartRxFromPausedSnapshot(paused(busy));
  assert.deepEqual([result.completeness.completed, result.completeness.rejectedRequests], [1, 1]);
});

test('paused pre-completion state is explicit in-flight and reset removes its authority', () => {
  const adapter = configuredAdapter(); const start = adapter.cpu.cycles;
  adapter.scheduleUartRx(start, 0x41); adapter.runUntilCycle(start + 20);
  const result = deriveX46UsartRxFromPausedSnapshot(paused(adapter));
  assert.equal(result.transfers.length, 0); assert.equal(result.inFlight.length, 1);
  assert(result.inFlight[0].scheduledCompletionCycle > adapter.cpu.cycles);

  const oldEpoch = adapter.snapshot().usartConfiguration.resetEpoch;
  const reset = adapter.reset();
  assert.equal(reset.serial.length, 0);
  assert.equal(reset.usartConfiguration.resetEpoch, oldEpoch + 1);
});

test('same-cycle configuration, immediate mode, stale completion and retention loss fail closed', () => {
  const adapter = configuredAdapter(); const start = adapter.cpu.cycles;
  adapter.cpu.writeData(usart0Config.UCSRA, 0x02);
  adapter.scheduleUartRx(start, 0x41); adapter.runUntilCycle(start + 9_000);
  assert.throws(() => deriveX46UsartRxFromPausedSnapshot(paused(adapter)),
    { code: 'X46_USART_RX_CONFIGURATION_SAME_CYCLE' });

  const immediate = configuredAdapter(); immediate.scheduleUartRx(immediate.cpu.cycles, 0x41, true);
  immediate.runUntilCycle(immediate.cpu.cycles + 1);
  assert.deepEqual(immediate.serial.filter((record) => record.direction.startsWith('rx'))
    .map((record) => record.direction), ['rx-request', 'rx-complete'],
  'synchronous completion is retained after its request and shares its transfer');
  assert.throws(() => deriveX46UsartRxFromPausedSnapshot(paused(immediate)),
    { code: 'X46_USART_RX_IMMEDIATE_UNSUPPORTED' });

  const valid = configuredAdapter(); valid.scheduleUartRx(valid.cpu.cycles, 0x41);
  valid.runUntilCycle(valid.cpu.cycles + 17_000); const stale = paused(valid);
  stale.serial.find((record) => record.direction === 'rx-complete').transferId = 'rx:1:99';
  assert.throws(() => deriveX46UsartRxFromPausedSnapshot(stale),
    { code: 'X46_USART_RX_COMPLETION_ORPHAN' });

  const dropped = paused(valid); dropped.retentionDrops.serial = 1;
  assert.throws(() => deriveX46UsartRxFromPausedSnapshot(dropped),
    { code: 'X46_USART_RX_SNAPSHOT_INCOMPLETE' });
});

test('unsupported parity remains unavailable even though avr8js includes it in frame timing', () => {
  const adapter = configuredAdapter(); adapter.cpu.writeData(usart0Config.UCSRC, 0x26);
  adapter.runUntilCycle(adapter.cpu.cycles + 1);
  adapter.scheduleUartRx(adapter.cpu.cycles, 0x41);
  adapter.runUntilCycle(adapter.cpu.cycles + 19_000);
  assert.throws(() => deriveX46UsartRxFromPausedSnapshot(paused(adapter)),
    { code: 'X46_USART_RX_CONFIGURATION_UNSUPPORTED' });
});

test('bounded history may evict a request without terminating compatible runtime', () => {
  const adapter = configuredAdapter(); const start = adapter.cpu.cycles;
  adapter.scheduleUartRx(start, 0x41); adapter.runUntilCycle(start + 2);
  for (let index = 0; index < SERIAL_LIMIT; index += 1) {
    adapter.retentionDrops.serial += boundedPush(adapter.serial,
      { direction: 'tx', cycle: adapter.cpu.cycles, value: index & 0xff,
        baud: 9_615, frameCycles: 16_640 }, SERIAL_LIMIT);
  }
  adapter.runUntilCycle(start + 17_000);
  const snapshot = paused(adapter);
  assert(snapshot.retentionDrops.serial > 0);
  assert.equal(snapshot.serial.some((record) => record.direction === 'rx-request'), false);
  assert.equal(snapshot.serial.some((record) => record.direction === 'rx-complete'), true);
  assert.doesNotThrow(() => acceptX46UsartRuntimeSnapshot(snapshot, { currentModel: true }));
  assert.throws(() => deriveX46UsartRxFromPausedSnapshot(snapshot),
    { code: 'X46_USART_RX_SNAPSHOT_INCOMPLETE' });

  const forged = structuredClone(snapshot); forged.retentionDrops.serial = 0;
  assert.throws(() => acceptX46UsartRuntimeSnapshot(forged, { currentModel: true }),
    { code: 'X46_USART_RX_COMPLETION_ORPHAN' });
});

test('adapter rejects scheduling in the past before any RX record exists', () => {
  const adapter = configuredAdapter();
  assert.throws(() => adapter.scheduleUartRx(adapter.cpu.cycles - 1, 0x41),
    /Event cycle is in the past/u);
  assert.equal(adapter.serial.some((record) => record.direction.startsWith('rx')), false);
});
