// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RP2040_PRESENTATION_SCHEMA, Rp2040SnapshotPacer, acceptsPresentation, presentationAck,
} from '../src/rp2040-snapshot-pacer.mjs';

const ARTIFACT = 'a'.repeat(64);

class FakeClock {
  constructor() { this.time = 0; this.nextId = 1; this.timers = new Map(); }
  now = () => this.time;
  setTimer = (callback, delay) => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + delay, callback });
    return id;
  };
  clearTimer = (id) => { this.timers.delete(id); };
  runNext() {
    const next = [...this.timers.entries()].sort((left, right) => left[1].at - right[1].at)[0];
    if (!next) throw new Error('NO_FAKE_TIMER');
    this.timers.delete(next[0]);
    this.time = next[1].at;
    next[1].callback();
  }
}

function fixture() {
  const clock = new FakeClock();
  const state = { advances: 0, snapshotConstructions: 0, events: [], dropped: 0 };
  const emitted = [];
  const errors = [];
  const pacer = new Rp2040SnapshotPacer({
    artifactIdentity: ARTIFACT,
    advance() {
      state.advances += 1;
      state.events.push({ cycle: state.advances * 500, level: Boolean(state.advances % 2) });
      if (state.events.length > 32) { state.events.shift(); state.dropped += 1; }
    },
    snapshot(kind) {
      state.snapshotConstructions += 1;
      return { kind, artifactIdentity: ARTIFACT, cycle: state.advances * 500,
        instructions: state.advances, paused: kind !== 'status', instruments: {
          serial: { records: structuredClone(state.events), retained: state.events.length,
            dropped: state.dropped },
          logic: { transitions: structuredClone(state.events), dropped: state.dropped },
        } };
    },
    emit: (message) => emitted.push(structuredClone(message)),
    onError: (error) => errors.push(error),
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    executionDelayMs: 4, presentationIntervalMs: 40,
  });
  return { clock, state, emitted, errors, pacer };
}

test('1,000 execution ticks construct at most one full snapshot before exact ACK', () => {
  const value = fixture();
  value.pacer.start(1);
  for (let index = 0; index < 1_000; index += 1) value.clock.runNext();
  assert.equal(value.state.advances, 1_000);
  assert.equal(value.state.snapshotConstructions, 1);
  assert.equal(value.emitted.length, 1);
  const first = value.emitted[0];
  assert.equal(first.presentation.schema, RP2040_PRESENTATION_SCHEMA);

  for (const changed of [
    { artifactIdentity: 'b'.repeat(64), presentationGeneration: 1, sequence: 1 },
    { artifactIdentity: ARTIFACT, presentationGeneration: 2, sequence: 1 },
    { artifactIdentity: ARTIFACT, presentationGeneration: 1, sequence: 2 },
  ]) assert.equal(value.pacer.acknowledge(changed), false);
  assert.equal(value.state.snapshotConstructions, 1);

  assert.equal(value.pacer.acknowledge(presentationAck(first)), true);
  assert.equal(value.state.snapshotConstructions, 2);
  assert.equal(value.emitted.length, 2);
  const latest = value.emitted[1];
  assert.equal(latest.cycle, 500_000);
  assert.equal(latest.instruments.serial.retained, 32);
  assert.equal(latest.instruments.serial.dropped, 968);
  assert.deepEqual(latest.instruments.logic.transitions, latest.instruments.serial.records);
  assert.equal(latest.instruments.logic.dropped, 968);
  assert.deepEqual(value.errors, []);
});

test('final Pause bypasses blocked ACK and stale ACK cannot release a new run', () => {
  const value = fixture();
  value.pacer.start(4);
  for (let index = 0; index < 10; index += 1) value.clock.runNext();
  const blocked = value.emitted[0];
  const final = value.pacer.publishFinal(5, 'paused');
  assert.equal(final.final, true);
  assert.equal(value.emitted.at(-1).kind, 'paused');
  assert.equal(value.emitted.at(-1).paused, true);
  assert.equal(value.clock.timers.size, 0);

  value.pacer.start(6);
  assert.equal(value.pacer.acknowledge(presentationAck(blocked)), false);
  for (let index = 0; index < 10; index += 1) value.clock.runNext();
  assert.equal(value.emitted.at(-1).presentation.generation, 6);
  assert.equal(value.emitted.at(-1).kind, 'status');
  assert.equal(value.pacer.acknowledge({ artifactIdentity: ARTIFACT,
    presentationGeneration: 5, sequence: final.sequence }), false);
});

test('cancel invalidates timers and exact page acceptance rejects stale generation and sequence', () => {
  const value = fixture();
  value.pacer.start(10);
  value.clock.runNext();
  value.pacer.cancel(11);
  assert.equal(value.clock.timers.size, 0);
  assert.throws(() => value.pacer.start(11), /RP2040_PRESENTATION_GENERATION_STALE/u);
  value.pacer.start(12);
  for (let index = 0; index < 10; index += 1) value.clock.runNext();
  const message = value.emitted.at(-1);
  assert.equal(acceptsPresentation(message, {
    artifactIdentity: ARTIFACT, presentationGeneration: 12, lastSequence: 0,
  }), true);
  assert.equal(acceptsPresentation(message, {
    artifactIdentity: ARTIFACT, presentationGeneration: 11, lastSequence: 0,
  }), false);
  assert.equal(acceptsPresentation(message, {
    artifactIdentity: ARTIFACT, presentationGeneration: 12,
    lastSequence: message.presentation.sequence,
  }), false);
});

