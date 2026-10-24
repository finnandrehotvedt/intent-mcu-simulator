import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBoundedObservationFifo, createLiveGenerationOwner, resolvedDeliveryDecision,
  evaluateCouplingAcceptance, targetCycleAtOrAfterMappedTick, verifiedCleanup,
} from '../src/x37-producer-orchestration.mjs';

const observation = (watermark, mappedTick, level) => ({
  origin: 'executed-firmware-observation', participantId: 'avr',
  netId: 'shared.digital.0', watermark, mappedTick, mode: 'DRIVE', level,
});

test('FIFO processes a whole chronological batch exactly once without dropping a trailing match', () => {
  const fifo = createBoundedObservationFifo(4);
  fifo.enqueue([observation(1, 2, false), observation(2, 4, true), observation(3, 6, false)]);
  const seen = fifo.drain((value) => `${value.watermark}:${value.level}`);
  assert.deepEqual(seen, ['1:false', '2:true', '3:false']);
  assert.deepEqual(fifo.snapshot(), { accepted: 3, processed: 3, pending: 0, limit: 4 });
  assert.deepEqual(fifo.drain(() => assert.fail('duplicate')), []);
  assert.throws(() => fifo.enqueue([observation(4, 8, true), observation(5, 10, false)]),
    { code: 'X37_EVENT_LIMIT' });
});

test('only a deliverable resolved level can queue input; conflict and high-Z cannot bypass it', () => {
  const source = observation(1, 5, true);
  assert.deepEqual(resolvedDeliveryDecision({ netId: source.netId, state: 'HIGH',
    deliverable: true, level: true }, source),
  { deliver: true, state: 'HIGH', level: true, sourceObservation: source });
  for (const state of ['CONFLICT', 'HIGH_Z']) {
    assert.equal(resolvedDeliveryDecision({ netId: source.netId, state,
      deliverable: false }, source).deliver, false);
  }
  assert.throws(() => resolvedDeliveryDecision({ netId: source.netId, state: 'CONFLICT',
    deliverable: false, level: true }, source), { code: 'X37_RESOLVED_DELIVERY_INVALID' });
});

test('live owners advance generation on reset replacement and retirement so stale seams reject', () => {
  const owner = createLiveGenerationOwner('rp');
  assert.deepEqual(owner.snapshot(), { participantId: 'rp', projectGeneration: 1, runtimeGeneration: 1 });
  assert.equal(owner.reset().runtimeGeneration, 2);
  assert.deepEqual(owner.replaceProject(), { participantId: 'rp', projectGeneration: 2, runtimeGeneration: 3 });
  assert.equal(owner.retire().runtimeGeneration, 4);
  assert.equal(owner.isRetired(), true);
  assert.throws(() => owner.reset(), { code: 'X37_OWNER_RETIRED' });
});

test('ceil target is an explicit not-before boundary and remains monotonic for both clocks', () => {
  for (const clock of [{ numerator: 1, denominator: 125 }, { numerator: 1, denominator: 8 }]) {
    const values = [0, 1, 8, 125, 126].map((tick) => targetCycleAtOrAfterMappedTick(tick, clock));
    assert(values.every((value) => value.rounding === 'ceil-not-before'
      && value.exactObservationTickClaimed === false));
    assert(values.every((value, index) => index === 0 || value.cycle >= values[index - 1].cycle));
    assert(values.every((value) => value.cycle * clock.denominator >= value.mappedTick * clock.numerator));
  }
});

test('terminal eligibility follows verified cleanup and cleanup failure is terminal failure', async () => {
  let disposed = false;
  assert.deepEqual(await verifiedCleanup([{ cleanup: () => { disposed = true; }, verify: () => disposed }]),
    { cleaned: 1, verified: true });
  await assert.rejects(verifiedCleanup([{ cleanup: () => { throw Object.assign(new Error('dispose'),
    { code: 'DISPOSE_FAILED' }); }, verify: () => false }]), { code: 'X37_CLEANUP_FAILED' });
});

test('same acceptance gate requires two measured queued inputs and later firmware responses', () => {
  const value = { observations: [{ mappedTick: 2 }, { mappedTick: 4 }, { mappedTick: 6 }],
    deliveries: [
      { direction: 'avr-to-rp', queued: true, inputApplied: true, inputAppliedCycle: 10,
        responseCycle: 11, sourceMappedTick: 2, responseMappedTick: 4 },
      { direction: 'rp-to-avr', queued: true, inputApplied: true, inputAppliedCycle: 20,
        responseCycle: 21, sourceMappedTick: 4, responseMappedTick: 6 },
    ] };
  assert.equal(evaluateCouplingAcceptance(value).accepted, true);
  for (const mutation of [
    (next) => { next.deliveries[0].queued = false; },
    (next) => { next.deliveries[0].inputApplied = false; },
    (next) => { next.deliveries[1].responseCycle = next.deliveries[1].inputAppliedCycle; },
  ]) {
    const next = structuredClone(value); mutation(next);
    assert.throws(() => evaluateCouplingAcceptance(next), { code: 'X37_COUPLING_CAUSAL_RESPONSE_MISSING' });
  }
});

test('disconnected, conflict, high-Z and backdated output cannot become coupling acceptance', () => {
  const source = observation(1, 5, true);
  for (const state of ['CONFLICT', 'HIGH_Z']) {
    assert.equal(resolvedDeliveryDecision({ netId: source.netId, state,
      deliverable: false }, source).deliver, false);
  }
  assert.throws(() => evaluateCouplingAcceptance({ observations: [{ mappedTick: 9 }, { mappedTick: 8 }],
    deliveries: [] }), { code: 'X37_COUPLING_CHRONOLOGY_INVALID' });
  assert.throws(() => evaluateCouplingAcceptance({ observations: [{ mappedTick: 1 }, { mappedTick: 2 }],
    deliveries: [] }), { code: 'X37_COUPLING_CAUSAL_RESPONSE_MISSING' });
});
