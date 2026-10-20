// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  X49_REPORT_SCHEMA, X49_RETENTION_SCHEMA, X49_TIME_SCHEMA, X49_CONTRACT_ID,
  sealX49Report, validateX49AcceptedNativeReport,
} from '../src/x49-sensor-offset.mjs';
import {
  X49_INSTRUMENTED_FIXTURE_ID, X49_INSTRUMENTED_SOURCE_SHA256,
  X49_PROBE_SYMBOL, X49_RUNTIME_PROBE_SCHEMA,
} from '../src/x49-instrumented-fixture-contract.mjs';

const manifest = JSON.parse(await readFile(new URL('../src/x49-private-runtime-manifest.json', import.meta.url)));
const artifactIdentity = '2'.repeat(64); const graphIdentity = `sha256:${'5'.repeat(64)}`;
const hex = ':00000001FF';
const hexSha256 = '8ff380455776389e7f113d525a23d5b7b449afc859b07b25ca23a8b9c3c13d89';
const stable = (value) => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const sha256 = (value) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const probe = () => ({ schema: X49_RUNTIME_PROBE_SCHEMA, fixtureId: X49_INSTRUMENTED_FIXTURE_ID,
  sourceSha256: X49_INSTRUMENTED_SOURCE_SHA256, artifactIdentity,
  symbol: { symbol: X49_PROBE_SYMBOL, dataAddress: 0x100, size: 4,
    elfSha256: '6'.repeat(64), binding: 'global', type: 'object' } });

async function init(caseId = 'baseline-offset-0', runtimeGeneration = 10) {
  const selectedProbe = probe();
  const experimentBinding = { schema: X49_EXPERIMENT_BINDING_SCHEMA, profile: X49_PROFILE,
    projectGeneration: 9, graphIdentity, sourceSha256: selectedProbe.sourceSha256,
    artifactIdentity, modelImplementationSha256: manifest.implementationSha256,
    modelExecutionContextSha256: '0'.repeat(64), fixtureClass: X49_FIXTURE_CLASS,
    componentId: 'temperature-sensor-1', boardPin: 'A1' };
  const context = await x49PrivateExecutionContext({ manifest, probe: selectedProbe,
    experimentBinding, hexSha256 });
  experimentBinding.modelExecutionContextSha256 = context;
  return { command: 'init', manifest: structuredClone(manifest), hex, hexSha256,
    probe: selectedProbe, caseId, experimentBinding,
    runtimeBinding: { schema: 'intent-mcu-runtime-binding@2', projectGeneration: 9,
      runtimeGeneration, artifactIdentity,
      modelImplementationSha256: manifest.implementationSha256,
      modelExecutionContextSha256: context }, receiptNonce: 'a'.repeat(32) };
}

test('private manifest and immutable init binding validate exactly', async () => {
  assert.equal((await validateX49PrivateManifest(manifest, crypto, manifest)).runtimeMembers.length, 15);
  const accepted = await validateX49PrivateInit(await init(), crypto, manifest);
  assert.equal(accepted.expected.inputIdentity,
    '4300d360967677c0cd653cb7bf4cd93ab6d8e8235cb76a38d86ae5b43f25679b');
});

test('closure drift, private field drift and current public lock reject', async () => {
  const drift = structuredClone(manifest); drift.runtimeMembers[0].sha256 = '9'.repeat(64);
  await assert.rejects(validateX49PrivateManifest(drift, crypto, manifest),
    { code: 'X49_PRIVATE_MANIFEST_HASH_INVALID' });
  const forged = structuredClone(manifest); forged.runtimeMembers[0].sha256 = '9'.repeat(64);
  forged.implementationSha256 = sha256({ runtimeMembers: forged.runtimeMembers,
    externalContracts: forged.externalContracts });
  const semantic = structuredClone(forged); delete semantic.semanticSha256;
  forged.semanticSha256 = sha256(semantic);
  await assert.rejects(validateX49PrivateManifest(forged, crypto, manifest),
    { code: 'X49_PRIVATE_MANIFEST_TRUST_INVALID' });
  const extra = await init(); extra.privateRuntime = true;
  await assert.rejects(validateX49PrivateInit(extra, crypto, manifest), { code: 'X49_PRIVATE_INIT_INVALID' });
  const current = await init();
  current.runtimeBinding.modelImplementationSha256 = CURRENT_MODEL_LIBRARY_LOCK.implementationSha256;
  current.experimentBinding.modelImplementationSha256 = CURRENT_MODEL_LIBRARY_LOCK.implementationSha256;
  await assert.rejects(validateX49PrivateInit(current, crypto, manifest),
    { code: 'X49_PRIVATE_BINDING_MISMATCH' });
  const swapped = await init(); swapped.hex = ':0100000000FF';
  await assert.rejects(validateX49PrivateInit(swapped, crypto, manifest),
    { code: 'X49_PRIVATE_HEX_HASH_INVALID' });
  swapped.hexSha256 = createHash('sha256').update(swapped.hex).digest('hex');
  await assert.rejects(validateX49PrivateInit(swapped, crypto, manifest),
    { code: 'X49_PRIVATE_BINDING_MISMATCH' });
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
    await assert.rejects(validateX49PrivateInit(value, crypto, manifest));
  }
});

function completeTerminal(accepted, workerInitialization = 1, nonce = 'b'.repeat(32)) {
  const expected = accepted.expected;
  return x49PrivateTerminal({ receiptNonce: accepted.receiptNonce,
    runtimeIdentity: {
      ...structuredClone(accepted.runtimeBinding),
      schema: 'intent-mcu-worker-runtime-identity@2',
      workerInitialization, workerInstanceNonce: nonce,
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
  const accepted = await validateX49PrivateInit(await init(), crypto, manifest);
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
  const accepted = await validateX49PrivateInit(await init(), crypto, manifest);
  const drift = structuredClone(completeTerminal(accepted));
  drift.experimentBinding.graphIdentity = `sha256:${'8'.repeat(64)}`;
  assert.throws(() => x49PrivateObservation(accepted, drift),
    { code: 'X49_PRIVATE_TERMINAL_BINDING_INVALID' });
  const malformed = structuredClone(completeTerminal(accepted));
  malformed.evidence.retention.untrusted = 1;
  assert.throws(() => x49PrivateObservation(accepted, malformed),
    { code: 'X49_PRIVATE_TERMINAL_EVIDENCE_INVALID' });
});

test('both canonical cases share one context and form one accepted synthetic native report', async () => {
  const baseline = await validateX49PrivateInit(await init('baseline-offset-0', 10), crypto, manifest);
  const offset = await validateX49PrivateInit(await init('offset-plus-1', 11), crypto, manifest);
  assert.equal(baseline.experimentBinding.modelExecutionContextSha256,
    offset.experimentBinding.modelExecutionContextSha256);
  assert.deepEqual(baseline.experimentBinding, offset.experimentBinding);
  const cases = [x49PrivateObservation(baseline, completeTerminal(baseline, 1, 'b'.repeat(32))),
    x49PrivateObservation(offset, completeTerminal(offset, 1, 'c'.repeat(32)))];
  const report = await sealX49Report({ schema: X49_REPORT_SCHEMA, contractId: X49_CONTRACT_ID,
    experimentBinding: baseline.experimentBinding, cases, semanticSha256: '' });
  const projection = await validateX49AcceptedNativeReport(report);
  assert.equal(projection.academicStatus, 'passed');
  assert.notEqual(cases[0].runtimeIdentity.runtimeGeneration,
    cases[1].runtimeIdentity.runtimeGeneration);
  assert.notEqual(cases[0].runtimeIdentity.workerInstanceNonce,
    cases[1].runtimeIdentity.workerInstanceNonce);
});
