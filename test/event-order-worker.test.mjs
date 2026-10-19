// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { OrderedInputQueue, RuntimeKernel } from '../src/runtime-kernel.mjs';

test('X30 queue uses target then sequence and reset restarts the epoch', () => {
  const queue = new OrderedInputQueue();
  queue.enqueue({ type: 'control', componentId: 'button-1', key: 'pressed', value: true }, 0, 20);
  queue.enqueue({ type: 'control', componentId: 'pot-1', key: 'position', value: 0.75 }, 0, 10);
  queue.enqueue({ type: 'control', componentId: 'pot-1', key: 'position', value: 0.25 }, 0, 20);
  const applied = queue.drainThrough(20, () => {});
  assert.deepEqual(applied.map((event) => [event.targetCycle, event.sequence]), [[10, 2], [20, 1], [20, 3]]);
  assert.deepEqual(applied.map((event) => event.appliedCycle), [20, 20, 20]);
  queue.reset();
  assert.deepEqual(queue.snapshot(), {
    pending: [], log: [], applied: [], dropped: 0,
    retention: {
      limit: 10_000,
      requested: { retained: 0, dropped: 0 },
      applied: { retained: 0, dropped: 0 },
    },
  });
  assert.equal(queue.enqueue({ type: 'control' }, 0, 0).sequence, 1);
});

test('X40 records actual application cycle separately and only after successful apply', () => {
  const queue = new OrderedInputQueue(4);
  queue.enqueue({ type: 'control', componentId: 'button-1', key: 'pressed', value: true }, 0, 10);
  queue.enqueue({ type: 'control', componentId: 'pot-1', key: 'position', value: 0.75 }, 0, 10);

  assert.throws(() => queue.drainThrough(20, () => { throw new Error('APPLICATION_REJECTED'); }),
    /APPLICATION_REJECTED/u);
  assert.equal(queue.snapshot().pending.length, 2);
  assert.deepEqual(queue.snapshot().applied, []);

  const returned = queue.drainThrough(25, () => {});
  assert.deepEqual(returned.map((event) => [event.targetCycle, event.appliedCycle, event.sequence]), [
    [10, 25, 1], [10, 25, 2],
  ]);
  returned[0].appliedCycle = 999;
  const snapshot = queue.snapshot();
  assert.deepEqual(snapshot.applied.map((event) => [event.targetCycle, event.appliedCycle, event.sequence]), [
    [10, 25, 1], [10, 25, 2],
  ]);
  assert.deepEqual(snapshot.retention, {
    limit: 4,
    requested: { retained: 2, dropped: 0 },
    applied: { retained: 2, dropped: 0 },
  });
});

test('X40 rejects malformed actual-cycle drains and reset clears requested and applied epochs', () => {
  const queue = new OrderedInputQueue();
  queue.enqueue({ type: 'control' }, 0, 0);
  for (const cycle of [undefined, null, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => queue.drainThrough(cycle, () => {}), /Invalid input queue drain/u);
  }
  queue.drainThrough(0, () => {});
  assert.equal(queue.snapshot().applied.length, 1);
  queue.reset();
  const reset = queue.snapshot();
  assert.deepEqual(reset.pending, []);
  assert.deepEqual(reset.log, []);
  assert.deepEqual(reset.applied, []);
  assert.deepEqual(reset.retention, {
    limit: 10_000,
    requested: { retained: 0, dropped: 0 },
    applied: { retained: 0, dropped: 0 },
  });
});

test('X30 RuntimeKernel sample is read-only and never drains a future input', () => {
  const runtime = new RuntimeKernel(':00000001FF', DEFAULT_CIRCUIT);
  runtime.queueControlAtCycle('pot-1', 'position', 0.75, 0);
  runtime.queueControlAtCycle('button-1', 'pressed', true, 0);
  runtime.queueControlAtCycle('pot-1', 'position', 0.9, 1_000_000);
  const before = runtime.snapshot();
  const sampled = runtime.sample();
  const after = runtime.snapshot();
  assert.deepEqual(sampled, before);
  assert.deepEqual(after, before);
  assert.equal(sampled.cycle, 0);
  assert.equal(sampled.instructions, 0);
  assert.equal(sampled.eventLog.pending.length, 1);
  assert.equal(sampled.circuit.controls['pot-1'].position, 0.75);
  assert.equal(sampled.circuit.controls['button-1'].pressed, true);
});

test('X30 worker sample command has non-mutating paused and rejection branches', async () => {
  const source = await readFile(new URL('../src/simulator.worker.mjs', import.meta.url), 'utf8');
  assert.match(source, /data\.command === 'sample'/u);
  assert.match(source, /SAMPLE_REQUIRES_PAUSED_RUNTIME/u);
  assert.match(source, /SAMPLE_PROFILE_UNSUPPORTED/u);
  assert.match(source, /const snapshot = kernel\.sample\(\)/u);
  const branch = source.slice(source.indexOf("data.command === 'sample'"), source.indexOf("data.command === 'step'"));
  assert.doesNotMatch(branch, /#flushInputs|queueControl|runInstructions|generation\+\+|running\s*=/u);
});
