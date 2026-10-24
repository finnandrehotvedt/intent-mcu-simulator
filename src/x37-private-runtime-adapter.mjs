// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  continueX37InertSchedule, createX37InertSchedule, resetX37InertSchedule,
  retireX37Participant, validateX37InertSchedule, validateX37SharedSchedulerContract,
  x37CanonicalSchedule,
} from './x37-shared-scheduler-contract.mjs';

const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

function participantSeam(value) {
  if (!value || typeof value.identity !== 'function' || typeof value.currentCycle !== 'function'
      || typeof value.advanceToLocalCycle !== 'function' || typeof value.retire !== 'function'
      || typeof value.reset !== 'function') reject('X37_ADAPTER_PARTICIPANT_INVALID');
  return value;
}

function identity(value) {
  const result = value.identity();
  if (!exactKeys(result, ['participantId', 'projectGeneration', 'runtimeGeneration'])
      || typeof result.participantId !== 'string' || !Number.isSafeInteger(result.projectGeneration)
      || !Number.isSafeInteger(result.runtimeGeneration)) reject('X37_ADAPTER_IDENTITY_INVALID');
  return clone(result);
}

export class X37PrivateRuntimeAdapter {
  constructor({ contract, participants, enabled = false }) {
    this.contract = validateX37SharedSchedulerContract(contract);
    if (!Array.isArray(participants) || participants.length !== 2 || typeof enabled !== 'boolean') {
      reject('X37_ADAPTER_CONFIGURATION_INVALID');
    }
    this.enabled = enabled;
    this.participants = new Map();
    for (const value of participants.map(participantSeam)) {
      const owner = identity(value);
      if (this.participants.has(owner.participantId)) reject('X37_ADAPTER_PARTICIPANT_DUPLICATE');
      this.participants.set(owner.participantId, value);
    }
    if (this.participants.size !== 2 || this.contract.participants.some(
      ({ participantId }) => !this.participants.has(participantId))) {
      reject('X37_ADAPTER_PARTICIPANT_MISMATCH');
    }
    this.schedule = null;
    this.failure = null;
    this.disposed = false;
  }

  #assertEnabled() {
    if (this.disposed) reject('X37_ADAPTER_DISPOSED');
    if (this.failure) reject('X37_ADAPTER_FAILED');
    if (!this.enabled) reject('X37_ADAPTER_DISARMED');
  }

  #invoke(phase, calls) {
    let completedCallbacks = 0;
    for (const call of calls) {
      try {
        call.invoke(); completedCallbacks += 1;
      } catch (cause) {
        this.failure = Object.freeze({ phase, participantId: call.participantId,
          eventId: call.eventId ?? null, completedCallbacks,
          cause: cause?.code ?? cause?.message ?? cause?.name ?? 'unknown' });
        throw Object.assign(new Error('X37_ADAPTER_SEAM_FAILURE'), {
          code: 'X37_ADAPTER_SEAM_FAILURE', cause,
        });
      }
    }
  }

  #preflightParticipantIdentities(activeIds) {
    for (const owner of this.contract.participants) {
      if (!activeIds.includes(owner.participantId)) continue;
      const value = identity(this.participants.get(owner.participantId));
      if (value.participantId !== owner.participantId
          || value.projectGeneration !== owner.projectGeneration
          || value.runtimeGeneration !== owner.runtimeGeneration) reject('X37_ADAPTER_STALE_PARTICIPANT');
      const cycle = this.participants.get(owner.participantId).currentCycle();
      if (!Number.isSafeInteger(cycle) || cycle < 0) reject('X37_ADAPTER_CYCLE_INVALID');
    }
  }

  #preflightAdvances(events, activeIds) {
    this.#preflightParticipantIdentities(activeIds);
    const tails = new Map(activeIds.map((participantId) => {
      const cycle = this.participants.get(participantId).currentCycle();
      return [participantId, cycle];
    }));
    for (const event of events) {
      if (!tails.has(event.participantId) || event.localCycle < tails.get(event.participantId)) {
        reject('X37_ADAPTER_ADVANCE_ORDER_INVALID');
      }
      tails.set(event.participantId, event.localCycle);
    }
  }

  execute(events) {
    this.#assertEnabled();
    const accepted = this.schedule === null
      ? createX37InertSchedule(this.contract, events)
      : continueX37InertSchedule(this.contract, this.schedule, events);
    const previousCount = this.schedule?.events.length ?? 0;
    const additions = accepted.events.slice(previousCount);
    this.#preflightAdvances(additions, accepted.lifecycle.activeParticipantIds);
    this.#invoke('advance', additions.map((event) => ({ participantId: event.participantId,
      eventId: event.eventId, invoke: () => this.participants.get(event.participantId)
        .advanceToLocalCycle(event.localCycle, clone(event)) })));
    this.schedule = accepted;
    return clone(accepted);
  }

  continueFrom(prior, events) {
    this.#assertEnabled();
    if (this.schedule === null) reject('X37_ADAPTER_COLD_RESTORE_REJECTED');
    const validated = validateX37InertSchedule(prior, this.contract);
    if (x37CanonicalSchedule(validated, this.contract)
        !== x37CanonicalSchedule(this.schedule, this.contract)) {
      reject('X37_ADAPTER_HISTORY_DIVERGED');
    }
    const accepted = continueX37InertSchedule(this.contract, validated, events);
    const additions = accepted.events.slice(validated.events.length);
    this.#preflightAdvances(additions, accepted.lifecycle.activeParticipantIds);
    this.#invoke('advance', additions.map((event) => ({ participantId: event.participantId,
      eventId: event.eventId, invoke: () => this.participants.get(event.participantId)
        .advanceToLocalCycle(event.localCycle, clone(event)) })));
    this.schedule = accepted;
    return clone(accepted);
  }

  retire(participantId) {
    this.#assertEnabled();
    if (this.schedule === null) reject('X37_ADAPTER_SCHEDULE_REQUIRED');
    const accepted = validateX37InertSchedule(this.schedule, this.contract);
    this.#preflightParticipantIdentities(accepted.lifecycle.activeParticipantIds);
    const retired = retireX37Participant(accepted, this.contract, participantId);
    this.#invoke('retire', [{ participantId, invoke: () => this.participants.get(participantId)
      .retire(clone(identity(this.participants.get(participantId)))) }]);
    this.schedule = retired;
    return clone(retired);
  }

  reset() {
    this.#assertEnabled();
    if (this.schedule === null) reject('X37_ADAPTER_SCHEDULE_REQUIRED');
    const accepted = validateX37InertSchedule(this.schedule, this.contract);
    this.#preflightParticipantIdentities(this.contract.participants.map(({ participantId }) => participantId));
    const reset = resetX37InertSchedule(accepted, this.contract);
    this.#invoke('reset', this.contract.participants.map(({ participantId }) => ({ participantId,
      invoke: () => this.participants.get(participantId).reset() })));
    this.schedule = reset;
    return clone(reset);
  }

  abandonAfterFailure() {
    if (!this.failure || this.disposed) reject('X37_ADAPTER_FAILURE_REQUIRED');
    const failure = clone(this.failure);
    this.enabled = false; this.disposed = true; this.schedule = null;
    return { abandoned: true, failure, retryAllowed: false, rollbackClaimed: false };
  }

  snapshot() {
    return { enabled: this.enabled, disposed: this.disposed,
      failure: this.failure ? clone(this.failure) : null,
      schedule: this.schedule ? clone(this.schedule) : null,
      participantCycles: Object.fromEntries([...this.participants.entries()]
        .map(([participantId, value]) => [participantId, value.currentCycle()])) };
  }
}
