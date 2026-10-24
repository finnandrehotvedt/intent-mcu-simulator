import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  new URL('../src/runtime-kernel.mjs', import.meta.url),
  new URL('../src/rp2040-experimental-runtime.mjs', import.meta.url),
  new URL('../src/x37-existing-runtime-seams.mjs', import.meta.url),
];
const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')));
assert.match(sources[0], /step\(\)/u);
assert.match(sources[0], /queueDigitalSequence\(events\)/u);
assert.match(sources[1], /step\(\)/u);
assert.match(sources[2], /createRuntimeCommand\(runtime\.requestId, 'digital-input'/u);
assert.match(sources[2], /origin: 'executed-firmware-observation'/u);
assert.match(sources[2], /exactCycleClaimed: false/u);
assert.match(sources[2], /X37_SEAM_OBSERVATION_HISTORY_LOST/u);
assert.match(sources[2], /X37_SEAM_CAUSAL_DELIVERY_INVALID/u);
assert.match(sources[2], /createObservedDigitalNetResolver/u);

process.stdout.write(`${JSON.stringify({
  result: 'static-preflight-pass',
  runtimeInstances: 0,
  firmwareBuilds: 0,
  nativeWorkers: 0,
  coordinatedRuns: 0,
  publicChanges: 0,
  nextReceiptBudget: {
    firmwareBuildsMax: 2,
    participantsMax: 2,
    coordinatedRunsMax: 1,
    eventsMax: 32,
    retriesMax: 0,
    wallTimeoutSeconds: 75,
    instructionCapPerParticipant: 1_000_000,
    advanceCallsMaxPerParticipant: 32,
  },
  requiredFlow: [
    'executed firmware output observation',
    'stateful per-driver shared digital net resolution',
    'mapped-tick causal barrier',
    'counterpart runtime input queue',
    'counterpart firmware observation',
  ],
})}\n`);
