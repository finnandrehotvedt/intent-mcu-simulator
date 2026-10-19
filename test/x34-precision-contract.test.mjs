// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  X34_PRECISION_SUITE, X34_REPORT_SCHEMA, evaluateX34Repeat, semanticX34Projection,
  stableX34Stringify, validateX34Report, x34RepeatProjection, x34ReportPassed,
  x34Sha256, x34SuiteIdentity,
} from '../src/x34-precision-contract.mjs';

const artifactIdentity = 'a'.repeat(64);
const sourceSha256 = 'b'.repeat(64);
const elfSha256 = 'c'.repeat(64);
const symbol = { symbol: 'intent_x34_probe_v1', dataAddress: 256, size: 4,
  elfSha256, binding: 'global', type: 'object' };

function repeat(label, generation, nonce, overrides = {}) {
  const runtimeBinding = { schema: 'intent-mcu-runtime-binding@1', projectGeneration: 7,
    runtimeGeneration: generation, artifactIdentity };
  const runtimeIdentity = { schema: 'intent-mcu-worker-runtime-identity@1', projectGeneration: 7,
    runtimeGeneration: generation, artifactIdentity, workerInitialization: 2, workerInstanceNonce: nonce };
  const transaction = { schema: 'intent-mcu-x34-firmware-producer@1', fixtureId: X34_PRECISION_SUITE.fixtureId,
    sourceSha256, artifactIdentity, symbol, commit: 2, temperatureC: 30, d13Level: 0,
    beginPc: 946, beginCycle: 6172, commitPc: 957, commitPcAfter: 959, commitCycle: 6183,
    adc: { channel: 1, startCycle: 2224, sampleCycles: 3200, completionCycle: 5424, value: 414 },
    pinObservation: { pin: 'D13', mode: 'OUTPUT', level: false, externalDrive: 'RELEASED', pwm: null, diagnostic: 'OK' },
    writes: [
      { pcBefore: 946, pcAfter: 948, cycle: 6172, changedOffsets: [0], before: [0, 0, 128, 255], after: [1, 0, 128, 255] },
      { pcBefore: 948, pcAfter: 950, cycle: 6174, changedOffsets: [2], before: [1, 0, 128, 255], after: [1, 0, 0, 255] },
      { pcBefore: 950, pcAfter: 952, cycle: 6176, changedOffsets: [1], before: [1, 0, 0, 255], after: [1, 30, 0, 255] },
      { pcBefore: 952, pcAfter: 954, cycle: 6178, changedOffsets: [3], before: [1, 30, 0, 255], after: [1, 30, 0, 0] },
      { pcBefore: 957, pcAfter: 959, cycle: 6183, changedOffsets: [0], before: [1, 30, 0, 0], after: [2, 30, 0, 0] },
    ],
    ...(overrides.transaction ?? {}) };
  const value = { repeat: label, runtimeBinding, runtimeIdentity,
    control: { temperatureC: 31, buttonPressed: true, targetCycle: 0 },
    voltage: { value: 2.0250000000000004, numerator: 81, denominator: 40, unit: 'V', producer: 'circuit-model A1' },
    adc: { channel: 1, startCycle: 2224, sampleCycles: 3200, completionCycle: 5424, value: 414 },
    firmwareTransaction: transaction,
    pin: { pin: 'D13', mode: 'OUTPUT', level: false, externalDrive: 'RELEASED', pwm: null, diagnostic: 'OK' },
    time: { cpuCycles: 2_560_000, virtualNanoseconds: 160_000_000, producer: 'X29 16 MHz cycle contract' },
    outcome: null };
  Object.assign(value, overrides.repeat ?? {});
  value.outcome = evaluateX34Repeat(value);
  return value;
}

async function report(repeats) {
  const value = { schema: X34_REPORT_SCHEMA, suiteId: X34_PRECISION_SUITE.suiteId,
    suiteSha256: await x34SuiteIdentity(), fixtureId: X34_PRECISION_SUITE.fixtureId,
    sourceSha256, artifactIdentity, symbol, repeats,
    repeatSemanticSha256: await x34Sha256(stableX34Stringify(x34RepeatProjection(repeats[0]))),
    validationProbes: { staleGenerationRejected: true, serialOnlyCannotPass: true,
      hostRecomputationCannotPass: true, genericMemoryApiExposed: false },
    limits: structuredClone(X34_PRECISION_SUITE.limits), semanticSha256: '' };
  value.semanticSha256 = await x34Sha256(stableX34Stringify(semanticX34Projection(value)));
  return value;
}

test('two fresh bound repeats accept with nonce excluded from semantic equality', async () => {
  const candidate = await report([repeat('A', 4, '1'.repeat(32)), repeat('B', 6, '2'.repeat(32))]);
  const accepted = await validateX34Report(candidate);
  assert.equal(x34ReportPassed(accepted), true);
  assert.equal(accepted.repeats[0].runtimeIdentity.workerInstanceNonce === accepted.repeats[1].runtimeIdentity.workerInstanceNonce, false);
});

test('producer mismatches fail their affected assertion and cannot pass', async () => {
  for (const [name, overrides, check] of [
    ['mailbox integer', { transaction: { temperatureC: 31 } }, 'committedFirmwareInteger'],
    ['mailbox D13', { transaction: { d13Level: 1 } }, 'firmwareD13'],
    ['ADC drift', { repeat: { adc: { channel: 1, startCycle: 2224, sampleCycles: 3200, completionCycle: 5424, value: 415 } } }, 'adcProducer'],
    ['actual pin', { repeat: { pin: { pin: 'D13', mode: 'OUTPUT', level: true, externalDrive: 'RELEASED', pwm: null, diagnostic: 'OK' } } }, 'actualPin'],
  ]) {
    const bad = repeat('A', 4, '1'.repeat(32), overrides);
    assert.equal(bad.outcome.checks[check], false, name);
    assert.equal(bad.outcome.academicStatus, 'failed', name);
  }
});

test('odd/incomplete, Serial-only and host-recomputed values never create a pass', () => {
  const base = repeat('A', 4, '1'.repeat(32));
  for (const incomplete of [
    { ...base, firmwareTransaction: null, serialText: 'TEMP_C=30' },
    { ...base, firmwareTransaction: { commit: 1, writes: [] }, hostRecomputedTemperatureC: 30 },
  ]) {
    const outcome = evaluateX34Repeat(incomplete);
    assert.equal(outcome.academicStatus, 'indeterminate');
    assert.equal(outcome.jobStatus, 'completed');
  }
});

test('stale generation and nonce reuse reject before an academic report is accepted', async () => {
  const same = [repeat('A', 4, '1'.repeat(32)), repeat('B', 4, '1'.repeat(32))];
  await assert.rejects(validateX34Report(await report(same)), { code: 'X34_RUNTIME_GENERATION_NOT_FRESH' });
});
