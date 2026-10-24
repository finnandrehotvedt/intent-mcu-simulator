// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { mapX37RuntimeObservation } from './x37-existing-runtime-seams.mjs';
import { resolvedDeliveryDecision, targetCycleAtOrAfterMappedTick } from './x37-producer-orchestration.mjs';
import { X37_TURNAROUND_BUDGET, validateX37TurnaroundTrace } from './x37-turnaround-protocol.mjs';

const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const asciiOrder = (left, right) => left === right ? 0 : left < right ? -1 : 1;
const order = (left, right) => left.mappedTick - right.mappedTick
  || asciiOrder(left.participantId, right.participantId);

export function runX37TurnaroundOrchestration({ seams, schedulerContract, net,
  advanceWindow = 512, inputApplied, onAcceptedObservation = () => {}, onProgress = () => {} }) {
  if (!seams?.avr || !seams?.rp || typeof inputApplied?.avr !== 'function'
      || typeof inputApplied?.rp !== 'function' || !Number.isSafeInteger(advanceWindow)
      || advanceWindow < 1 || typeof onAcceptedObservation !== 'function'
      || typeof onProgress !== 'function') fail('X37_TURNAROUND_ORCHESTRATOR_INVALID');
  const clocks = Object.fromEntries(schedulerContract.participants.map((value) =>
    [value.participantId, value.localCyclesPerSchedulerTick]));
  const pending = []; const evidence = []; const deliveries = []; const applied = [];
  let advanceCalls = 0;
  const collect = (participantId) => {
    for (const value of seams[participantId].observeFirmwareGpio()) {
      pending.push(mapX37RuntimeObservation(value, schedulerContract));
    }
    pending.sort(order);
  };
  const collectBoth = () => { collect('avr'); collect('rp'); };
  const processOne = () => {
    const observation = pending.shift();
    const resolved = net.apply([observation]);
    if (resolved.state === 'CONFLICT' || resolved.state === 'HIGH_Z') {
      fail(`X37_TURNAROUND_${resolved.state}`);
    }
    const item = { observation, resolved }; evidence.push(item);
    onAcceptedObservation({ index: evidence.length, observation, resolved }); return item;
  };
  const deliver = (item, participantId) => {
    const decision = resolvedDeliveryDecision(item.resolved, item.observation);
    if (!decision.deliver) fail('X37_REQUIRED_DELIVERY_NOT_QUEUED');
    const seam = seams[participantId];
    const boundary = targetCycleAtOrAfterMappedTick(item.observation.mappedTick, clocks[participantId]);
    const targetCycle = Math.max(seam.currentCycle(), boundary.cycle);
    let advance = null;
    if (targetCycle > seam.currentCycle()) {
      onProgress({ kind: 'advance-begin', participantId, cycle: seam.currentCycle(), targetCycle, lifecycle: seam.lifecycle() });
      advance = seam.advanceToLocalCycle(targetCycle); advanceCalls += 1; collect(participantId);
      onProgress({ kind: 'advance-end', participantId, cycle: seam.currentCycle(), targetCycle, lifecycle: seam.lifecycle() });
    }
    const delivery = seam.deliverResolvedLevel(decision.level, item.observation);
    const record = { participantId, source: item.observation, level: decision.level,
      targetCycle, advance, delivery };
    deliveries.push(record); return record;
  };
  try {
  collectBoth();
  const initial = pending.filter((value) => value.mappedTick === 0);
  if (initial.length !== 2 || initial.some((value) => value.mode !== 'RELEASE')) {
    fail('X37_TURNAROUND_INITIAL_RELEASE_MISSING');
  }
  processOne(); const idleItem = processOne();
  const idleDeliveries = [deliver(idleItem, 'avr'), deliver(idleItem, 'rp')];
  const trace = [{ phase: 'idle', actor: null, action: 'RELEASE',
    mappedTick: idleItem.observation.mappedTick, state: idleItem.resolved.state,
    level: idleItem.resolved.level }];
  const phases = [
    ['request', 'avr', 'DRIVE', false, 'rp'], ['request-release', 'avr', 'RELEASE', null, 'rp'],
    ['ack', 'rp', 'DRIVE', false, 'avr'], ['ack-release', 'rp', 'RELEASE', null, 'avr'],
    ['confirm', 'avr', 'DRIVE', false, 'rp'], ['confirm-release', 'avr', 'RELEASE', null, 'rp'],
  ];
  let priorDependency = idleDeliveries;
  for (const [phase, actor, mode, level, target] of phases) {
    let item = null;
    for (let attempt = 0; attempt < X37_TURNAROUND_BUDGET.maximumAdvanceCallsPerParticipant; attempt += 1) {
      collectBoth();
      if (pending.length) {
        const candidate = pending[0];
        if (candidate.participantId !== actor || candidate.mode !== mode
            || (mode === 'DRIVE' && candidate.level !== level)) {
          processOne();
          fail('X37_TURNAROUND_RESPONSE_BEFORE_INPUT');
        }
        item = processOne(); break;
      }
      const adaptiveWindow = Math.min(advanceWindow * (2 ** Math.min(attempt, 8)), 131_072);
      onProgress({ kind: 'advance-begin', phase, participantId: actor, cycle: seams[actor].currentCycle(),
        targetCycle: seams[actor].currentCycle() + adaptiveWindow, lifecycle: seams[actor].lifecycle() });
      seams[actor].advanceToLocalCycle(seams[actor].currentCycle() + adaptiveWindow);
      advanceCalls += 1; collect(actor);
      onProgress({ kind: 'advance-end', phase, participantId: actor, cycle: seams[actor].currentCycle(),
        lifecycle: seams[actor].lifecycle() });
    }
    if (!item) fail('X37_EXPECTED_FIRMWARE_OBSERVATION_MISSING');
    if ((phase === 'ack' || phase === 'confirm')
        && !priorDependency.every((record) => inputApplied[actor](record))) {
      fail('X37_TURNAROUND_INPUT_NOT_APPLIED');
    }
    const delivery = deliver(item, target); priorDependency = [delivery];
    applied.push({ phase, actor, inputApplied: phase === 'ack' || phase === 'confirm' });
    trace.push({ phase, actor, action: mode === 'DRIVE' ? 'DRIVE_LOW' : 'RELEASE',
      mappedTick: item.observation.mappedTick, state: item.resolved.state, level: item.resolved.level });
  }
  return { trace, evidence, deliveries, applied,
    acceptance: validateX37TurnaroundTrace(trace), advanceCalls };
  } catch (error) {
    error.x37Partial = { evidence: structuredClone(evidence), deliveries: structuredClone(deliveries),
      applied: structuredClone(applied), pending: structuredClone(pending), advanceCalls,
      seamLifecycle: { avr: seams.avr.lifecycle(), rp: seams.rp.lifecycle() }, net: net.snapshot() };
    throw error;
  }
}
