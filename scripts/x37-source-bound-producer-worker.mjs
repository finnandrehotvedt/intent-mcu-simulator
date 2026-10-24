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
  createRp2040X37RuntimeSeam,
} from '../src/x37-existing-runtime-seams.mjs';
import {
  createLiveGenerationOwner, verifiedCleanup,
} from '../src/x37-producer-orchestration.mjs';
import { runX37TurnaroundOrchestration } from '../src/x37-turnaround-orchestrator.mjs';
import { persistX37CompilerArtifact } from '../src/x37-producer-artifact-evidence.mjs';
import { constructX37RuntimePair } from '../src/x37-producer-runtime-lifecycle.mjs';
import { ensureX37WorkerEnvironment } from '../src/x37-worker-environment.mjs';
import { createX37PrivateRuntimeJournal } from '../src/x37-private-runtime-journal.mjs';
import { loadX37RetainedArtifacts } from '../src/x37-retained-artifact-loader.mjs';
import { resolveX37ProducerArtifacts } from '../src/x37-producer-artifact-source.mjs';

const workerEnvironment = await ensureX37WorkerEnvironment();

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const activity = { firmwareBuildAttempts: 0, firmwareBuilds: 0, runtimeInstances: 0,
  coordinatedRuns: 0, events: 0, buildRecords: [], workerEnvironment };
const terminal = (status, value) => parentPort.postMessage({
  schema: 'x37-producer-worker-result@1', status, ...value,
});
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

function validateConfiguration(value) {
  if (!exact(value, ['mode', 'avrLockPath', 'rp2040LockPath', 'avrSourcePath', 'rp2040SourcePath',
    'evidenceDirectory', 'retainedEvidenceDirectory']) || !['compile', 'retained'].includes(value.mode)
      || Object.entries(value).some(([key, item]) => key !== 'mode'
        && (typeof item !== 'string' || !item.startsWith('/')))) {
    throw Object.assign(new Error('X37_PRODUCER_CONFIGURATION_INVALID'), { code: 'X37_PRODUCER_CONFIGURATION_INVALID' });
  }
  return value;
}

async function compileOne(participantId, lock, request, evidenceDirectory) {
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
  record.persistedEvidence = await persistX37CompilerArtifact({ evidenceDirectory,
    participantId, artifact: result.artifact, buildRecord: record });
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
  const avrIdentity = { requestSha256: sha256(JSON.stringify(avrRequest)), sourceSha256: sha256(avrSource),
    imageId: avrLock.imageId, toolchainManifestSha256: avrLock.toolchainManifestSha256 };
  const rpIdentity = { requestSha256: sha256(JSON.stringify(rpRequest)), sourceSha256: sha256(rpSource),
    imageId: rpLock.imageId, toolchainManifestSha256: rpLock.toolchainManifestSha256 };
  const selected = await resolveX37ProducerArtifacts({ mode: config.mode,
    compile: async () => ({
      avr: await compileOne('avr', avrLock, avrRequest, config.evidenceDirectory),
      rp: await compileOne('rp', rpLock, rpRequest, config.evidenceDirectory),
    }),
    loadRetained: () => loadX37RetainedArtifacts({ evidenceDirectory: config.retainedEvidenceDirectory,
      expected: { avr: avrIdentity, rp: rpIdentity }, expectedBytes: { avr: 2836, rp: 1024 },
      expectedSha256: { avr: '83f70cfebdd8f05cb1045a25b7e64e3319d35ae562e15011c4ca35b4aa8164c3',
        rp: '05cdf8cc232a72cb1181bded3c65a60b41e419cc6eb396fc1b89f39aea21b2dc' } }),
  });
  const avrArtifact = selected.artifacts.avr; const rpArtifact = selected.artifacts.rp;
  if (selected.mode === 'retained') activity.buildRecords.push(
    { participantId: 'avr', ...avrIdentity, status: 'retained-verified', artifactSha256: avrArtifact.hexSha256 },
    { participantId: 'rp', ...rpIdentity, status: 'retained-verified', artifactSha256: rpArtifact.uf2.sha256 });
  if (sha256(avrArtifact.hex) !== avrArtifact.hexSha256
      || sha256(Buffer.from(rpArtifact.uf2.base64, 'base64')) !== rpArtifact.uf2.sha256) {
    throw Object.assign(new Error('X37_ARTIFACT_IDENTITY_INVALID'), { code: 'X37_ARTIFACT_IDENTITY_INVALID' });
  }
  let avr = null; let rp = null; let avrSeam = null; let rpSeam = null;
  const avrOwner = createLiveGenerationOwner('avr');
  const rpOwner = createLiveGenerationOwner('rp');
  let result = null; let primaryError = null; const cleanupEvidence = [];
  const journal = createX37PrivateRuntimeJournal(config.evidenceDirectory);
  journal.append('environment', workerEnvironment);
  try {
    const runtimes = await constructX37RuntimePair({ activity,
      createAvr: () => new RuntimeKernel(avrArtifact.hex, DEFAULT_CIRCUIT, { logicChannels: ['D13', 'D2'] }),
      createRp: () => Rp2040ExperimentalRuntime.create({ format: 'uf2',
        bytes: new Uint8Array(Buffer.from(rpArtifact.uf2.base64, 'base64')),
        expectedSha256: rpArtifact.uf2.sha256 }),
      cleanupAvr: (runtime) => { runtime.pause(); },
      cleanupRp: (runtime) => { runtime.pause(); runtime.dispose(); },
    });
    avr = runtimes.avr; rp = runtimes.rp; activity.coordinatedRuns = 1;
    avrSeam = createAvrX37RuntimeSeam({ runtime: avr, identityOwner: avrOwner.snapshot, schedulerContract });
    rpSeam = createRp2040X37RuntimeSeam({ runtime: rp, identityOwner: rpOwner.snapshot, schedulerContract });
    const net = createObservedDigitalNetResolver({ netId: 'shared.digital.0',
      driverParticipantIds: ['avr', 'rp'], idleLevel: true });
    result = runX37TurnaroundOrchestration({ seams: { avr: avrSeam, rp: rpSeam },
      schedulerContract, net, inputApplied: {
        avr: (record) => {
          const sequence = record.delivery.queued?.[0]?.sequence;
          return Number.isSafeInteger(sequence)
            && avr.snapshot().eventLog.applied.some((event) => event.sequence === sequence);
        },
        rp: (record) => rp.adapter.snapshot().events.some((event) =>
          event.type === 'digital-input-applied' && event.pin === 'GPIO1'
          && event.level === record.level && event.cycle >= record.targetCycle),
      }, onAcceptedObservation: (row) => { activity.events += 1; journal.append('observation', row); } });
  } catch (error) { primaryError = error; journal.append('failure', { code: error.code ?? error.message,
    partial: error.x37Partial ?? null, activity: { firmwareBuildAttempts: activity.firmwareBuildAttempts,
      firmwareBuilds: activity.firmwareBuilds, runtimeInstances: activity.runtimeInstances,
      coordinatedRuns: activity.coordinatedRuns, events: activity.events } }); }
  try {
    await verifiedCleanup([
      avrSeam ? { cleanup: () => { avrSeam.retire(); avrOwner.retire(); avrSeam.dispose(); cleanupEvidence.push({ participantId: 'avr', retired: true, disposed: true }); },
        verify: () => avrSeam.lifecycle().disposed && avrOwner.isRetired() }
        : avr ? { cleanup: () => { avr.pause(); avr.dispose?.(); }, verify: () => true } : null,
      rpSeam ? { cleanup: () => { rpSeam.retire(); rpOwner.retire(); rpSeam.dispose(); cleanupEvidence.push({ participantId: 'rp', retired: true, disposed: true }); },
        verify: () => rpSeam.lifecycle().disposed && rpOwner.isRetired() }
        : rp ? { cleanup: () => { rp.pause(); rp.dispose(); }, verify: () => rp.disposed === true } : null,
    ]);
  } catch (cleanupError) {
    cleanupError.primaryFailureCode = primaryError?.code ?? null;
    throw cleanupError;
  }
  journal.append('cleanup', { cleanupEvidence, journal: journal.snapshot() });
  if (primaryError) throw primaryError;
  return { ...result, cleanupEvidence, journal: journal.snapshot() };
}

try {
  const result = await main();
  terminal('passed', { ...result, activity: { ...activity } });
} catch (error) {
  terminal('failed', { code: error.code ?? 'X37_PRODUCER_FAILED',
    cleanupErrors: error.cleanupErrors ?? [], primaryFailureCode: error.primaryFailureCode ?? null,
    runtimeConstruction: error.runtimeConstruction ?? null,
    partial: error.x37Partial ?? null,
    activity: { ...activity } });
}
