// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  X26_VERSION_RELEASES, acceptedX26VersionReport, validateX26VersionReport,
  x26SyntheticExpectationMutation, x26VersionReportPassed,
} from '../src/x26-version-regression-contract.mjs';

const clone = (value) => structuredClone(value);
globalThis.crypto ??= webcrypto;

test('X26 version report binds two real releases to one unchanged four-case matrix', async () => {
  const report = await acceptedX26VersionReport();
  assert.deepEqual(X26_VERSION_RELEASES.map((item) => item.version), ['1.1.0-rc.49', '1.1.0-rc.60']);
  assert.equal(new Set(X26_VERSION_RELEASES.map((item) => item.executionNonce)).size, 2);
  assert.equal(report.results.length, 4);
  assert.equal(report.results.flatMap((item) => item.releases).length, 8);
  assert.equal(report.comparisonPolicy.samePinnedModelToolchainRuntimeSet, true);
  assert.equal(report.comparisonPolicy.compilerVersionComparison, false);
  assert.equal(report.comparisonPolicy.hardwareRevisionComparison, false);
  assert.equal(report.comparisonPolicy.compareRawTimeValues, false);
  assert.equal(x26VersionReportPassed(await validateX26VersionReport(report)), true);
});

test('X26 version report rejects every mandatory identity and row drift', async () => {
  const mutations = [
    (value) => { value.releases[0].commit = '0'.repeat(40); },
    (value) => { value.releases[1].version = '1.1.0-rc.59'; },
    (value) => { value.releases[0].imageId = `sha256:${'0'.repeat(64)}`; },
    (value) => { value.matrixSha256 = '0'.repeat(64); },
    (value) => { value.requirementFamilyId = 'OTHER'; },
    (value) => { value.results[0].fixtureSha256 = '0'.repeat(64); },
    (value) => { value.results[0].sourceSha256 = '0'.repeat(64); },
    (value) => { value.results[0].profile = value.results[1].profile; },
    (value) => { value.results[0].scenarioId = 'other'; },
    (value) => { value.results.pop(); },
    (value) => { value.results.push(clone(value.results[0])); },
    (value) => { value.releases[1].executionNonce = value.releases[0].executionNonce; },
    (value) => { value.results[0].releases[0].outcome.academicStatus = 'failed'; },
    (value) => { value.comparisonPolicy.compareRawTimeValues = true; },
    (value) => { value.comparisonPolicy.compilerVersionComparison = true; },
  ];
  for (const mutate of mutations) {
    const value = clone(await acceptedX26VersionReport()); mutate(value);
    await assert.rejects(validateX26VersionReport(value), /X26_VERSION_REPORT_DRIFT/u);
  }
});

test('synthetic expectation mutation is data-only, separate and rejected', async () => {
  const accepted = await acceptedX26VersionReport();
  const mutated = await x26SyntheticExpectationMutation();
  assert.equal(accepted.results[1].releases[1].expected.gpio0, true);
  assert.equal(mutated.results[1].releases[1].expected.gpio0, false);
  assert.equal(mutated.results[1].releases[1].actual.gpio0, true);
  await assert.rejects(validateX26VersionReport(mutated), /X26_VERSION_REPORT_DRIFT/u);
});
