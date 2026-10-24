// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';

import {
  BOARD_PROFILE, BUILD_REQUEST_SCHEMA, normalizeBuildRequestValue,
  RP2040_BOARD_PROFILE, RP2040_BUILD_REQUEST_SCHEMA,
} from '../compiler/build-protocol.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

export const X37_PRODUCER_BUDGET = Object.freeze({ firmwareBuildsMax: 2, participantsMax: 2,
  coordinatedRunsMax: 1, eventsMax: 32, advanceCallsMaxPerParticipant: 32,
  instructionsMaxPerParticipant: 1_000_000, wallTimeoutMilliseconds: 75_000, retriesMax: 0 });

export const X37_PRODUCER_WORKER = new URL('./x37-source-bound-producer-worker.mjs', import.meta.url);

export async function runKillableWorker(moduleUrl, workerData, timeoutMilliseconds = 75_000) {
  if (!(moduleUrl instanceof URL) || !Number.isSafeInteger(timeoutMilliseconds)
      || timeoutMilliseconds < 1 || timeoutMilliseconds > 75_000) throw new Error('X37_WATCHDOG_CONFIGURATION');
  const worker = new Worker(moduleUrl, { workerData, type: 'module' });
  return new Promise((resolve, reject) => {
    let settled = false; let terminating = false; let terminal = null;
    const finish = (callback, value) => { if (settled) return; settled = true; clearTimeout(timer); callback(value); };
    const killAndReject = async (error) => {
      if (settled) return;
      terminating = true;
      await worker.terminate();
      finish(reject, error);
    };
    const timer = setTimeout(async () => {
      terminating = true;
      const exitCode = await worker.terminate();
      finish(reject, Object.assign(new Error('X37_WALL_TIMEOUT'), { code: 'X37_WALL_TIMEOUT', exitCode }));
    }, timeoutMilliseconds);
    worker.on('message', (value) => {
      if (terminal !== null || !value || value.schema !== 'x37-producer-worker-result@1'
          || !['passed', 'failed'].includes(value.status)) {
        void killAndReject(Object.assign(new Error('X37_WORKER_RESULT_INVALID'), { code: 'X37_WORKER_RESULT_INVALID' }));
        return;
      }
      terminal = value;
    });
    worker.once('error', (error) => { void killAndReject(error); });
    worker.once('exit', (code) => {
      if (settled || terminating) return;
      if (code !== 0) finish(reject, Object.assign(new Error(`X37_WORKER_EXIT_${code}`), { code: 'X37_WORKER_EXIT' }));
      else if (terminal === null) finish(reject, Object.assign(new Error('X37_WORKER_RESULT_MISSING'), { code: 'X37_WORKER_RESULT_MISSING' }));
      else finish(resolve, terminal);
    });
  });
}

export const runSourceBoundProducer = (configuration) =>
  runKillableWorker(X37_PRODUCER_WORKER, configuration, X37_PRODUCER_BUDGET.wallTimeoutMilliseconds);

export async function staticPreflight() {
  const [avrSource, rpRequiredSource, rpLockText, rpManifestText, buildProtocol,
    rpWorker, rpHeader, runtimeBridge, runtimeKernel, rpRuntime, seams, producerWorker] = await Promise.all([
    read('test/fixtures/x37-producer/avr-main.ino'),
    read('test/fixtures/x37-producer/rp2040-required-main.c'),
    read('compiler/rp2040-image-lock.json'), read('compiler/rp2040-toolchain-manifest.json'),
    read('compiler/build-protocol.mjs'), read('compiler/rp2040-build-worker.mjs'),
    read('compiler/rp2040-contract/intent_rp2040_runtime.h'),
    read('expansion-drafts/rp2040-runtime-bridge-adapter-v1.mjs'),
    read('src/runtime-kernel.mjs'), read('src/rp2040-experimental-runtime.mjs'),
    read('src/x37-existing-runtime-seams.mjs'),
    read('scripts/x37-source-bound-producer-worker.mjs'),
  ]);
  const rpLock = JSON.parse(rpLockText); const rpManifest = JSON.parse(rpManifestText);
  const rpManifestSha256 = sha256(rpManifestText);
  const manifestHash = (path) => rpManifest.files.find((value) => value.path === path)?.sha256;
  const candidateIdentityChanged = manifestHash('compiler/rp2040-build-worker.mjs') !== sha256(rpWorker)
    || manifestHash('compiler/rp2040-contract/intent_rp2040_runtime.h') !== sha256(rpHeader);
  const turnaroundReleaseProtocol = rpHeader.includes('INTENT_SIO_GPIO_OE_CLR')
    && rpHeader.includes('intent_gpio0_release');
  const checks = {
    avrRequest: normalizeBuildRequestValue({ schema: BUILD_REQUEST_SCHEMA, board: BOARD_PROFILE,
      files: [{ name: 'main.ino', content: avrSource }] }).board === BOARD_PROFILE,
    rpLockSchema: rpLock.schema === 'teach-lab-compiler-image-lock@1',
    rpImagePinned: /^sha256:[a-f0-9]{64}$/u.test(rpLock.imageId),
    rpManifestPinned: rpLock.toolchainManifestSha256 === rpManifestSha256,
    rpGrammarFixed: buildProtocol.includes('RP2040_X37_REFLECT_SOURCE')
      && rpWorker.includes('X37_REFLECT_SOURCE'),
    rpInputMmioFixed: rpHeader.includes('#define INTENT_SIO_GPIO_IN         0xd0000004u')
      && rpHeader.includes('intent_gpio0_reflect_gpio1_4096'),
    rpBridgeMapsInputToMachinePin: runtimeBridge.includes('this.machine.gpio[pin].setInputValue(next.level)'),
    avrRuntimeApis: ['step()', 'queueDigitalSequence(events)', 'pause()', 'reset()']
      .every((value) => runtimeKernel.includes(value)),
    rpRuntimeApis: ['step()', 'pause()', 'reset()', 'dispose()']
      .every((value) => rpRuntime.includes(value))
      && seams.includes("createRuntimeCommand(runtime.requestId, 'digital-input'"),
    seamLimits: ['maxTotalInstructions', 'maxAdvanceCalls', 'maxObservations',
      'X37_SEAM_CAUSAL_DELIVERY_INVALID'].every((value) => seams.includes(value)),
    killableWatchdog: runKillableWorker.toString().includes('worker.terminate()'),
    realProducerWorker: ['DockerBuildBroker', 'RuntimeKernel', 'Rp2040ExperimentalRuntime.create',
      'createObservedDigitalNetResolver', 'resolvedDeliveryDecision', 'verifiedCleanup']
      .every((value) => producerWorker.includes(value)),
  };
  let rpSourceAccepted = false; let rpSourceError = null;
  try {
    normalizeBuildRequestValue({ schema: RP2040_BUILD_REQUEST_SCHEMA, board: RP2040_BOARD_PROFILE,
      files: [{ name: 'main.c', content: rpRequiredSource }] });
    rpSourceAccepted = true;
  } catch (error) { rpSourceError = error.code ?? error.message; }
  const blockers = [];
  if (!rpSourceAccepted) blockers.push({ code: 'X37_RP2040_SOURCE_INPUT_UNSUPPORTED',
    detail: `required input-reading source rejected before Build: ${rpSourceError}` });
  if (Object.values(checks).some((value) => value !== true)) blockers.push({ code: 'X37_STATIC_PREFLIGHT_FAILED' });
  if (candidateIdentityChanged) blockers.push({ code: 'X37_RP2040_COMPILER_IMAGE_REBUILD_REQUIRED',
    detail: 'candidate worker/header differ from the currently trusted manifest and image' });
  if (!turnaroundReleaseProtocol) blockers.push({ code: 'X37_RP2040_RELEASE_PROTOCOL_REQUIRED',
    detail: 'the accepted private image drives GPIO0 but has no bounded firmware release operation; two outputs cannot safely take turns on one shared net' });
  return {
    result: blockers.length ? 'blocked-before-charge' : 'ready-for-separate-producer-receipt',
    chargeAuthorized: false, activity: { firmwareBuilds: 0, runtimeInstances: 0,
      nativeWorkers: 0, coordinatedRuns: 0, retries: 0 },
    budget: X37_PRODUCER_BUDGET, checks, blockers,
    requiredBuildBudget: { compilerImageBuilds: 1, firmwareBuilds: 2,
      coordinatedRuns: 1, retries: 0 },
    sources: { avrSha256: sha256(avrSource), rp2040RequiredSha256: sha256(rpRequiredSource) },
    capabilities: { turnaroundReleaseProtocol },
    expectedObservations: [
      'AVR D13 firmware output reaches resolved shared net',
      'RP2040 GPIO1 firmware reads delivered level and changes GPIO0',
      'RP2040 GPIO0 reaches resolved shared net',
      'AVR D2 firmware reads delivered level and changes D13',
    ],
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.stdout.write(`${JSON.stringify(await staticPreflight())}\n`);
}
