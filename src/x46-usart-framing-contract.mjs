// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { analyzeAvrUsart0 } from './x46-uart-protocol-analyzer.mjs';
import { validateX46UsartConfigurationSource } from './x46-usart-configuration-producer.mjs';

export const X46_USART_FRAMING_SCHEMA = 'intent-mcu-x46-usart-framing@1';

const AUTHORITY = Object.freeze({ apply: false, build: false, run: false, verdict: false });
const SUPPORT = Object.freeze({
  uart: 'model-derived AVR USART0 TX framing for complete identity-bound 8-N-1 records',
  rx: 'unavailable — no supported RX framing producer',
  parity: 'unavailable — this bounded contract accepts no parity modes',
  signalLevel: 'unavailable — semantic symbols are not physical voltage or noise evidence',
  i2c: 'unavailable — no supported I2C signal producer',
  spi: 'unavailable — no supported SPI signal producer',
});

function reject(code) {
  throw Object.assign(new Error(code), { code });
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function displayByte(value) {
  if (value === 10) return '\n';
  if (value === 13) return '\r';
  if (value >= 32 && value <= 126) return String.fromCharCode(value);
  return `\\x${value.toString(16).padStart(2, '0')}`;
}

function matchingIdentity(uartIdentity, runtimeIdentity) {
  return uartIdentity.runtimeGeneration === runtimeIdentity.runtimeGeneration
    && uartIdentity.workerInstanceNonce === runtimeIdentity.workerInstanceNonce
    && uartIdentity.modelExecutionContextSha256 === runtimeIdentity.modelExecutionContextSha256;
}

function symbols(value) {
  return Object.freeze([
    Object.freeze({ kind: 'start', value: 0 }),
    ...Array.from({ length: 8 }, (_, index) => Object.freeze({
      kind: 'data', index, value: (value >> index) & 1,
    })),
    Object.freeze({ kind: 'stop', value: 1 }),
  ]);
}

export function deriveX46UsartFramingFromPausedSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
      || snapshot.kind !== 'paused' || snapshot.paused !== true
      || !Number.isSafeInteger(snapshot.cycle) || snapshot.cycle < 0
      || !snapshot.runtimeIdentity || !snapshot.usartConfiguration
      || !Array.isArray(snapshot.serial)
      || !snapshot.retentionDrops || !Number.isSafeInteger(snapshot.retentionDrops.serial)
      || snapshot.retentionDrops.serial < 0) {
    reject('X46_USART_FRAMING_SNAPSHOT_INVALID');
  }
  if (snapshot.retentionDrops.serial !== 0) reject('X46_USART_FRAMING_SERIAL_INCOMPLETE');
  const resetEpoch = snapshot.usartConfiguration.resetEpoch;
  const configuration = validateX46UsartConfigurationSource(
    snapshot.usartConfiguration,
    { runtimeIdentity: snapshot.runtimeIdentity, resetEpoch },
  );
  if (configuration.records.some((record) => record.cycle > snapshot.cycle)) {
    reject('X46_USART_FRAMING_CONFIGURATION_FUTURE');
  }
  const tx = snapshot.serial.filter((record) => record?.direction === 'tx');
  if (!tx.length || tx.some((record) => !Number.isSafeInteger(record.cycle)
      || record.cycle < 0 || record.cycle > snapshot.cycle)) {
    reject('X46_USART_FRAMING_TX_CYCLE_INVALID');
  }
  const uart = analyzeAvrUsart0({
    schema: 'intent-mcu-x46-uart-source@1',
    profile: configuration.profile,
    channel: configuration.channel,
    artifactIdentity: snapshot.runtimeIdentity.artifactIdentity,
    runtimeIdentity: {
      runtimeGeneration: snapshot.runtimeIdentity.runtimeGeneration,
      workerInstanceNonce: snapshot.runtimeIdentity.workerInstanceNonce,
      modelExecutionContextSha256: snapshot.runtimeIdentity.modelExecutionContextSha256,
    },
    clockHertz: configuration.clockHertz,
    records: tx.map((record) => ({
      direction: 'tx',
      cycle: record.cycle,
      value: record.value,
      baud: record.baud,
      frameCycles: record.frameCycles,
      virtualMilliseconds: record.cycle / 16_000,
      text: displayByte(record.value),
    })),
    retention: { retained: tx.length, dropped: 0, truncated: false },
  });
  if (!matchingIdentity(uart.runtimeIdentity, snapshot.runtimeIdentity)
      || uart.artifactIdentity !== snapshot.runtimeIdentity.artifactIdentity) {
    reject('X46_USART_FRAMING_IDENTITY_STALE');
  }

  uart.frames.forEach((frame, index) => {
    if (index > 0) {
      const previous = uart.frames[index - 1];
      if (frame.cycle < previous.cycle + previous.frameCycles) {
        reject('X46_USART_FRAMING_TX_OVERLAP');
      }
    }
  });
  const completed = uart.frames.filter((frame) => frame.cycle + frame.frameCycles <= snapshot.cycle);
  const inFlight = uart.frames.length - completed.length;
  if (inFlight > 1 || (inFlight === 1 && completed.length !== uart.frames.length - 1)) {
    reject('X46_USART_FRAMING_COMPLETION_AMBIGUOUS');
  }
  const frames = completed.map((frame) => {
    if (configuration.records.some((record) => record.cycle === frame.cycle)) {
      reject('X46_USART_FRAMING_CONFIGURATION_SAME_CYCLE');
    }
    // avr8js 0.21.1 calls onByteTransmit synchronously on the UDR write and
    // schedules TXC/UDRE cyclesPerChar later. A configuration record from the
    // same CPU cycle has no retained intra-cycle ordering, so only a strictly
    // earlier configuration can own this model-derived frame.
    const candidates = configuration.records.filter((record) => record.cycle < frame.cycle);
    const record = candidates.at(-1);
    if (!record) reject('X46_USART_FRAMING_CONFIGURATION_MISSING');
    const config = record.configuration;
    if (config.mode !== 'asynchronous' || config.dataBits !== 8
        || config.parity !== 'none' || config.stopBits !== 1 || config.supported !== true
        || config.transmitterEnabled !== true) {
      reject('X46_USART_FRAMING_CONFIGURATION_UNSUPPORTED');
    }
    if (frame.frameCycles !== config.frameCycles || Math.floor(frame.baud) !== config.baud
        || frame.frameCycles % 10 !== 0) {
      reject('X46_USART_FRAMING_TIMING_CONFLICT');
    }
    return Object.freeze({
      ordinal: frame.ordinal,
      recordCycle: frame.cycle,
      value: frame.value,
      configurationEpoch: record.epoch,
      frameCycles: frame.frameCycles,
      cyclesPerSymbol: frame.frameCycles / 10,
      symbols: symbols(frame.value),
    });
  });

  return Object.freeze({
    schema: X46_USART_FRAMING_SCHEMA,
    status: 'derived-model-framing',
    profile: configuration.profile,
    channel: configuration.channel,
    runtimeIdentity: Object.freeze(structuredClone(snapshot.runtimeIdentity)),
    resetEpoch,
    epochProvenance: 'same-paused-reset-isolated-worker-snapshot',
    frames: Object.freeze(frames),
    completeness: Object.freeze({
      configurationRecords: configuration.retention.retained,
      txRecords: uart.completeness.retained,
      framedRecords: frames.length,
      inFlightRecords: inFlight,
      dropped: 0,
      truncated: false,
    }),
    support: SUPPORT,
    authority: AUTHORITY,
  });
}
