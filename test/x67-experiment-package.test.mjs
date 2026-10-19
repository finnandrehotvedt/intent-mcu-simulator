// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  EXPERIMENT_PACKAGE_LIMITATIONS,
  createExperimentPackage,
  parseExperimentPackage,
} from '../src/experiment-package.mjs';
import { completedExperimentOutcome } from '../src/experiment-outcomes.mjs';
import { createExpectationReference } from '../src/expectation-reference.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';
import { defaultThermostatScenarioTimeline } from '../src/scenario-timeline.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const PROFILE = 'board.atmega328p-16mhz-v1';
const HASH = 'a'.repeat(64);
const adapters = Object.freeze({
  [PROFILE]: Object.freeze({
    schemas: Object.freeze(['x67-test-project@1']),
    prepare(value) { return { project: structuredClone(value), preserved: ['source', 'circuit'] }; },
  }),
});

function brief() {
  return {
    ...emptyProjectBrief(),
    acceptanceCriteria: [{ id: 'REQ_X67', text: 'Export current evidence.', codeRefs: ['main.ino:1'], testRefs: ['TEST_X67'] }],
    requiredCapabilities: [{ id: 'CAP_LED', kind: 'component', target: 'led.basic-v1', requirementIds: ['REQ_X67'] }],
  };
}

function projectText(source = 'const char *note = "password=human-authored-review-required";') {
  return canonicalProjectEnvelope(PROFILE, {
    schema: 'x67-test-project@1', profile: PROFILE, name: 'X67 test',
    source: { files: [{ name: 'main.ino', content: source }] },
    circuit: { components: [], nets: [] },
  }, adapters, brief(), defaultThermostatScenarioTimeline());
}

function resultFor(scenario, level = scenario.events.at(-1).level) {
  const expected = scenario.events.at(-1);
  const passed = level === expected.level;
  return {
    schema: 'intent-mcu-scenario-observation-result@1',
    scenarioId: scenario.id,
    status: passed ? 'passed' : 'failed',
    outcome: completedExperimentOutcome({
      evidence: [{ code: 'EVIDENCE_COMPLETE', complete: true }],
      assertions: [{ code: 'EXPECTED_PIN_LEVEL_MISMATCH', passed }],
    }),
    virtualMilliseconds: expected.atMilliseconds,
    expected: { eventId: expected.id, pin: expected.pin, level: expected.level,
      observationWindow: { startMilliseconds: expected.atMilliseconds,
        endMilliseconds: expected.throughMilliseconds } },
    observed: { pin: expected.pin, mode: 'OUTPUT', level,
      captureWindow: { minimumMilliseconds: expected.atMilliseconds,
        maximumMilliseconds: expected.throughMilliseconds } },
    checks: { timeInWindow: true, inputsComplete: true, pinObserved: true,
      primaryExecutedPin: passed, faultRequestsComplete: true,
      faultProducerEvidenceComplete: true, faultBehaviorMatched: true },
    retention: { inputEventsDropped: 0, serialEventsDropped: 0 },
  };
}

async function fixture({ source, resultMutation } = {}) {
  const text = projectText(source);
  const expectation = await createExpectationReference(text, adapters, PROFILE);
  const timeline = defaultThermostatScenarioTimeline();
  const results = timeline.scenarios.map((scenario) => resultFor(scenario));
  if (resultMutation) resultMutation(results, timeline);
  const created = await createExperimentPackage({ projectText: text, adapters,
    activeProfile: PROFILE, expectationText: expectation.canonical,
    artifactIdentitySha256: HASH, sourceVariant: 'correct', results });
  return { created, expectation, text, timeline, results };
}

test('X67 creates deterministic canonical local package with all five concepts', async () => {
  const first = await fixture();
  const second = await fixture();
  assert.equal(first.created.ok, true, first.created.code);
  assert.equal(first.created.canonical, second.created.canonical);
  assert.equal(first.created.sha256, second.created.sha256);
  const parsed = await parseExperimentPackage(first.created.canonical, adapters);
  assert.equal(parsed.ok, true, parsed.code);
  assert.equal(parsed.value.project.project.source.files[0].content.includes('human-authored'), true);
  assert.equal(parsed.value.project.project.circuit.components.length, 0);
  assert.equal(parsed.value.project.scenarioTimeline.scenarios.length, 4);
  assert.equal(parsed.value.expectation.scenarioTimeline.scenarios.length, 4);
  assert.equal(parsed.value.report.results.length, 4);
  assert.deepEqual(parsed.value.limitations, [...EXPERIMENT_PACKAGE_LIMITATIONS]);
  assert.deepEqual(parsed.value.report.authority, { executable: false, runtime: false, verdict: false });
});

test('X67 permits legitimate requirement capability terminology and inert human-authored text', async () => {
  const { created } = await fixture({ source: '// token and capability are ordinary user words\nvoid setup() {}' });
  assert.equal(created.ok, true, created.code);
  assert.equal(created.value.project.brief.requiredCapabilities[0].id, 'CAP_LED');
});

test('X67 preserves a complete failed measurement without turning it into verdict authority', async () => {
  const { created } = await fixture({ resultMutation(results, timeline) {
    results[1] = resultFor(timeline.scenarios[1], !timeline.scenarios[1].events.at(-1).level);
  } });
  assert.equal(created.ok, true, created.code);
  assert.equal(created.value.report.aggregate.academicStatus, 'failed');
  assert.equal(created.value.report.results[1].academicStatus, 'failed');
  assert.equal(created.verdictAuthority, false);
});

test('X67 rejects incomplete, missing and input-loss result sets', async (suite) => {
  for (const [name, mutate, code] of [
    ['missing', (results) => { results.pop(); }, 'EXPERIMENT_REPORT_RESULT_COUNT'],
    ['indeterminate', (results) => {
      results[0].status = 'indeterminate';
      results[0].outcome = { ...results[0].outcome, academicStatus: 'indeterminate', evidenceStatus: 'incomplete' };
    }, 'EXPERIMENT_REPORT_RESULT_INCOMPLETE'],
    ['input loss', (results) => { results[0].retention.inputEventsDropped = 1; }, 'EXPERIMENT_REPORT_INPUT_LOSS'],
  ]) await suite.test(name, async () => {
    const { created } = await fixture({ resultMutation: mutate });
    assert.equal(created.ok, false);
    assert.equal(created.code, code);
  });
});

test('X67 rejects stale independent expectation binding', async () => {
  const first = await fixture();
  const changed = projectText('// changed authored source');
  const result = await createExperimentPackage({ projectText: changed, adapters,
    activeProfile: PROFILE, expectationText: first.expectation.canonical,
    artifactIdentitySha256: HASH, sourceVariant: 'correct', results: first.results });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'EXPERIMENT_PACKAGE_EXPECTATION_STALE');
});

test('X67 strict parser rejects extra fields, binding mutation and executable authority', async (suite) => {
  const { created } = await fixture();
  for (const [name, mutate, code] of [
    ['extra', (value) => { value.extra = true; }, 'EXPERIMENT_PACKAGE_SHAPE'],
    ['binding', (value) => { value.bindings.reportSha256 = '0'.repeat(64); }, 'EXPERIMENT_PACKAGE_BINDING'],
    ['firmware bytes', (value) => { value.project.project.firmwareHex = ':00000001FF'; }, 'PROJECT_ENVELOPE_EXECUTABLE_AUTHORITY'],
    ['report capability authority', (value) => { value.report.capability = 'forbidden'; }, 'EXPERIMENT_REPORT_SHAPE'],
  ]) await suite.test(name, async () => {
    const value = structuredClone(created.value); mutate(value);
    const parsed = await parseExperimentPackage(`${JSON.stringify(value, null, 2)}\n`, adapters);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, code);
  });
});

test('X67 rejects a report that relabels measured failure as pass even with recomputed bindings', async () => {
  const { created } = await fixture({ resultMutation(results, timeline) {
    results[1] = resultFor(timeline.scenarios[1], !timeline.scenarios[1].events.at(-1).level);
  } });
  const value = structuredClone(created.value);
  value.report.results[1].academicStatus = 'passed';
  value.report.results[1].reasons = [];
  value.report.aggregate.academicStatus = 'passed';
  value.report.aggregate.reasons = [];
  const { experimentPackageSha256 } = await import('../src/experiment-package.mjs');
  value.bindings.reportSha256 = await experimentPackageSha256(value.report);
  const parsed = await parseExperimentPackage(`${JSON.stringify(value, null, 2)}\n`, adapters);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.code, 'EXPERIMENT_REPORT_ASSERTION_MISMATCH');
});

test('X67 strict parser rejects duplicate keys and non-canonical member bytes', async () => {
  const { created } = await fixture();
  const duplicate = created.canonical.replace('{\n  "schema":', '{\n  "schema": "duplicate",\n  "schema":');
  assert.equal((await parseExperimentPackage(duplicate, adapters)).code, 'DUPLICATE_KEY');
  const compact = JSON.stringify(created.value);
  assert.equal((await parseExperimentPackage(compact, adapters)).code, 'EXPERIMENT_PACKAGE_NOT_CANONICAL');
});

test('X67 parser enforces the bounded package size', async () => {
  const oversized = ' '.repeat(2 * 1024 * 1024 + 1);
  assert.equal((await parseExperimentPackage(oversized, adapters)).code, 'INPUT_LIMIT');
});
