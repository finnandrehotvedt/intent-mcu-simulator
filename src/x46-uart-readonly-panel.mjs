// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { AVR_PROFILE } from './compile-targets.mjs';
import {
  X46_UART_ANALYSIS_SCHEMA,
  X46_UART_SOURCE_SCHEMA,
  analyzeAvrUsart0,
} from './x46-uart-protocol-analyzer.mjs';
import { deriveX46UsartFramingFromPausedSnapshot } from './x46-usart-framing-contract.mjs';
import { deriveX46UsartRxFromPausedSnapshot } from './x46-usart-rx-contract.mjs';

export const X46_UART_PANEL_SCHEMA = 'intent-mcu-x46-uart-panel@1';
export const X46_UART_PANEL_INPUT_SCHEMA = 'intent-mcu-x46-uart-panel-input@1';

const HASH = /^[0-9a-f]{64}$/u;
const NONCE = /^[0-9a-f]{32}$/u;
const AUTHORITY = Object.freeze({ apply: false, build: false, run: false, verdict: false });
const SUPPORT = Object.freeze({
  uart: 'AVR USART0 TX byte events from the current validated worker only',
  rx: 'unavailable — no complete current paused-worker RX transfer',
  framing: 'unavailable — byte records do not independently prove data bits, parity or stop bits',
  signalLevel: 'unavailable — no physical voltage waveform or line-noise measurement',
  i2c: 'unavailable — no supported I2C signal producer',
  spi: 'unavailable — no supported SPI signal producer',
});
const EMPTY_FRAMING = Object.freeze({
  state: 'unavailable',
  reason: 'no-current-complete-framing',
  completed: 0,
  inFlight: 0,
  frames: Object.freeze([]),
  modelDerived: true,
  physicalSignal: false,
});
const EMPTY_RX = Object.freeze({
  state: 'unavailable', reason: 'no-current-complete-rx', completed: 0,
  inFlight: 0, rejected: 0, transfers: Object.freeze([]),
  modelDerived: true, physicalSignal: false,
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
    framing: EMPTY_FRAMING,
    rx: EMPTY_RX,
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
  let framing = EMPTY_FRAMING;
  try {
    const derived = deriveX46UsartFramingFromPausedSnapshot(input.runtimeSnapshot);
    framing = Object.freeze({
      state: 'current',
      reason: 'same-paused-worker-model-derived',
      completed: derived.completeness.framedRecords,
      inFlight: derived.completeness.inFlightRecords,
      frames: Object.freeze(derived.frames.map((frame) => Object.freeze(structuredClone(frame)))),
      modelDerived: true,
      physicalSignal: false,
    });
  } catch (error) {
    framing = Object.freeze({ ...EMPTY_FRAMING, reason: error.code ?? 'X46_USART_FRAMING_REJECTED' });
  }
  let rx = EMPTY_RX;
  try {
    const derived = deriveX46UsartRxFromPausedSnapshot(input.runtimeSnapshot);
    rx = Object.freeze({
      state: 'current', reason: 'same-paused-worker-model-derived',
      completed: derived.completeness.completed,
      inFlight: derived.completeness.inFlight,
      rejected: derived.completeness.rejectedRequests,
      transfers: Object.freeze(derived.transfers.map((transfer) =>
        Object.freeze(structuredClone(transfer)))),
      modelDerived: true, physicalSignal: false,
    });
  } catch (error) {
    rx = Object.freeze({ ...EMPTY_RX, reason: error.code ?? 'X46_USART_RX_REJECTED' });
  }
  return result('current', 'current-paused-worker-complete', {
    frames: Object.freeze(analysis.frames.map((frame) => Object.freeze(structuredClone(frame)))),
    displayText: analysis.displayText,
    identity: identityResult(identity),
    retention,
    framing,
    rx,
    support: framing.state === 'current' || rx.state === 'current' ? Object.freeze({
      ...SUPPORT,
      ...(framing.state === 'current' ? {
        framing: 'bounded model-derived asynchronous 8-N-1 framing from the same paused worker snapshot',
      } : {}),
      ...(rx.state === 'current' ? {
        rx: 'bounded model-derived USART0 RX byte transfers from the same paused worker snapshot',
      } : {}),
    }) : SUPPORT,
  });
}
