// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  AVR_PROFILE,
  ESP32C3_PROFILE,
  RP2040_PROFILE,
  STM32F429ZI_PROFILE,
} from './compile-targets.mjs';

export const X43_PROFILE_SCHEMA = 'intent-mcu-x43-avr-observation-interval@1';
export const X43_OBSERVATION_SCHEMA = 'intent-mcu-x43-avr-worker-observation@1';
export const X43_CLOCK_HERTZ = 16_000_000;

const HASH = /^[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
const OBSERVATION_KEYS = Object.freeze([
  'schema', 'profile', 'revision', 'sourceIdentity', 'artifactIdentity',
  'projectGeneration', 'buildGeneration', 'runtimeGeneration', 'phase',
  'modelImplementationSha256', 'modelExecutionContextSha256',
  'workerInitialization', 'workerInstanceNonce', 'cycle', 'instructions', 'paused',
]);
const BINDING_KEYS = Object.freeze(OBSERVATION_KEYS.filter(
  (key) => !['schema', 'phase', 'cycle', 'instructions', 'paused'].includes(key),
));
const CURRENT_PHASES = new Set(['ready', 'running', 'paused']);
const clone = (value) => structuredClone(value);

function reject(code) {
  throw Object.assign(new Error(code), { code });
}

function exactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) reject(code);
}

function safeCounter(value, code, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) reject(code);
  return value;
}

function finiteWall(value, code) {
  if (!Number.isFinite(value) || value < 0) reject(code);
  return value;
}

function diagnosticRate(delta, wallMilliseconds) {
  if (wallMilliseconds <= 0) return null;
  const value = delta / (wallMilliseconds / 1000);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function unavailableReason(profile) {
  if (profile === RP2040_PROFILE) return 'unavailable-rp2040-profile-contract-pending';
  if (profile === ESP32C3_PROFILE) return 'unavailable-esp32c3-no-cpu-profile-producer';
  if (profile === STM32F429ZI_PROFILE) return 'unavailable-stm32-instruction-ordinals-not-cycles';
  return 'unavailable-no-current-avr-worker';
}

function validateX43AvrObservationValue(value, { allowPauseTransition = false } = {}) {
  exactKeys(value, OBSERVATION_KEYS, 'X43_OBSERVATION_KEYS');
  if (value.schema !== X43_OBSERVATION_SCHEMA) reject('X43_OBSERVATION_SCHEMA');
  if (value.profile !== AVR_PROFILE) reject(unavailableReason(value.profile));
  safeCounter(value.revision, 'X43_REVISION');
  safeCounter(value.projectGeneration, 'X43_PROJECT_GENERATION', 1);
  safeCounter(value.buildGeneration, 'X43_BUILD_GENERATION', 1);
  safeCounter(value.runtimeGeneration, 'X43_RUNTIME_GENERATION', 1);
  safeCounter(value.workerInitialization, 'X43_WORKER_INITIALIZATION', 1);
  safeCounter(value.cycle, 'X43_CYCLE');
  safeCounter(value.instructions, 'X43_INSTRUCTIONS');
  if (!HASH.test(value.sourceIdentity)) reject('X43_SOURCE_IDENTITY');
  if (!HASH.test(value.artifactIdentity)) reject('X43_ARTIFACT_IDENTITY');
  if (!HASH.test(value.modelImplementationSha256)) reject('X43_MODEL_IMPLEMENTATION');
  if (!HASH.test(value.modelExecutionContextSha256)) reject('X43_MODEL_CONTEXT');
  if (!NONCE.test(value.workerInstanceNonce)) reject('X43_WORKER_NONCE');
  if (!CURRENT_PHASES.has(value.phase)) reject('X43_RUNTIME_NOT_CURRENT');
  if (typeof value.paused !== 'boolean') reject('X43_PAUSE_STATE_MISMATCH');
  const pauseTransition = (value.phase === 'paused' && value.paused !== true)
    || (value.phase === 'running' && value.paused !== false);
  if (pauseTransition && !allowPauseTransition) reject('X43_PAUSE_STATE_MISMATCH');
  return clone(value);
}

export function validateX43AvrObservation(value) {
  return validateX43AvrObservationValue(value);
}

export function projectX43AvrObservationStatus(profile, state) {
  if (profile !== AVR_PROFILE) reject(unavailableReason(profile));
  const lifecycle = state?.lifecycle;
  const artifact = lifecycle?.artifact;
  const runtimeBinding = lifecycle?.runtimeBinding;
  const runtime = state?.runtime;
  const identity = runtime?.runtimeIdentity;
  if (state?.compilerTarget !== AVR_PROFILE || lifecycle?.schema !== 'intent-mcu-lifecycle@1'
      || identity?.schema !== 'intent-mcu-worker-runtime-identity@2') {
    reject('X43_RUNTIME_NOT_CURRENT');
  }
  const value = {
    schema: X43_OBSERVATION_SCHEMA,
    profile,
    revision: state.revision,
    sourceIdentity: state.inputIdentity,
    artifactIdentity: state.artifactIdentity,
    projectGeneration: lifecycle.projectGeneration,
    buildGeneration: lifecycle.buildGeneration,
    runtimeGeneration: lifecycle.runtimeGeneration,
    phase: lifecycle.phase,
    modelImplementationSha256: identity.modelImplementationSha256,
    modelExecutionContextSha256: identity.modelExecutionContextSha256,
    workerInitialization: identity.workerInitialization,
    workerInstanceNonce: identity.workerInstanceNonce,
    cycle: runtime?.cycle,
    instructions: runtime?.instructions,
    paused: runtime?.paused,
  };
  const observation = validateX43AvrObservationValue(value, { allowPauseTransition: true });
  if (!artifact || !runtimeBinding
      || artifact.projectGeneration !== observation.projectGeneration
      || artifact.buildGeneration !== observation.buildGeneration
      || artifact.artifactIdentity !== observation.artifactIdentity
      || artifact.inputIdentity !== observation.sourceIdentity
      || runtimeBinding.projectGeneration !== observation.projectGeneration
      || runtimeBinding.runtimeGeneration !== observation.runtimeGeneration
      || runtimeBinding.artifactIdentity !== observation.artifactIdentity
      || identity.projectGeneration !== observation.projectGeneration
      || identity.runtimeGeneration !== observation.runtimeGeneration
      || identity.artifactIdentity !== observation.artifactIdentity
      || runtime?.modelExecutionContextSha256 !== observation.modelExecutionContextSha256) {
    reject('X43_BINDING_MISMATCH');
  }
  const transition = (observation.phase === 'paused' && observation.paused !== true)
    || (observation.phase === 'running' && observation.paused !== false);
  return Object.freeze({
    state: transition ? 'transition' : 'current',
    reason: transition ? 'X43_PAUSE_STATE_TRANSITION' : null,
    observation: transition ? null : observation,
    binding: bindingFrom(observation),
    counters: Object.freeze({ cycle: observation.cycle, instructions: observation.instructions }),
  });
}

export function projectX43AvrObservation(profile, state) {
  const status = projectX43AvrObservationStatus(profile, state);
  if (status.state !== 'current') reject('X43_PAUSE_STATE_MISMATCH');
  return status.observation;
}

export function x43VirtualNanoseconds(deltaCycles) {
  safeCounter(deltaCycles, 'X43_DELTA_CYCLES');
  let numerator = BigInt(deltaCycles) * 125n;
  let denominator = 2n;
  if (numerator % 2n === 0n) {
    numerator /= 2n;
    denominator = 1n;
  }
  return Object.freeze({ numerator: numerator.toString(), denominator: Number(denominator),
    unit: 'nanosecond', clockHertz: X43_CLOCK_HERTZ });
}

export function x43VirtualNanosecondsText(rational) {
  if (!rational || !/^\d+$/u.test(rational.numerator ?? '')
      || ![1, 2].includes(rational.denominator) || rational.unit !== 'nanosecond'
      || rational.clockHertz !== X43_CLOCK_HERTZ) reject('X43_VIRTUAL_TIME');
  const numerator = BigInt(rational.numerator);
  if (rational.denominator === 1) return `${numerator.toString()} ns virtual`;
  return `${(numerator / 2n).toString()}.${numerator % 2n === 0n ? '0' : '5'} ns virtual`;
}

const support = Object.freeze({
  dynamicSram: Object.freeze({ value: null, status: 'unavailable', reason: 'runtime-does-not-expose-dynamic-sram-use' }),
  heap: Object.freeze({ value: null, status: 'unavailable', reason: 'runtime-does-not-expose-heap-use' }),
  currentStack: Object.freeze({ value: null, status: 'unavailable', reason: 'runtime-does-not-expose-current-stack-depth' }),
  peakStack: Object.freeze({ value: null, status: 'unavailable', reason: 'runtime-does-not-expose-stack-high-water-mark' }),
});

const blank = (state = 'unavailable', reason = 'unavailable-no-current-avr-worker') => ({
  schema: X43_PROFILE_SCHEMA,
  state,
  reason,
  binding: null,
  interval: null,
  support: clone(support),
});

function bindingFrom(observation) {
  return Object.fromEntries(BINDING_KEYS.map((key) => [key, observation[key]]));
}

function bindingMatches(binding, observation) {
  return BINDING_KEYS.every((key) => binding?.[key] === observation[key]);
}

export function x43AvrProfileAvailability(profile, state) {
  try {
    projectX43AvrObservation(profile, state);
    return { state: 'ready', reason: null };
  } catch (error) {
    return { state: 'unavailable', reason: error.code ?? unavailableReason(profile) };
  }
}

export function createX43AvrObservationProfile() {
  let view = blank();
  let lastAccepted = null;

  const publicView = () => clone(view);
  const invalidate = (reason = 'X43_INVALIDATED') => {
    view = blank('invalidated', reason);
    lastAccepted = null;
    return publicView();
  };
  const prepare = (observation) => {
    if (['observing', 'captured', 'invalidated'].includes(view.state)) return publicView();
    try {
      validateX43AvrObservation(observation);
      view = blank('ready', null);
    } catch (error) {
      view = blank('unavailable', error.code ?? 'X43_UNAVAILABLE');
    }
    return publicView();
  };
  const revalidate = (observation) => {
    if (!['observing', 'captured'].includes(view.state)) return publicView();
    let current;
    try {
      current = validateX43AvrObservation(observation);
    } catch (error) {
      return invalidate(error.code ?? 'X43_OBSERVATION_INVALID');
    }
    if (!bindingMatches(view.binding, current)) return invalidate('X43_BINDING_CHANGED');
    if (!lastAccepted || current.cycle < lastAccepted.cycle
        || current.instructions < lastAccepted.instructions) {
      return invalidate('X43_COUNTER_REGRESSION');
    }
    lastAccepted = { cycle: current.cycle, instructions: current.instructions };
    return publicView();
  };
  const start = (observation, wallMilliseconds) => {
    const current = validateX43AvrObservation(observation);
    const wall = finiteWall(wallMilliseconds, 'X43_WALL_TIME');
    view = blank('observing', null);
    view.binding = bindingFrom(current);
    lastAccepted = { cycle: current.cycle, instructions: current.instructions };
    view.interval = {
      start: { cycle: current.cycle, instructions: current.instructions, wallMilliseconds: wall },
      end: null,
      delta: null,
      virtualTime: null,
      wallDiagnostic: null,
    };
    return publicView();
  };
  const capture = (observation, wallMilliseconds) => {
    if (view.state !== 'observing') reject('X43_NOT_OBSERVING');
    const checked = revalidate(observation);
    if (checked.state !== 'observing') return checked;
    const current = validateX43AvrObservation(observation);
    const wall = finiteWall(wallMilliseconds, 'X43_WALL_TIME');
    if (wall < view.interval.start.wallMilliseconds) return invalidate('X43_WALL_TIME_REGRESSION');
    const deltaCycles = current.cycle - view.interval.start.cycle;
    const deltaInstructions = current.instructions - view.interval.start.instructions;
    const wallDurationMilliseconds = wall - view.interval.start.wallMilliseconds;
    view.state = 'captured';
    view.interval.end = { cycle: current.cycle, instructions: current.instructions, wallMilliseconds: wall };
    view.interval.delta = { cycles: deltaCycles, instructions: deltaInstructions };
    view.interval.virtualTime = x43VirtualNanoseconds(deltaCycles);
    view.interval.wallDiagnostic = {
      classification: 'browser-host-diagnostic',
      milliseconds: wallDurationMilliseconds,
      cyclesPerSecond: diagnosticRate(deltaCycles, wallDurationMilliseconds),
      instructionsPerSecond: diagnosticRate(deltaInstructions, wallDurationMilliseconds),
    };
    return publicView();
  };
  const snapshot = (observation = null) => {
    if (['observing', 'captured'].includes(view.state)) return revalidate(observation);
    return publicView();
  };

  return Object.freeze({ prepare, start, capture, revalidate, invalidate, snapshot, peek: publicView });
}
