// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {
  X33_RUNTIME_REPORT_SCHEMA, X33_RUNTIME_SUITE, projectX33RuntimeRows,
  semanticX33RuntimeProjection, stableX33RuntimeStringify, validateX33RuntimeReport,
  x33RuntimeRepeatProjection, x33RuntimeReportPassed, x33RuntimeSha256,
  x33RuntimeSuiteIdentity, x33RuntimeTopologyIdentity,
} from '../src/x33-runtime-state-contract.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const artifactIdentity = 'a'.repeat(64);
const inputIdentity = 'b'.repeat(64);
const imageId = X33_RUNTIME_SUITE.toolchainImageId;
const pin = (name, mode, level, externalDrive = 'RELEASED') => ({
  pin: name, mode, level, externalDrive, pwm: null, diagnostic: 'OK',
});
const pins = () => ({ D2: pin('D2', 'INPUT', false), D3: pin('D3', 'OUTPUT', true),
  D4: pin('D4', 'OUTPUT', false), D5: pin('D5', 'INPUT', false, 'LOW') });

function repeat(label, generation, nonce, overrides = {}) {
  const runtimeBinding = { schema: 'intent-mcu-runtime-binding@1', projectGeneration: 33,
    runtimeGeneration: generation, artifactIdentity };
  const value = { repeat: label, runtimeBinding,
    runtimeIdentity: { schema: 'intent-mcu-worker-runtime-identity@1', projectGeneration: 33,
      runtimeGeneration: generation, artifactIdentity, workerInitialization: 2,
      workerInstanceNonce: nonce },
    marker: { text: 'X33_READY', observed: true, cycle: 19037 },
    pins: pins(), rows: null, drops: { logic: 0, serial: 0, adc: 0, unsupported: 0 } };
  Object.assign(value, overrides);
  value.rows ??= projectX33RuntimeRows(value.pins);
  return value;
}

async function report(repeats) {
  const value = { schema: X33_RUNTIME_REPORT_SCHEMA, suiteId: X33_RUNTIME_SUITE.suiteId,
    suiteSha256: await x33RuntimeSuiteIdentity(), profile: X33_RUNTIME_SUITE.profile,
    sourceSha256: X33_RUNTIME_SUITE.sourceSha256, artifactIdentity, inputIdentity,
    toolchainImageId: imageId, toolchainIdentitySha256: X33_RUNTIME_SUITE.toolchainIdentitySha256,
    runtime: structuredClone(X33_RUNTIME_SUITE.runtime),
    topology: structuredClone(X33_RUNTIME_SUITE.topology),
    topologySha256: await x33RuntimeTopologyIdentity(), repeats,
    repeatSemanticSha256: await x33RuntimeSha256(stableX33RuntimeStringify(
      x33RuntimeRepeatProjection(repeats[0]))),
    validationProbes: { rawFalseRejected: true, releasedLowRejected: true,
      highLowRejected: true, sameLevelConflictRejected: true, thirdEndpointRejected: true,
      staleRecordRejected: true, crossWorkerRejected: true, extraRecordRejected: true,
      malformedRecordRejected: true }, limits: structuredClone(X33_RUNTIME_SUITE.limits),
    semanticSha256: '' };
  value.semanticSha256 = await x33RuntimeSha256(stableX33RuntimeStringify(
    semanticX33RuntimeProjection(value)));
  return value;
}

test('X33 runtime contract accepts two fresh semantic worker repeats', async () => {
  const candidate = await report([repeat('A', 3301, '1'.repeat(32)), repeat('B', 3302, '2'.repeat(32))]);
  const accepted = await validateX33RuntimeReport(candidate);
  assert.equal(x33RuntimeReportPassed(accepted), true);
  assert.deepEqual(accepted.repeats[0].rows.map((row) => row.resolution), ['HIGH_Z', 'LOW', 'CONFLICT']);
  assert.deepEqual(accepted.repeats[0].rows.map((row) => row.requirement.academicVerdict), [null, 'passed', null]);
});

test('raw false never authorizes LOW and D5 requires external LOW', () => {
  const rawOnly = pins(); rawOnly.D2 = { pin: 'D2', level: false };
  assert.throws(() => projectX33RuntimeRows(rawOnly), { code: 'X33_RUNTIME_PIN_MALFORMED' });
  for (const drive of ['RELEASED', 'HIGH']) {
    const changed = pins(); changed.D5.externalDrive = drive;
    assert.throws(() => projectX33RuntimeRows(changed), { code: 'X33_RUNTIME_LOW_PRODUCER_INVALID' });
  }
});

test('conflict requires exact opposing output producers and exact two-endpoint topology', async () => {
  for (const changed of [
    (() => { const value = pins(); value.D3.level = false; return value; })(),
    (() => { const value = pins(); value.D4.mode = 'INPUT'; return value; })(),
  ]) assert.throws(() => projectX33RuntimeRows(changed), { code: 'X33_RUNTIME_CONFLICT_PRODUCERS_INVALID' });
  const missing = pins(); delete missing.D4;
  assert.throws(() => projectX33RuntimeRows(missing), { code: 'X33_RUNTIME_PIN_SET_INVALID' });
  const extra = structuredClone(X33_RUNTIME_SUITE.topology);
  extra.endpoints.push({ component: 'board-1', pin: 'D5' });
  assert.throws(() => projectX33RuntimeRows(pins(), extra), { code: 'X33_RUNTIME_TOPOLOGY_CHANGED' });
  await assert.rejects(x33RuntimeTopologyIdentity(extra), { code: 'X33_RUNTIME_TOPOLOGY_CHANGED' });
});

test('strict report rejects stale, cross-worker, duplicate-extra and malformed evidence atomically', async () => {
  const original = await report([repeat('A', 3301, '1'.repeat(32)), repeat('B', 3302, '2'.repeat(32))]);
  const mutations = [
    (value) => { value.sourceSha256 = '0'.repeat(64); },
    (value) => { value.repeats[1].runtimeIdentity.workerInstanceNonce = value.repeats[0].runtimeIdentity.workerInstanceNonce; },
    (value) => { value.repeats.push(structuredClone(value.repeats[1])); },
    (value) => { value.repeats[0].pins.D2.untrusted = true; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(original); mutate(candidate);
    await assert.rejects(validateX33RuntimeReport(candidate));
  }
  assert.equal(x33RuntimeReportPassed(await validateX33RuntimeReport(original)), true);
});

test('X33 runtime authority is transient across build reset edit open and reload boundaries', () => {
  const main = fs.readFileSync(new URL('../staging/main.mjs', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../staging/index.html', import.meta.url), 'utf8');
  assert.match(main, /invalidateDigitalStateRuntimeReport\('A new build cleared/u);
  assert.match(main, /invalidateDigitalStateRuntimeReport\('Reset cleared/u);
  assert.match(main, /Runtime worker retirement cleared the prior X33 runtime report/u);
  assert.match(main, /invalidateDigitalStateRuntimeReport\(message\)/u);
  assert.match(main, /projectopeninput[\s\S]+invalidateRegressionMatrixReport/u);
  assert.doesNotMatch(main, /persistProject\([^)]*digitalStateRuntimeReport/u);
  assert.match(html, /session-only review evidence\. Build, Reset, Open, source\/circuit\/profile change and reload clear export authority/u);
});
