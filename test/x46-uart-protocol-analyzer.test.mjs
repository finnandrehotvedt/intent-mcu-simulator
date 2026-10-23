// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { AVR_PROFILE } from '../src/compile-targets.mjs';
import {
  X46_UART_ANALYSIS_SCHEMA,
  X46_UART_SOURCE_SCHEMA,
  analyzeAvrUsart0,
} from '../src/x46-uart-protocol-analyzer.mjs';

const hash = (character) => character.repeat(64);

function record(cycle, value, baud = 9_615.384615384615, frameCycles = 16_640) {
  const text = value === 10 ? '\n' : value === 13 ? '\r'
    : value >= 32 && value <= 126
      ? String.fromCharCode(value) : `\\x${value.toString(16).padStart(2, '0')}`;
  return { direction: 'tx', cycle, value, baud, frameCycles,
    virtualMilliseconds: cycle / 16_000, text };
}

function source() {
  const records = [record(31_000, 65), record(47_640, 10)];
  return {
    schema: X46_UART_SOURCE_SCHEMA,
    profile: AVR_PROFILE,
    channel: 'USART0',
    artifactIdentity: hash('a'),
    runtimeIdentity: {
      runtimeGeneration: 7,
      workerInstanceNonce: 'worker-x46-1',
      modelExecutionContextSha256: hash('b'),
    },
    clockHertz: 16_000_000,
    records,
    retention: { retained: records.length, dropped: 0, truncated: false },
  };
}

test('decodes complete AVR USART0 TX records without creating runtime authority', () => {
  const result = analyzeAvrUsart0(source());
  assert.equal(result.schema, X46_UART_ANALYSIS_SCHEMA);
  assert.equal(result.status, 'decoded-byte-events');
  assert.equal(result.displayText, 'A\n');
  assert.deepEqual(result.frames.map(({ cycle, cycleDelta, value }) => ({ cycle, cycleDelta, value })), [
    { cycle: 31_000, cycleDelta: null, value: 65 },
    { cycle: 47_640, cycleDelta: 16_640, value: 10 },
  ]);
  assert.deepEqual(result.authority, { apply: false, build: false, run: false, verdict: false });
  assert.match(result.support.signalLevel, /^unavailable/u);
  assert.match(result.support.framing, /^unavailable/u);
  assert.match(result.support.i2c, /^unavailable/u);
  assert.match(result.support.spi, /^unavailable/u);
});

test('fails closed when retained evidence is incomplete', () => {
  for (const mutate of [
    (value) => { value.retention.dropped = 1; },
    (value) => { value.retention.truncated = true; },
    (value) => { value.retention.retained = 1; },
  ]) {
    const value = source();
    mutate(value);
    assert.throws(() => analyzeAvrUsart0(value), /X46_UART_SOURCE/u);
  }
});

test('rejects reordered, fabricated and unsupported records', () => {
  for (const mutate of [
    (value) => { value.records[1].cycle = 1; value.records[1].virtualMilliseconds = 1 / 16_000; },
    (value) => { value.records[0].text = 'fabricated'; },
    (value) => { value.records[0].frameCycles = 8_320; },
    (value) => { value.records[0].direction = 'rx-complete'; },
    (value) => { value.records[0].extra = true; },
  ]) {
    const value = source();
    mutate(value);
    assert.throws(() => analyzeAvrUsart0(value), { code: 'X46_UART_RECORD_INVALID' });
  }
});

test('rejects profile, channel, identity and shape substitution', () => {
  for (const mutate of [
    (value) => { value.profile = 'board.rp2040-pico-v1'; },
    (value) => { value.channel = 'I2C0'; },
    (value) => { value.artifactIdentity = hash('z'); },
    (value) => { value.runtimeIdentity.workerInstanceNonce = ''; },
    (value) => { value.extra = true; },
  ]) {
    const value = source();
    mutate(value);
    assert.throws(() => analyzeAvrUsart0(value), { code: 'X46_UART_SOURCE_INVALID' });
  }
});
