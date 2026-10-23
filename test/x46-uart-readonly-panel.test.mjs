// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { AVR_PROFILE } from '../src/compile-targets.mjs';
import {
  X46_UART_PANEL_INPUT_SCHEMA,
  assessX46UartReadonlyPanel,
} from '../src/x46-uart-readonly-panel.mjs';

const hash = (character) => character.repeat(64);
const identity = () => ({
  schema: 'intent-mcu-worker-runtime-identity@2',
  projectGeneration: 3,
  runtimeGeneration: 7,
  artifactIdentity: hash('a'),
  modelImplementationSha256: hash('b'),
  modelExecutionContextSha256: hash('c'),
  workerInitialization: 1,
  workerInstanceNonce: 'd'.repeat(32),
});

const record = (cycle = 0, value = 65) => ({
  direction: 'tx', cycle, value, baud: 9_615.384615384615, frameCycles: 16_640,
  virtualMilliseconds: cycle / 16_000,
  text: value === 10 ? '\n' : value >= 32 && value <= 126
    ? String.fromCharCode(value) : `\\x${value.toString(16).padStart(2, '0')}`,
});

function fixture() {
  const current = identity();
  const records = [record(0, 65), record(16_640, 10)];
  return {
    schema: X46_UART_PANEL_INPUT_SCHEMA,
    profile: AVR_PROFILE,
    lifecyclePhase: 'paused',
    buildArtifactIdentity: current.artifactIdentity,
    lifecycleRuntimeBinding: {
      projectGeneration: current.projectGeneration,
      runtimeGeneration: current.runtimeGeneration,
      artifactIdentity: current.artifactIdentity,
    },
    trustedCurrentWorker: true,
    currentWorkerIdentity: structuredClone(current),
    runtimeSnapshot: {
      paused: true,
      runtimeIdentity: structuredClone(current),
      modelExecutionContextSha256: current.modelExecutionContextSha256,
      instruments: { serial: { records, retained: records.length, dropped: 0 } },
    },
  };
}

test('valid paused current worker produces complete read-only one-based rows', () => {
  const value = assessX46UartReadonlyPanel(fixture());
  assert.equal(value.state, 'current');
  assert.deepEqual(value.frames.map(({ ordinal, cycle, cycleDelta }) => ({ ordinal, cycle, cycleDelta })), [
    { ordinal: 1, cycle: 0, cycleDelta: null },
    { ordinal: 2, cycle: 16_640, cycleDelta: 16_640 },
  ]);
  assert.deepEqual(value.authority, { apply: false, build: false, run: false, verdict: false });
  assert.match(value.support.framing, /^unavailable/u);
});

test('empty, wrong-profile and explicit-pause states are distinct', () => {
  const empty = fixture(); empty.runtimeSnapshot.instruments.serial.records = [];
  empty.runtimeSnapshot.instruments.serial.retained = 0;
  assert.equal(assessX46UartReadonlyPanel(empty).state, 'empty');
  const profile = fixture(); profile.profile = 'architecture.rp2040-v1';
  assert.deepEqual([assessX46UartReadonlyPanel(profile).state,
    assessX46UartReadonlyPanel(profile).reason], ['unavailable', 'profile-not-avr']);
  const running = fixture(); running.lifecyclePhase = 'running'; running.runtimeSnapshot.paused = false;
  assert.deepEqual([assessX46UartReadonlyPanel(running).state,
    assessX46UartReadonlyPanel(running).reason], ['unavailable', 'explicit-pause-required']);
});

test('loss is partial while malformed current TX evidence is rejected', () => {
  const loss = fixture(); loss.runtimeSnapshot.instruments.serial.dropped = 1;
  assert.equal(assessX46UartReadonlyPanel(loss).state, 'partial');
  assert.equal(assessX46UartReadonlyPanel(loss).retention.truncated, true);
  const malformed = fixture(); delete malformed.runtimeSnapshot.instruments.serial.records[0].frameCycles;
  assert.equal(assessX46UartReadonlyPanel(malformed).state, 'invalid');
});

test('stale and runtime-replaced identities clear accepted rows', () => {
  const stale = fixture(); stale.runtimeSnapshot.runtimeIdentity.workerInstanceNonce = 'e'.repeat(32);
  assert.equal(assessX46UartReadonlyPanel(stale).state, 'stale');
  assert.equal(assessX46UartReadonlyPanel(stale).frames.length, 0);
  const replaced = fixture(); replaced.lifecycleRuntimeBinding.runtimeGeneration += 1;
  assert.equal(assessX46UartReadonlyPanel(replaced).state, 'stale');
  assert.equal(assessX46UartReadonlyPanel(replaced).frames.length, 0);
});

test('self-consistent imported-looking IDs never qualify without live-worker trust', () => {
  const imported = fixture(); imported.trustedCurrentWorker = false;
  assert.deepEqual([assessX46UartReadonlyPanel(imported).state,
    assessX46UartReadonlyPanel(imported).reason], ['unavailable', 'no-current-validated-worker']);
});
