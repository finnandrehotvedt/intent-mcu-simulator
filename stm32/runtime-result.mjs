// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0

import { STM32_PROFILE } from './protocol.mjs';

const ENGINE_VERSION = '1.17.0';
const ENGINE_ASSET_SHA256 = '4ba7c68b59e2447f188ef4b4b112fcccd2802582c460beedceb63b84e5605a5f';

export function parseStm32RuntimeResult(raw, expected) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 256 * 1024
    || typeof expected?.pb0 !== 'boolean'
    || !/^[A-Z0-9 _-]{1,24}\n$/u.test(expected?.uartText ?? '')) {
    throw new Error('SOURCE_RUNTIME_RESULT_INVALID');
  }
  const lines = raw.split(/\r?\n/u).filter((line) => line.trim());
  if (lines.length !== 1) throw new Error('SOURCE_RUNTIME_RESULT_INVALID');
  let value;
  try { value = JSON.parse(lines[0]); } catch { throw new Error('SOURCE_RUNTIME_RESULT_INVALID'); }
  if (value?.accepted !== true
    || value.schema !== 'intent-mcu-renode-conformance@1'
    || value.profile !== STM32_PROFILE
    || value.engine?.id !== 'renode' || value.engine?.version !== ENGINE_VERSION
    || value.engine?.releaseAssetSha256 !== ENGINE_ASSET_SHA256
    || value.compiler !== 'arm-none-eabi-gcc-14.3.1'
    || value.fullStm32Support !== false || value.publicSupport !== false
    || value.resetReplay !== true || value.instructionOrdinalsNotPhysicalCycles !== true
    || value.unsupportedMmioBlockedBySourceProfile !== true
    || value.finalState?.PB0 !== expected.pb0 || value.observed?.pb0 !== expected.pb0
    || value.observed?.uartText !== expected.uartText || !Array.isArray(value.events)) {
    throw new Error('SOURCE_RUNTIME_RESULT_INVALID');
  }
  const expectedBytes = [...Buffer.from(expected.uartText, 'ascii')];
  const perEpoch = 1 + expectedBytes.length;
  if (value.events.length !== perEpoch * 2) throw new Error('SOURCE_RUNTIME_EVENT_MISMATCH');
  for (const epoch of [0, 1]) {
    const events = value.events.slice(epoch * perEpoch, (epoch + 1) * perEpoch);
    const gpio = events[0];
    if (gpio?.schema !== 'intent-mcu-runtime-event@1' || gpio.epoch !== epoch
      || gpio.type !== 'gpio' || gpio.pin !== 'PB0' || gpio.level !== expected.pb0
      || gpio.mode !== 'output') throw new Error('SOURCE_RUNTIME_EVENT_MISMATCH');
    const uart = events.slice(1);
    if (JSON.stringify(uart.map((event) => event.value)) !== JSON.stringify(expectedBytes)
      || uart.some((event) => event.schema !== 'intent-mcu-runtime-event@1'
        || event.epoch !== epoch || event.type !== 'uart-tx' || event.port !== 'USART3')) {
      throw new Error('SOURCE_RUNTIME_EVENT_MISMATCH');
    }
  }
  const first = value.events.slice(0, perEpoch).map(({ sequence, epoch, ...event }) => event);
  const second = value.events.slice(perEpoch).map(({ sequence, epoch, ...event }) => event);
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    throw new Error('SOURCE_RUNTIME_RESET_MISMATCH');
  }
  if (value.artifact?.container?.sha256 !== expected.elfSha256
    || value.artifact?.container?.bytes !== expected.elfBytes) {
    throw new Error('SOURCE_RUNTIME_ARTIFACT_INVALID');
  }
  return Object.freeze(structuredClone(value));
}
