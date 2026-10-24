// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { X37PrivateRuntimeAdapter } from '../src/x37-private-runtime-adapter.mjs';
import { X37_SHARED_SCHEDULER_SCHEMA } from '../src/x37-shared-scheduler-contract.mjs';

const clone = (value) => structuredClone(value);
const contract = (overrides = {}) => ({ schema: X37_SHARED_SCHEDULER_SCHEMA,
  schedulerId: 'x37-private-adapter', startSchedulerTick: 0,
  participants: [
    { participantId: 'mcu-2x', projectGeneration: 2, runtimeGeneration: 12,
      localCyclesPerSchedulerTick: { numerator: 2, denominator: 1 } },
    { participantId: 'mcu-3x', projectGeneration: 3, runtimeGeneration: 13,
      localCyclesPerSchedulerTick: { numerator: 3, denominator: 1 } },
  ], sharedNet: { netId: 'digital-shared-0',
    driverParticipantIds: ['mcu-2x', 'mcu-3x'], readerParticipantIds: ['mcu-2x', 'mcu-3x'] },
  limits: { eventLimit: 32, traceLimit: 32 }, ...overrides });
const event = (eventId, participantId, localCycle, sequence, mode, level = null,
  netId = 'digital-shared-0') => ({ eventId, participantId,
  projectGeneration: participantId === 'mcu-2x' ? 2 : 3,
  runtimeGeneration: participantId === 'mcu-2x' ? 12 : 13,
  localCycle, sequence, action: { netId, mode, level } });

class ParticipantSeam {
  constructor(participantId, projectGeneration, runtimeGeneration) {
    this.owner = { participantId, projectGeneration, runtimeGeneration };
    this.cycle = 0; this.advances = []; this.retired = 0; this.resets = 0;
    this.throwOnEventId = null;
  }
  identity() { return clone(this.owner); }
  currentCycle() { return this.cycle; }
  advanceToLocalCycle(cycle, acceptedEvent) {
    if (acceptedEvent.eventId === this.throwOnEventId) throw new Error('SYNTHETIC_SEAM_FAILURE');
    if (cycle < this.cycle) throw new Error('SEAM_REWIND');
    this.cycle = cycle; this.advances.push({ cycle, eventId: acceptedEvent.eventId });
  }
  retire() { this.retired += 1; }
  reset() { this.cycle = 0; this.advances = []; this.resets += 1; }
}

function fixture(enabled = true) {
  const two = new ParticipantSeam('mcu-2x', 2, 12);
  const three = new ParticipantSeam('mcu-3x', 3, 13);
  return { two, three, adapter: new X37PrivateRuntimeAdapter({
    contract: contract(), participants: [three, two], enabled,
  }) };
}

const workedEvents = () => [
  event('two.low', 'mcu-2x', 2, 1, 'DRIVE', 'LOW'),
  event('three.high', 'mcu-3x', 3, 1, 'DRIVE', 'HIGH'),
  event('two.high', 'mcu-2x', 4, 2, 'DRIVE', 'HIGH'),
  event('two.release', 'mcu-2x', 6, 3, 'RELEASE'),
  event('three.release', 'mcu-3x', 12, 2, 'RELEASE'),
];

test('adapter is default-disarmed and touches neither participant', () => {
  const { adapter, two, three } = fixture(false);
  assert.throws(() => adapter.execute(workedEvents()), /X37_ADAPTER_DISARMED/u);
  assert.deepEqual([two.advances, three.advances], [[], []]);
});

test('synthetic participant seams execute the 2:1 and 3:1 LOW conflict HIGH high-Z sequence', () => {
  const { adapter, two, three } = fixture();
  const result = adapter.execute([...workedEvents()].reverse());
  assert.deepEqual(result.trace.map(({ schedulerTick, wireState }) => [schedulerTick, wireState]),
    [[1, 'LOW'], [1, 'CONFLICT'], [2, 'HIGH'], [3, 'HIGH'], [4, 'HIGH_Z']]);
  assert.deepEqual(two.advances, [
    { cycle: 2, eventId: 'two.low' }, { cycle: 4, eventId: 'two.high' },
    { cycle: 6, eventId: 'two.release' },
  ]);
  assert.deepEqual(three.advances, [
    { cycle: 3, eventId: 'three.high' }, { cycle: 12, eventId: 'three.release' },
  ]);
  assert.equal(result.events.length, 5);
  assert.equal(result.limits.eventLimit, 32);
});

test('inexact overflow stale unknown-net and reader-drive reject before either seam advances', () => {
  const cases = [];
  const inexact = event('inexact', 'mcu-3x', 1, 1, 'READ'); cases.push(inexact);
  const stale = event('stale', 'mcu-2x', 2, 1, 'READ'); stale.runtimeGeneration = 99; cases.push(stale);
  cases.push(event('unknown', 'mcu-2x', 2, 1, 'READ', null, 'other-net'));
  for (const candidate of cases) {
    const { adapter, two, three } = fixture();
    assert.throws(() => adapter.execute([candidate]), /X37_/u);
    assert.deepEqual([two.advances, three.advances], [[], []]);
  }
  const readerContract = contract(); readerContract.sharedNet.driverParticipantIds = ['mcu-2x'];
  const { two, three } = fixture();
  const adapter = new X37PrivateRuntimeAdapter({ contract: readerContract,
    participants: [two, three], enabled: true });
  assert.throws(() => adapter.execute([
    event('reader-drive', 'mcu-3x', 3, 1, 'DRIVE', 'HIGH'),
  ]), /X37_ACTION_INVALID/u);
  assert.deepEqual([two.advances, three.advances], [[], []]);

  const overflowContract = contract();
  overflowContract.participants[0].localCyclesPerSchedulerTick = { numerator: 1, denominator: 2 };
  const overflowTwo = new ParticipantSeam('mcu-2x', 2, 12);
  const overflowThree = new ParticipantSeam('mcu-3x', 3, 13);
  const overflowAdapter = new X37PrivateRuntimeAdapter({ contract: overflowContract,
    participants: [overflowTwo, overflowThree], enabled: true });
  assert.throws(() => overflowAdapter.execute([
    event('overflow', 'mcu-2x', Number.MAX_SAFE_INTEGER, 1, 'READ'),
  ]), /X37_CLOCK_OVERFLOW/u);
  assert.deepEqual([overflowTwo.advances, overflowThree.advances], [[], []]);
});

test('stale live seam identity and tampered continuation reject before advance', () => {
  const { adapter, two, three } = fixture();
  const first = adapter.execute(workedEvents().slice(0, 2));
  const priorCounts = [two.advances.length, three.advances.length];
  two.owner.runtimeGeneration = 14;
  assert.throws(() => adapter.continueFrom(first,
    [event('next', 'mcu-3x', 6, 2, 'READ')]), /X37_ADAPTER_STALE_PARTICIPANT/u);
  assert.deepEqual([two.advances.length, three.advances.length], priorCounts);
  two.owner.runtimeGeneration = 12;
  const tampered = clone(first); tampered.trace[0].wireState = 'HIGH';
  assert.throws(() => adapter.continueFrom(tampered,
    [event('later', 'mcu-3x', 6, 2, 'READ')]), /X37_SCHEDULE_TRACE_INVALID/u);
  assert.deepEqual([two.advances.length, three.advances.length], priorCounts);
});

test('continuation binds exact live ancestry and rejects cold alternate retirement and reset replay', () => {
  const { adapter, two, three } = fixture();
  const first = adapter.execute(workedEvents().slice(0, 2));
  const cold = fixture().adapter;
  assert.throws(() => cold.continueFrom(first,
    [event('cold.next', 'mcu-2x', 4, 2, 'READ')]), /X37_ADAPTER_COLD_RESTORE_REJECTED/u);

  const alternateFixture = fixture();
  const alternate = alternateFixture.adapter.execute([
    event('alternate.low', 'mcu-2x', 2, 1, 'DRIVE', 'LOW'),
    event('alternate.high', 'mcu-3x', 3, 1, 'DRIVE', 'HIGH'),
  ]);
  const priorCounts = [two.advances.length, three.advances.length];
  assert.throws(() => adapter.continueFrom(alternate,
    [event('later', 'mcu-2x', 4, 2, 'READ')]), /X37_ADAPTER_HISTORY_DIVERGED/u);
  assert.deepEqual([two.advances.length, three.advances.length], priorCounts);

  const retired = adapter.retire('mcu-2x');
  assert.throws(() => adapter.continueFrom(first,
    [event('old-after-retire', 'mcu-3x', 6, 2, 'READ')]), /X37_ADAPTER_HISTORY_DIVERGED/u);
  const reset = adapter.reset();
  assert.throws(() => adapter.continueFrom(retired,
    [event('old-after-reset', 'mcu-3x', 9, 2, 'READ')]), /X37_ADAPTER_HISTORY_DIVERGED/u);
  assert.equal(reset.lifecycle.transitionKind, 'reset');
});

test('retirement preserves the survivor and reset clears history and both seams', () => {
  const { adapter, two, three } = fixture();
  adapter.execute(workedEvents().slice(0, 3));
  const retired = adapter.retire('mcu-2x');
  assert.deepEqual(retired.lifecycle.activeParticipantIds, ['mcu-3x']);
  assert.equal(two.retired, 1);
  const continued = adapter.execute([event('three.release', 'mcu-3x', 9, 2, 'RELEASE')]);
  assert.deepEqual(continued.wireOwnership[0], {
    netId: 'digital-shared-0', drivers: [], state: 'HIGH_Z',
  });
  assert.throws(() => adapter.execute([event('retired-read', 'mcu-2x', 8, 4, 'READ')]), /X37_EVENT_INVALID/u);
  const reset = adapter.reset();
  assert.deepEqual([reset.events, reset.trace, reset.wireOwnership[0].drivers], [[], [], []]);
  assert.deepEqual([two.resets, three.resets], [1, 1]);
  assert.deepEqual(adapter.snapshot().participantCycles, { 'mcu-2x': 0, 'mcu-3x': 0 });
});

test('changed retired generation blocks reset before either synthetic seam mutates', () => {
  const { adapter, two, three } = fixture();
  adapter.execute(workedEvents().slice(0, 3));
  adapter.retire('mcu-2x');
  two.owner.runtimeGeneration = 99;
  const before = { twoResets: two.resets, threeResets: three.resets,
    twoCycle: two.cycle, threeCycle: three.cycle };
  assert.throws(() => adapter.reset(), /X37_ADAPTER_STALE_PARTICIPANT/u);
  assert.deepEqual({ twoResets: two.resets, threeResets: three.resets,
    twoCycle: two.cycle, threeCycle: three.cycle }, before);
});

test('second synthetic seam failure locks adapter against retry until explicit abandonment', () => {
  const { adapter, two, three } = fixture();
  three.throwOnEventId = 'three.high';
  assert.throws(() => adapter.execute(workedEvents().slice(0, 2)), /X37_ADAPTER_SEAM_FAILURE/u);
  assert.deepEqual(two.advances, [{ cycle: 2, eventId: 'two.low' }]);
  assert.deepEqual(three.advances, []);
  assert.deepEqual(adapter.snapshot().failure, { phase: 'advance', participantId: 'mcu-3x',
    eventId: 'three.high', completedCallbacks: 1, cause: 'SYNTHETIC_SEAM_FAILURE' });
  assert.throws(() => adapter.execute(workedEvents().slice(0, 2)), /X37_ADAPTER_FAILED/u);
  assert.throws(() => adapter.reset(), /X37_ADAPTER_FAILED/u);
  assert.deepEqual(two.advances, [{ cycle: 2, eventId: 'two.low' }]);
  const abandoned = adapter.abandonAfterFailure();
  assert.deepEqual(abandoned, { abandoned: true, failure: { phase: 'advance',
    participantId: 'mcu-3x', eventId: 'three.high', completedCallbacks: 1,
    cause: 'SYNTHETIC_SEAM_FAILURE' }, retryAllowed: false, rollbackClaimed: false });
  assert.throws(() => adapter.execute([]), /X37_ADAPTER_DISPOSED/u);
});
