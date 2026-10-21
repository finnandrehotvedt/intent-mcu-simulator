// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { AVR_PROFILE, ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE } from '../src/compile-targets.mjs';
import {
  createX43AvrObservationProfile,
  projectX43AvrObservation,
  projectX43AvrObservationStatus,
  validateX43AvrObservation,
  X43_CLOCK_HERTZ,
  X43_OBSERVATION_SCHEMA,
  x43AvrProfileAvailability,
  x43VirtualNanoseconds,
  x43VirtualNanosecondsText,
} from '../src/x43-avr-observation-profile.mjs';

const hash = (digit) => digit.repeat(64);
const nonce = 'ab'.repeat(16);

function state(overrides = {}) {
  const artifactIdentity = hash('a');
  const inputIdentity = hash('b');
  const modelImplementationSha256 = hash('c');
  const modelExecutionContextSha256 = hash('d');
  const base = {
    compilerTarget: AVR_PROFILE,
    revision: 7,
    artifactIdentity,
    inputIdentity,
    lifecycle: {
      schema: 'intent-mcu-lifecycle@1', phase: 'paused', projectGeneration: 2,
      buildGeneration: 3, runtimeGeneration: 5,
      artifact: { projectGeneration: 2, buildGeneration: 3, artifactIdentity, inputIdentity },
      runtimeBinding: { projectGeneration: 2, runtimeGeneration: 5, artifactIdentity },
    },
    runtime: {
      cycle: 200, instructions: 120, paused: true, modelExecutionContextSha256,
      runtimeIdentity: {
        schema: 'intent-mcu-worker-runtime-identity@2', projectGeneration: 2,
        runtimeGeneration: 5, artifactIdentity, modelImplementationSha256,
        modelExecutionContextSha256, workerInitialization: 2, workerInstanceNonce: nonce,
      },
    },
  };
  return Object.assign(base, overrides);
}

function observation(cycle = 200, instructions = 120) {
  const value = projectX43AvrObservation(AVR_PROFILE, state());
  value.cycle = cycle;
  value.instructions = instructions;
  return value;
}

function transitionStatus(cycle = 200, instructions = 120, mutate = () => {}) {
  const value = state();
  value.lifecycle.phase = 'running';
  value.runtime.cycle = cycle;
  value.runtime.instructions = instructions;
  mutate(value);
  return projectX43AvrObservationStatus(AVR_PROFILE, value);
}

test('projection binds exact source, artifact, generations, model and worker identity', () => {
  const value = projectX43AvrObservation(AVR_PROFILE, state());
  assert.equal(value.schema, X43_OBSERVATION_SCHEMA);
  assert.equal(value.sourceIdentity, hash('b'));
  assert.equal(value.artifactIdentity, hash('a'));
  assert.equal(value.projectGeneration, 2);
  assert.equal(value.runtimeGeneration, 5);
  assert.equal(value.modelImplementationSha256, hash('c'));
  assert.equal(value.workerInstanceNonce, nonce);
  assert.equal(x43AvrProfileAvailability(AVR_PROFILE, state()).state, 'ready');
});

test('strict observation rejects unknown keys, unsafe counters and mixed bindings', () => {
  assert.throws(() => validateX43AvrObservation({ ...observation(), extra: true }),
    { code: 'X43_OBSERVATION_KEYS' });
  assert.throws(() => validateX43AvrObservation({ ...observation(), cycle: Number.MAX_SAFE_INTEGER + 1 }),
    { code: 'X43_CYCLE' });
  const mixedArtifact = state();
  mixedArtifact.lifecycle.runtimeBinding.artifactIdentity = hash('e');
  assert.throws(() => projectX43AvrObservation(AVR_PROFILE, mixedArtifact),
    { code: 'X43_BINDING_MISMATCH' });
  const mixedModel = state();
  mixedModel.runtime.modelExecutionContextSha256 = hash('e');
  assert.throws(() => projectX43AvrObservation(AVR_PROFILE, mixedModel),
    { code: 'X43_BINDING_MISMATCH' });
});

test('pause/run ordering is explicit only after full projection and binding validation', () => {
  const transition = state();
  transition.lifecycle.phase = 'running';
  assert.throws(() => projectX43AvrObservation(AVR_PROFILE, transition),
    { code: 'X43_PAUSE_STATE_MISMATCH' });
  const status = projectX43AvrObservationStatus(AVR_PROFILE, transition);
  assert.equal(status.state, 'transition');
  assert.equal(status.reason, 'X43_PAUSE_STATE_TRANSITION');
  assert.equal(status.observation, null);
  assert.equal(status.binding.artifactIdentity, hash('a'));
  assert.deepEqual(status.counters, { cycle: 200, instructions: 120 });

  const mixed = state();
  mixed.lifecycle.phase = 'running';
  mixed.lifecycle.runtimeBinding.artifactIdentity = hash('e');
  assert.throws(() => projectX43AvrObservationStatus(AVR_PROFILE, mixed),
    { code: 'X43_BINDING_MISMATCH' }, 'a pause mismatch may not hide a stale binding');
});

test('transition snapshots are sanitized while exact counters advance the accepted floor', () => {
  const owner = createX43AvrObservationProfile();
  owner.start(observation(), 100);
  const duplicate = owner.transition(transitionStatus());
  assert.equal(duplicate.state, 'transitioning');
  assert.equal(duplicate.reason, 'X43_PAUSE_STATE_TRANSITION');
  assert.equal(duplicate.binding, null);
  assert.equal(duplicate.interval, null);
  assert.equal(owner.transition(transitionStatus(400, 250)).state, 'transitioning');
  assert.equal(owner.snapshot(observation(399, 260)).reason, 'X43_COUNTER_REGRESSION',
    'a coherent projection may not fall below the transition sample');
  assert.equal(owner.snapshot(observation(500, 300)).state, 'invalidated', 'no resurrection');
});

test('either transition counter falling invalidates and duplicate transition samples are idempotent', () => {
  for (const [cycle, instructions, mutate] of [
    [399, 260, () => {}],
    [410, 249, (value) => { value.lifecycle.phase = 'paused'; value.runtime.paused = false; }],
  ]) {
    const owner = createX43AvrObservationProfile();
    owner.start(observation(), 100);
    owner.snapshot(observation(400, 250));
    assert.equal(owner.transition(transitionStatus(400, 250)).state, 'transitioning');
    assert.equal(owner.transition(transitionStatus(400, 250)).state, 'transitioning');
    assert.equal(owner.transition(transitionStatus(cycle, instructions, mutate)).reason, 'X43_COUNTER_REGRESSION');
    assert.equal(owner.transition(transitionStatus(500, 300)).state, 'invalidated');
  }
});

test('transition nonce or model change invalidates before any interval can be retained', () => {
  for (const mutate of [
    (value) => { value.runtime.runtimeIdentity.workerInstanceNonce = 'cd'.repeat(16); },
    (value) => { value.runtime.runtimeIdentity.modelImplementationSha256 = hash('e'); },
    (value) => {
      value.runtime.runtimeIdentity.modelExecutionContextSha256 = hash('e');
      value.runtime.modelExecutionContextSha256 = hash('e');
    },
  ]) {
    const owner = createX43AvrObservationProfile();
    owner.start(observation(), 100);
    assert.equal(owner.transition(transitionStatus(220, 130, mutate)).reason, 'X43_BINDING_CHANGED');
    assert.equal(owner.snapshot(observation(300, 180)).state, 'invalidated');
  }
});

test('captured interval survives a valid transition internally but no transition API exposes it', () => {
  const owner = createX43AvrObservationProfile();
  owner.start(observation(), 100);
  const captured = owner.capture(observation(300, 180), 110);
  const hidden = owner.transition(transitionStatus(400, 250));
  assert.equal(hidden.state, 'transitioning');
  assert.equal(hidden.binding, null);
  assert.equal(hidden.interval, null);
  const resumed = owner.snapshot(observation(500, 300));
  assert.equal(resumed.state, 'captured');
  assert.deepEqual(resumed.interval, captured.interval);
});

test('overflow-safe rational conversion preserves exact 16 MHz virtual time', () => {
  assert.equal(X43_CLOCK_HERTZ, 16_000_000);
  assert.deepEqual(x43VirtualNanoseconds(203_081), {
    numerator: '25385125', denominator: 2, unit: 'nanosecond', clockHertz: 16_000_000,
  });
  assert.equal(x43VirtualNanosecondsText(x43VirtualNanoseconds(203_081)), '12692562.5 ns virtual');
  const maximum = x43VirtualNanoseconds(Number.MAX_SAFE_INTEGER);
  assert.equal(maximum.numerator, (BigInt(Number.MAX_SAFE_INTEGER) * 125n).toString());
  assert.equal(maximum.denominator, 2);
});

test('explicit Start and Capture produce exact deltas with separate wall diagnostics', () => {
  const owner = createX43AvrObservationProfile();
  owner.prepare(observation());
  const started = owner.start(observation(), 1_000);
  assert.equal(started.state, 'observing');
  const captured = owner.capture(observation(360, 200), 1_025);
  assert.equal(captured.state, 'captured');
  assert.deepEqual(captured.interval.delta, { cycles: 160, instructions: 80 });
  assert.equal(x43VirtualNanosecondsText(captured.interval.virtualTime), '10000 ns virtual');
  assert.equal(captured.interval.wallDiagnostic.classification, 'browser-host-diagnostic');
  assert.equal(captured.interval.wallDiagnostic.milliseconds, 25);
  assert.equal(captured.interval.wallDiagnostic.cyclesPerSecond, 6_400);
  assert.equal(captured.interval.wallDiagnostic.instructionsPerSecond, 3_200);

  const zeroWall = createX43AvrObservationProfile();
  zeroWall.start(observation(), 1_000);
  const sameTick = zeroWall.capture(observation(360, 200), 1_000);
  assert.equal(sameTick.interval.wallDiagnostic.cyclesPerSecond, null);
  assert.equal(sameTick.interval.wallDiagnostic.instructionsPerSecond, null);
});

test('captured interval remains valid only under exact binding and monotonic counters', () => {
  const owner = createX43AvrObservationProfile();
  owner.start(observation(), 100);
  owner.capture(observation(300, 180), 110);
  assert.equal(owner.snapshot(observation(400, 250)).state, 'captured');
  assert.equal(owner.snapshot(observation(299, 250)).reason, 'X43_COUNTER_REGRESSION');
  assert.equal(owner.snapshot(observation(500, 300)).state, 'invalidated', 'invalidated state cannot resurrect');

  const changed = createX43AvrObservationProfile();
  changed.start(observation(), 100);
  const next = observation(300, 180); next.workerInstanceNonce = 'cd'.repeat(16);
  assert.equal(changed.snapshot(next).reason, 'X43_BINDING_CHANGED');
});

test('observing compares Capture to the latest accepted sample, not only Start', () => {
  const owner = createX43AvrObservationProfile();
  owner.start(observation(200, 120), 100);
  assert.equal(owner.snapshot(observation(400, 250)).state, 'observing');
  const regressed = owner.capture(observation(300, 180), 110);
  assert.equal(regressed.state, 'invalidated');
  assert.equal(regressed.reason, 'X43_COUNTER_REGRESSION');
  assert.equal(regressed.interval, null);
  assert.equal(owner.snapshot(observation(500, 300)).state, 'invalidated');
});

test('captured monotonic progress advances the floor while the frozen interval stays exact', () => {
  const owner = createX43AvrObservationProfile();
  owner.start(observation(200, 120), 100);
  const captured = owner.capture(observation(300, 180), 110);
  assert.deepEqual(captured.interval.delta, { cycles: 100, instructions: 60 });
  const progressed = owner.snapshot(observation(500, 300));
  assert.equal(progressed.state, 'captured');
  assert.deepEqual(progressed.interval, captured.interval, 'later progress must not rewrite the captured interval');
  const regressed = owner.snapshot(observation(400, 250));
  assert.equal(regressed.state, 'invalidated');
  assert.equal(regressed.reason, 'X43_COUNTER_REGRESSION');
  assert.equal(regressed.interval, null);
});

test('cycle and instruction monotonicity are independent and duplicate samples are idempotent', () => {
  for (const next of [observation(399, 260), observation(410, 249)]) {
    const owner = createX43AvrObservationProfile();
    owner.start(observation(200, 120), 100);
    assert.equal(owner.snapshot(observation(400, 250)).state, 'observing');
    assert.equal(owner.snapshot(observation(400, 250)).state, 'observing');
    const invalid = owner.snapshot(next);
    assert.equal(invalid.reason, 'X43_COUNTER_REGRESSION');
    assert.equal(invalid.interval, null);
  }
});

test('missing current observation, counter regression and wall regression fail closed', () => {
  const missing = createX43AvrObservationProfile();
  missing.start(observation(), 10);
  assert.equal(missing.snapshot(null).state, 'invalidated');

  const counter = createX43AvrObservationProfile();
  counter.start(observation(), 10);
  assert.equal(counter.capture(observation(199, 121), 11).reason, 'X43_COUNTER_REGRESSION');

  const wall = createX43AvrObservationProfile();
  wall.start(observation(), 10);
  assert.equal(wall.capture(observation(201, 121), 9).reason, 'X43_WALL_TIME_REGRESSION');

  const stopped = createX43AvrObservationProfile();
  stopped.start(observation(), 10);
  const stoppedState = state(); stoppedState.lifecycle.runtimeBinding = null;
  assert.throws(() => projectX43AvrObservation(AVR_PROFILE, stoppedState), { code: 'X43_BINDING_MISMATCH' });
  assert.equal(stopped.snapshot(null).state, 'invalidated');
});

test('dynamic SRAM and heap remain explicit unavailable values rather than zero', () => {
  const owner = createX43AvrObservationProfile();
  const view = owner.start(observation(), 0);
  assert.deepEqual(Object.keys(view.support).sort(), ['dynamicSram', 'heap']);
  for (const item of Object.values(view.support)) {
    assert.equal(item.value, null);
    assert.equal(item.status, 'unavailable');
    assert.match(item.reason, /^runtime-does-not-expose-/u);
  }
});

test('three non-AVR profiles have truthful distinct unavailable boundaries', () => {
  for (const [profile, reason] of [
    [RP2040_PROFILE, 'unavailable-rp2040-profile-contract-pending'],
    [ESP32C3_PROFILE, 'unavailable-esp32c3-no-cpu-profile-producer'],
    [STM32F429ZI_PROFILE, 'unavailable-stm32-instruction-ordinals-not-cycles'],
  ]) assert.equal(x43AvrProfileAvailability(profile, state()).reason, reason);
});

test('shared shell integration is transient, read-only and outside model closure', async () => {
  const [shell, owner, modelClosure] = await Promise.all([
    readFile(new URL('../src/shared-workbench-shell.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/x43-avr-observation-profile.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/generate-model-library-snapshots.mjs', import.meta.url), 'utf8'),
  ]);
  for (const code of ['X43_SOURCE_EDITED', 'X43_BUILD_STARTED', 'X43_RESET', 'X43_STOP',
    'X43_NEW_PROJECT', 'X43_EXAMPLE_LOADED', 'X43_PROFILE_CHANGED']) assert.match(shell, new RegExp(code, 'u'));
  assert.match(shell, /projectX43AvrObservationStatus/u);
  assert.match(shell, /owner\.snapshot\(observation\)/u);
  assert.match(shell, /owner\.transition\(status\)/u);
  assert.match(shell, /Awaiting one coherent AVR worker status/u);
  assert.doesNotMatch(`${owner}\n${shell}`, /localStorage|sessionStorage|indexedDB|serviceWorker|postMessage\(/u);
  assert.doesNotMatch(modelClosure, /x43-avr-observation-profile|shared-workbench-shell/u);
});
