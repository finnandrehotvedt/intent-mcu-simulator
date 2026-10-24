// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parentPort, workerData } from 'node:worker_threads';

import { DockerBuildBroker, loadImageLock } from '../compiler/docker-broker.mjs';
import {
  BOARD_PROFILE, BUILD_REQUEST_SCHEMA, normalizeBuildRequestValue,
  RP2040_BOARD_PROFILE, RP2040_BUILD_REQUEST_SCHEMA,
} from '../compiler/build-protocol.mjs';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import { RuntimeKernel } from '../src/runtime-kernel.mjs';
import { Rp2040ExperimentalRuntime } from '../src/rp2040-experimental-runtime.mjs';
import {
  createAvrX37RuntimeSeam, createObservedDigitalNetResolver,
  createRp2040X37RuntimeSeam, mapX37RuntimeObservation,
} from '../src/x37-existing-runtime-seams.mjs';
import {
  createBoundedObservationFifo, createLiveGenerationOwner, resolvedDeliveryDecision,
  evaluateCouplingAcceptance, targetCycleAtOrAfterMappedTick, verifiedCleanup,
} from '../src/x37-producer-orchestration.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const activity = { firmwareBuildAttempts: 0, firmwareBuilds: 0, runtimeInstances: 0,
  coordinatedRuns: 0, events: 0, buildRecords: [] };
const terminal = (status, value) => parentPort.postMessage({
  schema: 'x37-producer-worker-result@1', status, ...value,
});
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

function validateConfiguration(value) {
  if (!exact(value, ['avrLockPath', 'rp2040LockPath', 'avrSourcePath', 'rp2040SourcePath'])
      || Object.values(value).some((item) => typeof item !== 'string' || !item.startsWith('/'))) {
    throw Object.assign(new Error('X37_PRODUCER_CONFIGURATION_INVALID'), { code: 'X37_PRODUCER_CONFIGURATION_INVALID' });
  }
  return value;
}

async function compileOne(participantId, lock, request) {
  const record = { participantId, requestSha256: sha256(JSON.stringify(request)),
    sourceSha256: sha256(request.files[0].content), imageId: lock.imageId,
    toolchainManifestSha256: lock.toolchainManifestSha256, status: 'attempted' };
  activity.firmwareBuildAttempts += 1; activity.buildRecords.push(record);
  const broker = new DockerBuildBroker({ imageLock: lock, deadlineMs: 20_000 });
  let result;
  try { result = await broker.compile(request); }
  catch (error) { record.failureCode = error.code ?? 'X37_BUILD_BROKER_FAILED'; throw error; }
  if (result.status !== 'succeeded' || result.imageId !== lock.imageId) {
    record.failureCode = 'X37_BUILD_FAILED';
    throw Object.assign(new Error('X37_BUILD_FAILED'), { code: 'X37_BUILD_FAILED' });
  }
  record.status = 'succeeded'; record.artifactSha256 = result.artifact.artifactSha256
    ?? result.artifact.hexSha256 ?? result.artifact.uf2?.sha256 ?? null;
  activity.firmwareBuilds += 1;
  return result.artifact;
}

const schedulerContract = {
  schema: 'intent-mcu-x37-shared-scheduler-contract@1', schedulerId: 'x37-source-bound', startSchedulerTick: 0,
  participants: [
    { participantId: 'avr', projectGeneration: 1, runtimeGeneration: 1,
      localCyclesPerSchedulerTick: { numerator: 1, denominator: 125 } },
    { participantId: 'rp', projectGeneration: 1, runtimeGeneration: 1,
      localCyclesPerSchedulerTick: { numerator: 1, denominator: 8 } },
  ],
  sharedNet: { netId: 'shared.digital.0', driverParticipantIds: ['avr', 'rp'], readerParticipantIds: ['avr', 'rp'] },
  limits: { eventLimit: 32, traceLimit: 32 },
};
async function main() {
  const config = validateConfiguration(workerData);
  const [avrLock, rpLock, avrSource, rpSource] = await Promise.all([
    loadImageLock(config.avrLockPath), loadImageLock(config.rp2040LockPath),
    readFile(config.avrSourcePath, 'utf8'), readFile(config.rp2040SourcePath, 'utf8'),
  ]);
  const avrRequest = normalizeBuildRequestValue({ schema: BUILD_REQUEST_SCHEMA, board: BOARD_PROFILE,
    files: [{ name: 'main.ino', content: avrSource }] });
  const rpRequest = normalizeBuildRequestValue({ schema: RP2040_BUILD_REQUEST_SCHEMA, board: RP2040_BOARD_PROFILE,
    files: [{ name: 'main.c', content: rpSource }] });
  const avrArtifact = await compileOne('avr', avrLock, avrRequest);
  const rpArtifact = await compileOne('rp', rpLock, rpRequest);
  if (sha256(avrArtifact.hex) !== avrArtifact.hexSha256
      || sha256(Buffer.from(rpArtifact.uf2.base64, 'base64')) !== rpArtifact.uf2.sha256) {
    throw Object.assign(new Error('X37_ARTIFACT_IDENTITY_INVALID'), { code: 'X37_ARTIFACT_IDENTITY_INVALID' });
  }
  let avr = null; let rp = null; let avrSeam = null; let rpSeam = null;
  const avrOwner = createLiveGenerationOwner('avr');
  const rpOwner = createLiveGenerationOwner('rp');
  let result = null; let primaryError = null;
  try {
    avr = new RuntimeKernel(avrArtifact.hex, DEFAULT_CIRCUIT, { logicChannels: ['D13', 'D2'] });
    rp = await Rp2040ExperimentalRuntime.create({ format: 'uf2',
      bytes: new Uint8Array(Buffer.from(rpArtifact.uf2.base64, 'base64')),
      expectedSha256: rpArtifact.uf2.sha256 });
    activity.runtimeInstances = 2; activity.coordinatedRuns = 1;
    avrSeam = createAvrX37RuntimeSeam({ runtime: avr, identityOwner: avrOwner.snapshot, schedulerContract });
    rpSeam = createRp2040X37RuntimeSeam({ runtime: rp, identityOwner: rpOwner.snapshot, schedulerContract });
    const net = createObservedDigitalNetResolver({ netId: 'shared.digital.0', driverParticipantIds: ['avr', 'rp'] });
    const fifo = createBoundedObservationFifo(32); const evidence = []; let events = 0;
    const processPending = (seam) => {
      fifo.enqueue(seam.observeFirmwareGpio());
      return fifo.drain((observation) => {
        events += 1; activity.events = events;
        const mapped = mapX37RuntimeObservation(observation, schedulerContract);
        const resolved = net.apply([mapped]); evidence.push({ observation: mapped, resolved });
        return { observation: mapped, resolved };
      });
    };
    const nextDrive = (seam, level, window) => {
      for (let call = 0; call < 32; call += 1) {
        seam.advanceToLocalCycle(seam.currentCycle() + window);
        const matching = processPending(seam).find(({ observation }) =>
          observation.mode === 'DRIVE' && observation.level === level) ?? null;
        if (matching) return matching;
      }
      throw Object.assign(new Error('X37_EXPECTED_FIRMWARE_OBSERVATION_MISSING'), { code: 'X37_EXPECTED_FIRMWARE_OBSERVATION_MISSING' });
    };
    const deliver = (resolvedObservation, targetSeam, clock) => {
      const decision = resolvedDeliveryDecision(resolvedObservation.resolved,
        resolvedObservation.observation);
      if (!decision.deliver) return { ...decision, queued: false };
      const boundary = targetCycleAtOrAfterMappedTick(
        decision.sourceObservation.mappedTick, clock);
      const advance = targetSeam.advanceToLocalCycle(boundary.cycle);
      processPending(targetSeam);
      const current = net.snapshot();
      const currentDecision = resolvedDeliveryDecision({ ...current,
        deliverable: ['LOW', 'HIGH'].includes(current.state),
        ...(['LOW', 'HIGH'].includes(current.state) ? { level: current.state === 'HIGH' } : {}) },
      decision.sourceObservation);
      if (!currentDecision.deliver) return { ...currentDecision, boundary, advance, queued: false };
      const delivery = targetSeam.deliverResolvedLevel(currentDecision.level, decision.sourceObservation);
      return { ...decision, boundary, advance, delivery, queued: true };
    };
    const avrHigh = nextDrive(avrSeam, true, 20_000);
    const avrToRp = deliver(avrHigh, rpSeam, { numerator: 1, denominator: 8 });
    if (!avrToRp.queued) throw Object.assign(new Error('X37_REQUIRED_DELIVERY_NOT_QUEUED'),
      { code: 'X37_REQUIRED_DELIVERY_NOT_QUEUED' });
    const rpHigh = nextDrive(rpSeam, true, 20_000);
    const rpApplied = rp.adapter.snapshot().events.findLast((event) =>
      event.type === 'digital-input-applied' && event.pin === 'GPIO1');
    const rpToAvr = deliver(rpHigh, avrSeam, { numerator: 1, denominator: 125 });
    if (!rpToAvr.queued) throw Object.assign(new Error('X37_REQUIRED_DELIVERY_NOT_QUEUED'),
      { code: 'X37_REQUIRED_DELIVERY_NOT_QUEUED' });
    const avrLow = nextDrive(avrSeam, false, 20_000);
    const avrQueued = rpToAvr.delivery.queued[0];
    const avrApplied = avr.snapshot().eventLog.applied.find((event) => event.sequence === avrQueued.sequence);
    const couplingAcceptance = evaluateCouplingAcceptance({
      observations: evidence.map(({ observation }) => observation),
      deliveries: [
        { direction: 'avr-to-rp', queued: avrToRp.queued, inputApplied: Boolean(rpApplied),
          inputAppliedCycle: rpApplied?.cycle, responseCycle: rpHigh.observation.localCycle,
          sourceMappedTick: avrHigh.observation.mappedTick,
          responseMappedTick: rpHigh.observation.mappedTick },
        { direction: 'rp-to-avr', queued: rpToAvr.queued, inputApplied: Boolean(avrApplied),
          inputAppliedCycle: avrApplied?.targetCycle, responseCycle: avrLow.observation.localCycle,
          sourceMappedTick: rpHigh.observation.mappedTick,
          responseMappedTick: avrLow.observation.mappedTick },
      ],
    });
    const conflictDecision = resolvedDeliveryDecision(avrLow.resolved, avrLow.observation);
    if (conflictDecision.deliver || conflictDecision.state !== 'CONFLICT') {
      throw Object.assign(new Error('X37_EXPECTED_CONFLICT_MISSING'), { code: 'X37_EXPECTED_CONFLICT_MISSING' });
    }
    result = { evidence, observations: { avrHigh, rpHigh, avrLow },
      deliveries: { avrToRp, rpToAvr, conflictDecision }, couplingAcceptance,
      fifo: fifo.snapshot() };
  } catch (error) { primaryError = error; }
  try {
    await verifiedCleanup([
      avrSeam ? { cleanup: () => { avrSeam.retire(); avrOwner.retire(); avrSeam.dispose(); },
        verify: () => avrSeam.lifecycle().disposed && avrOwner.isRetired() }
        : avr ? { cleanup: () => { avr.pause(); avr.dispose?.(); }, verify: () => true } : null,
      rpSeam ? { cleanup: () => { rpSeam.retire(); rpOwner.retire(); rpSeam.dispose(); },
        verify: () => rpSeam.lifecycle().disposed && rpOwner.isRetired() }
        : rp ? { cleanup: () => { rp.pause(); rp.dispose(); }, verify: () => rp.disposed === true } : null,
    ]);
  } catch (cleanupError) {
    cleanupError.primaryFailureCode = primaryError?.code ?? null;
    throw cleanupError;
  }
  if (primaryError) throw primaryError;
  return result;
}

try {
  const result = await main();
  terminal('passed', { ...result, activity: { ...activity } });
} catch (error) {
  terminal('failed', { code: error.code ?? 'X37_PRODUCER_FAILED',
    cleanupErrors: error.cleanupErrors ?? [], primaryFailureCode: error.primaryFailureCode ?? null,
    activity: { ...activity } });
}
