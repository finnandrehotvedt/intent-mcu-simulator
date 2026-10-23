// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  X46_USART_FRAMING_SCHEMA,
  deriveX46UsartFramingFromPausedSnapshot,
} from '../src/x46-usart-framing-contract.mjs';

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

function configuration(runtimeIdentity = identity()) {
  return {
    schema: 'intent-mcu-usart-config@1',
    profile: 'board.atmega328p-16mhz-v1',
    channel: 'USART0',
    clockHertz: 16_000_000,
    runtimeIdentity,
    resetEpoch: 1,
    records: [{
      epoch: 1,
      cycle: 10,
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

function fixture() {
  const runtimeIdentity = identity();
  return {
    kind: 'paused',
    paused: true,
    cycle: 20_000,
    runtimeIdentity,
    usartConfiguration: configuration(runtimeIdentity),
    serial: [{ direction: 'tx', cycle: 100, value: 0x41, baud: 9_615,
      frameCycles: 16_640 }],
    retentionDrops: { serial: 0 },
  };
}

test('derives start, eight LSB-first data and stop symbols without runtime authority', () => {
  const result = deriveX46UsartFramingFromPausedSnapshot(fixture());
  assert.equal(result.schema, X46_USART_FRAMING_SCHEMA);
  assert.equal(result.status, 'derived-model-framing');
  assert.deepEqual(result.frames[0].symbols, [
    { kind: 'start', value: 0 },
    { kind: 'data', index: 0, value: 1 },
    { kind: 'data', index: 1, value: 0 },
    { kind: 'data', index: 2, value: 0 },
    { kind: 'data', index: 3, value: 0 },
    { kind: 'data', index: 4, value: 0 },
    { kind: 'data', index: 5, value: 0 },
    { kind: 'data', index: 6, value: 1 },
    { kind: 'data', index: 7, value: 0 },
    { kind: 'stop', value: 1 },
  ]);
  assert.equal(result.frames[0].cyclesPerSymbol, 1_664);
  assert.equal(result.epochProvenance, 'same-paused-reset-isolated-worker-snapshot');
  assert.deepEqual(result.authority, { apply: false, build: false, run: false, verdict: false });
  assert.match(result.support.signalLevel, /not physical voltage/u);
  assert.match(result.support.rx, /unavailable/u);
  assert.match(result.support.i2c, /unavailable/u);
  assert.match(result.support.spi, /unavailable/u);
});

test('selects the latest complete supported configuration at or before each TX record', () => {
  const input = fixture();
  const next = structuredClone(input.usartConfiguration.records[0]);
  next.epoch = 2;
  next.cycle = 90;
  next.trigger = { register: 'UCSRA', value: 2 };
  next.registers.UCSRA = 2;
  next.registers.UBRRL = 207;
  next.trigger.value = 2;
  next.configuration.doubleSpeed = true;
  input.usartConfiguration.records.push(next);
  input.usartConfiguration.retention.retained = 2;
  const result = deriveX46UsartFramingFromPausedSnapshot(input);
  assert.equal(result.frames[0].configurationEpoch, 2);
});

test('rejects stale or missing identity and retention loss in either producer', () => {
  const stale = fixture();
  stale.usartConfiguration.runtimeIdentity = identity({ runtimeGeneration: 8 });
  assert.throws(() => deriveX46UsartFramingFromPausedSnapshot(stale),
    { code: 'X46_USART_CONFIG_SOURCE_STALE' });

  const missing = fixture();
  delete missing.runtimeIdentity;
  assert.throws(() => deriveX46UsartFramingFromPausedSnapshot(missing),
    { code: 'X46_USART_FRAMING_SNAPSHOT_INVALID' });

  const droppedUart = fixture();
  droppedUart.retentionDrops.serial = 1;
  assert.throws(() => deriveX46UsartFramingFromPausedSnapshot(droppedUart),
    { code: 'X46_USART_FRAMING_SERIAL_INCOMPLETE' });

  const droppedConfiguration = fixture();
  droppedConfiguration.usartConfiguration.retention.dropped = 1;
  droppedConfiguration.usartConfiguration.retention.truncated = true;
  assert.throws(() => deriveX46UsartFramingFromPausedSnapshot(droppedConfiguration),
    { code: 'X46_USART_CONFIG_SOURCE_INCOMPLETE' });
});

test('rejects unsupported parity, missing prior configuration and contradictory timing', () => {
  const parity = fixture();
  parity.usartConfiguration.records[0].registers.UCSRC = 0x26;
  parity.usartConfiguration.records[0].configuration.parity = 'even';
  parity.usartConfiguration.records[0].configuration.frameCycles = 18_304;
  parity.usartConfiguration.records[0].configuration.supported = false;
  assert.throws(() => deriveX46UsartFramingFromPausedSnapshot(parity),
    { code: 'X46_USART_FRAMING_CONFIGURATION_UNSUPPORTED' });

  const missing = fixture();
  missing.usartConfiguration.records[0].cycle = 101;
  assert.throws(() => deriveX46UsartFramingFromPausedSnapshot(missing),
    { code: 'X46_USART_FRAMING_CONFIGURATION_MISSING' });

  const timing = fixture();
  timing.serial[0].frameCycles = 8_320;
  timing.serial[0].baud = 19_230;
  assert.throws(() => deriveX46UsartFramingFromPausedSnapshot(timing),
    { code: 'X46_USART_FRAMING_TIMING_CONFLICT' });
});

test('rejects negative TX cycles, overlapping frames and mid-frame configuration ambiguity', () => {
  const negative = fixture();
  negative.serial[0].cycle = -1;
  assert.throws(() => deriveX46UsartFramingFromPausedSnapshot(negative),
    { code: 'X46_USART_FRAMING_TX_CYCLE_INVALID' });

  const overlap = fixture();
  overlap.serial.push({ direction: 'tx', cycle: 16_739, value: 0x42,
    baud: 9_615, frameCycles: 16_640 });
  assert.throws(() => deriveX46UsartFramingFromPausedSnapshot(overlap),
    { code: 'X46_USART_FRAMING_TX_OVERLAP' });

  const midFrame = fixture();
  const changed = structuredClone(midFrame.usartConfiguration.records[0]);
  changed.epoch = 2;
  changed.cycle = 1_000;
  changed.trigger = { register: 'UCSRC', value: 0x26 };
  changed.registers.UCSRC = 0x26;
  changed.configuration.parity = 'even';
  changed.configuration.frameCycles = 18_304;
  changed.configuration.supported = false;
  midFrame.usartConfiguration.records.push(changed);
  midFrame.usartConfiguration.retention.retained = 2;
  const result = deriveX46UsartFramingFromPausedSnapshot(midFrame);
  assert.equal(result.frames[0].configurationEpoch, 1,
    'start-latched frame retains configuration even when a later write occurs mid-frame');
});

test('rejects a same-cycle configuration even with an earlier valid owner and future configuration', () => {
  const sameCycle = fixture();
  const changed = structuredClone(sameCycle.usartConfiguration.records[0]);
  changed.epoch = 2;
  changed.cycle = sameCycle.serial[0].cycle;
  changed.trigger = { register: 'UCSRC', value: 0x26 };
  changed.registers.UCSRC = 0x26;
  changed.configuration.parity = 'even';
  changed.configuration.frameCycles = 18_304;
  changed.configuration.supported = false;
  sameCycle.usartConfiguration.records.push(changed);
  sameCycle.usartConfiguration.retention.retained = 2;
  assert.throws(() => deriveX46UsartFramingFromPausedSnapshot(sameCycle),
    { code: 'X46_USART_FRAMING_CONFIGURATION_SAME_CYCLE' });

  const future = fixture();
  future.usartConfiguration.records[0].cycle = future.cycle + 1;
  assert.throws(() => deriveX46UsartFramingFromPausedSnapshot(future),
    { code: 'X46_USART_FRAMING_CONFIGURATION_FUTURE' });
});
