// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { USART_RX_OBSERVATION_LATENESS_LIMIT } from './atmega328p-adapter.mjs';
import { exactKeys } from './strict-json.mjs';
import { validateX46UsartConfigurationSource } from './x46-usart-configuration-producer.mjs';

export const X46_USART_RX_SCHEMA = 'intent-mcu-x46-usart-rx@1';

const REQUEST_KEYS = Object.freeze([
  'direction', 'cycle', 'targetCycle', 'value', 'accepted', 'immediate', 'transferId',
  'startObservationLatenessCycles', 'resetEpoch', 'baud', 'frameCycles',
  'scheduledCompletionCycle',
]);
const COMPLETION_KEYS = Object.freeze([
  'direction', 'cycle', 'transferId', 'resetEpoch', 'value', 'startCycle',
  'scheduledCompletionCycle', 'observationLatenessCycles',
]);
const TRANSFER_ID = /^rx:[1-9]\d*:[1-9]\d*$/u;
const AUTHORITY = Object.freeze({ apply: false, build: false, run: false, verdict: false });
const SUPPORT = Object.freeze({
  uart: 'pinned-emulator AVR USART0 RX byte/peripheral model events for bounded asynchronous 8-N-1',
  lineSignal: 'unavailable — no D0 edge, voltage, noise or physical signal producer',
  parity: 'unavailable — decoded-byte injection cannot supply or validate parity symbols/errors',
  i2c: 'unavailable — no accepted SDA/SCL transition producer',
  spi: 'unavailable — no accepted SCLK/MOSI/MISO/SS transition producer',
});

function reject(code) { throw Object.assign(new Error(code), { code }); }
const safeCycle = (value) => Number.isSafeInteger(value) && value >= 0;
const byte = (value) => Number.isInteger(value) && value >= 0 && value <= 255;

function validateRequest(record, resetEpoch, snapshotCycle, { strictEligibility = true } = {}) {
  if (!exactKeys(record, REQUEST_KEYS) || record.direction !== 'rx-request'
      || !safeCycle(record.cycle) || !safeCycle(record.targetCycle)
      || record.cycle < record.targetCycle || record.cycle > snapshotCycle
      || !Number.isSafeInteger(record.startObservationLatenessCycles)
      || record.startObservationLatenessCycles < 0
      || record.startObservationLatenessCycles > USART_RX_OBSERVATION_LATENESS_LIMIT
      || record.cycle !== record.targetCycle + record.startObservationLatenessCycles
      || !byte(record.value) || typeof record.accepted !== 'boolean'
      || typeof record.immediate !== 'boolean' || !TRANSFER_ID.test(record.transferId ?? '')
      || record.resetEpoch !== resetEpoch || !Number.isSafeInteger(record.baud) || record.baud <= 0
      || !Number.isSafeInteger(record.frameCycles) || record.frameCycles <= 0
      || (record.accepted
        ? record.scheduledCompletionCycle !== record.cycle + record.frameCycles
        : record.scheduledCompletionCycle !== null)) reject('X46_USART_RX_REQUEST_INVALID');
  if (strictEligibility && record.immediate) reject('X46_USART_RX_IMMEDIATE_UNSUPPORTED');
  return record;
}

function validateCompletion(record, resetEpoch, snapshotCycle, { strictEligibility = true } = {}) {
  if (!exactKeys(record, COMPLETION_KEYS) || record.direction !== 'rx-complete'
      || !safeCycle(record.cycle) || record.cycle > snapshotCycle
      || !TRANSFER_ID.test(record.transferId ?? '') || record.resetEpoch !== resetEpoch
      || !byte(record.value) || !safeCycle(record.startCycle)
      || !safeCycle(record.scheduledCompletionCycle)
      || !Number.isSafeInteger(record.observationLatenessCycles)
      || (strictEligibility && (record.observationLatenessCycles < 0
        || record.observationLatenessCycles > USART_RX_OBSERVATION_LATENESS_LIMIT))
      || record.cycle !== record.scheduledCompletionCycle + record.observationLatenessCycles) {
    reject('X46_USART_RX_COMPLETION_INVALID');
  }
  return record;
}

function validateSnapshotRecords(snapshot, {
  strictEligibility = true, allowRetentionGaps = false,
} = {}) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
      || !Number.isSafeInteger(snapshot.cycle) || snapshot.cycle < 0
      || !Array.isArray(snapshot.serial) || !snapshot.usartConfiguration) {
    reject('X46_USART_RX_SNAPSHOT_INVALID');
  }
  const resetEpoch = snapshot.usartConfiguration.resetEpoch;
  const requests = snapshot.serial.filter((record) => record?.direction === 'rx-request')
    .map((record) => validateRequest(record, resetEpoch, snapshot.cycle, { strictEligibility }));
  const completions = snapshot.serial.filter((record) => record?.direction === 'rx-complete')
    .map((record) => validateCompletion(record, resetEpoch, snapshot.cycle,
      { strictEligibility }));
  const requestIds = new Set(); const completionIds = new Set();
  for (const request of requests) {
    if (requestIds.has(request.transferId)) reject('X46_USART_RX_TRANSFER_DUPLICATE');
    requestIds.add(request.transferId);
  }
  for (const completion of completions) {
    if (completionIds.has(completion.transferId)) {
      reject('X46_USART_RX_COMPLETION_ORPHAN');
    }
    completionIds.add(completion.transferId);
    const request = requests.find((candidate) => candidate.transferId === completion.transferId);
    if (!request && allowRetentionGaps
        && Number.isSafeInteger(snapshot.retentionDrops?.serial)
        && snapshot.retentionDrops.serial > 0) continue;
    if (!request) reject('X46_USART_RX_COMPLETION_ORPHAN');
    if (!request.accepted || completion.value !== request.value
        || completion.startCycle !== request.cycle
        || completion.scheduledCompletionCycle !== request.scheduledCompletionCycle
        || snapshot.serial.indexOf(request) >= snapshot.serial.indexOf(completion)) {
      reject('X46_USART_RX_COMPLETION_CONFLICT');
    }
  }
  return { requests, completions };
}

export function validateX46UsartRxSnapshotRecords(snapshot) {
  return validateSnapshotRecords(snapshot, { strictEligibility: true });
}

export function validateX46UsartRxSnapshotCompatibility(snapshot) {
  return validateSnapshotRecords(snapshot,
    { strictEligibility: false, allowRetentionGaps: true });
}

export function deriveX46UsartRxFromPausedSnapshot(snapshot) {
  if (!snapshot || snapshot.kind !== 'paused' || snapshot.paused !== true
      || !snapshot.runtimeIdentity || !snapshot.retentionDrops
      || !Number.isSafeInteger(snapshot.retentionDrops.serial)
      || snapshot.retentionDrops.serial !== 0) reject('X46_USART_RX_SNAPSHOT_INCOMPLETE');
  const configuration = validateX46UsartConfigurationSource(snapshot.usartConfiguration, {
    runtimeIdentity: snapshot.runtimeIdentity,
    resetEpoch: snapshot.usartConfiguration?.resetEpoch,
  });
  const { requests, completions } = validateX46UsartRxSnapshotRecords(snapshot);
  if (!requests.length) reject('X46_USART_RX_SOURCE_MISSING');
  if (configuration.records.some((record) => record.cycle > snapshot.cycle)) {
    reject('X46_USART_RX_CONFIGURATION_FUTURE');
  }
  const completionById = new Map(completions.map((record) => [record.transferId, record]));
  const completed = []; const inFlight = []; let rejectedRequests = 0;
  let priorAccepted = null;
  for (const request of requests) {
    const completion = completionById.get(request.transferId);
    if (!request.accepted) {
      rejectedRequests += 1;
      if (completion) reject('X46_USART_RX_REJECTED_COMPLETION');
      continue;
    }
    if (priorAccepted && request.cycle < priorAccepted.scheduledCompletionCycle) {
      reject('X46_USART_RX_OVERLAP');
    }
    priorAccepted = request;
    if (configuration.records.some((record) => record.cycle === request.cycle)) {
      reject('X46_USART_RX_CONFIGURATION_SAME_CYCLE');
    }
    const owner = configuration.records.filter((record) => record.cycle < request.cycle).at(-1);
    if (!owner) reject('X46_USART_RX_CONFIGURATION_MISSING');
    const config = owner.configuration;
    if (config.mode !== 'asynchronous' || config.dataBits !== 8 || config.parity !== 'none'
        || config.stopBits !== 1 || config.supported !== true || config.receiverEnabled !== true) {
      reject('X46_USART_RX_CONFIGURATION_UNSUPPORTED');
    }
    if (request.frameCycles !== config.frameCycles || request.baud !== config.baud) {
      reject('X46_USART_RX_TIMING_CONFLICT');
    }
    if (!completion) {
      if (request.scheduledCompletionCycle <= snapshot.cycle) reject('X46_USART_RX_COMPLETION_MISSING');
      inFlight.push(Object.freeze({ transferId: request.transferId, value: request.value,
        startCycle: request.cycle, scheduledCompletionCycle: request.scheduledCompletionCycle,
        configurationEpoch: owner.epoch }));
      continue;
    }
    if (completion.value !== request.value || completion.startCycle !== request.cycle
        || completion.scheduledCompletionCycle !== request.scheduledCompletionCycle) {
      reject('X46_USART_RX_COMPLETION_CONFLICT');
    }
    completed.push(Object.freeze({
      transferId: request.transferId,
      value: request.value,
      startCycle: request.cycle,
      scheduledCompletionCycle: request.scheduledCompletionCycle,
      observedCompletionCycle: completion.cycle,
      observationLatenessCycles: completion.observationLatenessCycles,
      frameCycles: request.frameCycles,
      baud: request.baud,
      configurationEpoch: owner.epoch,
    }));
  }
  if (inFlight.length > 1) reject('X46_USART_RX_INFLIGHT_AMBIGUOUS');
  return Object.freeze({
    schema: X46_USART_RX_SCHEMA,
    status: 'model-rx-complete',
    profile: configuration.profile,
    channel: configuration.channel,
    runtimeIdentity: Object.freeze(structuredClone(snapshot.runtimeIdentity)),
    resetEpoch: configuration.resetEpoch,
    clock: Object.freeze({ basis: 'avr-native-cycle', hertz: configuration.clockHertz,
      completionObservation: 'first-instruction-boundary-at-or-after-avr8js-clock-event',
      maximumObservationLatenessCycles: USART_RX_OBSERVATION_LATENESS_LIMIT }),
    transfers: Object.freeze(completed),
    inFlight: Object.freeze(inFlight),
    completeness: Object.freeze({ requests: requests.length, completions: completions.length,
      completed: completed.length, inFlight: inFlight.length, rejectedRequests,
      retained: snapshot.serial.length, dropped: 0, truncated: false }),
    support: SUPPORT,
    authority: AUTHORITY,
  });
}
