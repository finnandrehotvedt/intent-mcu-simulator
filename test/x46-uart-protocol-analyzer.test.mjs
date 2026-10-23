// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AVR_PROFILE } from '../src/compile-targets.mjs';
import {
  X46_UART_ANALYSIS_SCHEMA,
  X46_UART_SOURCE_SCHEMA,
  analyzeAvrUsart0,
} from '../src/x46-uart-protocol-analyzer.mjs';

const hash = (character) => character.repeat(64);
const actualRawBytes = readFileSync(
  new URL('./fixtures/x46-worker-004-paused-raw.json', import.meta.url),
);
const actualPausedRaw = JSON.parse(actualRawBytes);
const actualRawSha256 = createHash('sha256').update(actualRawBytes).digest('hex');

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

function actualSource() {
  const identity = actualPausedRaw.runtimeIdentity;
  const records = structuredClone(actualPausedRaw.instruments.serial.records.filter(
    (entry) => entry.direction === 'tx',
  ));
  return {
    schema: X46_UART_SOURCE_SCHEMA,
    profile: AVR_PROFILE,
    channel: 'USART0',
    artifactIdentity: identity.artifactIdentity,
    runtimeIdentity: {
      runtimeGeneration: identity.runtimeGeneration,
      workerInstanceNonce: identity.workerInstanceNonce,
      modelExecutionContextSha256: identity.modelExecutionContextSha256,
    },
    clockHertz: 16_000_000,
    records,
    retention: {
      retained: records.length,
      dropped: actualPausedRaw.instruments.serial.dropped,
      truncated: actualPausedRaw.instruments.serial.dropped > 0,
    },
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
  assert.deepEqual(result.frames.map(({ index, ordinal }) => ({ index, ordinal })), [
    { index: 0, ordinal: 1 }, { index: 1, ordinal: 2 },
  ]);
  assert.deepEqual(result.authority, { apply: false, build: false, run: false, verdict: false });
  assert.match(result.support.signalLevel, /^unavailable/u);
  assert.match(result.support.framing, /^unavailable/u);
  assert.match(result.support.i2c, /^unavailable/u);
  assert.match(result.support.spi, /^unavailable/u);
});

test('first frame may start at cycle zero and always receives an integer one-based ordinal', () => {
  const value = source();
  value.records = [record(0, 0)];
  value.retention.retained = 1;
  const [first] = analyzeAvrUsart0(value).frames;
  assert.equal(first.cycle, 0);
  assert.equal(first.cycleDelta, null);
  assert.equal(first.ordinal, 1);
  assert.equal(Number.isSafeInteger(first.ordinal), true);
});

test('accepts all unmodified receipt-004 TX records with their actual identity and integer model baud', () => {
  assert.equal(actualRawSha256,
    '547ea71d3f1ecf5d887880e2ed3bebec7c958ee1d259b3586e03d0ac09b06058');
  const input = actualSource();
  assert.equal(input.artifactIdentity,
    '1501248cde92e96d417ae24a6f9e9a5a82faa057dabfdd97fbe5bc922b42100c');
  assert.equal(input.runtimeIdentity.modelExecutionContextSha256,
    '13084dfcf0d1091f7046af5274fcf1cc2c5d473f3484138c7bf5a49d5089756d');
  assert.equal(input.records.length, 23);
  assert(input.records.every((entry) => entry.baud === 9_615
    && entry.frameCycles === 16_640));

  const projection = input.records.map(({
    direction, cycle, value, baud, frameCycles, virtualMilliseconds, text,
  }) => ({ direction, cycle, value, baud, frameCycles, virtualMilliseconds, text }));
  assert.equal(createHash('sha256').update(JSON.stringify(projection)).digest('hex'),
    '1ffe1b3e3bee716e72089e0811fae1fa85428ea960811eadb29dde20661dbce1');

  const result = analyzeAvrUsart0(input);
  assert.equal(result.status, 'decoded-byte-events');
  assert.equal(result.frames.length, 23);
  assert.equal(result.displayText, 'TEMP_C=29 BUTTON=RELEAS');
  assert.deepEqual(result.frames.map((frame) => ({
    cycle: frame.cycle,
    value: frame.value,
    baud: frame.baud,
    frameCycles: frame.frameCycles,
    virtualMilliseconds: frame.virtualMilliseconds,
    display: frame.display,
  })), input.records.map((entry) => ({
    cycle: entry.cycle,
    value: entry.value,
    baud: entry.baud,
    frameCycles: entry.frameCycles,
    virtualMilliseconds: entry.virtualMilliseconds,
    display: entry.text,
  })));
});

test('uses exact avr8js floor quantization boundaries and rejects baud/frame mismatch', () => {
  const single = (baud, frameCycles) => {
    const value = source();
    value.records = [record(0, 65, baud, frameCycles)];
    value.retention.retained = 1;
    return value;
  };
  assert.equal(analyzeAvrUsart0(single(9_615, 16_639)).frames.length, 1);
  assert.equal(analyzeAvrUsart0(single(9_615, 16_640)).frames.length, 1);
  for (const [baud, frameCycles] of [
    [9_614, 16_640],
    [9_616, 16_640],
    [9_615, 16_638],
    [9_615, 16_641],
    [9_615.25, 16_640],
    [(160_000_000 / 16_640) + (2 / 16_640), 16_640],
  ]) {
    assert.throws(() => analyzeAvrUsart0(single(baud, frameCycles)),
      { code: 'X46_UART_RECORD_INVALID' });
  }
});

test('receipt-004 replay still fails closed on retained loss', () => {
  const value = actualSource();
  value.retention.dropped = 1;
  value.retention.truncated = true;
  assert.throws(() => analyzeAvrUsart0(value), { code: 'X46_UART_SOURCE_INCOMPLETE' });
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
