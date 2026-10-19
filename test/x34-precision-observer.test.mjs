// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  X34PrecisionObserver, X34_RUNTIME_PROBE_SCHEMA, validateX34RuntimeProbe,
} from '../src/x34-precision-observer.mjs';

const hash = (value) => value.repeat(64);
const probe = () => ({
  schema: X34_RUNTIME_PROBE_SCHEMA,
  fixtureId: 'x34-avr-thermostat-instrumented-v1',
  sourceSha256: hash('a'), artifactIdentity: hash('b'),
  symbol: { symbol: 'intent_x34_probe_v1', dataAddress: 0x100, size: 4,
    elfSha256: hash('c'), binding: 'global', type: 'object' },
});
const adc = { channel: 1, startCycle: 100, sampleCycles: 13, completionCycle: 113, value: 414 };
const d13 = { pin: 'D13', mode: 'OUTPUT', level: false };
const step = (observer, before, after, cycle) => observer.observe({
  before, after, cycle, pcBefore: cycle, pcAfter: cycle + 1, latestAdc: adc, d13,
});

test('X34 accepts only a witnessed complete odd-to-even firmware transaction', () => {
  const observer = new X34PrecisionObserver(probe());
  step(observer, [0, 0, 0, 0], [0, 0, 0, 0], 120);
  assert.equal(observer.snapshot().completed.length, 0);
  step(observer, [0, 0, 128, 255], [1, 0, 128, 255], 121);
  step(observer, [1, 0, 128, 255], [1, 30, 128, 255], 122);
  step(observer, [1, 30, 128, 255], [1, 30, 0, 255], 123);
  step(observer, [1, 30, 0, 255], [1, 30, 0, 0], 124);
  step(observer, [1, 30, 0, 0], [2, 30, 0, 0], 125);
  const state = observer.snapshot({ schema: 'intent-mcu-worker-runtime-identity@1',
    projectGeneration: 1, runtimeGeneration: 2,
    artifactIdentity: hash('b'), workerInitialization: 3,
    workerInstanceNonce: 'd'.repeat(32) });
  assert.equal(state.rejected, null);
  assert.equal(state.completed.length, 1);
  assert.equal(state.completed[0].temperatureC, 30);
  assert.equal(state.completed[0].d13Level, 0);
  assert.equal(state.completed[0].adc.completionCycle, 113);
  assert.equal(state.completed[0].pinObservation.level, false);
  assert.equal(state.completed[0].writes.length, 5);
  assert.equal(state.sealed, true);
});

test('X34 rejects startup-even, incomplete and wrapped transactions', () => {
  const startup = new X34PrecisionObserver(probe());
  step(startup, [0, 0, 0, 0], [2, 30, 0, 0], 120);
  assert.equal(startup.snapshot().rejected, 'X34_COMMIT_SEQUENCE_INVALID');

  const incomplete = new X34PrecisionObserver(probe());
  step(incomplete, [0, 0, 128, 255], [1, 0, 128, 255], 121);
  step(incomplete, [1, 0, 128, 255], [2, 0, 128, 255], 122);
  assert.equal(incomplete.snapshot().rejected, 'X34_TRANSACTION_INCOMPLETE');

  const wrapped = new X34PrecisionObserver(probe());
  step(wrapped, [255, 30, 0, 0], [0, 30, 0, 0], 123);
  assert.equal(wrapped.snapshot().rejected, 'X34_COMMIT_WRAP');
});

test('X34 probe and identity contracts reject arbitrary memory and stale shapes', () => {
  assert.deepEqual(validateX34RuntimeProbe(probe()), probe());
  const arbitrary = probe(); arbitrary.symbol.dataAddress = 0x10;
  assert.throws(() => validateX34RuntimeProbe(arbitrary), { code: 'X34_RUNTIME_PROBE_INVALID' });
  const observer = new X34PrecisionObserver(probe());
  assert.throws(() => observer.snapshot({ projectGeneration: 1 }), { code: 'X34_RUNTIME_IDENTITY_INVALID' });
});
