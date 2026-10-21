// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { RuntimeKernel } from '../src/runtime-kernel.mjs';
import {
  X43_AVR_RAMEND, createX43AvrStackTracker, validateX43AvrStackSnapshot,
} from '../src/x43-avr-stack-profile.mjs';

test('synthetic tracker fixture distinguishes current, interval and since-reset observed depth', () => {
  const tracker = createX43AvrStackTracker({ pointer: X43_AVR_RAMEND });
  tracker.observe({ pointer: 0x08f9, cycle: 4, instructions: 2 });
  tracker.start('synthetic-interval-1');
  tracker.observe({ pointer: 0x08ef, cycle: 8, instructions: 4 });
  tracker.observe({ pointer: 0x08f5, cycle: 12, instructions: 6 });
  const captured = validateX43AvrStackSnapshot(tracker.capture('synthetic-interval-1'));
  assert.equal(captured.current.pointer, 0x08f5);
  assert.equal(captured.current.depthBytes, 10);
  assert.equal(captured.interval.minimumPointer, 0x08ef);
  assert.equal(captured.interval.maximumObservedDepthBytes, 16);
  assert.equal(captured.allTime.maximumObservedDepthBytes, 16);
  assert.equal(captured.semantics.measuresLiveBytes, false);
  assert.equal(captured.semantics.memoryHighWaterMark, false);
  assert.throws(() => validateX43AvrStackSnapshot({ ...captured, authority: true }),
    /X43_STACK_SNAPSHOT_INVALID/u);
});

test('synthetic out-of-SRAM fixture fails observed minima closed without claiming free memory', () => {
  const tracker = createX43AvrStackTracker({ pointer: X43_AVR_RAMEND });
  tracker.start('synthetic-invalid-sp');
  const unavailable = tracker.observe({ pointer: 0x00ff, cycle: 2, instructions: 1 });
  assert.equal(unavailable.current, null);
  assert.equal(unavailable.allTime, null);
  assert.equal(unavailable.allTimeReason, 'stack-pointer-outside-atmega328p-sram');
  assert.equal(unavailable.interval.state, 'unavailable');
  assert.throws(() => tracker.capture('wrong-token'), /X43_STACK_TOKEN_STALE/u);
});

test('actual runtime samples avr8js CPU.SP after every instruction plus tick and reset clears history', () => {
  // Synthetic firmware fixture: RCALL -1 recurses at address zero. It is not
  // native acceptance evidence; it exercises the actual pinned avr8js CPU.SP producer.
  const runtime = new RuntimeKernel(':02000000FFDF20\n:00000001FF', DEFAULT_CIRCUIT);
  assert.equal(runtime.snapshot().x43Stack.current.pointer, X43_AVR_RAMEND);
  runtime.startX43StackObservation('runtime-interval');
  runtime.step();
  const captured = runtime.captureX43StackObservation('runtime-interval').x43Stack;
  assert.equal(captured.current.pointer, X43_AVR_RAMEND - 2);
  assert.equal(captured.interval.maximumObservedDepthBytes, 2);
  assert.equal(runtime.snapshot().x43Stack.allTime.maximumObservedDepthBytes, 2);
  runtime.reset();
  const reset = runtime.snapshot().x43Stack;
  assert.equal(reset.current.pointer, X43_AVR_RAMEND);
  assert.equal(reset.allTime.maximumObservedDepthBytes, 0);
  assert.equal(reset.interval, null);
});
