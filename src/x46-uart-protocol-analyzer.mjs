// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { AVR_PROFILE } from './compile-targets.mjs';

export const X46_UART_SOURCE_SCHEMA = 'intent-mcu-x46-uart-source@1';
export const X46_UART_ANALYSIS_SCHEMA = 'intent-mcu-x46-uart-analysis@1';

const HASH = /^[0-9a-f]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CLOCK_HERTZ = 16_000_000;
const MAX_RECORDS = 4_096;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function finite(value, minimum = 0) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum;
}

function displayByte(value) {
  if (value === 10) return '\n';
  if (value === 13) return '\r';
  if (value >= 32 && value <= 126) return String.fromCharCode(value);
  return `\\x${value.toString(16).padStart(2, '0')}`;
}

function validateSource(source) {
  if (!exactKeys(source, [
    'schema', 'profile', 'channel', 'artifactIdentity', 'runtimeIdentity',
    'clockHertz', 'records', 'retention',
  ]) || source.schema !== X46_UART_SOURCE_SCHEMA || source.profile !== AVR_PROFILE
      || source.channel !== 'USART0' || source.clockHertz !== CLOCK_HERTZ
      || !HASH.test(source.artifactIdentity ?? '')
      || !exactKeys(source.runtimeIdentity, [
        'runtimeGeneration', 'workerInstanceNonce', 'modelExecutionContextSha256',
      ])
      || !Number.isSafeInteger(source.runtimeIdentity.runtimeGeneration)
      || source.runtimeIdentity.runtimeGeneration < 1
      || !ID.test(source.runtimeIdentity.workerInstanceNonce ?? '')
      || !HASH.test(source.runtimeIdentity.modelExecutionContextSha256 ?? '')
      || !exactKeys(source.retention, ['retained', 'dropped', 'truncated'])
      || !Number.isSafeInteger(source.retention.retained)
      || !Number.isSafeInteger(source.retention.dropped)
      || source.retention.retained < 0 || source.retention.dropped < 0
      || typeof source.retention.truncated !== 'boolean'
      || !Array.isArray(source.records) || source.records.length < 1
      || source.records.length > MAX_RECORDS
      || source.retention.retained !== source.records.length) {
    fail('X46_UART_SOURCE_INVALID');
  }
  if (source.retention.dropped !== 0 || source.retention.truncated) {
    fail('X46_UART_SOURCE_INCOMPLETE');
  }

  let previousCycle = -1;
  for (const record of source.records) {
    if (!exactKeys(record, [
      'direction', 'cycle', 'value', 'baud', 'frameCycles',
      'virtualMilliseconds', 'text',
    ]) || record.direction !== 'tx' || !Number.isSafeInteger(record.cycle)
        || record.cycle < previousCycle || !Number.isInteger(record.value)
        || record.value < 0 || record.value > 255 || !finite(record.baud, 1)
        || !Number.isSafeInteger(record.frameCycles) || record.frameCycles < 1
        || !finite(record.virtualMilliseconds)
        || record.virtualMilliseconds !== record.cycle / 16_000
        || record.text !== displayByte(record.value)
        || Math.abs((record.baud * record.frameCycles) - (CLOCK_HERTZ * 10)) > 1) {
      fail('X46_UART_RECORD_INVALID');
    }
    previousCycle = record.cycle;
  }
}

export function analyzeAvrUsart0(source) {
  validateSource(source);
  const frames = source.records.map((record, index) => ({
    index,
    ordinal: index + 1,
    cycle: record.cycle,
    cycleDelta: index === 0 ? null : record.cycle - source.records[index - 1].cycle,
    virtualMilliseconds: record.virtualMilliseconds,
    value: record.value,
    display: record.text,
    baud: record.baud,
    frameCycles: record.frameCycles,
  }));

  return Object.freeze({
    schema: X46_UART_ANALYSIS_SCHEMA,
    status: 'decoded-byte-events',
    protocol: 'UART',
    profile: source.profile,
    channel: source.channel,
    artifactIdentity: source.artifactIdentity,
    runtimeIdentity: Object.freeze(structuredClone(source.runtimeIdentity)),
    clockHertz: source.clockHertz,
    frames: Object.freeze(frames.map(Object.freeze)),
    displayText: frames.map((frame) => frame.display).join(''),
    completeness: Object.freeze({
      retained: frames.length,
      dropped: 0,
      truncated: false,
    }),
    support: Object.freeze({
      uart: 'AVR USART0 TX byte events with model-recorded baud and frame duration',
      framing: 'unavailable — byte records do not independently prove data bits, parity or stop bits',
      signalLevel: 'unavailable — byte events are not a physical voltage waveform',
      i2c: 'unavailable — no supported I2C signal producer',
      spi: 'unavailable — no supported SPI signal producer',
    }),
    authority: Object.freeze({ apply: false, build: false, run: false, verdict: false }),
  });
}
