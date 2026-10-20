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
  postMessage(message) { this.messages.push(structuredClone(message)); }
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

function preparedWorkbench() {
  WorkerFixture.instances.length = 0;
  globalThis.Worker = WorkerFixture;
  const workbench = new Rp2040PublicWorkbench({ elements: elements() });
  workbench.activate();
  workbench.artifact = { uf2Sha256: ARTIFACT, artifactIdentity: ARTIFACT };
  workbench.artifactBytes = new Uint8Array([1, 2, 3]);
  workbench.artifactRevision = workbench.revision;
  workbench.phase = 'built';
  return workbench;
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
