// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CHECKABLE_EVIDENCE_ADAPTERS,
  CHECKABLE_EVIDENCE_REPORT_SCHEMA,
  CHECKABLE_EVIDENCE_TRUTH_BOUNDARY,
  canonicalCheckableEvidenceText,
  checkableEvidenceDownloadSha256,
  createCheckableEvidenceReport,
  validateCheckableEvidenceReport,
} from '../src/checkable-evidence-report.mjs';
import { MEASUREMENT_PRODUCER_REGISTRY, measurementSha256 } from '../src/measurement-completeness.mjs';
import { RETAINED_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';

const clone = (value) => structuredClone(value);
const retainedReport = async () => JSON.parse(await readFile(new URL(
  'fixtures/x80-authored-scenario-report.json', import.meta.url), 'utf8'));

test('X82 has one explicit finite-path adapter for every registered report and surface owner', () => {
  const owners = [...MEASUREMENT_PRODUCER_REGISTRY.reportOwners,
    ...MEASUREMENT_PRODUCER_REGISTRY.surfaceOwners];
  assert.equal(owners.length, 27);
  assert.equal(CHECKABLE_EVIDENCE_ADAPTERS.length, 27);
  assert.deepEqual(new Set(CHECKABLE_EVIDENCE_ADAPTERS.map((item) => item.reportSchema)),
    new Set(owners.map((item) => item.reportSchema)));
  assert.ok(CHECKABLE_EVIDENCE_ADAPTERS.every((item) => item.adapterId.startsWith('x82-')));
  assert.ok(CHECKABLE_EVIDENCE_ADAPTERS.every((item) => !item.sourcePath.includes('**')));
});

test('X82 makes retained native GPIO observations checkable without changing their authority', async () => {
  const source = await retainedReport();
  const report = await createCheckableEvidenceReport(source,
    { modelLibraryLock: RETAINED_MODEL_LIBRARY_LOCK });
  assert.equal(report.schema, CHECKABLE_EVIDENCE_REPORT_SCHEMA);
  assert.equal(report.sourceEnvelope.report.schema, source.schema);
  assert.equal(report.sourceEnvelope.measurementCompleteness.producerId, 'authored-scenario-avr');
  assert.equal(report.producer.evidenceClass, 'actual-runtime');
  assert.equal(report.producer.timeBasis, 'virtual-millisecond');
  assert.equal(report.modelContext.state, 'known');
  assert.equal(report.modelContext.lock.version, RETAINED_MODEL_LIBRARY_LOCK.version);
  assert.equal(report.measurements.length, 4);
  assert.ok(report.measurements.every((row) => row.value.state === 'known'));
  assert.ok(report.measurements.every((row) => row.unit.value === 'logic-level'));
  assert.ok(report.measurements.every((row) => row.timeBasis === 'virtual-millisecond'));
  assert.ok(report.measurements.every((row) => row.sourcePath === 'results[].observed.level'));
  assert.ok(report.limitations.some((row) => row.category === 'profile'));
  assert.ok(report.limitations.some((row) => row.category === 'model'));
  assert.deepEqual(await validateCheckableEvidenceReport(report), report);
  const text = canonicalCheckableEvidenceText(report);
  assert.equal(await checkableEvidenceDownloadSha256(report), await measurementSha256(text));
});

test('X82 never assumes current model context and maps missing native fields to unavailable', async () => {
  const source = await retainedReport();
  delete source.results[0].observed.level;
  const report = await createCheckableEvidenceReport(source);
  assert.deepEqual(report.modelContext, {
    state: 'unknown',
    reason: 'Source evidence did not carry a validated model-library lock; current was not assumed.',
  });
  assert.equal(report.measurements[0].value.state, 'unavailable');
  assert.match(report.measurements[0].value.reason, /no measurement was guessed/u);
  assert.ok(report.limitations.some((row) => row.category === 'model'
    && row.text.includes('current was not assumed')));
  assert.equal(report.outcome.reportedAcademicStatus, 'passed');
  assert.equal(report.outcome.effectiveAcademicStatus, 'indeterminate');
});

test('X82 strict canonical validation rejects forged value, unit, time, limit, outcome and hashes', async () => {
  const baseline = await createCheckableEvidenceReport(await retainedReport());
  const mutations = [
    (value) => { value.measurements[0].value.value = !value.measurements[0].value.value; },
    (value) => { value.measurements[0].unit.value = 'volt'; },
    (value) => { value.measurements[0].timeBasis = 'wall-clock'; },
    (value) => { value.limitations[0].text += ' forged'; },
    (value) => { value.outcome.effectiveAcademicStatus = 'failed'; },
    (value) => { value.integrity.reportSha256 = '0'.repeat(64); },
    (value) => { value.truthBoundary = 'hash proves truth'; },
    (value) => { value.sourceEnvelope.report.results[0].observed.level = false; },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const value = clone(baseline); mutate(value);
    await assert.rejects(() => validateCheckableEvidenceReport(value),
      /CHECKABLE_EVIDENCE|MEASUREMENT_REPORT/u, `mutation ${index} must fail closed`);
  }
  assert.equal(baseline.truthBoundary, CHECKABLE_EVIDENCE_TRUTH_BOUNDARY);
});

test('X82 report is deterministic and the compact surface remains local, transient and producer-free', async () => {
  const source = await retainedReport();
  const first = await createCheckableEvidenceReport(source);
  const second = await createCheckableEvidenceReport(clone(source));
  assert.equal(canonicalCheckableEvidenceText(first), canonicalCheckableEvidenceText(second));
  const [main, html] = await Promise.all([
    readFile(new URL('../staging/main.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../staging/index.html', import.meta.url), 'utf8'),
  ]);
  assert.match(main, /window\.__CHECKABLE_EVIDENCE__/u);
  assert.match(main, /clearCheckableEvidenceReport\(message\)/u);
  assert.match(main, /canonicalCheckableEvidenceText/u);
  assert.doesNotMatch(main.slice(main.indexOf('function renderCheckableEvidence'),
    main.indexOf('function applyMeasurementPresentation')), /\b(build|runBrowser|Worker)\s*\(/u);
  assert.match(html, /Strict source-owned measurements · local JSON only/u);
  assert.match(html, /Hashes bind identity and integrity only/u);
});
