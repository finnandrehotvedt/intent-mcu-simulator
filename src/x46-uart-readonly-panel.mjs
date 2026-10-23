// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { AVR_PROFILE } from './compile-targets.mjs';
import {
  X46_UART_ANALYSIS_SCHEMA,
  X46_UART_SOURCE_SCHEMA,
  analyzeAvrUsart0,
} from './x46-uart-protocol-analyzer.mjs';

export const X46_UART_PANEL_SCHEMA = 'intent-mcu-x46-uart-panel@1';
export const X46_UART_PANEL_INPUT_SCHEMA = 'intent-mcu-x46-uart-panel-input@1';

const HASH = /^[0-9a-f]{64}$/u;
const NONCE = /^[0-9a-f]{32}$/u;
const AUTHORITY = Object.freeze({ apply: false, build: false, run: false, verdict: false });
const SUPPORT = Object.freeze({
  uart: 'AVR USART0 TX byte events from the current validated worker only',
  framing: 'unavailable — byte records do not independently prove data bits, parity or stop bits',
  signalLevel: 'unavailable — no physical voltage waveform or line-noise measurement',
  i2c: 'unavailable — no supported I2C signal producer',
  spi: 'unavailable — no supported SPI signal producer',
});

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function sameIdentity(left, right) {
  return left && right && JSON.stringify(left) === JSON.stringify(right);
}

function validWorkerIdentity(value) {
  return exactKeys(value, [
    'schema', 'projectGeneration', 'runtimeGeneration', 'artifactIdentity',
    'modelImplementationSha256', 'modelExecutionContextSha256',
    'workerInitialization', 'workerInstanceNonce',
  ]) && value.schema === 'intent-mcu-worker-runtime-identity@2'
    && Number.isSafeInteger(value.projectGeneration) && value.projectGeneration > 0
    && Number.isSafeInteger(value.runtimeGeneration) && value.runtimeGeneration > 0
    && Number.isSafeInteger(value.workerInitialization) && value.workerInitialization > 0
    && HASH.test(value.artifactIdentity ?? '')
    && HASH.test(value.modelImplementationSha256 ?? '')
    && HASH.test(value.modelExecutionContextSha256 ?? '')
    && NONCE.test(value.workerInstanceNonce ?? '');
}

function result(state, reason, extras = {}) {
  return Object.freeze({
    schema: X46_UART_PANEL_SCHEMA,
    state,
    reason,
    frames: Object.freeze([]),
    identity: null,
    retention: Object.freeze({ retainedTx: 0, retainedAll: 0, dropped: 0, truncated: false }),
    support: SUPPORT,
    authority: AUTHORITY,
    ...extras,
  });
}
function identityResult(identity) {
  return Object.freeze({
    artifactIdentity: identity.artifactIdentity,
    projectGeneration: identity.projectGeneration,
    runtimeGeneration: identity.runtimeGeneration,
    workerInitialization: identity.workerInitialization,
    workerInstanceNonce: identity.workerInstanceNonce,
    modelImplementationSha256: identity.modelImplementationSha256,
    modelExecutionContextSha256: identity.modelExecutionContextSha256,
  });
}

function invalid(code) {
  return result('invalid', code);
}

export function assessX46UartReadonlyPanel(input) {
  if (!exactKeys(input, [
    'schema', 'profile', 'lifecyclePhase', 'buildArtifactIdentity',
    'lifecycleRuntimeBinding', 'trustedCurrentWorker', 'currentWorkerIdentity',
    'runtimeSnapshot',
  ]) || input.schema !== X46_UART_PANEL_INPUT_SCHEMA) return invalid('X46_PANEL_INPUT_INVALID');
  if (input.profile !== AVR_PROFILE) return result('unavailable', 'profile-not-avr');
  if (input.trustedCurrentWorker !== true || !input.currentWorkerIdentity
      || !input.runtimeSnapshot || !input.lifecycleRuntimeBinding
      || !HASH.test(input.buildArtifactIdentity ?? '')) {
    return result('unavailable', 'no-current-validated-worker');
  }
  if (!validWorkerIdentity(input.currentWorkerIdentity)) return invalid('X46_WORKER_IDENTITY_INVALID');
  const binding = input.lifecycleRuntimeBinding;
  if (!exactKeys(binding, ['projectGeneration', 'runtimeGeneration', 'artifactIdentity'])
      || !Number.isSafeInteger(binding.projectGeneration) || binding.projectGeneration < 1
      || !Number.isSafeInteger(binding.runtimeGeneration) || binding.runtimeGeneration < 1
      || !HASH.test(binding.artifactIdentity ?? '')) return invalid('X46_LIFECYCLE_BINDING_INVALID');
  const identity = input.currentWorkerIdentity;
  const runtimeIdentity = input.runtimeSnapshot.runtimeIdentity;
  if (!validWorkerIdentity(runtimeIdentity)
      || !sameIdentity(identity, runtimeIdentity)
      || binding.projectGeneration !== identity.projectGeneration
      || binding.runtimeGeneration !== identity.runtimeGeneration
      || binding.artifactIdentity !== identity.artifactIdentity
      || input.buildArtifactIdentity !== identity.artifactIdentity
      || input.runtimeSnapshot.modelExecutionContextSha256 !== identity.modelExecutionContextSha256) {
    return result('stale', 'runtime-identity-changed');
  }
  if (input.lifecyclePhase !== 'paused' || input.runtimeSnapshot.paused !== true) {
    return result('unavailable', 'explicit-pause-required', { identity: identityResult(identity) });
  }
  const serial = input.runtimeSnapshot.instruments?.serial;
  if (!serial || !Array.isArray(serial.records)
      || !Number.isSafeInteger(serial.retained) || serial.retained !== serial.records.length
      || !Number.isSafeInteger(serial.dropped) || serial.dropped < 0) {
    return result('invalid', 'X46_SERIAL_RETENTION_INVALID', { identity: identityResult(identity) });
  }
  const tx = serial.records.filter((record) => record?.direction === 'tx');
  const retention = Object.freeze({
    retainedTx: tx.length,
    retainedAll: serial.records.length,
    dropped: serial.dropped,
    truncated: serial.dropped > 0,
  });
  if (!tx.length && serial.dropped === 0) {
    return result('empty', 'current-worker-has-no-tx-bytes', {
      identity: identityResult(identity), retention,
    });
  }
  let analysis;
  try {
    analysis = analyzeAvrUsart0({
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
      records: tx,
      retention: { retained: tx.length, dropped: serial.dropped, truncated: serial.dropped > 0 },
    });
  } catch (error) {
    return result(error.code === 'X46_UART_SOURCE_INCOMPLETE' ? 'partial' : 'invalid',
      error.code ?? 'X46_UART_ANALYSIS_REJECTED', {
        identity: identityResult(identity), retention,
      });
  }
  if (analysis.schema !== X46_UART_ANALYSIS_SCHEMA) return invalid('X46_UART_ANALYSIS_INVALID');
  return result('current', 'current-paused-worker-complete', {
    frames: Object.freeze(analysis.frames.map((frame) => Object.freeze(structuredClone(frame)))),
    displayText: analysis.displayText,
    identity: identityResult(identity),
    retention,
  });
}
