// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { Rp2040PublicWorkbench } from '../src/rp2040-public-workbench.mjs';
import { RP2040_PRESENTATION_SCHEMA } from '../src/rp2040-snapshot-pacer.mjs';

const ARTIFACT = 'a'.repeat(64);

class ElementFixture {
  constructor() {
    this.value = '';
    this.disabled = false;
    this.textContent = '';
    this.dataset = {};
    this.files = [];
    this.listeners = new Map();
    this.classList = { toggle() {} };
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  setAttribute() {}
  click() {}
}

class WorkerFixture {
  static instances = [];
  constructor() { this.messages = []; this.listeners = new Map(); this.terminated = false; WorkerFixture.instances.push(this); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  postMessage(message) { this.messages.push(structuredClone(message)); this.onPost?.(structuredClone(message)); }
  terminate() { this.terminated = true; }
  emit(data) { this.listeners.get('message')?.({ data: structuredClone(data) }); }
}

function elements() {
  return Object.fromEntries(['state', 'name', 'save', 'open', 'openInput', 'source', 'build', 'run',
    'pause', 'reset', 'stop', 'message', 'sourceHash', 'artifactHash', 'diagram', 'externalLed',
    'circuitState', 'serial'].map((key) => [key, new ElementFixture()]));
}

function ready() {
  return { kind: 'ready', profile: 'board.rp2040-pico-v1', artifactIdentity: ARTIFACT,
    paused: true, cycle: 0, instructions: 0, circuit: { leds: [] }, instruments: {
      serial: { text: '', records: [], retained: 0, dropped: 0 },
      logic: { transitions: [], dropped: 0 },
    }, experimental: { gpio0: { mode: 'input', level: false } } };
}

function paced(kind, generation, sequence, { paused = false, cycle = 500 } = {}) {
  return { ...ready(), kind, paused, cycle, instructions: cycle / 500,
    presentation: { schema: RP2040_PRESENTATION_SCHEMA, artifactIdentity: ARTIFACT,
      generation, sequence, final: paused } };
}

function preparedWorkbench(pauseProof = {}) {
  WorkerFixture.instances.length = 0;
  globalThis.Worker = WorkerFixture;
  const workbench = new Rp2040PublicWorkbench({ elements: elements(), pauseProof });
  workbench.activate();
  workbench.artifact = { uf2Sha256: ARTIFACT, sourceSha256: 'b'.repeat(64), artifactIdentity: ARTIFACT };
  workbench.artifactBytes = new Uint8Array([1, 2, 3]);
  workbench.artifactRevision = workbench.revision;
  workbench.phase = 'built';
  return workbench;
}

function manualClock() {
  let value = 0; let sequence = 0; const timers = new Map();
  const runDue = () => {
    while (true) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= value)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if (!due) break;
      timers.delete(due[0]); due[1].callback();
    }
  };
  return {
    now: () => value,
    schedule(callback, delay) { const id = ++sequence; timers.set(id, { at: value + delay, callback }); return id; },
    unschedule(id) { timers.delete(id); },
    advance(ms) { value += ms; runDue(); },
    pending: () => timers.size,
  };
}

test('page ACK is exact and stale running snapshots cannot overwrite final Pause', async () => {
  const workbench = preparedWorkbench();
  assert.equal((await workbench.run()).ok, true);
  const worker = WorkerFixture.instances.at(-1);
  worker.emit(ready());
  const run = worker.messages.find((message) => message.command === 'run');
  assert(run);
  worker.emit(paced('status', run.presentationGeneration, 1));
  assert.equal(workbench.lastRuntime.cycle, 500);
  assert.deepEqual(worker.messages.at(-1), { command: 'snapshot-ack', artifactIdentity: ARTIFACT,
    presentationGeneration: run.presentationGeneration, sequence: 1 });

  workbench.pause();
  const pause = worker.messages.findLast((message) => message.command === 'pause');
  worker.emit(paced('status', run.presentationGeneration, 2, { cycle: 1_000 }));
  assert.equal(workbench.lastRuntime.cycle, 500);
  worker.emit(paced('paused', pause.presentationGeneration, 1, { paused: true, cycle: 750 }));
  assert.equal(workbench.phase, 'paused');
  assert.equal(workbench.lastRuntime.cycle, 750);
  assert.equal(workbench.lastRuntime.presentation.final, true);
});

test('Pause requested during worker start prevents a later ready message from auto-running', async () => {
  const workbench = preparedWorkbench();
  await workbench.run();
  const worker = WorkerFixture.instances.at(-1);
  workbench.pause();
  const pause = worker.messages.findLast((message) => message.command === 'pause');
  worker.emit(ready());
  assert.equal(worker.messages.some((message) => message.command === 'run'), false);
  worker.emit(paced('paused', pause.presentationGeneration, 1, { paused: true, cycle: 0 }));
  assert.equal(workbench.phase, 'paused');
});

test('Reset and Stop invalidate stale presentation authority', async () => {
  const workbench = preparedWorkbench();
  await workbench.run();
  const worker = WorkerFixture.instances.at(-1);
  worker.emit(ready());
  const run = worker.messages.find((message) => message.command === 'run');
  worker.emit(paced('status', run.presentationGeneration, 1, { cycle: 500 }));

  workbench.reset();
  const reset = worker.messages.findLast((message) => message.command === 'reset');
  worker.emit(paced('status', run.presentationGeneration, 2, { cycle: 1_000 }));
  assert.equal(workbench.lastRuntime, null);
  worker.emit(paced('reset', reset.presentationGeneration, 1, { paused: true, cycle: 0 }));
  assert.equal(workbench.phase, 'paused');
  assert.equal(workbench.lastRuntime.kind, 'reset');

  workbench.stop();
  assert.equal(worker.terminated, true);
  assert.equal(workbench.lastRuntime, null);
  worker.emit(paced('paused', reset.presentationGeneration, 2, { paused: true, cycle: 10 }));
  assert.equal(workbench.lastRuntime, null);
  assert.equal(workbench.phase, 'editing');
});

test('budget pause ignores cached state and requires two fresh stable owner ACKs', async () => {
  const clock = manualClock();
  const workbench = preparedWorkbench({ now: clock.now, schedule: clock.schedule,
    unschedule: clock.unschedule, minimumMs: 250, timeoutMs: 1_000 });
  await workbench.run();
  const worker = WorkerFixture.instances.at(-1);
  worker.emit(ready());
  workbench.lastRuntime = paced('paused', 99, 9, { paused: true, cycle: 1_000 });
  let settled = false;
  const promise = workbench.pauseForBudget({ deadlineAt: 900, requestId: 'req-1', dispatchToken: 'dispatch-1' })
    .then((value) => { settled = true; return value; });
  assert.equal(settled, false);
  const first = worker.messages.findLast((message) => message.command === 'pause');
  worker.emit(paced('paused', first.presentationGeneration, 1, { paused: true, cycle: 1_000 }));
  await Promise.resolve(); assert.equal(settled, false);
  clock.advance(249); await Promise.resolve();
  assert.equal(worker.messages.filter((message) => message.command === 'pause').length, 1);
  clock.advance(1);
  const second = worker.messages.findLast((message) => message.command === 'pause');
  assert.notEqual(second.presentationGeneration, first.presentationGeneration);
  worker.emit(paced('paused', second.presentationGeneration, 1, { paused: true, cycle: 1_000 }));
  const proof = await promise;
  assert.equal(proof.producerState, 'paused');
  assert.equal(proof.durationMs, 250);
  assert.deepEqual([proof.first.presentationGeneration, proof.second.presentationGeneration],
    [first.presentationGeneration, second.presentationGeneration]);
  assert.equal(Object.isFrozen(proof), true);
  assert.equal(clock.pending(), 0);
});

test('budget pause waiter exists before synchronous ACK and same owner joins one promise', async () => {
  const clock = manualClock();
  const workbench = preparedWorkbench({ now: clock.now, schedule: clock.schedule,
    unschedule: clock.unschedule, minimumMs: 250, timeoutMs: 1_000 });
  await workbench.run();
  const worker = WorkerFixture.instances.at(-1); worker.emit(ready());
  worker.onPost = (message) => {
    if (message.command === 'pause') worker.emit(paced('paused', message.presentationGeneration, 1,
      { paused: true, cycle: 500 }));
  };
  const first = workbench.pauseForBudget({ deadlineAt: 900, requestId: 'req-sync', dispatchToken: 'dispatch-sync' });
  const joined = workbench.pauseForBudget({ deadlineAt: 900, requestId: 'req-sync', dispatchToken: 'dispatch-sync' });
  assert.equal(first, joined);
  await assert.rejects(workbench.pauseForBudget({ deadlineAt: 900, requestId: 'other', dispatchToken: 'other' }),
    /RP2040_BUDGET_PAUSE_OWNER_CONFLICT/u);
  clock.advance(250);
  const proof = await first;
  assert.equal(proof.first.presentationSequence, 1);
  assert.equal(proof.second.presentationSequence, 1);
  assert.equal(clock.pending(), 0);
});

test('budget pause rejects masquerades, changed state, advancing commands and worker loss', async () => {
  const clock = manualClock();
  const workbench = preparedWorkbench({ now: clock.now, schedule: clock.schedule,
    unschedule: clock.unschedule, minimumMs: 250, timeoutMs: 1_000 });
  await workbench.run(); const worker = WorkerFixture.instances.at(-1); worker.emit(ready());
  const proof = workbench.pauseForBudget({ deadlineAt: 900, requestId: 'req-guards', dispatchToken: 'dispatch-guards' });
  const first = worker.messages.findLast((message) => message.command === 'pause');
  worker.emit(paced('status', first.presentationGeneration, 1, { paused: false, cycle: 500 }));
  assert.equal(workbench.pauseProofOperation.first, null);
  assert.equal((await workbench.build()).code, 'RP2040_BUDGET_PAUSE_BUSY');
  assert.equal((await workbench.run()).code, 'RP2040_BUDGET_PAUSE_BUSY');
  assert.equal(workbench.reset().code, 'RP2040_BUDGET_PAUSE_BUSY');
  assert.equal(workbench.pause().code, 'RP2040_BUDGET_PAUSE_BUSY');
  worker.emit(paced('paused', first.presentationGeneration, 2, { paused: true, cycle: 500 }));
  clock.advance(250);
  const second = worker.messages.findLast((message) => message.command === 'pause');
  worker.emit(paced('paused', second.presentationGeneration, 1, { paused: true, cycle: 1_000 }));
  await assert.rejects(proof, /RP2040_BUDGET_PAUSE_STATE_CHANGED/u);
  assert.equal(clock.pending(), 0);

  const next = workbench.pauseForBudget({ deadlineAt: 900, requestId: 'req-loss', dispatchToken: 'dispatch-loss' });
  workbench.stop();
  await assert.rejects(next, /RP2040_BUDGET_PAUSE_STOPPED/u);
  assert.equal(worker.terminated, true);
  assert.equal(clock.pending(), 0);
});

test('source invalidation rejects owned pause before retiring worker authority', async () => {
  const clock = manualClock();
  const workbench = preparedWorkbench({ now: clock.now, schedule: clock.schedule,
    unschedule: clock.unschedule, minimumMs: 250, timeoutMs: 1_000 });
  await workbench.run(); const worker = WorkerFixture.instances.at(-1); worker.emit(ready());
  const proof = workbench.pauseForBudget({ deadlineAt: 900,
    requestId: 'req-source-change', dispatchToken: 'dispatch-source-change' });
  workbench.invalidate('Source changed.');
  await assert.rejects(proof, /RP2040_BUDGET_PAUSE_WORKER_RETIRED/u);
  assert.equal(worker.terminated, true);
  assert.equal(workbench.pauseProofOperation, null);
  assert.equal(clock.pending(), 0);
});

test('budget pause cancellation and deadline reject once and late ACK cannot revive ownership', async () => {
  const clock = manualClock(); const controller = new AbortController();
  const workbench = preparedWorkbench({ now: clock.now, schedule: clock.schedule,
    unschedule: clock.unschedule, minimumMs: 250, timeoutMs: 1_000 });
  await workbench.run(); const worker = WorkerFixture.instances.at(-1); worker.emit(ready());
  const cancelled = workbench.pauseForBudget({ signal: controller.signal, deadlineAt: 900,
    requestId: 'req-cancel', dispatchToken: 'dispatch-cancel' });
  const oldPause = worker.messages.findLast((message) => message.command === 'pause');
  controller.abort();
  await assert.rejects(cancelled, /RP2040_BUDGET_PAUSE_CANCELLED/u);
  worker.emit(paced('paused', oldPause.presentationGeneration, 1, { paused: true, cycle: 500 }));
  assert.equal(workbench.pauseProofOperation, null);
  assert.equal(clock.pending(), 0);

  const timed = workbench.pauseForBudget({ deadlineAt: 100, requestId: 'req-time', dispatchToken: 'dispatch-time' });
  clock.advance(100);
  await assert.rejects(timed, /RP2040_BUDGET_PAUSE_DEADLINE/u);
  assert.equal(workbench.pauseProofOperation, null);
  assert.equal(clock.pending(), 0);
});
