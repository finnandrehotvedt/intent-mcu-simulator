// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export const X37_TURNAROUND_TOPOLOGY = Object.freeze({
  schema: 'intent-mcu-x37-turnaround-topology@1',
  netId: 'shared.digital.0',
  pullup: Object.freeze({ voltage: 3.3, resistanceOhms: 10_000, explicit: true }),
  participants: Object.freeze({
    avr: Object.freeze({ input: 'D2', openDrainOutput: 'D13', driveLevel: false }),
    rp: Object.freeze({ input: 'GPIO1', openDrainOutput: 'GPIO0', driveLevel: false }),
  }),
});

export const X37_TURNAROUND_BUDGET = Object.freeze({
  maximumSamplesPerWait: 8192,
  lowHoldSamples: 4096,
  maximumInstructionsPerParticipant: 1_000_000,
  maximumAdvanceCallsPerParticipant: 32,
  maximumEvents: 32,
  wallTimeoutMilliseconds: 75_000,
  retries: 0,
  avrClock: Object.freeze({ numerator: 1, denominator: 125 }),
  rpClock: Object.freeze({ numerator: 1, denominator: 8 }),
});

export const X37_TURNAROUND_PHASES = Object.freeze([
  Object.freeze({ phase: 'idle', actor: null, action: 'RELEASE', expectedLevel: true }),
  Object.freeze({ phase: 'request', actor: 'avr', action: 'DRIVE_LOW', expectedLevel: false }),
  Object.freeze({ phase: 'request-release', actor: 'avr', action: 'RELEASE', expectedLevel: true }),
  Object.freeze({ phase: 'ack', actor: 'rp', action: 'DRIVE_LOW', expectedLevel: false }),
  Object.freeze({ phase: 'ack-release', actor: 'rp', action: 'RELEASE', expectedLevel: true }),
  Object.freeze({ phase: 'confirm', actor: 'avr', action: 'DRIVE_LOW', expectedLevel: false }),
  Object.freeze({ phase: 'confirm-release', actor: 'avr', action: 'RELEASE', expectedLevel: true }),
]);

export function validateX37TurnaroundTrace(trace) {
  if (!Array.isArray(trace) || trace.length !== X37_TURNAROUND_PHASES.length) {
    fail('X37_TURNAROUND_TRACE_INVALID');
  }
  let priorTick = -1;
  for (let index = 0; index < trace.length; index += 1) {
    const value = trace[index]; const expected = X37_TURNAROUND_PHASES[index];
    if (!value || value.phase !== expected.phase || value.actor !== expected.actor
        || value.action !== expected.action || value.level !== expected.expectedLevel
        || !Number.isSafeInteger(value.mappedTick) || value.mappedTick <= priorTick
        || value.state === 'CONFLICT' || value.state === 'HIGH_Z'
        || value.level !== (value.state === 'HIGH')) fail('X37_TURNAROUND_TRACE_INVALID');
    priorTick = value.mappedTick;
  }
  return { accepted: true, finalState: 'HIGH', explicitBias: true,
    dependentOutputs: ['rp:ack-after-request', 'avr:confirm-after-ack'] };
}
