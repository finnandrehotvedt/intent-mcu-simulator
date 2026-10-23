// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  continueX37InertSchedule, createX37InertSchedule, resetX37InertSchedule,
  retireX37Participant, validateX37InertSchedule, X37_SHARED_SCHEDULER_SCHEMA,
  x37CanonicalSchedule, x37SchedulerTick,
} from '../src/x37-shared-scheduler-contract.mjs';

const clone = (value) => structuredClone(value);
const contract = (overrides = {}) => ({ schema: X37_SHARED_SCHEDULER_SCHEMA,
  schedulerId: 'x37-two-clock-review', startSchedulerTick: 0,
  participants: [
    { participantId: 'z-MCU', projectGeneration: 4, runtimeGeneration: 8,
      localCyclesPerSchedulerTick: { numerator: 3, denominator: 1 } },
    { participantId: 'A_mcu', projectGeneration: 2, runtimeGeneration: 6,
      localCyclesPerSchedulerTick: { numerator: 2, denominator: 1 } },
  ], sharedNet: { netId: 'shared-digital',
    driverParticipantIds: ['z-MCU', 'A_mcu'], readerParticipantIds: ['z-MCU', 'A_mcu'] },
  limits: { eventLimit: 16, traceLimit: 16 }, ...overrides });
const event = (eventId, participantId, localCycle, sequence, mode, level = null,
  netId = 'shared-digital') => ({ eventId, participantId,
  projectGeneration: participantId === 'A_mcu' ? 2 : 4,
  runtimeGeneration: participantId === 'A_mcu' ? 6 : 8,
  localCycle, sequence, action: { netId, mode, level } });

test('worked two-clock example is ASCII-canonical across participant and input order', () => {
  const events = [event('z.release', 'z-MCU', 12, 4, 'RELEASE'),
    event('A.low', 'A_mcu', 2, 1, 'DRIVE', 'LOW'),
    event('z.high', 'z-MCU', 3, 1, 'DRIVE', 'HIGH'),
    event('A.release', 'A_mcu', 6, 3, 'RELEASE'),
    event('A.high', 'A_mcu', 4, 2, 'DRIVE', 'HIGH')];
  const left = createX37InertSchedule(contract(), events);
  const reversedContract = contract(); reversedContract.participants.reverse();
  reversedContract.sharedNet.driverParticipantIds.reverse();
  reversedContract.sharedNet.readerParticipantIds.reverse();
  const right = createX37InertSchedule(reversedContract, [...events].reverse());
  assert.equal(x37CanonicalSchedule(left, contract()), x37CanonicalSchedule(right, contract()));
  assert.deepEqual(left.trace.map(({ schedulerTick, eventId, wireState }) =>
    [schedulerTick, eventId, wireState]), [[1, 'A.low', 'LOW'], [1, 'z.high', 'CONFLICT'],
    [2, 'A.high', 'HIGH'], [3, 'A.release', 'HIGH'], [4, 'z.release', 'HIGH_Z']]);
});

test('ASCII order is explicit for upper lower underscore hyphen dot and colon IDs', () => {
  const ids = ['a:id', 'A.id', 'A_id', 'A-id'];
  const sorted = [...ids].sort((left, right) => left === right ? 0 : left < right ? -1 : 1);
  assert.deepEqual(sorted, ['A-id', 'A.id', 'A_id', 'a:id']);
  const value = createX37InertSchedule(contract(), [
    event('a:id', 'A_mcu', 2, 4, 'READ'), event('A.id', 'A_mcu', 2, 2, 'READ'),
    event('A_id', 'A_mcu', 2, 3, 'READ'), event('A-id', 'A_mcu', 2, 1, 'READ')]);
  assert.deepEqual(value.events.map(({ eventId }) => eventId), ['A-id', 'A.id', 'A_id', 'a:id']);
});

test('rational conversion rejects rounding overflow and events before explicit start boundary', () => {
  assert.equal(x37SchedulerTick(12, { numerator: 3, denominator: 2 }), 8);
  assert.throws(() => x37SchedulerTick(1, { numerator: 3, denominator: 2 }), /X37_CLOCK_INEXACT/u);
  assert.throws(() => x37SchedulerTick(Number.MAX_SAFE_INTEGER,
    { numerator: 1, denominator: 2 }), /X37_CLOCK_OVERFLOW/u);
  const startOne = contract({ startSchedulerTick: 1 });
  assert.throws(() => createX37InertSchedule(startOne,
    [event('past', 'A_mcu', 0, 1, 'READ')]), /X37_EVENT_PAST/u);
  assert.equal(createX37InertSchedule(contract(),
    [event('zero', 'A_mcu', 0, 1, 'READ')]).events[0].schedulerTick, 0);
});

test('declared net roles reject unknown nets and reader-only DRIVE or RELEASE', () => {
  const readerOnly = contract(); readerOnly.sharedNet.driverParticipantIds = ['A_mcu'];
  assert.throws(() => createX37InertSchedule(readerOnly,
    [event('drive', 'z-MCU', 3, 1, 'DRIVE', 'HIGH')]), /X37_ACTION_INVALID/u);
  assert.throws(() => createX37InertSchedule(readerOnly,
    [event('release', 'z-MCU', 3, 1, 'RELEASE')]), /X37_ACTION_INVALID/u);
  assert.throws(() => createX37InertSchedule(contract(),
    [event('wrong-net', 'A_mcu', 2, 1, 'READ', null, 'other-net')]), /X37_ACTION_INVALID/u);
  assert.equal(createX37InertSchedule(readerOnly,
    [event('read', 'z-MCU', 3, 1, 'READ')]).trace[0].wireState, 'HIGH_Z');
});

test('stale identity duplicates and bounded retention fail closed or report exact loss', () => {
  const stale = event('stale', 'A_mcu', 2, 1, 'READ'); stale.runtimeGeneration = 5;
  assert.throws(() => createX37InertSchedule(contract(), [stale]), /X37_EVENT_STALE/u);
  const one = event('one', 'A_mcu', 2, 1, 'READ');
  assert.throws(() => createX37InertSchedule(contract(), [one, clone(one)]), /X37_EVENT_DUPLICATE/u);
  const two = event('two', 'A_mcu', 4, 1, 'READ');
  assert.throws(() => createX37InertSchedule(contract(), [one, two]), /X37_SEQUENCE_DUPLICATE/u);
  const limited = contract({ limits: { eventLimit: 2, traceLimit: 1 } });
  const value = createX37InertSchedule(limited,
    [one, event('two', 'A_mcu', 4, 2, 'READ')]);
  assert.deepEqual(value.traceRetention, { dropped: 1, complete: false });
});

test('continuation retains bounded identity history and rejects cross-batch replay', () => {
  const first = createX37InertSchedule(contract(), [event('one', 'A_mcu', 2, 1, 'READ')]);
  const continued = continueX37InertSchedule(contract(), first,
    [event('two', 'A_mcu', 4, 2, 'READ')]);
  assert.deepEqual(continued.events.map(({ eventId }) => eventId), ['one', 'two']);
  assert.throws(() => continueX37InertSchedule(contract(), first,
    [event('one', 'A_mcu', 4, 2, 'READ')]), /X37_EVENT_DUPLICATE/u);
  assert.throws(() => continueX37InertSchedule(contract(), first,
    [event('two', 'A_mcu', 4, 1, 'READ')]), /X37_SEQUENCE_DUPLICATE/u);
  const oneOnly = contract({ limits: { eventLimit: 1, traceLimit: 1 } });
  const full = createX37InertSchedule(oneOnly, [event('one', 'A_mcu', 2, 1, 'READ')]);
  assert.throws(() => continueX37InertSchedule(oneOnly, full,
    [event('two', 'A_mcu', 4, 2, 'READ')]), /X37_EVENT_BUDGET/u);
});

test('retirement tombstones generation and rejects all later events from retired owner', () => {
  const value = createX37InertSchedule(contract(), [
    event('a', 'A_mcu', 2, 1, 'DRIVE', 'LOW'), event('z', 'z-MCU', 3, 1, 'DRIVE', 'LOW')]);
  const retired = retireX37Participant(value, contract(), 'A_mcu');
  assert.deepEqual(retired.lifecycle.activeParticipantIds, ['z-MCU']);
  assert.deepEqual(retired.lifecycle.retiredGenerations,
    [{ participantId: 'A_mcu', projectGeneration: 2, runtimeGeneration: 6 }]);
  assert.deepEqual(retired.events.map(({ eventId }) => eventId), ['z']);
  assert.deepEqual(retired.wireOwnership[0].drivers, [['z-MCU', 'LOW']]);
  assert.throws(() => continueX37InertSchedule(contract(), retired,
    [event('rejoin', 'A_mcu', 8, 2, 'READ')]), /X37_EVENT_INVALID/u);
  assert.throws(() => continueX37InertSchedule(contract(), retired,
    [event('past-boundary', 'z-MCU', 3, 2, 'READ')]), /X37_EVENT_PAST/u);
});

test('reset tombstones both generations and clears every event trace and owner', () => {
  const value = createX37InertSchedule(contract(), [event('a', 'A_mcu', 2, 1, 'DRIVE', 'LOW')]);
  const reset = resetX37InertSchedule(value, contract());
  assert.deepEqual(reset.lifecycle.activeParticipantIds, []);
  assert.equal(reset.lifecycle.retiredGenerations.length, 2);
  assert.deepEqual([reset.events, reset.trace, reset.wireOwnership[0].drivers], [[], [], []]);
  assert.throws(() => continueX37InertSchedule(contract(), reset,
    [event('after-reset', 'z-MCU', 3, 1, 'READ')]), /X37_EVENT_INVALID/u);
});

test('transition APIs reject schema-only and authority-forged schedules', () => {
  const value = createX37InertSchedule(contract(), [event('a', 'A_mcu', 2, 1, 'READ')]);
  const forged = clone(value); forged.authority.runtimeExecution = true;
  assert.throws(() => validateX37InertSchedule(forged, contract()), /X37_SCHEDULE_AUTHORITY_INVALID/u);
  const forgedOwner = clone(value); forgedOwner.wireOwnership[0].drivers = [['ghost', 'LOW']];
  forgedOwner.wireOwnership[0].state = 'LOW';
  assert.throws(() => validateX37InertSchedule(forgedOwner, contract()), /X37_SCHEDULE_WIRE_INVALID/u);
  const forgedTrace = clone(value); forgedTrace.trace[0].wireState = 'LOW';
  assert.throws(() => validateX37InertSchedule(forgedTrace, contract()), /X37_SCHEDULE_TRACE_INVALID/u);
  const forgedDrivers = clone(value); forgedDrivers.trace[0].driverIds = ['z-MCU'];
  assert.throws(() => validateX37InertSchedule(forgedDrivers, contract()), /X37_SCHEDULE_TRACE_INVALID/u);
  const forgedRetention = clone(value); forgedRetention.traceRetention = { dropped: 1, complete: false };
  assert.throws(() => validateX37InertSchedule(forgedRetention, contract()),
    /X37_SCHEDULE_TRACE_INVALID/u);
  const forgedDuplicate = clone(value); forgedDuplicate.events.push(clone(forgedDuplicate.events[0]));
  assert.throws(() => validateX37InertSchedule(forgedDuplicate, contract()), /X37_EVENT_DUPLICATE/u);
  assert.throws(() => retireX37Participant({ schema: value.schema }, contract(), 'A_mcu'),
    /X37_SCHEDULE_INVALID/u);
  assert.throws(() => resetX37InertSchedule({ schema: value.schema }, contract()),
    /X37_SCHEDULE_INVALID/u);
});

test('source remains browser-safe and has no worker service or ambient timer integration', async () => {
  const source = await readFile(new URL('../src/x37-shared-scheduler-contract.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source,
    /new Worker|fetch\(|WebSocket|setTimeout|setInterval|from ['"]node:|service\.mjs/u);
  assert.match(source, /digital-state-contract\.mjs/u);
});
