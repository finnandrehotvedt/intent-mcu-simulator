// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  validateX37SharedSchedulerContract, x37SchedulerTick,
} from './x37-shared-scheduler-contract.mjs';
import { createRuntimeCommand } from '../expansion-drafts/controller-runtime-bridge-v1.mjs';

const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };
const outputModes = new Set(['OUTPUT', 'DIGITAL_PWM']);

function liveIdentity(owner) {
  if (typeof owner !== 'function') reject('X37_SEAM_IDENTITY_OWNER_REQUIRED');
  const value = owner();
  if (!value || typeof value.participantId !== 'string'
      || !Number.isSafeInteger(value.projectGeneration)
      || !Number.isSafeInteger(value.runtimeGeneration)) reject('X37_SEAM_IDENTITY_INVALID');
  return clone(value);
}

function runtimeSnapshot(runtime) {
  if (!runtime || typeof runtime.snapshot !== 'function') reject('X37_SEAM_RUNTIME_INVALID');
  const value = runtime.snapshot();
  if (!value || !Number.isSafeInteger(value.cycle) || value.cycle < 0
      || !Number.isSafeInteger(value.instructions) || value.instructions < 0
      || !Array.isArray(value.pins) || !Array.isArray(value.instruments?.logic?.transitions)
      || !Number.isSafeInteger(value.instruments.logic.dropped)
      || value.instruments.logic.dropped < 0) reject('X37_SEAM_SNAPSHOT_INVALID');
  return value;
}

export function mapX37RuntimeObservation(observation, contractValue) {
  const contract = validateX37SharedSchedulerContract(contractValue);
  const participant = contract.participants.find(({ participantId }) => participantId === observation?.participantId);
  if (!participant || observation.netId !== contract.sharedNet.netId
      || observation.runtimeEpoch < 0 || !Number.isSafeInteger(observation.localCycle)) {
    reject('X37_SEAM_OBSERVATION_MAPPING_INVALID');
  }
  const mappedTick = x37SchedulerTick(observation.localCycle, participant.localCyclesPerSchedulerTick);
  if (mappedTick < contract.startSchedulerTick) reject('X37_SEAM_OBSERVATION_MAPPING_INVALID');
  return { ...clone(observation), mappedTick };
}

function commonSeam({ runtime, identityOwner, schedulerContract, profile, outputPin, inputPin,
  maxTotalInstructions, maxAdvanceCalls, maxObservations, abortFlag }) {
  const contract = validateX37SharedSchedulerContract(schedulerContract);
  const configuredOwner = liveIdentity(identityOwner);
  const participant = contract.participants.find((candidate) =>
    candidate.participantId === configuredOwner.participantId
      && candidate.projectGeneration === configuredOwner.projectGeneration
      && candidate.runtimeGeneration === configuredOwner.runtimeGeneration);
  if (!participant || !Number.isSafeInteger(maxTotalInstructions)
      || maxTotalInstructions < 1 || !Number.isSafeInteger(maxAdvanceCalls)
      || maxAdvanceCalls < 1 || maxAdvanceCalls > 32 || !Number.isSafeInteger(maxObservations)
      || maxObservations < 1 || maxObservations > 32
      || (abortFlag !== undefined && !(abortFlag instanceof Int32Array))) reject('X37_SEAM_LIMIT_INVALID');
  let retired = false; let disposed = false; let epoch = 0;
  let watermark = 0; let pending = []; let priorOutput = null;
  let totalInstructions = 0; let advanceCalls = 0;
  const probeSnapshot = () => typeof runtime.x37ProbeSnapshot === 'function'
    ? runtime.x37ProbeSnapshot(outputPin) : runtimeSnapshot(runtime);
  const stepRuntime = () => typeof runtime.x37Step === 'function'
    ? runtime.x37Step() : runtime.step();
  const initial = probeSnapshot();
  const netId = contract.sharedNet.netId;
  let historyCursor = initial.instruments.logic.dropped
    + initial.instruments.logic.transitions.length;

  const lifecycleGuard = ({ allowRetired = false } = {}) => {
    if (disposed) reject('X37_SEAM_DISPOSED');
    if (retired && !allowRetired) reject('X37_SEAM_RETIRED');
  };
  const inspectHistory = (snapshot) => {
    const { transitions, dropped } = snapshot.instruments.logic;
    const retainedEnd = dropped + transitions.length;
    if (retainedEnd < historyCursor || dropped > historyCursor) reject('X37_SEAM_OBSERVATION_HISTORY_LOST');
    historyCursor = retainedEnd;
  };
  const sampleOutput = (snapshot) => {
    inspectHistory(snapshot);
    const pin = snapshot.pins.find((value) => value.pin === outputPin);
    if (!pin || typeof pin.mode !== 'string' || typeof pin.level !== 'boolean') {
      reject('X37_SEAM_OUTPUT_PIN_INVALID');
    }
    const next = outputModes.has(pin.mode)
      ? { mode: 'DRIVE', level: pin.level }
      : { mode: 'RELEASE' };
    if (JSON.stringify(next) === JSON.stringify(priorOutput)) return;
    if (watermark >= maxObservations) reject('X37_SEAM_OBSERVATION_CAP');
    priorOutput = next; watermark += 1;
    const owner = liveIdentity(identityOwner);
    pending.push({ origin: 'executed-firmware-observation', participantId: owner.participantId,
      netId, runtimeEpoch: epoch, watermark, localCycle: snapshot.cycle,
      mode: next.mode, ...(next.mode === 'DRIVE' ? { level: next.level } : {}) });
  };
  const advanceByStepping = (targetCycle, maxSteps) => {
    lifecycleGuard();
    const before = probeSnapshot();
    if (!Number.isSafeInteger(targetCycle) || targetCycle < before.cycle) reject('X37_SEAM_TARGET_INVALID');
    if (advanceCalls >= maxAdvanceCalls) reject('X37_SEAM_ADVANCE_CALL_CAP');
    advanceCalls += 1;
    let steps = 0; let priorInstructions = before.instructions; let priorCycle = before.cycle;
    while (probeSnapshot().cycle < targetCycle) {
      if (abortFlag && steps % 256 === 0 && Atomics.load(abortFlag, 0) === 1) reject('X37_COOPERATIVE_ABORT');
      if (steps >= maxSteps || totalInstructions >= maxTotalInstructions) {
        reject('X37_SEAM_INSTRUCTION_CAP');
      }
      stepRuntime(); steps += 1;
      const snapshot = probeSnapshot();
      const delta = snapshot.instructions - priorInstructions;
      if (!Number.isSafeInteger(delta) || delta <= 0) reject('X37_SEAM_INSTRUCTION_COUNTER_INVALID');
      if (snapshot.cycle <= priorCycle) reject('X37_SEAM_NO_PROGRESS');
      totalInstructions += delta; priorInstructions = snapshot.instructions;
      priorCycle = snapshot.cycle;
      if (totalInstructions > maxTotalInstructions) reject('X37_SEAM_INSTRUCTION_CAP');
      sampleOutput(snapshot);
    }
    const reachedCycle = probeSnapshot().cycle;
    return { requestedBoundaryCycle: targetCycle, reachedCycle, steps,
      exact: reachedCycle === targetCycle, overshootCycles: reachedCycle - targetCycle,
      totalInstructions, advanceCalls };
  };
  sampleOutput(initial);
  return {
    identity: () => liveIdentity(identityOwner),
    currentCycle: () => probeSnapshot().cycle,
    observeFirmwareGpio: () => { lifecycleGuard(); const result = pending.map(clone); pending = []; return result; },
    advanceByStepping,
    causalDelivery(level, sourceObservation, queue) {
      lifecycleGuard();
      if (typeof level !== 'boolean') reject('X37_SEAM_CAUSAL_DELIVERY_INVALID');
      const mapped = mapX37RuntimeObservation(sourceObservation, contract);
      const currentMappedTick = x37SchedulerTick(probeSnapshot().cycle,
        participant.localCyclesPerSchedulerTick);
      if (currentMappedTick < mapped.mappedTick) {
        reject('X37_SEAM_CAUSAL_DELIVERY_INVALID');
      }
      return { origin: 'resolved-shared-net', notBeforeMappedTick: mapped.mappedTick,
        deliveredAtMappedTick: currentMappedTick,
        exactCycleClaimed: false, queued: queue() };
    },
    retire() {
      lifecycleGuard();
      if (typeof runtime.pause !== 'function') reject('X37_SEAM_PAUSE_UNAVAILABLE');
      runtime.pause(); retired = true;
      return { retired: true, disposed: false, detached: true, identity: liveIdentity(identityOwner) };
    },
    reset() {
      lifecycleGuard({ allowRetired: true });
      if (typeof runtime.reset !== 'function') reject('X37_SEAM_RESET_UNAVAILABLE');
      const wasRetired = retired; const result = runtime.reset(); const snapshot = runtimeSnapshot(runtime);
      epoch += 1; watermark = 0; pending = []; priorOutput = null;
      historyCursor = snapshot.instruments.logic.dropped + snapshot.instruments.logic.transitions.length;
      return { reset: true, retired: wasRetired, runtimeEpoch: epoch, cycle: snapshot.cycle, result };
    },
    dispose() {
      if (disposed) return { disposed: true };
      if (typeof runtime.pause === 'function') runtime.pause();
      if (typeof runtime.dispose === 'function') runtime.dispose();
      disposed = true;
      return { disposed: true, runtimeDisposed: typeof runtime.dispose === 'function', detached: true };
    },
    lifecycle: () => ({ retired, disposed, epoch, totalInstructions, advanceCalls }),
    profile, outputPin, inputPin, netId,
  };
}

export function createAvrX37RuntimeSeam({ runtime, identityOwner, outputPin = 'D13', inputPin = 2,
  schedulerContract, maxInstructionsPerAdvance = 1_000_000,
  maxTotalInstructions = 1_000_000, maxAdvanceCalls = 32, maxObservations = 32, abortFlag }) {
  if (typeof runtime?.step !== 'function' || typeof runtime?.queueDigitalSequence !== 'function'
      || typeof runtime?.pause !== 'function' || typeof runtime?.reset !== 'function'
      || !/^D(?:[0-9]|1[0-3])$/u.test(outputPin) || !Number.isInteger(inputPin)
      || inputPin < 0 || inputPin > 13) reject('X37_SEAM_AVR_API_INVALID');
  const seam = commonSeam({ runtime, identityOwner, schedulerContract,
    profile: 'avr', outputPin, inputPin,
    maxTotalInstructions, maxAdvanceCalls, maxObservations, abortFlag });
  return Object.freeze({ ...seam,
    advanceToLocalCycle: (targetCycle) => seam.advanceByStepping(targetCycle, maxInstructionsPerAdvance),
    deliverResolvedLevel(level, sourceObservation) {
      return seam.causalDelivery(level, sourceObservation,
        () => runtime.queueDigitalSequence([{ offsetCycles: 1, pin: inputPin, level }]));
    },
  });
}

export function createRp2040X37RuntimeSeam({ runtime, identityOwner, outputPin = 'GPIO0',
  inputPin = 'GPIO1', schedulerContract, maxStepsPerAdvance = 1_000_000,
  maxTotalInstructions = 1_000_000, maxAdvanceCalls = 32, maxObservations = 32, abortFlag }) {
  const hasPrivateInputBridge = typeof runtime?.queueDigitalInput === 'function'
    || (typeof runtime?.adapter?.handle === 'function'
      && typeof runtime?.adapter?.machineSnapshot === 'function'
      && Number.isSafeInteger(runtime?.requestId));
  if (typeof runtime?.step !== 'function' || !hasPrivateInputBridge
      || typeof runtime?.pause !== 'function' || typeof runtime?.reset !== 'function'
      || !/^GPIO(?:[0-9]|[12][0-9])$/u.test(outputPin)
      || !/^GPIO(?:[0-9]|[12][0-9])$/u.test(inputPin)) reject('X37_SEAM_RP2040_API_INVALID');
  const seam = commonSeam({ runtime, identityOwner, schedulerContract,
    profile: 'rp2040', outputPin, inputPin,
    maxTotalInstructions, maxAdvanceCalls, maxObservations, abortFlag });
  return Object.freeze({ ...seam,
    advanceToLocalCycle: (targetCycle) => seam.advanceByStepping(targetCycle, maxStepsPerAdvance),
    deliverResolvedLevel(level, sourceObservation) {
      return seam.causalDelivery(level, sourceObservation,
        () => {
          if (typeof runtime.queueDigitalInput === 'function') {
            return runtime.queueDigitalInput(inputPin, level);
          }
          const targetCycle = runtime.adapter.machineSnapshot().cycle;
          runtime.requestId += 1;
          runtime.adapter.handle(createRuntimeCommand(runtime.requestId, 'digital-input', {
            pin: inputPin, level, targetCycle,
          }));
          return { pin: inputPin, level, requestedAtCycle: targetCycle };
        });
    },
  });
}

export function createObservedDigitalNetResolver({ netId, driverParticipantIds, idleLevel = null }) {
  if (typeof netId !== 'string' || !Array.isArray(driverParticipantIds)
      || driverParticipantIds.length < 1 || new Set(driverParticipantIds).size !== driverParticipantIds.length
      || ![null, false, true].includes(idleLevel)) {
    reject('X37_SEAM_NET_CONFIGURATION_INVALID');
  }
  const allowed = new Set(driverParticipantIds); let drivers = new Map();
  let watermarks = new Map(); let lastMappedTick = -1;
  const state = (source = drivers) => {
    const levels = [...source.values()].map(({ level }) => level);
    if (!levels.length) return idleLevel === null ? 'HIGH_Z' : idleLevel ? 'HIGH' : 'LOW';
    return levels.every((value) => value === levels[0]) ? (levels[0] ? 'HIGH' : 'LOW') : 'CONFLICT';
  };
  return Object.freeze({
    apply(observations) {
      if (!Array.isArray(observations)) reject('X37_SEAM_NET_INPUT_INVALID');
      const stagedDrivers = new Map(drivers); const stagedWatermarks = new Map(watermarks);
      let stagedTick = lastMappedTick; const trace = [];
      for (const value of observations) {
        if (!value || value.origin !== 'executed-firmware-observation' || value.netId !== netId
            || !allowed.has(value.participantId) || !['DRIVE', 'RELEASE'].includes(value.mode)
            || !Number.isSafeInteger(value.runtimeEpoch) || value.runtimeEpoch < 0
            || !Number.isSafeInteger(value.watermark) || value.watermark < 1
            || !Number.isSafeInteger(value.mappedTick) || value.mappedTick < stagedTick
            || (value.mode === 'DRIVE' && typeof value.level !== 'boolean')
            || (value.mode === 'RELEASE' && Object.hasOwn(value, 'level'))) reject('X37_SEAM_NET_INPUT_INVALID');
        const prior = stagedWatermarks.get(value.participantId);
        if (!prior && (value.runtimeEpoch !== 0 || value.watermark !== 1)) {
          reject('X37_SEAM_OBSERVATION_SEQUENCE');
        }
        if (prior && (value.runtimeEpoch !== prior.runtimeEpoch
            || value.watermark !== prior.watermark + 1)) {
          reject('X37_SEAM_OBSERVATION_STALE');
        }
        stagedWatermarks.set(value.participantId, { runtimeEpoch: value.runtimeEpoch, watermark: value.watermark });
        if (value.mode === 'DRIVE') stagedDrivers.set(value.participantId, { level: value.level });
        else stagedDrivers.delete(value.participantId);
        stagedTick = value.mappedTick;
        trace.push({ mappedTick: value.mappedTick, participantId: value.participantId,
          mode: value.mode, state: state(stagedDrivers) });
      }
      drivers = stagedDrivers; watermarks = stagedWatermarks; lastMappedTick = stagedTick;
      const resolved = state();
      return { netId, state: resolved, deliverable: ['LOW', 'HIGH'].includes(resolved),
        ...(resolved === 'LOW' || resolved === 'HIGH' ? { level: resolved === 'HIGH' } : {}),
        drivers: [...drivers.entries()].map(([participantId, value]) => ({ participantId, ...value })), trace };
    },
    resetParticipant(participantId, nextRuntimeEpoch) {
      if (!allowed.has(participantId) || !Number.isSafeInteger(nextRuntimeEpoch)) {
        reject('X37_SEAM_NET_RESET_INVALID');
      }
      const prior = watermarks.get(participantId);
      if (!prior || nextRuntimeEpoch !== prior.runtimeEpoch + 1) reject('X37_SEAM_NET_RESET_INVALID');
      const stagedDrivers = new Map(drivers); const stagedWatermarks = new Map(watermarks);
      stagedDrivers.delete(participantId);
      stagedWatermarks.set(participantId, { runtimeEpoch: nextRuntimeEpoch, watermark: 0 });
      drivers = stagedDrivers; watermarks = stagedWatermarks;
      return { participantId, runtimeEpoch: nextRuntimeEpoch, state: state() };
    },
    snapshot: () => ({ netId, state: state(), lastMappedTick, idleLevel,
      drivers: [...drivers.entries()].map(([participantId, value]) => ({ participantId, ...value })) }),
  });
}
