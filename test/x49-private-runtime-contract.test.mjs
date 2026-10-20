// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import {
  validateX49PrivateInit, validateX49PrivateManifest, x49PrivateExecutionContext,
  x49PrivateObservation, x49PrivateTerminal,
} from '../src/x49-private-runtime-contract.mjs';
import {
  X49_ADC_SCHEMA, X49_CASE_SCHEMA, X49_EVIDENCE_STATE_SCHEMA,
  X49_EXPERIMENT_BINDING_SCHEMA, X49_FIRMWARE_PRODUCER_SCHEMA, X49_FIXTURE_CLASS,
  X49_INPUT_SCHEMA, X49_MODEL_OUTPUT_SCHEMA, X49_PIN_SCHEMA, X49_PROFILE,
  X49_RETENTION_SCHEMA, X49_TIME_SCHEMA,
} from '../src/x49-sensor-offset.mjs';
import {
  X49_INSTRUMENTED_FIXTURE_ID, X49_INSTRUMENTED_SOURCE_SHA256,
  X49_PROBE_SYMBOL, X49_RUNTIME_PROBE_SCHEMA,
} from '../src/x49-instrumented-fixture-contract.mjs';

const manifest = JSON.parse(await readFile(new URL('../src/x49-private-runtime-manifest.json', import.meta.url)));
const artifactIdentity = '2'.repeat(64); const graphIdentity = `sha256:${'5'.repeat(64)}`;
const probe = () => ({ schema: X49_RUNTIME_PROBE_SCHEMA, fixtureId: X49_INSTRUMENTED_FIXTURE_ID,
  sourceSha256: X49_INSTRUMENTED_SOURCE_SHA256, artifactIdentity,
  symbol: { symbol: X49_PROBE_SYMBOL, dataAddress: 0x100, size: 4,
    elfSha256: '6'.repeat(64), binding: 'global', type: 'object' } });

async function init() {
  const selectedProbe = probe();
  const experimentBinding = { schema: X49_EXPERIMENT_BINDING_SCHEMA, profile: X49_PROFILE,
    projectGeneration: 9, graphIdentity, sourceSha256: selectedProbe.sourceSha256,
    artifactIdentity, modelImplementationSha256: manifest.implementationSha256,
    modelExecutionContextSha256: '0'.repeat(64), fixtureClass: X49_FIXTURE_CLASS,
    componentId: 'temperature-sensor-1', boardPin: 'A1' };
  const context = await x49PrivateExecutionContext({ manifest, probe: selectedProbe,
    experimentBinding, caseId: 'baseline-offset-0' });
  experimentBinding.modelExecutionContextSha256 = context;
  return { command: 'init', manifest: structuredClone(manifest), hex: ':00000001FF',
    probe: selectedProbe, caseId: 'baseline-offset-0', experimentBinding,
    runtimeBinding: { schema: 'intent-mcu-runtime-binding@2', projectGeneration: 9,
      runtimeGeneration: 10, artifactIdentity,
      modelImplementationSha256: manifest.implementationSha256,
      modelExecutionContextSha256: context }, receiptNonce: 'a'.repeat(32) };
}

test('private manifest and immutable init binding validate exactly', async () => {
  assert.equal((await validateX49PrivateManifest(manifest)).runtimeMembers.length, 15);
  const accepted = await validateX49PrivateInit(await init());
  assert.equal(accepted.expected.inputIdentity,
    '4300d360967677c0cd653cb7bf4cd93ab6d8e8235cb76a38d86ae5b43f25679b');
});

test('closure drift, private field drift and current public lock reject', async () => {
  const drift = structuredClone(manifest); drift.runtimeMembers[0].sha256 = '9'.repeat(64);
  await assert.rejects(validateX49PrivateManifest(drift), { code: 'X49_PRIVATE_MANIFEST_HASH_INVALID' });
  const extra = await init(); extra.privateRuntime = true;
  await assert.rejects(validateX49PrivateInit(extra), { code: 'X49_PRIVATE_INIT_INVALID' });
  const current = await init();
  current.runtimeBinding.modelImplementationSha256 = CURRENT_MODEL_LIBRARY_LOCK.implementationSha256;
  current.experimentBinding.modelImplementationSha256 = CURRENT_MODEL_LIBRARY_LOCK.implementationSha256;
  await assert.rejects(validateX49PrivateInit(current), { code: 'X49_PRIVATE_BINDING_MISMATCH' });
});

test('artifact, project, source and model-context swaps cannot cross the private init boundary', async () => {
  const cases = [
    (value) => { value.runtimeBinding.projectGeneration += 1; },
    (value) => { value.runtimeBinding.artifactIdentity = '8'.repeat(64); },
    (value) => { value.runtimeBinding.modelExecutionContextSha256 = '8'.repeat(64); },
    (value) => { value.experimentBinding.artifactIdentity = '8'.repeat(64); },
    (value) => { value.probe.sourceSha256 = '8'.repeat(64); },
  ];
  for (const mutate of cases) {
    const value = await init(); mutate(value);
    await assert.rejects(validateX49PrivateInit(value));
  }
});

function completeTerminal(accepted) {
  const expected = accepted.expected;
  return x49PrivateTerminal({ receiptNonce: accepted.receiptNonce,
    runtimeIdentity: {
      ...structuredClone(accepted.runtimeBinding),
      schema: 'intent-mcu-worker-runtime-identity@2',
      workerInitialization: 1, workerInstanceNonce: 'b'.repeat(32),
    },
    experimentBinding: accepted.experimentBinding, state: 'complete', reason: null,
    evidence: {
      caseId: expected.caseId, inputIdentity: expected.inputIdentity,
      inputAppliedCycle: 0, inputRetainedThroughCycle: 2_560_000,
      adc: { schema: X49_ADC_SCHEMA, channel: 1, value: expected.calculated.adcCount,
        startCycle: 80, completionCycle: 90 },
      firmwareTransaction: { schema: X49_FIRMWARE_PRODUCER_SCHEMA,
        fixtureClass: X49_FIXTURE_CLASS, sourceSha256: accepted.probe.sourceSha256,
        artifactIdentity: accepted.probe.artifactIdentity, commit: 2,
        temperatureC: expected.calculated.firmwareIntegerC,
        d13Level: expected.calculated.d13Level ? 1 : 0, adcChannel: 1,
        adcValue: expected.calculated.adcCount, adcCompletionCycle: 90,
        beginCycle: 100, commitCycle: 140 },
      pin: { schema: X49_PIN_SCHEMA, pin: 'D13', mode: 'OUTPUT',
        level: expected.calculated.d13Level, observedCycle: 2_560_000 },
      time: { cpuCycles: 2_560_000, virtualMilliseconds: 160 },
      retention: { completeThroughCycle: 2_560_000, droppedTraceRows: 0,
        droppedAdcCompletions: 0, droppedMailboxTransactions: 0,
        retainedMailboxWrites: 5, mailboxWriteLimit: 8 },
    } });
}

test('private terminal transforms into the exact existing native-case boundary', async () => {
  const accepted = await validateX49PrivateInit(await init());
  const observation = x49PrivateObservation(accepted, completeTerminal(accepted));
  assert.equal(observation.schema, X49_CASE_SCHEMA);
  assert.deepEqual(observation.input, { schema: X49_INPUT_SCHEMA,
    inputIdentity: accepted.expected.inputIdentity, graphIdentity,
    authored: accepted.expected.authored, targetCycle: 0, appliedCycle: 0,
    retainedThroughCycle: 2_560_000 });
  assert.deepEqual(observation.modelOutput, { schema: X49_MODEL_OUTPUT_SCHEMA,
    componentId: 'temperature-sensor-1', boardPin: 'A1',
    voltage: accepted.expected.calculated.modelVoltage });
  assert.deepEqual(observation.time, { schema: X49_TIME_SCHEMA,
    cpuCycles: 2_560_000, virtualMilliseconds: 160 });
  assert.deepEqual(observation.retention, { schema: X49_RETENTION_SCHEMA,
    completeThroughCycle: 2_560_000, droppedTraceRows: 0,
    droppedAdcCompletions: 0, droppedMailboxTransactions: 0 });
  assert.deepEqual(observation.evidence, { schema: X49_EVIDENCE_STATE_SCHEMA,
    state: 'complete', reason: null });
  assert.equal('retainedMailboxWrites' in observation.retention, false);
});

test('terminal transformation rejects binding drift and malformed private evidence', async () => {
  const accepted = await validateX49PrivateInit(await init());
  const drift = structuredClone(completeTerminal(accepted));
  drift.experimentBinding.graphIdentity = `sha256:${'8'.repeat(64)}`;
  assert.throws(() => x49PrivateObservation(accepted, drift),
    { code: 'X49_PRIVATE_TERMINAL_BINDING_INVALID' });
  const malformed = structuredClone(completeTerminal(accepted));
  malformed.evidence.retention.untrusted = 1;
  assert.throws(() => x49PrivateObservation(accepted, malformed),
    { code: 'X49_PRIVATE_TERMINAL_EVIDENCE_INVALID' });
});
