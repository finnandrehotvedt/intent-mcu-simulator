// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export function createLiveGenerationOwner(participantId) {
  if (typeof participantId !== 'string' || participantId.length < 1) fail('X37_OWNER_INVALID');
  let projectGeneration = 1; let runtimeGeneration = 1; let retired = false;
  return Object.freeze({
    snapshot: () => ({ participantId, projectGeneration, runtimeGeneration }),
    reset() {
      if (retired) fail('X37_OWNER_RETIRED');
      runtimeGeneration += 1;
      return this.snapshot();
    },
    retire() {
      if (retired) fail('X37_OWNER_RETIRED');
      retired = true; runtimeGeneration += 1;
      return this.snapshot();
    },
    replaceProject() {
      if (retired) fail('X37_OWNER_RETIRED');
      projectGeneration += 1; runtimeGeneration += 1;
      return this.snapshot();
    },
    isRetired: () => retired,
  });
}

export function createBoundedObservationFifo(limit = 32) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 32) fail('X37_FIFO_LIMIT_INVALID');
  const pending = []; let accepted = 0; let processed = 0;
  return Object.freeze({
    enqueue(values) {
      if (!Array.isArray(values) || accepted + values.length > limit) fail('X37_EVENT_LIMIT');
      for (const value of values) pending.push(structuredClone(value));
      accepted += values.length;
      return pending.length;
    },
    drain(visit) {
      if (typeof visit !== 'function') fail('X37_FIFO_VISITOR_INVALID');
      const results = [];
      while (pending.length) {
        const value = pending.shift();
        results.push(visit(value)); processed += 1;
      }
      return results;
    },
    snapshot: () => ({ accepted, processed, pending: pending.length, limit }),
  });
}

export function resolvedDeliveryDecision(resolved, sourceObservation) {
  if (!resolved || resolved.netId !== sourceObservation?.netId
      || typeof sourceObservation?.mappedTick !== 'number'
      || sourceObservation.origin !== 'executed-firmware-observation') {
    fail('X37_RESOLVED_DELIVERY_INVALID');
  }
  if (!resolved.deliverable) {
    if (!['CONFLICT', 'HIGH_Z'].includes(resolved.state) || Object.hasOwn(resolved, 'level')) {
      fail('X37_RESOLVED_DELIVERY_INVALID');
    }
    return Object.freeze({ deliver: false, state: resolved.state, sourceObservation });
  }
  if (!['LOW', 'HIGH'].includes(resolved.state)
      || typeof resolved.level !== 'boolean'
      || resolved.level !== (resolved.state === 'HIGH')) fail('X37_RESOLVED_DELIVERY_INVALID');
  return Object.freeze({ deliver: true, state: resolved.state, level: resolved.level,
    sourceObservation });
}

export function targetCycleAtOrAfterMappedTick(mappedTick, clock) {
  if (!Number.isSafeInteger(mappedTick) || mappedTick < 0 || !clock
      || !Number.isSafeInteger(clock.numerator) || clock.numerator < 1
      || !Number.isSafeInteger(clock.denominator) || clock.denominator < 1) {
    fail('X37_TARGET_BOUNDARY_INVALID');
  }
  const scaled = mappedTick * clock.numerator;
  if (!Number.isSafeInteger(scaled)) fail('X37_TARGET_BOUNDARY_INVALID');
  const cycle = Math.ceil(scaled / clock.denominator);
  return Object.freeze({ cycle, mappedTick, rounding: 'ceil-not-before',
    exactObservationTickClaimed: false });
}

export async function verifiedCleanup(resources) {
  const errors = [];
  for (const resource of resources) {
    if (!resource) continue;
    try { await resource.cleanup(); }
    catch (error) { errors.push(error.code ?? error.message ?? 'X37_CLEANUP_FAILED'); }
    try {
      if (resource.verify && resource.verify() !== true) errors.push('X37_CLEANUP_NOT_VERIFIED');
    } catch (error) { errors.push(error.code ?? error.message ?? 'X37_CLEANUP_VERIFY_FAILED'); }
  }
  if (errors.length) {
    throw Object.assign(new Error('X37_CLEANUP_FAILED'), { code: 'X37_CLEANUP_FAILED', cleanupErrors: errors });
  }
  return { cleaned: resources.filter(Boolean).length, verified: true };
}

export function evaluateCouplingAcceptance({ observations, deliveries }) {
  if (!Array.isArray(observations) || observations.length < 2
      || observations.some((value) => !Number.isSafeInteger(value?.mappedTick))
      || observations.some((value, index) => index > 0
        && value.mappedTick < observations[index - 1].mappedTick)) {
    fail('X37_COUPLING_CHRONOLOGY_INVALID');
  }
  const expected = ['avr-to-rp', 'rp-to-avr'];
  if (!Array.isArray(deliveries) || deliveries.length !== 2
      || deliveries.some((value, index) => value?.direction !== expected[index]
        || value.queued !== true || value.inputApplied !== true
        || !Number.isSafeInteger(value.inputAppliedCycle)
        || !Number.isSafeInteger(value.responseCycle)
        || value.responseCycle <= value.inputAppliedCycle
        || !Number.isSafeInteger(value.sourceMappedTick)
        || !Number.isSafeInteger(value.responseMappedTick)
        || value.responseMappedTick < value.sourceMappedTick)) {
    fail('X37_COUPLING_CAUSAL_RESPONSE_MISSING');
  }
  return Object.freeze({ accepted: true, observations: observations.length,
    directions: expected, autonomousSubstitutionRejected: true });
}
