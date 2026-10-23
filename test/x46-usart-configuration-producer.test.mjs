// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { usart0Config } from 'avr8js';
import { Atmega328PAdapter } from '../src/atmega328p-adapter.mjs';
import {
  X46_USART_CONFIGURATION_LIMIT,
  X46_USART_CONFIGURATION_SCHEMA,
  X46UsartConfigurationProducer,
  validateX46UsartConfigurationSource,
} from '../src/x46-usart-configuration-producer.mjs';

const hash = (character) => character.repeat(64);

function identity(overrides = {}) {
  return {
    schema: 'intent-mcu-worker-runtime-identity@2',
    projectGeneration: 3,
    runtimeGeneration: 7,
    artifactIdentity: hash('a'),
    modelImplementationSha256: hash('b'),
    modelExecutionContextSha256: hash('c'),
    workerInitialization: 2,
    workerInstanceNonce: 'd'.repeat(32),
    ...overrides,
  };
}

function registers(overrides = {}) {
  return {
    UCSRA: 0x00,
    UCSRB: 0x18,
    UCSRC: 0x06,
    UBRRL: 103,
    UBRRH: 0,
    ...overrides,
  };
}

function producerSource() {
  const runtimeIdentity = identity();
  const producer = new X46UsartConfigurationProducer(runtimeIdentity, 1);
  producer.observe({ cycle: 10, register: 'UBRRL', value: 103, registers: registers() });
  producer.observe({
    cycle: 20,
    register: 'UCSRC',
    value: 0x26,
    registers: registers({ UCSRC: 0x26 }),
  });
  return { producer, runtimeIdentity, source: producer.snapshot() };
}

test('synthetic producer emits identity-bound ordered AVR USART configuration epochs', () => {
  const { source, runtimeIdentity } = producerSource();
  const accepted = validateX46UsartConfigurationSource(source, {
    runtimeIdentity,
    resetEpoch: 1,
  });
  assert.equal(accepted.schema, X46_USART_CONFIGURATION_SCHEMA);
  assert.equal(accepted.records.length, 2);
  assert.deepEqual(accepted.records.map(({ epoch, cycle }) => ({ epoch, cycle })), [
    { epoch: 1, cycle: 10 },
    { epoch: 2, cycle: 20 },
  ]);
  assert.deepEqual(accepted.records[0].configuration, {
    dataBits: 8,
    parity: 'none',
    stopBits: 1,
    mode: 'asynchronous',
    doubleSpeed: false,
    baud: 9_615,
    frameCycles: 16_640,
    receiverEnabled: true,
    transmitterEnabled: true,
    supported: true,
  });
  assert.equal(accepted.records[1].configuration.parity, 'even');
  assert.equal(accepted.records[1].configuration.frameCycles, 18_304);
  assert.equal(accepted.records[1].configuration.supported, false);
});

test('synthetic producer suppresses duplicate semantic writes and bounds retention', () => {
  const runtimeIdentity = identity();
  const producer = new X46UsartConfigurationProducer(runtimeIdentity, 1);
  assert.equal(producer.observe({ cycle: 1, register: 'UBRRL', value: 103,
    registers: registers() }), true);
  assert.equal(producer.observe({ cycle: 2, register: 'UBRRL', value: 103,
    registers: registers() }), false);
  for (let index = 0; index < X46_USART_CONFIGURATION_LIMIT; index++) {
    const enabled = index % 2 === 0 ? 0x10 : 0x18;
    producer.observe({ cycle: index + 3, register: 'UCSRB', value: enabled,
      registers: registers({ UCSRB: enabled }) });
  }
  const source = producer.snapshot();
  assert.equal(source.records.length, X46_USART_CONFIGURATION_LIMIT);
  assert.equal(source.retention.dropped, 1);
  assert.equal(source.retention.truncated, true);
  assert.throws(() => validateX46UsartConfigurationSource(source, {
    runtimeIdentity, resetEpoch: 1,
  }), { code: 'X46_USART_CONFIG_SOURCE_INCOMPLETE' });
});

test('synthetic validation fails closed on missing, stale, reordered, conflicting and dropped records', () => {
  const { source, runtimeIdentity } = producerSource();
  const expected = { runtimeIdentity, resetEpoch: 1 };

  const missing = structuredClone(source);
  missing.records = [];
  missing.retention.retained = 0;
  assert.throws(() => validateX46UsartConfigurationSource(missing, expected),
    { code: 'X46_USART_CONFIG_SOURCE_MISSING' });

  assert.throws(() => validateX46UsartConfigurationSource(source, {
    runtimeIdentity: identity({ runtimeGeneration: 8 }), resetEpoch: 1,
  }), { code: 'X46_USART_CONFIG_SOURCE_STALE' });

  const reordered = structuredClone(source);
  reordered.records.reverse();
  assert.throws(() => validateX46UsartConfigurationSource(reordered, expected),
    { code: 'X46_USART_CONFIG_RECORD_INVALID' });

  const conflicting = structuredClone(source);
  conflicting.records[1] = structuredClone(conflicting.records[0]);
  conflicting.records[1].epoch = 2;
  conflicting.records[1].cycle = 20;
  assert.throws(() => validateX46UsartConfigurationSource(conflicting, expected),
    { code: 'X46_USART_CONFIG_RECORD_CONFLICT' });

  const dropped = structuredClone(source);
  dropped.retention.dropped = 1;
  dropped.retention.truncated = true;
  assert.throws(() => validateX46UsartConfigurationSource(dropped, expected),
    { code: 'X46_USART_CONFIG_SOURCE_INCOMPLETE' });
});

test('synthetic adapter fixture binds producer to worker identity and Reset starts a new empty epoch', () => {
  const runtimeIdentity = identity();
  const adapter = new Atmega328PAdapter(':00000001FF', { runtimeIdentity });
  adapter.cpu.cycles = 50;
  adapter.cpu.writeData(usart0Config.UBRRL, 103);
  adapter.cpu.writeData(usart0Config.UCSRC, 0x06);
  adapter.cpu.writeData(usart0Config.UCSRB, 0x18);
  const beforeReset = adapter.snapshot().usartConfiguration;
  assert.equal(beforeReset.runtimeIdentity.workerInstanceNonce,
    runtimeIdentity.workerInstanceNonce);
  assert.equal(beforeReset.resetEpoch, 1);
  assert(beforeReset.records.length >= 1);
  assert.equal(beforeReset.records.at(-1).configuration.dataBits, 8);
  assert.equal(beforeReset.records.at(-1).configuration.parity, 'none');
  assert.equal(beforeReset.records.at(-1).configuration.stopBits, 1);
  validateX46UsartConfigurationSource(beforeReset, { runtimeIdentity, resetEpoch: 1 });

  const afterReset = adapter.reset().usartConfiguration;
  assert.equal(afterReset.resetEpoch, 2);
  assert.equal(afterReset.records.length, 0);
  assert.throws(() => validateX46UsartConfigurationSource(beforeReset, {
    runtimeIdentity, resetEpoch: 2,
  }), { code: 'X46_USART_CONFIG_SOURCE_STALE' });
  assert.throws(() => validateX46UsartConfigurationSource(afterReset, {
    runtimeIdentity, resetEpoch: 2,
  }), { code: 'X46_USART_CONFIG_SOURCE_MISSING' });
});

test('retained actual X46 raw evidence has no configuration producer and creates no actual-data claim', () => {
  const actual = JSON.parse(readFileSync(
    new URL('./fixtures/x46-worker-004-paused-raw.json', import.meta.url),
  ));
  assert.equal(actual.usartConfiguration, undefined);
  assert.equal(actual.instruments?.usartConfiguration, undefined);
});
