// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EXPERIMENT_PACKAGE_COMPARISON_LIMITS,
  compareExperimentPackages,
  parseExperimentComparisonSlot,
  validateExperimentComparisonContext,
  validateExperimentComparisonLimits,
} from '../src/experiment-package-comparison.mjs';
import { createCheckableEvidenceReport } from '../src/checkable-evidence-report.mjs';
import { THERMOSTAT_PROJECT_ADAPTER } from '../src/thermostat-experiment.mjs';

const PROFILE = 'board.atmega328p-16mhz-v1';
const adapters = Object.freeze({ [PROFILE]: THERMOSTAT_PROJECT_ADAPTER });
const beforePath = process.env.X41_BEFORE_PACKAGE;
const afterPath = process.env.X41_AFTER_PACKAGE;
const genuineAvailable = Boolean(beforePath && afterPath);
const clone = (value) => structuredClone(value);

async function genuine() {
  assert(genuineAvailable, 'X41_BEFORE_PACKAGE and X41_AFTER_PACKAGE are required');
  return Promise.all([readFile(beforePath, 'utf8'), readFile(afterPath, 'utf8')]);
}

test('X41 compares the original genuine pair deterministically without mutating it',
  { skip: !genuineAvailable }, async () => {
    const [beforeSource, afterSource] = await genuine();
    const beforeBytes = beforeSource; const afterBytes = afterSource;
    const first = await compareExperimentPackages({ beforeSource, afterSource, adapters,
      expectedBeforeSha256: '4b7d85dd0d0fce4d5b521c16c798730af6547d554f32c5f8895668f887530fc5',
      expectedAfterSha256: 'a0f6d2d40e8ade683e860a7d9767cd8ebd2109b6acdd0df7fd38081e2278b521' });
    const second = await compareExperimentPackages({ beforeSource, afterSource, adapters });
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.deepEqual(first.comparison, second.comparison);
    assert.equal(beforeSource, beforeBytes); assert.equal(afterSource, afterBytes);
    assert.equal(Object.isFrozen(first.comparison), true);

    const value = first.comparison;
    assert.equal(value.profile, PROFILE);
    assert.equal(value.experimentId, 'avr-thermostat-boundary-v1');
    assert.deepEqual(value.authority,
      { apply: false, build: false, run: false, replay: false, verdict: false });
    assert.match(value.limitation, /does not infer causality, correctness, a winner or a new verdict/u);
    assert.deepEqual(value.identityChanges, ['packageSha256', 'projectSha256', 'expectationSha256',
      'sourceSha256', 'circuitSha256', 'artifactSha256', 'reportSha256', 'manifestSha256']);
    assert.equal(value.before.identities.packageSha256,
      '4b7d85dd0d0fce4d5b521c16c798730af6547d554f32c5f8895668f887530fc5');
    assert.equal(value.after.identities.packageSha256,
      'a0f6d2d40e8ade683e860a7d9767cd8ebd2109b6acdd0df7fd38081e2278b521');
    assert.equal(value.source.diffs.length, 1);
    assert.match(value.source.diffs[0].text, /-  bool heating = enabled && temperatureC < SETPOINT_C;/u);
    assert.match(value.source.diffs[0].text, /\+  bool heating = enabled && temperatureC <= SETPOINT_C;/u);
    assert.equal(value.circuit.rows.length, 1);
    assert.equal(value.circuit.rows[0].ownerId, 'heater-led-1');
    assert.deepEqual(value.circuit.rows[0].fields.map((field) =>
      [field.path, field.before, field.after]), [['properties.color', 'red', 'green']]);
    assert.equal(value.results.length, 4);
    assert.deepEqual(value.results.filter((row) => row.changed).map((row) => row.id),
      ['THERM-SCENARIO-EQUALITY-ENABLED']);
    const equality = value.results.find((row) => row.id === 'THERM-SCENARIO-EQUALITY-ENABLED');
    assert.equal(equality.expected.level, false);
    assert.equal(equality.before.observed.level, false);
    assert.equal(equality.after.observed.level, true);
    assert.equal(equality.after.evidenceStatus, 'complete');
    assert.equal(value.before.reportedAcademicStatus, 'passed');
    assert.equal(value.after.reportedAcademicStatus, 'failed');
    assert.deepEqual(value.compatibility, {
      normalizedExpectationsEqual: true, scenariosEqual: true, modelsEqual: true,
      toolsEqual: true, evidenceContextEqual: true,
      evidenceAdapterId: 'x82-authored-gpio-v2', evidenceClass: 'actual-runtime',
      nativeTimeBasis: 'virtual-millisecond', evidenceRows: 8,
    });
  });

test('X41 context owner rejects every compatibility drift class',
  { skip: !genuineAvailable }, async () => {
    const [beforeSource, afterSource] = await genuine();
    const beforeSlot = await parseExperimentComparisonSlot(beforeSource, adapters, 'before');
    const afterSlot = await parseExperimentComparisonSlot(afterSource, adapters, 'after');
    assert(beforeSlot.ok && afterSlot.ok);
    const beforeEvidence = await createCheckableEvidenceReport(beforeSlot.value.report,
      { sourceProject: beforeSlot.value.project });
    const afterEvidence = await createCheckableEvidenceReport(afterSlot.value.report,
      { sourceProject: afterSlot.value.project });
    const expectCode = (mutate, code) => {
      const before = clone(beforeSlot.value); const after = clone(afterSlot.value);
      const leftEvidence = clone(beforeEvidence); const rightEvidence = clone(afterEvidence);
      mutate({ before, after, beforeEvidence: leftEvidence, afterEvidence: rightEvidence });
      assert.equal(validateExperimentComparisonContext(before, after, leftEvidence, rightEvidence).code, code);
    };
    expectCode(({ after }) => { after.profile = 'board.rp2040-pico-v1'; }, 'X41_PROFILE_MISMATCH');
    expectCode(({ after }) => { after.experimentId = 'other'; }, 'X41_EXPERIMENT_MISMATCH');
    expectCode(({ after }) => { after.expectation.boundaryCases.push('changed'); }, 'X41_EXPECTATION_MISMATCH');
    expectCode(({ after }) => { after.project.scenarioTimeline.scenarios.reverse(); }, 'X41_SCENARIO_MISMATCH');
    expectCode(({ after }) => { after.manifest.modelLibrary.version = 'retained'; }, 'X41_MODEL_MISMATCH');
    expectCode(({ after }) => { after.manifest.tools.compiler.imageId = 'sha256:'.padEnd(71, '0'); }, 'X41_TOOL_MISMATCH');
    for (const mutation of [
      ({ afterEvidence }) => { afterEvidence.producer.adapterId = 'other'; },
      ({ afterEvidence }) => { afterEvidence.measurements.reverse(); },
      ({ afterEvidence }) => { afterEvidence.measurements[0].kind = 'other'; },
      ({ afterEvidence }) => { afterEvidence.measurements[0].channelId = 'other'; },
      ({ afterEvidence }) => { afterEvidence.measurements[0].sourcePath = 'other'; },
      ({ afterEvidence }) => { afterEvidence.measurements[0].unit.value = 'volt'; },
      ({ afterEvidence }) => { afterEvidence.measurements[0].timeBasis = 'wall-clock'; },
    ]) expectCode(mutation, 'X41_EVIDENCE_CONTEXT_MISMATCH');
  });

test('X41 rejects same, stale, tampered, historical, invalid and oversized inputs atomically',
  { skip: !genuineAvailable }, async () => {
    const [beforeSource, afterSource] = await genuine();
    assert.equal((await compareExperimentPackages({ beforeSource, afterSource: beforeSource, adapters })).code,
      'X41_SAME_PACKAGE');
    assert.equal((await compareExperimentPackages({ beforeSource, afterSource, adapters,
      expectedAfterSha256: '0'.repeat(64) })).code, 'X41_STALE_SLOT');
    assert.equal((await parseExperimentComparisonSlot('{"schema":"bad"}\n', adapters)).ok, false);
    assert.equal((await parseExperimentComparisonSlot(
      beforeSource.replace('intent-mcu-experiment-package@3', 'intent-mcu-experiment-package@2'), adapters)).ok, false);
    assert.equal((await parseExperimentComparisonSlot(
      afterSource.replace('2.0.0-x56-current', '2.0.0-x56-forged'), adapters)).ok, false);
    assert.equal((await parseExperimentComparisonSlot('x'.repeat(
      EXPERIMENT_PACKAGE_COMPARISON_LIMITS.packageBytes + 1), adapters)).code, 'X41_PACKAGE_LIMIT');
  });

test('X41 enforces package, source and rendered-row limits without truncation', () => {
  assert.deepEqual(EXPERIMENT_PACKAGE_COMPARISON_LIMITS,
    { packageBytes: 2 * 1024 * 1024, sourceFiles: 8, sourceBytes: 128 * 1024, renderedRows: 2000 });
  assert.equal(validateExperimentComparisonLimits({ packageBytes: 2 * 1024 * 1024 }).ok, true);
  assert.equal(validateExperimentComparisonLimits({ packageBytes: 2 * 1024 * 1024 + 1 }).code,
    'X41_PACKAGE_LIMIT');
  assert.equal(validateExperimentComparisonLimits({ files: Array.from({ length: 8 }, (_, index) =>
    ({ name: `file-${index}.ino`, content: '' })) }).ok, true);
  assert.equal(validateExperimentComparisonLimits({ files: Array.from({ length: 9 }, (_, index) =>
    ({ name: `file-${index}.ino`, content: '' })) }).code, 'X41_SOURCE_LIMIT');
  assert.equal(validateExperimentComparisonLimits({ files: [{ name: 'main.ino',
    content: 'x'.repeat(128 * 1024 + 1) }] }).code, 'X41_SOURCE_LIMIT');
  assert.equal(validateExperimentComparisonLimits({ renderedRows: 2000 }).ok, true);
  assert.equal(validateExperimentComparisonLimits({ renderedRows: 2001 }).code, 'X41_RENDER_LIMIT');
});
