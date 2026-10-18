// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  LONG_DURATION_REPORT_SCHEMA, X28_GOOD_SOURCE, X28_KNOWN_BAD_SOURCE, X28_LONG_DURATION_SUITE,
  longDurationSuiteIdentity, semanticLongDurationProjection, validateLongDurationReport,
  validateLongDurationSuite,
} from '../src/long-duration-contract.mjs';
import { completedExperimentOutcome } from '../src/experiment-outcomes.mjs';
import { sha256Text, stableStringify } from '../src/regression-matrix-contract.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
const clone = (value) => structuredClone(value);
const hash = (character) => character.repeat(64);

test('X28 contract pins exact fixture sources, three cells, windows and explicit limits', async () => {
  const suite = await validateLongDurationSuite(X28_LONG_DURATION_SUITE);
  assert.equal(suite.cells.length, 3);
  assert.deepEqual(suite.cells.map((cell) => cell.cellId), [
    'X28-MILLIS-UNSIGNED-WRAP', 'X28-FIVE-RESET-EPOCHS', 'X28-128-ORDERED-D2',
  ]);
  assert.equal(suite.fixture.sourceSha256, await sha256Text(X28_GOOD_SOURCE));
  assert.equal(suite.fixture.knownBadSourceSha256, await sha256Text(X28_KNOWN_BAD_SOURCE));
  assert.equal(suite.cells[1].resetEpochs, 5);
  assert.equal(suite.cells[2].eventCount, 128);
  assert.equal(suite.cells[2].minimumVirtualMilliseconds, 2048);
  assert.equal(suite.limits.physicalTimeClaimed, false);
});

test('X28 strict suite rejects drift, duplicate cells and source hash substitution', async () => {
  for (const mutate of [
    (value) => { value.extra = true; },
    (value) => { value.cells[2].cellId = value.cells[1].cellId; },
    (value) => { value.fixture.sourceSha256 = hash('0'); },
    (value) => { value.profile = 'board.rp2040-pico-v1'; },
  ]) {
    const candidate = clone(X28_LONG_DURATION_SUITE); mutate(candidate);
    await assert.rejects(validateLongDurationSuite(candidate), /LONG_DURATION_/u);
  }
});

test('X28 report keeps raw observed time outside semantic identity and rejects stale bindings', async () => {
  const suite = await validateLongDurationSuite();
  const outcome = completedExperimentOutcome({ assertions: [{ code: 'EXAMPLE', passed: true }] });
  const results = suite.cells.map((cell) => ({ cellId: cell.cellId, expected: clone(cell.expected), actual: {}, outcome,
    rawVirtualTime: { timebase: 'avr8js-cycles', cycle: 1 }, durationMilliseconds: 1 }));
  const report = {
    schema: LONG_DURATION_REPORT_SCHEMA, suiteId: suite.suiteId,
    suiteSha256: await longDurationSuiteIdentity(suite), profile: suite.profile,
    fixtureSha256: suite.fixture.sourceSha256, sourceSha256: suite.fixture.sourceSha256,
    artifactSha256: hash('a'), producer: 'RuntimeKernel/avr8js 0.21.1 from compiler-generated HEX', results,
    knownBad: { sourceSha256: suite.fixture.knownBadSourceSha256, artifactSha256: hash('b'), actual: {}, outcome,
      rawVirtualTime: { timebase: 'avr8js-cycles', cycle: 1 }, durationMilliseconds: 1 },
    limits: clone(suite.limits),
  };
  report.semanticSha256 = await sha256Text(stableStringify(semanticLongDurationProjection(report)));
  await validateLongDurationReport(report);
  const changedRaw = clone(report);
  changedRaw.results[0].rawVirtualTime.cycle = 999;
  changedRaw.results[0].durationMilliseconds = 999;
  assert.equal(await sha256Text(stableStringify(semanticLongDurationProjection(changedRaw))), report.semanticSha256);
  await validateLongDurationReport(changedRaw);
  const stale = clone(report); stale.artifactSha256 = hash('c');
  await assert.rejects(validateLongDurationReport(stale), /STALE_OR_UNKNOWN/u);
  const unknown = clone(report); unknown.results[0].extra = true;
  await assert.rejects(validateLongDurationReport(unknown), /STALE_OR_UNKNOWN/u);
});
