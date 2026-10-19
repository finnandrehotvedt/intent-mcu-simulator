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
import { experimentPackageSha256 } from '../src/experiment-package.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK, RETAINED_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';

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
  assert.ok(CHECKABLE_EVIDENCE_ADAPTERS.every((item) => item.rowMaps.length > 0));
  assert.ok(CHECKABLE_EVIDENCE_ADAPTERS.flatMap((item) => item.rowMaps)
    .every((item) => !item.sourcePath.includes('**')
      && !/(^|\.)outcome(\.|$)|academicStatus/u.test(item.sourcePath)));
});

test('X82 makes retained native GPIO observations checkable without changing their authority', async () => {
  const source = await retainedReport();
  const sourceProject = { schema: 'intent-mcu-project-envelope@8', modelLibrary: RETAINED_MODEL_LIBRARY_LOCK,
    project: { name: 'X82 bound fixture' } };
  source.projectSha256 = await experimentPackageSha256(sourceProject);
  const report = await createCheckableEvidenceReport(source,
    { sourceProject });
  assert.equal(report.schema, CHECKABLE_EVIDENCE_REPORT_SCHEMA);
  assert.equal(report.sourceEnvelope.report.schema, source.schema);
  assert.equal(report.sourceEnvelope.measurementCompleteness.producerId, 'authored-scenario-avr');
  assert.equal(report.producer.evidenceClass, 'actual-runtime');
  assert.equal(report.producer.timeBasis, 'virtual-millisecond');
  assert.equal(report.modelContext.state, 'known');
  assert.equal(report.modelContext.lock.version, RETAINED_MODEL_LIBRARY_LOCK.version);
  assert.equal(report.measurements.length, 8);
  assert.ok(report.measurements.every((row) => row.value.state === 'known'));
  assert.ok(report.measurements.slice(0, 4).every((row) => row.unit.value === 'logic-level'));
  assert.ok(report.measurements.slice(4).every((row) => row.unit.value === 'mode'));
  assert.ok(report.measurements.every((row) => row.timeBasis === 'virtual-millisecond'));
  assert.ok(report.measurements.every((row) => row.observation.state === 'known'));
  assert.ok(report.measurements.every((row) => typeof row.value.value !== 'object'));
  assert.ok(report.limitations.some((row) => row.category === 'profile'));
  assert.ok(report.limitations.some((row) => row.category === 'model'));
  assert.deepEqual(await validateCheckableEvidenceReport(report), report);
  const text = canonicalCheckableEvidenceText(report);
  assert.equal(await checkableEvidenceDownloadSha256(report), await measurementSha256(text));

  const swapped = clone(report);
  swapped.modelContext.sourceProject.modelLibrary = CURRENT_MODEL_LIBRARY_LOCK;
  await assert.rejects(() => validateCheckableEvidenceReport(swapped),
    /CHECKABLE_EVIDENCE_MODEL_PROJECT_BINDING/u);
});

test('X82 never assumes current model context and maps missing native fields to unavailable', async () => {
  const source = await retainedReport();
  delete source.results[0].observed.level;
  const report = await createCheckableEvidenceReport(source);
  assert.deepEqual(report.modelContext, {
    state: 'unknown',
    reason: 'Source evidence did not carry a validated, report-bound model-library project; current was not assumed.',
  });
  assert.equal(report.measurements[0].value.state, 'unavailable');
  assert.match(report.measurements[0].value.reason, /no value was guessed or serialized/u);
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

test('X82 retained X29-X32 and X34 shapes expose only explicit primitive native fields', async () => {
  const fixtures = [
    ['x29-private-browser-evidence.json', 'intent-mcu-time-invariance-report@1'],
    ['x30-private-browser-evidence.json', 'intent-mcu-event-order-report@1'],
    ['x31-private-browser-evidence.json', 'intent-mcu-reset-class-report@1'],
    ['x32-private-browser-evidence.json', 'intent-mcu-unsupported-access-report@1'],
    ['x34-two-repeat-runtime.json', 'intent-mcu-x34-instrumented-precision-report@1'],
  ];
  for (const [filename, schema] of fixtures) {
    const source = JSON.parse(await readFile(new URL(`fixtures/${filename}`, import.meta.url), 'utf8'));
    source.schema = schema;
    if (filename.startsWith('x34-')) source.repeats = source.repeats.map((repeat) => ({
      ...repeat, repeat: repeat.repeatId, adc: repeat.transaction.adc,
      voltage: { value: repeat.a1.voltage },
    }));
    const report = await createCheckableEvidenceReport(source);
    const knownRows = report.measurements.filter((item) => item.value.state === 'known');
    assert.ok(knownRows.length > 0, filename);
    assert.ok(knownRows.every((item) => ['string', 'number', 'boolean'].includes(typeof item.value.value)), filename);
    assert.ok(report.measurements.every((item) => !/(^|\.)outcome(\.|$)|academicStatus/u.test(item.sourcePath)), filename);
    await validateCheckableEvidenceReport(report);
  }
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
