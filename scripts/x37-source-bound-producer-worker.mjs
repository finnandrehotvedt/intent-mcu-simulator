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

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const activity = { firmwareBuilds: 0, runtimeInstances: 0, coordinatedRuns: 0, events: 0 };
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

async function compileOne(lock, request) {
  const broker = new DockerBuildBroker({ imageLock: lock, deadlineMs: 20_000 });
  const result = await broker.compile(request);
  if (result.status !== 'succeeded' || result.imageId !== lock.imageId) {
    throw Object.assign(new Error('X37_BUILD_FAILED'), { code: 'X37_BUILD_FAILED' });
  }
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
const owner = (participantId) => () => ({ participantId, projectGeneration: 1, runtimeGeneration: 1 });
const targetCycle = (tick, clock) => Math.ceil(tick * clock.numerator / clock.denominator);

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
  const avrArtifact = await compileOne(avrLock, avrRequest);
  activity.firmwareBuilds += 1;
  const rpArtifact = await compileOne(rpLock, rpRequest);
  activity.firmwareBuilds += 1;
  if (sha256(avrArtifact.hex) !== avrArtifact.hexSha256
      || sha256(Buffer.from(rpArtifact.uf2.base64, 'base64')) !== rpArtifact.uf2.sha256) {
    throw Object.assign(new Error('X37_ARTIFACT_IDENTITY_INVALID'), { code: 'X37_ARTIFACT_IDENTITY_INVALID' });
  }
  let avr = null; let rp = null; let avrSeam = null; let rpSeam = null;
  try {
    avr = new RuntimeKernel(avrArtifact.hex, DEFAULT_CIRCUIT, { logicChannels: ['D13', 'D2'] });
    rp = await Rp2040ExperimentalRuntime.create({ format: 'uf2',
      bytes: new Uint8Array(Buffer.from(rpArtifact.uf2.base64, 'base64')),
      expectedSha256: rpArtifact.uf2.sha256 });
    activity.runtimeInstances = 2; activity.coordinatedRuns = 1;
    avrSeam = createAvrX37RuntimeSeam({ runtime: avr, identityOwner: owner('avr'), schedulerContract });
    rpSeam = createRp2040X37RuntimeSeam({ runtime: rp, identityOwner: owner('rp'), schedulerContract });
    const net = createObservedDigitalNetResolver({ netId: 'shared.digital.0', driverParticipantIds: ['avr', 'rp'] });
    const evidence = []; let events = 0;
    const nextDrive = (seam, level, window) => {
      for (let call = 0; call < 32; call += 1) {
        seam.advanceToLocalCycle(seam.currentCycle() + window);
        for (const observation of seam.observeFirmwareGpio()) {
          events += 1; activity.events = events;
          if (events > 32) throw Object.assign(new Error('X37_EVENT_LIMIT'), { code: 'X37_EVENT_LIMIT' });
          const mapped = mapX37RuntimeObservation(observation, schedulerContract);
          const resolved = net.apply([mapped]); evidence.push({ observation: mapped, resolved });
          if (observation.mode === 'DRIVE' && observation.level === level) return mapped;
        }
      }
      throw Object.assign(new Error('X37_EXPECTED_FIRMWARE_OBSERVATION_MISSING'), { code: 'X37_EXPECTED_FIRMWARE_OBSERVATION_MISSING' });
    };
    const avrHigh = nextDrive(avrSeam, true, 20_000);
    rpSeam.advanceToLocalCycle(targetCycle(avrHigh.mappedTick, { numerator: 1, denominator: 8 }));
    rpSeam.deliverResolvedLevel(true, avrHigh);
    const rpHigh = nextDrive(rpSeam, true, 20_000);
    avrSeam.advanceToLocalCycle(targetCycle(rpHigh.mappedTick, { numerator: 1, denominator: 125 }));
    avrSeam.deliverResolvedLevel(true, rpHigh);
    const avrLow = nextDrive(avrSeam, false, 20_000);
    terminal('passed', { evidence, observations: { avrHigh, rpHigh, avrLow },
      activity: { ...activity } });
  } finally {
    try { avr?.pause(); } catch { /* bounded cleanup */ }
    try { rp?.pause(); } catch { /* bounded cleanup */ }
    try { avrSeam?.dispose(); } catch { /* bounded cleanup */ }
    try { rpSeam?.dispose(); } catch { /* bounded cleanup */ }
  }
}

try { await main(); }
catch (error) { terminal('failed', { code: error.code ?? 'X37_PRODUCER_FAILED', activity: { ...activity } }); }
