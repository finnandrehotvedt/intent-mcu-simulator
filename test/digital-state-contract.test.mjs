// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

import {
  DIGITAL_STATE_REPORT_SCHEMA, X33_DIGITAL_STATE_SUITE, digitalStateReportPassed,
  digitalStateSha256, digitalStateSuiteIdentity, semanticDigitalStateProjection,
  stableDigitalStateStringify, validateDigitalStateAnnotations, validateDigitalStateReport,
  validateDigitalStateSuite,
} from '../src/digital-state-contract.mjs';
import { runDigitalStateRepeat } from '../src/digital-state-runner.mjs';

async function reportFixture() {
  const repeats = X33_DIGITAL_STATE_SUITE.repeats.map((repeat) => runDigitalStateRepeat(repeat));
  const repeatSemanticSha256 = await digitalStateSha256(stableDigitalStateStringify({
    rows: repeats[0].rows, pullupCompanion: repeats[0].pullupCompanion,
  }));
  const report = {
    schema: DIGITAL_STATE_REPORT_SCHEMA, suiteId: X33_DIGITAL_STATE_SUITE.suiteId,
    suiteSha256: await digitalStateSuiteIdentity(), profile: X33_DIGITAL_STATE_SUITE.profile,
    fixtureId: X33_DIGITAL_STATE_SUITE.fixtureId, label: X33_DIGITAL_STATE_SUITE.label,
    repeats, repeatSemanticSha256,
    strictParserProbe: { status: 'rejected-before-resolution', code: 'DIGITAL_STATE_ANNOTATION_UNKNOWN',
      resolverCalled: false, equalLevelsDistinctProducersAccepted: true },
    staleRecordProbe: { status: 'rejected-atomically',
      code: 'DIGITAL_STATE_REPORT_STALE_OR_UNKNOWN', priorReportRetained: true },
    limits: structuredClone(X33_DIGITAL_STATE_SUITE.limits), semanticSha256: '',
  };
  report.semanticSha256 = await digitalStateSha256(stableDigitalStateStringify(
    semanticDigitalStateProjection(report)));
  return report;
}

test('X33 suite is one closed static synthetic AVR circuit-model check', async () => {
  assert.equal(validateDigitalStateSuite().label, 'STATIC SYNTHETIC CIRCUIT-MODEL CHECK');
  assert.equal((await digitalStateSuiteIdentity()).length, 64);
  assert.equal(X33_DIGITAL_STATE_SUITE.limits.compiledFirmware, false);
  assert.equal(X33_DIGITAL_STATE_SUITE.limits.runtimeExecution, false);
});

test('X33 parser rejects unknown before resolver and distinguishes producer identity from equal levels', () => {
  assert.throws(() => validateDigitalStateAnnotations([{ producerId: 'a', level: 'UNKNOWN' }]),
    /DIGITAL_STATE_ANNOTATION_UNKNOWN/u);
  assert.throws(() => validateDigitalStateAnnotations([
    { producerId: 'same', level: 'HIGH_Z' }, { producerId: 'same', level: 'HIGH_Z' },
  ]), /DIGITAL_STATE_PRODUCER_DUPLICATE/u);
  assert.deepEqual(validateDigitalStateAnnotations([
    { producerId: 'first', level: 'HIGH_Z' }, { producerId: 'second', level: 'HIGH_Z' },
  ]).map((item) => item.level), ['HIGH_Z', 'HIGH_Z']);
});

test('X33 repeat separates LOW high-Z conflict unknown evidence and pull-up', () => {
  const repeat = runDigitalStateRepeat('A');
  assert.deepEqual(repeat.rows.map((row) => row.disposition),
    ['resolved-low', 'high-impedance', 'conflict', 'unknown-evidence']);
  assert.deepEqual(repeat.rows.map((row) => row.outcome?.academicStatus ?? null),
    ['passed', 'indeterminate', null, 'indeterminate']);
  assert.equal(repeat.rows[2].validation.code, 'OUTPUT_CONTENTION');
  assert.equal(repeat.pullupCompanion.resolution, 'PULLED_HIGH');
});

test('X33 strict report accepts two semantic repeats and rejects stale or malformed atomically', async () => {
  const report = await reportFixture();
  assert.deepEqual(await validateDigitalStateReport(report), report);
  assert.equal(digitalStateReportPassed(report), true);
  const stale = structuredClone(report); stale.fixtureId = 'stale-fixture';
  await assert.rejects(validateDigitalStateReport(stale), /DIGITAL_STATE_REPORT_STALE_OR_UNKNOWN/u);
  const extra = structuredClone(report); extra.untrusted = true;
  await assert.rejects(validateDigitalStateReport(extra), /DIGITAL_STATE_REPORT_STALE_OR_UNKNOWN/u);
});

test('X33 missing evidence never invents an UNKNOWN driver and cannot pass', async () => {
  const report = await reportFixture();
  const missing = report.repeats[0].rows[3];
  assert.deepEqual(missing.producerAnnotations, []);
  assert.equal(missing.resolution.state, null);
  assert.equal(missing.outcome.academicStatus, 'indeterminate');
  assert.equal(report.repeats.flatMap((repeat) => repeat.rows)
    .some((row) => row.producerAnnotations.some((item) => item.level === 'UNKNOWN')), false);
});

test('X33 report authority is explicitly retired by every new Build', async () => {
  const main = await readFile(new URL('../staging/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /invalidateDigitalStateReport\('A new build cleared the prior X33 report/u);
});
