// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { X49PrivateInstrumentedRuntime } from '../src/x49-private-instrumented-runtime.mjs';
import {
  X49_INSTRUMENTED_FIXTURE_ID, X49_INSTRUMENTED_SOURCE_SHA256,
  X49_PROBE_SYMBOL, X49_RUNTIME_PROBE_SCHEMA,
} from '../src/x49-instrumented-fixture-contract.mjs';

const probe = () => ({ schema: X49_RUNTIME_PROBE_SCHEMA,
  fixtureId: X49_INSTRUMENTED_FIXTURE_ID, sourceSha256: X49_INSTRUMENTED_SOURCE_SHA256,
  artifactIdentity: '2'.repeat(64), symbol: { symbol: X49_PROBE_SYMBOL,
    dataAddress: 0x100, size: 4, elfSha256: '6'.repeat(64), binding: 'global', type: 'object' } });

class FakeAdapter {
  constructor(events, priorHook = null) {
    this.cpu = { data: new Uint8Array(0x900), writeHooks: [], cycles: 0, pc: 0 };
    this.adcReads = [];
    this.retentionDrops = { logic: 0, serial: 0, adc: 0, unsupported: 0 };
    this.events = events.map((item) => structuredClone(item)); this.d13 = false;
    if (priorHook) this.cpu.writeHooks[0x101] = priorHook;
  }
  setAnalogChannel(channel, voltage) { this.analogue = { channel, voltage }; }
  setDigitalPin(pin, level) { this.digital = { pin, level }; }
  pinSnapshot() { return [{ pin: 'D13', mode: 'OUTPUT', level: this.d13 }]; }
  step() {
    const event = this.events.shift() ?? { cycle: this.cpu.cycles + 1 };
    const pcBefore = this.cpu.pc;
    for (const write of event.writes ?? []) {
      const address = 0x100 + write.offset; const old = this.cpu.data[address];
      const intercepted = this.cpu.writeHooks[address]?.(write.value, old, address, 255) ?? false;
      if (!intercepted) this.cpu.data[address] = write.value;
    }
    if (event.adc) this.adcReads.push(structuredClone(event.adc));
    if (typeof event.d13 === 'boolean') this.d13 = event.d13;
    this.cpu.cycles = event.cycle; this.cpu.pc += 1;
    return { pcBefore, pcAfter: this.cpu.pc, cycles: 1 };
  }
}

function events({ temperature = 29, d13 = true, lowUnchanged = false, adcValue = 409 } = {}) {
  const low = lowUnchanged ? 0 : temperature & 0xff;
  return [
    { cycle: 10, writes: [{ offset: 0, value: 0 }] },
    { cycle: 20, writes: [{ offset: 1, value: 0 }] },
    { cycle: 30, writes: [{ offset: 2, value: 128 }] },
    { cycle: 40, writes: [{ offset: 3, value: 255 }] },
    { cycle: 100, adc: { channel: 1, value: adcValue, startCycle: 80,
      completionCycle: 90 }, writes: [{ offset: 0, value: 1 }] },
    { cycle: 110, writes: [{ offset: 1, value: low }] },
    { cycle: 120, writes: [{ offset: 2, value: 0 }] },
    { cycle: 130, d13, writes: [{ offset: 3, value: d13 ? 1 : 0 }] },
    { cycle: 140, writes: [{ offset: 0, value: 2 }] },
    { cycle: 2_560_000, d13 },
  ];
}

function runtime({ sequence = events(), priorHook = null, caseId = 'baseline-offset-0' } = {}) {
  let adapter;
  const value = new X49PrivateInstrumentedRuntime({ hex: ':00000001FF', probe: probe(),
    caseId, adapterFactory: () => (adapter = new FakeAdapter(sequence, priorHook)) });
  return { value, adapter };
}

test('zeroed SRAM arms only after four genuine ordered CRT sentinel stores', () => {
  const { value, adapter } = runtime();
  assert.equal(adapter.cpu.cycles, 0);
  assert.deepEqual(adapter.analogue, { channel: 1, voltage: 2 });
  assert.deepEqual(adapter.digital, { pin: 2, level: false });
  assert.deepEqual([...adapter.cpu.data.slice(0x100, 0x104)], [0, 0, 0, 0]);
  for (let index = 0; index < 3; index += 1) {
    assert.equal(value.step().terminal, null); assert.equal(value.snapshot().startupArmed, false);
  }
  assert.equal(value.step().terminal, null);
  assert.equal(value.snapshot().startupArmed, true);
  assert.equal(value.snapshot().startupWrites, 4);
  assert.equal(value.snapshot().retainedMailboxWrites, 0);
  assert.deepEqual([...adapter.cpu.data.slice(0x100, 0x104)], [0, 0, 128, 255]);
});

test('early first transaction is retained but cannot qualify before an actual 160ms sample', () => {
  const { value } = runtime();
  for (let index = 0; index < 9; index += 1) assert.equal(value.step().terminal, null);
  assert.equal(value.snapshot().transactionCaptured, true);
  assert.equal(value.snapshot().cycle, 140);
  const result = value.step();
  assert.equal(result.terminal.state, 'complete');
  assert.equal(result.terminal.evidence.time.cpuCycles, 2_560_000);
  assert.equal(result.terminal.evidence.pin.observedCycle, 2_560_000);
  assert.equal(result.terminal.evidence.inputRetainedThroughCycle, 2_560_000);
  assert.equal(result.terminal.evidence.retention.retainedMailboxWrites, 5);
});

test('fresh +1 case joins ADC414, mailbox 30 and D13 low at the qualifying sample', () => {
  const { value } = runtime({ caseId: 'offset-plus-1',
    sequence: events({ temperature: 30, d13: false, adcValue: 414 }) });
  for (let index = 0; index < 10; index += 1) value.step();
  const evidence = value.snapshot().terminal.evidence;
  assert.equal(evidence.adc.value, 414);
  assert.equal(evidence.firmwareTransaction.temperatureC, 30);
  assert.equal(evidence.firmwareTransaction.d13Level, 0);
  assert.equal(evidence.pin.level, false);
});

test('exact hooks witness unchanged stores, preserve prior hook and dispose restores it', () => {
  let priorCalls = 0; const prior = () => { priorCalls += 1; return false; }; const { value, adapter } = runtime({
    sequence: events({ temperature: 0, lowUnchanged: true }), priorHook: prior,
  });
  for (let index = 0; index < 10; index += 1) value.step();
  assert.equal(value.snapshot().terminal.state, 'complete');
  assert.equal(priorCalls, 2);
  const terminal = value.dispose();
  assert.equal(terminal.newlyTerminal, false);
  assert.equal(adapter.cpu.writeHooks[0x101], prior);
  assert.equal(value.snapshot().disposed, true);
});

test('an intercepting prior hook cannot forge a mailbox write witness', () => {
  const { value } = runtime({ priorHook: () => true });
  for (let index = 0; index < 4; index += 1) value.step();
  assert.equal(value.snapshot().terminal.reason, 'missing-evidence');
  assert.equal(value.snapshot().startupArmed, false);
});

test('a prior hook may observe startup but an intercepted transaction store is never witnessed', () => {
  let calls = 0; const prior = () => { calls += 1; return calls > 1; };
  const { value } = runtime({ priorHook: prior });
  for (let index = 0; index < 9; index += 1) value.step();
  assert.equal(value.snapshot().terminal.reason, 'truncated-evidence');
  assert.equal(calls, 2);
});

test('startup witness retention is finite before the sentinel can arm', () => {
  const sequence = Array.from({ length: 17 }, (_, index) =>
    ({ cycle: index + 1, writes: [{ offset: index % 4, value: 0 }] }));
  const { value } = runtime({ sequence });
  while (!value.snapshot().terminal) value.step();
  assert.equal(value.snapshot().terminal.reason, 'dropped-evidence');
  assert.equal(value.snapshot().startupArmed, false);
});

test('missing commit, hook overflow, cancellation and post-terminal cancellation never double-terminal', () => {
  const missing = runtime({ sequence: [...events().slice(0, 4), { cycle: 5_600_001 }] }).value;
  for (let index = 0; index < 4; index += 1) missing.step();
  assert.equal(missing.step().terminal.reason, 'window-expired');
  const overflowEvents = [...events().slice(0, 4), { cycle: 100,
    adc: { channel: 1, value: 409, startCycle: 80,
    completionCycle: 90 }, writes: [{ offset: 0, value: 1 }] }];
  for (let index = 0; index < 9; index += 1) overflowEvents.push({ cycle: 110 + index,
    writes: [{ offset: 1, value: index }] });
  const overflow = runtime({ sequence: overflowEvents }).value;
  while (!overflow.snapshot().terminal) overflow.step();
  assert.equal(overflow.snapshot().terminal.reason, 'dropped-evidence');
  const cancelled = runtime().value;
  assert.equal(cancelled.cancel().newlyTerminal, true);
  assert.equal(cancelled.cancel().newlyTerminal, false);
  const completed = runtime().value; for (let index = 0; index < 10; index += 1) completed.step();
  assert.equal(completed.cancel().newlyTerminal, false);
});
