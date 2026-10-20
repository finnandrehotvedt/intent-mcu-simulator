// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { Rp2040ExperimentalRuntime } from '../src/rp2040-experimental-runtime.mjs';

class FakeAdapter {
  constructor() {
    this.cycle = 0;
    this.instructions = 0;
    this.advances = 0;
    this.machineSnapshots = 0;
  }

  snapshot() { return { descriptor: { capabilities: ['gpio', 'uart'] } }; }

  handleWithoutSnapshot(command) {
    assert.equal(command.type, 'advance');
    this.advances += 1;
    this.cycle += command.budgetCycles;
    this.instructions += 1;
    return null;
  }

  machineStatus() {
    return { cycle: this.cycle, instructions: this.instructions, blocked: false,
      blockedCode: null, blockedPeripheral: null };
  }

  machineSnapshot() {
    this.machineSnapshots += 1;
    return {
      cycle: this.cycle, instructions: this.instructions, blocked: false,
      gpio: [{ cycle: this.cycle, pin: 'GPIO0', level: true, mode: 'output', virtualNanos: this.cycle }],
      uart: [{ cycle: this.cycle, value: 65 }], pwm: [], adc: [], virtualNanos: this.cycle,
    };
  }
}

test('Pico execution advances without constructing presentation snapshots', () => {
  const adapter = new FakeAdapter();
  const runtime = new Rp2040ExperimentalRuntime(adapter, {
    artifactIdentity: 'a'.repeat(64), firmwareFormat: 'uf2', firmwareOrigin: 'test',
  });
  runtime.run();
  for (let index = 0; index < 1_000; index += 1) runtime.advanceSlice();
  assert.equal(adapter.advances, 1_000);
  assert.equal(adapter.machineSnapshots, 0);
  const snapshot = runtime.snapshot();
  assert.equal(adapter.machineSnapshots, 1);
  assert.equal(snapshot.cycle, 500_000);
  assert.equal(snapshot.instructions, 1_000);
  assert.equal(snapshot.instruments.serial.text, 'A');
  assert.equal(snapshot.trace.at(-1).cycle, 500_000);
});

