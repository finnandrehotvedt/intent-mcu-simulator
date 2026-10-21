// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const X43_AVR_STACK_SCHEMA = 'intent-mcu-x43-avr-observed-stack@1';
export const X43_AVR_SRAM_START = 0x0100;
export const X43_AVR_RAMEND = 0x08ff;
export const X43_AVR_SRAM_BYTES = 0x0800;
export const X43_AVR_STACK_BOUNDARY = 'reset-and-after-each-instruction-plus-tick';

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const clone = (value) => structuredClone(value);

function reject(code) { throw Object.assign(new Error(code), { code }); }
function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}
function counter(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) reject(code);
  return value;
}
function validPointer(value) {
  return Number.isInteger(value) && value >= X43_AVR_SRAM_START && value <= X43_AVR_RAMEND;
}
function pointSnapshot(pointer, cycle, instructions) {
  return { pointer, depthBytes: X43_AVR_RAMEND - pointer,
    cycle: counter(cycle, 'X43_STACK_CYCLE'),
    instructions: counter(instructions, 'X43_STACK_INSTRUCTIONS') };
}

export function createX43AvrStackTracker({ pointer, cycle = 0, instructions = 0 }) {
  if (pointer !== X43_AVR_RAMEND) reject('X43_STACK_RESET_POINTER_INVALID');
  let currentAvailable = true;
  let currentPointer = pointer;
  let currentCycle = counter(cycle, 'X43_STACK_CYCLE');
  let currentInstructions = counter(instructions, 'X43_STACK_INSTRUCTIONS');
  let minimumPointer = pointer;
  let samples = 1;
  let allTimeReason = null;
  let intervalState = null;
  let intervalToken = null;
  let intervalReason = null;
  let intervalStartPointer = null;
  let intervalStartCycle = null;
  let intervalStartInstructions = null;
  let intervalCurrentPointer = null;
  let intervalCurrentCycle = null;
  let intervalCurrentInstructions = null;
  let intervalEndPointer = null;
  let intervalEndCycle = null;
  let intervalEndInstructions = null;
  let intervalMinimumPointer = null;
  let intervalSamples = 0;

  const materializePoint = (entryPointer, entryCycle, entryInstructions) =>
    pointSnapshot(entryPointer, entryCycle, entryInstructions);
  const materializeInterval = () => intervalState ? {
    state: intervalState,
    token: intervalToken,
    reason: intervalReason,
    start: materializePoint(intervalStartPointer, intervalStartCycle, intervalStartInstructions),
    current: intervalCurrentPointer === null ? null
      : materializePoint(intervalCurrentPointer, intervalCurrentCycle, intervalCurrentInstructions),
    end: intervalEndPointer === null ? null
      : materializePoint(intervalEndPointer, intervalEndCycle, intervalEndInstructions),
    minimumPointer: intervalMinimumPointer,
    maximumObservedDepthBytes: X43_AVR_RAMEND - intervalMinimumPointer,
    samples: intervalSamples,
  } : null;

  const snapshot = () => Object.freeze({
    schema: X43_AVR_STACK_SCHEMA,
    source: 'avr8js@0.21.1 CPU.SP',
    boundary: X43_AVR_STACK_BOUNDARY,
    sram: Object.freeze({ start: X43_AVR_SRAM_START, end: X43_AVR_RAMEND,
      bytes: X43_AVR_SRAM_BYTES, registerSpaceBytes: X43_AVR_SRAM_START }),
    resetPointer: X43_AVR_RAMEND,
    current: currentAvailable
      ? materializePoint(currentPointer, currentCycle, currentInstructions) : null,
    allTime: allTimeReason ? null : Object.freeze({ minimumPointer,
      maximumObservedDepthBytes: X43_AVR_RAMEND - minimumPointer, samples }),
    allTimeReason,
    interval: materializeInterval(),
    semantics: Object.freeze({ growsTowardLowerAddresses: true,
      includesInterruptEntryAfterTick: true, includesNestedInterruptsWhenFirmwareReenablesThem: true,
      measuresAddressDistanceFromResetTop: true, measuresLiveBytes: false,
      measuresHeap: false, measuresFreeSram: false, memoryHighWaterMark: false }),
  });

  const observe = (nextPointer, nextCycle, nextInstructions) => {
    counter(nextCycle, 'X43_STACK_CYCLE'); counter(nextInstructions, 'X43_STACK_INSTRUCTIONS');
    if (currentAvailable && (nextCycle < currentCycle || nextInstructions < currentInstructions)) {
      reject('X43_STACK_COUNTER_REGRESSION');
    }
    samples += 1;
    if (!validPointer(nextPointer)) {
      currentAvailable = false;
      allTimeReason = 'stack-pointer-outside-atmega328p-sram';
      if (intervalState === 'observing') {
        intervalState = 'unavailable';
        intervalReason = allTimeReason;
        intervalEndPointer = null;
        intervalEndCycle = null;
        intervalEndInstructions = null;
      }
      return;
    }
    currentAvailable = true;
    currentPointer = nextPointer;
    currentCycle = nextCycle;
    currentInstructions = nextInstructions;
    if (!allTimeReason) minimumPointer = Math.min(minimumPointer, nextPointer);
    if (intervalState === 'observing') {
      intervalCurrentPointer = nextPointer;
      intervalCurrentCycle = nextCycle;
      intervalCurrentInstructions = nextInstructions;
      intervalMinimumPointer = Math.min(intervalMinimumPointer, nextPointer);
      intervalSamples += 1;
    }
  };

  const start = (token) => {
    if (!TOKEN.test(token ?? '')) reject('X43_STACK_TOKEN_INVALID');
    if (!currentAvailable) reject('X43_STACK_CURRENT_UNAVAILABLE');
    intervalState = 'observing';
    intervalToken = token;
    intervalReason = null;
    intervalStartPointer = currentPointer;
    intervalStartCycle = currentCycle;
    intervalStartInstructions = currentInstructions;
    intervalCurrentPointer = currentPointer;
    intervalCurrentCycle = currentCycle;
    intervalCurrentInstructions = currentInstructions;
    intervalEndPointer = null;
    intervalEndCycle = null;
    intervalEndInstructions = null;
    intervalMinimumPointer = currentPointer;
    intervalSamples = 1;
    return snapshot();
  };

  const capture = (token) => {
    if (!TOKEN.test(token ?? '') || intervalToken !== token) reject('X43_STACK_TOKEN_STALE');
    if (intervalState === 'unavailable') return snapshot();
    if (intervalState !== 'observing' || !currentAvailable) reject('X43_STACK_NOT_OBSERVING');
    intervalState = 'captured';
    intervalCurrentPointer = currentPointer;
    intervalCurrentCycle = currentCycle;
    intervalCurrentInstructions = currentInstructions;
    intervalEndPointer = currentPointer;
    intervalEndCycle = currentCycle;
    intervalEndInstructions = currentInstructions;
    return snapshot();
  };

  return Object.freeze({ observe, start, capture, snapshot });
}

export function validateX43AvrStackSnapshot(value) {
  if (!exactKeys(value, ['schema', 'source', 'boundary', 'sram', 'resetPointer', 'current',
    'allTime', 'allTimeReason', 'interval', 'semantics'])
      || !exactKeys(value.sram, ['start', 'end', 'bytes', 'registerSpaceBytes'])
      || !exactKeys(value.semantics, ['growsTowardLowerAddresses',
        'includesInterruptEntryAfterTick', 'includesNestedInterruptsWhenFirmwareReenablesThem',
        'measuresAddressDistanceFromResetTop', 'measuresLiveBytes', 'measuresHeap',
        'measuresFreeSram', 'memoryHighWaterMark'])
      || value.schema !== X43_AVR_STACK_SCHEMA
      || value.source !== 'avr8js@0.21.1 CPU.SP' || value.boundary !== X43_AVR_STACK_BOUNDARY
      || value.resetPointer !== X43_AVR_RAMEND
      || value.sram?.start !== X43_AVR_SRAM_START || value.sram?.end !== X43_AVR_RAMEND
      || value.sram?.bytes !== X43_AVR_SRAM_BYTES || value.sram?.registerSpaceBytes !== X43_AVR_SRAM_START
      || value.semantics?.growsTowardLowerAddresses !== true
      || value.semantics?.includesInterruptEntryAfterTick !== true
      || value.semantics?.includesNestedInterruptsWhenFirmwareReenablesThem !== true
      || value.semantics?.measuresAddressDistanceFromResetTop !== true
      || value.semantics?.measuresLiveBytes !== false || value.semantics?.measuresHeap !== false
      || value.semantics?.measuresFreeSram !== false || value.semantics?.memoryHighWaterMark !== false) {
    reject('X43_STACK_SNAPSHOT_INVALID');
  }
  const validPoint = (entry) => exactKeys(entry, ['pointer', 'depthBytes', 'cycle', 'instructions'])
    && validPointer(entry.pointer) && entry.depthBytes === X43_AVR_RAMEND - entry.pointer
    && Number.isSafeInteger(entry.cycle) && entry.cycle >= 0
    && Number.isSafeInteger(entry.instructions) && entry.instructions >= 0;
  if (value.current && !validPoint(value.current)) {
    reject('X43_STACK_CURRENT_INVALID');
  }
  if (value.allTime && (!exactKeys(value.allTime,
    ['minimumPointer', 'maximumObservedDepthBytes', 'samples'])
      || !validPointer(value.allTime.minimumPointer)
      || value.allTime.maximumObservedDepthBytes !== X43_AVR_RAMEND - value.allTime.minimumPointer
      || !Number.isSafeInteger(value.allTime.samples) || value.allTime.samples < 1)) {
    reject('X43_STACK_ALL_TIME_INVALID');
  }
  if ((value.allTime && value.allTimeReason !== null)
      || (!value.allTime && typeof value.allTimeReason !== 'string')) {
    reject('X43_STACK_ALL_TIME_REASON_INVALID');
  }
  if (value.interval) {
    const interval = value.interval;
    if (!exactKeys(interval, ['state', 'token', 'reason', 'start', 'current', 'end',
      'minimumPointer', 'maximumObservedDepthBytes', 'samples'])
        || !TOKEN.test(interval.token ?? '')
        || !['observing', 'captured', 'unavailable'].includes(interval.state)
        || !validPoint(interval.start) || (interval.current && !validPoint(interval.current))
        || (interval.end && !validPoint(interval.end))
        || !validPointer(interval.minimumPointer)
        || interval.maximumObservedDepthBytes !== X43_AVR_RAMEND - interval.minimumPointer
        || !Number.isSafeInteger(interval.samples) || interval.samples < 1
        || (interval.state === 'captured' && !interval.end)
        || (interval.state === 'observing' && interval.end !== null)
        || (interval.state === 'unavailable' && typeof interval.reason !== 'string')) {
      reject('X43_STACK_INTERVAL_INVALID');
    }
  }
  return clone(value);
}
