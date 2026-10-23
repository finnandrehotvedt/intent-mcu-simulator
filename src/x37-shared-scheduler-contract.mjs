// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { DIGITAL_DRIVER_LEVELS, stableDigitalStateStringify } from './digital-state-contract.mjs';

export const X37_SHARED_SCHEDULER_SCHEMA = 'intent-mcu-x37-shared-scheduler-contract@1';
export const X37_SHARED_SCHEDULE_SCHEMA = 'intent-mcu-x37-inert-schedule@1';
const AUTHORITY = Object.freeze({ inertTraceOnly: true, runtimeExecution: false, worker: false,
  compiler: false, service: false, network: false, timer: false, storage: false });
const ID = /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/u;
const positiveSafe = (value) => Number.isSafeInteger(value) && value > 0;
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };
const asciiCompare = (left, right) => left === right ? 0 : left < right ? -1 : 1;
const same = (left, right) => stableDigitalStateStringify(left) === stableDigitalStateStringify(right);

function participant(value) {
  if (!exactKeys(value, ['participantId', 'projectGeneration', 'runtimeGeneration',
    'localCyclesPerSchedulerTick']) || !ID.test(value.participantId ?? '')
      || !positiveSafe(value.projectGeneration) || !positiveSafe(value.runtimeGeneration)
      || !exactKeys(value.localCyclesPerSchedulerTick, ['numerator', 'denominator'])
      || !positiveSafe(value.localCyclesPerSchedulerTick.numerator)
      || !positiveSafe(value.localCyclesPerSchedulerTick.denominator)) reject('X37_PARTICIPANT_INVALID');
  return clone(value);
}

function sortedUniqueIds(value, participants, code) {
  if (!Array.isArray(value) || !value.length || value.some((id) => !participants.has(id))) reject(code);
  const sorted = [...value].sort(asciiCompare);
  if (new Set(sorted).size !== sorted.length) reject(code);
  return sorted;
}

export function validateX37SharedSchedulerContract(value) {
  if (!exactKeys(value, ['schema', 'schedulerId', 'startSchedulerTick', 'participants',
    'sharedNet', 'limits']) || value.schema !== X37_SHARED_SCHEDULER_SCHEMA
      || !ID.test(value.schedulerId ?? '') || !Number.isSafeInteger(value.startSchedulerTick)
      || value.startSchedulerTick < 0 || !Array.isArray(value.participants)
      || value.participants.length !== 2 || !exactKeys(value.sharedNet,
        ['netId', 'driverParticipantIds', 'readerParticipantIds'])
      || !ID.test(value.sharedNet.netId ?? '') || !exactKeys(value.limits, ['eventLimit', 'traceLimit'])
      || !positiveSafe(value.limits.eventLimit) || value.limits.eventLimit > 32
      || !positiveSafe(value.limits.traceLimit) || value.limits.traceLimit > 32) reject('X37_CONTRACT_INVALID');
  const participants = value.participants.map(participant)
    .sort((left, right) => asciiCompare(left.participantId, right.participantId));
  if (participants[0].participantId === participants[1].participantId) reject('X37_PARTICIPANT_DUPLICATE');
  const ids = new Set(participants.map(({ participantId }) => participantId));
  const sharedNet = { netId: value.sharedNet.netId,
    driverParticipantIds: sortedUniqueIds(value.sharedNet.driverParticipantIds, ids, 'X37_NET_DRIVERS_INVALID'),
    readerParticipantIds: sortedUniqueIds(value.sharedNet.readerParticipantIds, ids, 'X37_NET_READERS_INVALID') };
  return { schema: value.schema, schedulerId: value.schedulerId,
    startSchedulerTick: value.startSchedulerTick, participants, sharedNet, limits: clone(value.limits) };
}

export function x37SchedulerTick(localCycle, clock) {
  if (!Number.isSafeInteger(localCycle) || localCycle < 0
      || !exactKeys(clock, ['numerator', 'denominator'])
      || !positiveSafe(clock.numerator) || !positiveSafe(clock.denominator)) reject('X37_CLOCK_INVALID');
  const scaled = BigInt(localCycle) * BigInt(clock.denominator);
  const divisor = BigInt(clock.numerator);
  if (scaled % divisor !== 0n) reject('X37_CLOCK_INEXACT');
  const tick = scaled / divisor;
  if (tick > BigInt(Number.MAX_SAFE_INTEGER)) reject('X37_CLOCK_OVERFLOW');
  return Number(tick);
}

function action(value, contract, participantId) {
  if (!exactKeys(value, ['netId', 'mode', 'level']) || value.netId !== contract.sharedNet.netId
      || !['DRIVE', 'RELEASE', 'READ'].includes(value.mode)
      || (value.mode === 'DRIVE'
        ? !['LOW', 'HIGH'].includes(value.level) || !DIGITAL_DRIVER_LEVELS.includes(value.level)
          || !contract.sharedNet.driverParticipantIds.includes(participantId)
        : value.level !== null)
      || (value.mode === 'READ' && !contract.sharedNet.readerParticipantIds.includes(participantId))
      || (value.mode === 'RELEASE'
        && !contract.sharedNet.driverParticipantIds.includes(participantId))) reject('X37_ACTION_INVALID');
  return clone(value);
}

function acceptedEvent(value, contract, activeIds, minimumTick, strictFuture) {
  const owners = new Map(contract.participants.map((item) => [item.participantId, item]));
  if (!exactKeys(value, ['eventId', 'participantId', 'projectGeneration', 'runtimeGeneration',
    'localCycle', 'sequence', 'action']) || !ID.test(value.eventId ?? '')
      || !owners.has(value.participantId) || !activeIds.has(value.participantId)
      || !Number.isSafeInteger(value.localCycle) || value.localCycle < 0
      || !positiveSafe(value.sequence)) reject('X37_EVENT_INVALID');
  const owner = owners.get(value.participantId);
  if (value.projectGeneration !== owner.projectGeneration
      || value.runtimeGeneration !== owner.runtimeGeneration) reject('X37_EVENT_STALE');
  const schedulerTick = x37SchedulerTick(value.localCycle, owner.localCyclesPerSchedulerTick);
  if (strictFuture ? schedulerTick <= minimumTick : schedulerTick < minimumTick) reject('X37_EVENT_PAST');
  return { ...clone(value), action: action(value.action, contract, value.participantId), schedulerTick };
}

const eventOrder = (left, right) => left.schedulerTick - right.schedulerTick
  || asciiCompare(left.participantId, right.participantId)
  || left.sequence - right.sequence || asciiCompare(left.eventId, right.eventId);
function wireState(drivers) {
  const levels = [...drivers.values()];
  if (!levels.length) return 'HIGH_Z';
  return levels.every((level) => level === levels[0]) ? levels[0] : 'CONFLICT';
}
function ownership(contract, drivers) {
  return [{ netId: contract.sharedNet.netId,
    drivers: [...drivers.entries()].sort(([left], [right]) => asciiCompare(left, right)),
    state: wireState(drivers) }];
}

function deriveEventState(contract, events) {
  const drivers = new Map(); const trace = [];
  for (const item of events) {
    if (item.action.mode === 'DRIVE') drivers.set(item.participantId, item.action.level);
    if (item.action.mode === 'RELEASE') drivers.delete(item.participantId);
    trace.push({ schedulerTick: item.schedulerTick, participantId: item.participantId,
      eventId: item.eventId, sequence: item.sequence, action: clone(item.action),
      wireState: wireState(drivers), driverIds: [...drivers.keys()].sort(asciiCompare) });
  }
  const dropped = Math.max(0, trace.length - contract.limits.traceLimit);
  return { trace: trace.slice(dropped), traceRetention: { dropped, complete: dropped === 0 },
    wireOwnership: ownership(contract, drivers) };
}

function validateAuthority(value) {
  if (!same(value, AUTHORITY)) reject('X37_SCHEDULE_AUTHORITY_INVALID');
}

export function validateX37InertSchedule(value, contractValue) {
  const contract = validateX37SharedSchedulerContract(contractValue);
  if (!exactKeys(value, ['schema', 'schedulerId', 'participants', 'sharedNet', 'events', 'trace',
    'traceRetention', 'wireOwnership', 'lifecycle', 'limits', 'authority'])
      || value.schema !== X37_SHARED_SCHEDULE_SCHEMA || value.schedulerId !== contract.schedulerId
      || !same(value.participants, contract.participants) || !same(value.sharedNet, contract.sharedNet)
      || !same(value.limits, contract.limits) || !Array.isArray(value.events)
      || !Array.isArray(value.trace) || !Array.isArray(value.wireOwnership)
      || !exactKeys(value.traceRetention, ['dropped', 'complete'])
      || !Number.isSafeInteger(value.traceRetention.dropped) || value.traceRetention.dropped < 0
      || value.traceRetention.complete !== (value.traceRetention.dropped === 0)
      || !exactKeys(value.lifecycle, ['transitionKind', 'startSchedulerTick', 'boundarySchedulerTick',
        'activeParticipantIds', 'retiredGenerations'])
      || !['scheduled', 'participant-retired', 'reset'].includes(value.lifecycle.transitionKind)
      || value.lifecycle.startSchedulerTick !== contract.startSchedulerTick
      || !Number.isSafeInteger(value.lifecycle.boundarySchedulerTick)
      || value.lifecycle.boundarySchedulerTick < contract.startSchedulerTick
      || !Array.isArray(value.lifecycle.activeParticipantIds)
      || !Array.isArray(value.lifecycle.retiredGenerations)) reject('X37_SCHEDULE_INVALID');
  validateAuthority(value.authority);
  const known = new Set(contract.participants.map(({ participantId }) => participantId));
  const owners = new Map(contract.participants.map((item) => [item.participantId, item]));
  const active = [...value.lifecycle.activeParticipantIds].sort(asciiCompare);
  if (new Set(active).size !== active.length || active.some((id) => !known.has(id))
      || !same(active, value.lifecycle.activeParticipantIds)) reject('X37_SCHEDULE_LIFECYCLE_INVALID');
  const retiredIds = new Set();
  for (const item of value.lifecycle.retiredGenerations) {
    const owner = owners.get(item?.participantId);
    if (!exactKeys(item, ['participantId', 'projectGeneration', 'runtimeGeneration'])
        || !owner || item.projectGeneration !== owner.projectGeneration
        || item.runtimeGeneration !== owner.runtimeGeneration || active.includes(item.participantId)
        || retiredIds.has(item.participantId)) {
      reject('X37_SCHEDULE_LIFECYCLE_INVALID');
    }
    retiredIds.add(item.participantId);
  }
  if (active.length + retiredIds.size !== 2) reject('X37_SCHEDULE_LIFECYCLE_INVALID');
  if (value.events.length > contract.limits.eventLimit) reject('X37_EVENT_BUDGET');
  let priorEvent = null; const eventIds = new Set(); const participantSequences = new Set();
  for (const item of value.events) {
    const owner = owners.get(item?.participantId);
    if (!exactKeys(item, ['eventId', 'participantId', 'projectGeneration', 'runtimeGeneration',
      'localCycle', 'sequence', 'action', 'schedulerTick']) || !owner
        || !active.includes(item.participantId) || !ID.test(item.eventId ?? '')
        || item.projectGeneration !== owner.projectGeneration
        || item.runtimeGeneration !== owner.runtimeGeneration || !positiveSafe(item.sequence)
        || item.schedulerTick !== x37SchedulerTick(item.localCycle, owner.localCyclesPerSchedulerTick)
        || item.schedulerTick < contract.startSchedulerTick
        || item.schedulerTick > value.lifecycle.boundarySchedulerTick) reject('X37_SCHEDULE_EVENT_INVALID');
    action(item.action, contract, item.participantId);
    const sequence = `${item.participantId}:${item.sequence}`;
    if (eventIds.has(item.eventId)) reject('X37_EVENT_DUPLICATE');
    if (participantSequences.has(sequence)) reject('X37_SEQUENCE_DUPLICATE');
    eventIds.add(item.eventId); participantSequences.add(sequence);
    if (priorEvent && eventOrder(priorEvent, item) >= 0) reject('X37_SCHEDULE_EVENT_ORDER_INVALID');
    priorEvent = item;
  }
  if (value.trace.length > contract.limits.traceLimit) reject('X37_SCHEDULE_TRACE_INVALID');
  for (const row of value.trace) {
    if (!exactKeys(row, ['schedulerTick', 'participantId', 'eventId', 'sequence', 'action',
      'wireState', 'driverIds']) || !Number.isSafeInteger(row.schedulerTick)
        || !active.includes(row.participantId) || !ID.test(row.eventId ?? '')
        || !positiveSafe(row.sequence) || !['LOW', 'HIGH', 'HIGH_Z', 'CONFLICT'].includes(row.wireState)
        || !Array.isArray(row.driverIds) || !same([...row.driverIds].sort(asciiCompare), row.driverIds)) {
      reject('X37_SCHEDULE_TRACE_INVALID');
    }
    action(row.action, contract, row.participantId);
  }
  if (value.wireOwnership.length !== 1) reject('X37_SCHEDULE_WIRE_INVALID');
  const wire = value.wireOwnership[0];
  if (!exactKeys(wire, ['netId', 'drivers', 'state']) || wire.netId !== contract.sharedNet.netId
      || !Array.isArray(wire.drivers)) reject('X37_SCHEDULE_WIRE_INVALID');
  const driverMap = new Map();
  for (const pair of wire.drivers) {
    if (!Array.isArray(pair) || pair.length !== 2 || driverMap.has(pair[0])
        || !active.includes(pair[0]) || !contract.sharedNet.driverParticipantIds.includes(pair[0])
        || !['LOW', 'HIGH'].includes(pair[1])) reject('X37_SCHEDULE_WIRE_INVALID');
    driverMap.set(pair[0], pair[1]);
  }
  if (!same([...driverMap.entries()].sort(([left], [right]) => asciiCompare(left, right)), wire.drivers)
      || wire.state !== wireState(driverMap)) reject('X37_SCHEDULE_WIRE_INVALID');
  const derived = deriveEventState(contract, value.events);
  if (!same(value.wireOwnership, derived.wireOwnership)) reject('X37_SCHEDULE_WIRE_INVALID');
  if (value.lifecycle.transitionKind === 'scheduled') {
    if (!same(value.trace, derived.trace) || !same(value.traceRetention, derived.traceRetention)) {
      reject('X37_SCHEDULE_TRACE_INVALID');
    }
  } else if (value.trace.length !== 0 || !same(value.traceRetention, { dropped: 0, complete: true })) {
    reject('X37_SCHEDULE_TRACE_INVALID');
  }
  return clone(value);
}

function schedule(contractValue, eventValues, priorValue = null) {
  const contract = validateX37SharedSchedulerContract(contractValue);
  const prior = priorValue === null ? null : validateX37InertSchedule(priorValue, contract);
  if (!Array.isArray(eventValues)) reject('X37_EVENT_BUDGET');
  const activeIds = new Set(prior?.lifecycle.activeParticipantIds
    ?? contract.participants.map(({ participantId }) => participantId));
  const minimumTick = prior?.lifecycle.boundarySchedulerTick ?? contract.startSchedulerTick;
  const additions = eventValues.map((item) => acceptedEvent(item, contract, activeIds,
    minimumTick, prior !== null));
  const events = [...clone(prior?.events ?? []), ...additions];
  if (events.length > contract.limits.eventLimit) reject('X37_EVENT_BUDGET');
  const eventIds = new Set(); const participantSequences = new Set();
  for (const item of events) {
    if (eventIds.has(item.eventId)) reject('X37_EVENT_DUPLICATE');
    const sequence = `${item.participantId}:${item.sequence}`;
    if (participantSequences.has(sequence)) reject('X37_SEQUENCE_DUPLICATE');
    eventIds.add(item.eventId); participantSequences.add(sequence);
  }
  events.sort(eventOrder);
  const derived = deriveEventState(contract, events);
  const boundarySchedulerTick = additions.length ? events.at(-1).schedulerTick : minimumTick;
  const value = { schema: X37_SHARED_SCHEDULE_SCHEMA, schedulerId: contract.schedulerId,
    participants: contract.participants, sharedNet: contract.sharedNet, events,
    trace: derived.trace, traceRetention: derived.traceRetention,
    wireOwnership: derived.wireOwnership, lifecycle: {
      transitionKind: 'scheduled', startSchedulerTick: contract.startSchedulerTick, boundarySchedulerTick,
      activeParticipantIds: [...activeIds].sort(asciiCompare),
      retiredGenerations: clone(prior?.lifecycle.retiredGenerations ?? []) },
    limits: contract.limits, authority: clone(AUTHORITY) };
  return validateX37InertSchedule(value, contract);
}

export const createX37InertSchedule = (contract, events) => schedule(contract, events);
export const continueX37InertSchedule = (contract, prior, events) => schedule(contract, events, prior);
export function x37CanonicalSchedule(value, contract) {
  return stableDigitalStateStringify(validateX37InertSchedule(value, contract));
}

export function resetX37InertSchedule(value, contractValue) {
  const contract = validateX37SharedSchedulerContract(contractValue);
  const accepted = validateX37InertSchedule(value, contract);
  return validateX37InertSchedule({ ...accepted, events: [], trace: [],
    traceRetention: { dropped: 0, complete: true }, wireOwnership: ownership(contract, new Map()),
    lifecycle: { ...accepted.lifecycle, transitionKind: 'reset', activeParticipantIds: [],
      retiredGenerations: contract.participants.map(({ participantId, projectGeneration,
        runtimeGeneration }) => ({ participantId, projectGeneration, runtimeGeneration })) } }, contract);
}

export function retireX37Participant(value, contractValue, participantId) {
  const contract = validateX37SharedSchedulerContract(contractValue);
  const accepted = validateX37InertSchedule(value, contract);
  if (!accepted.lifecycle.activeParticipantIds.includes(participantId)) reject('X37_RETIREMENT_INVALID');
  const owner = contract.participants.find((item) => item.participantId === participantId);
  const drivers = new Map(accepted.wireOwnership[0].drivers);
  drivers.delete(participantId);
  return validateX37InertSchedule({ ...accepted,
    events: accepted.events.filter((item) => item.participantId !== participantId), trace: [],
    traceRetention: { dropped: 0, complete: true }, wireOwnership: ownership(contract, drivers),
    lifecycle: { ...accepted.lifecycle, transitionKind: 'participant-retired',
      activeParticipantIds: accepted.lifecycle.activeParticipantIds.filter((id) => id !== participantId),
      retiredGenerations: [...accepted.lifecycle.retiredGenerations, {
        participantId, projectGeneration: owner.projectGeneration,
        runtimeGeneration: owner.runtimeGeneration }].sort((left, right) =>
        asciiCompare(left.participantId, right.participantId)) } }, contract);
}
