// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  EXPERIMENT_PACKAGE_LIMITATIONS,
  LEGACY_EXPERIMENT_PACKAGE_SCHEMA,
  createExperimentPackage,
  experimentPackageSha256,
  parseExperimentPackage,
} from '../src/experiment-package.mjs';
import {
  AVR_EXPERIMENT_RUNTIME,
  AVR_EXPERIMENT_TOOL_VERSIONS,
  AVR_TOOLCHAIN_MANIFEST_SHA256,
} from '../src/experiment-manifest.mjs';
import { completedExperimentOutcome } from '../src/experiment-outcomes.mjs';
import { createExpectationReference } from '../src/expectation-reference.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';
import { defaultThermostatScenarioTimeline } from '../src/scenario-timeline.mjs';
import {
  THERMOSTAT_PROJECT_ADAPTER,
  createThermostatExperiment,
} from '../src/thermostat-experiment.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const PROFILE = 'board.atmega328p-16mhz-v1';
const HASH = 'a'.repeat(64);
const PRODUCER = Object.freeze({
  artifactIdentitySha256: HASH,
  inputIdentitySha256: 'b'.repeat(64),
  toolchainImageId: `sha256:${'c'.repeat(64)}`,
  toolchainIdentitySha256: '098e57cc2da7f46f0abea657a33473ef7c2a3c2f556152640fb4862ad4de53d2',
  projectGeneration: 1,
  buildGeneration: 1,
  runtimeGeneration: 1,
  runtimeIdentity: Object.freeze({
    schema: 'intent-mcu-worker-runtime-identity@1', projectGeneration: 1,
    runtimeGeneration: 1, artifactIdentity: HASH, workerInitialization: 1,
    workerInstanceNonce: 'd'.repeat(32),
  }),
});
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
    circuit: { components: [
      { id: 'board-1', type: 'board.atmega328p-16mhz-v1', label: 'Board', properties: {}, controls: {} },
      { id: 'led-1', type: 'led.basic-v1', label: 'LED', properties: { color: 'red' }, controls: {} },
    ], nets: [], junctions: [] },
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
    artifactIdentitySha256: HASH, sourceVariant: 'correct', results,
    producer: structuredClone(PRODUCER) });
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
  assert.equal(parsed.value.project.project.circuit.components.length, 2);
  assert.equal(parsed.value.project.scenarioTimeline.scenarios.length, 4);
  assert.equal(parsed.value.expectation.scenarioTimeline.scenarios.length, 4);
  assert.equal(parsed.value.report.results.length, 4);
  assert.deepEqual(parsed.value.limitations, [...EXPERIMENT_PACKAGE_LIMITATIONS]);
  assert.deepEqual(parsed.value.report.authority, { executable: false, runtime: false, verdict: false });
  assert.equal(parsed.value.schema, 'intent-mcu-experiment-package@2');
  assert.equal(parsed.value.manifest.artifactSha256, HASH);
  assert.equal(parsed.value.manifest.models.length, 2);
  assert.equal(parsed.x80Complete, true);
});

test('X80 tool identities match the checksum-pinned owners', async () => {
  const toolchain = JSON.parse(await readFile(new URL('../toolchain/manifest.json', import.meta.url), 'utf8'));
  assert.equal(await experimentPackageSha256(await readFile(
    new URL('../toolchain/manifest.json', import.meta.url), 'utf8')),
  AVR_TOOLCHAIN_MANIFEST_SHA256);
  const inputs = new Map(toolchain.inputs.map((item) => [item.name, item]));
  assert.deepEqual(AVR_EXPERIMENT_TOOL_VERSIONS.map(({ id, version, sourceSha256 }) => ({ id, version, sourceSha256 })), [
    { id: 'arduino-cli', version: inputs.get('Arduino CLI').version, sourceSha256: inputs.get('Arduino CLI').sha256 },
    { id: 'arduino-avr-core', version: inputs.get('Arduino AVR Boards').version, sourceSha256: inputs.get('Arduino AVR Boards').sha256 },
    { id: 'avr-gcc', version: inputs.get('Arduino AVR GCC bundle').version, sourceSha256: inputs.get('Arduino AVR GCC bundle').sha256 },
  ]);
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(AVR_EXPERIMENT_RUNTIME.version, lock.packages['node_modules/avr8js'].version);
});

test('X80 resolves all five authoritative runtime model owners from the real thermostat envelope', async () => {
  const realAdapters = Object.freeze({ [PROFILE]: THERMOSTAT_PROJECT_ADAPTER });
  const timeline = defaultThermostatScenarioTimeline();
  const projectText = canonicalProjectEnvelope(PROFILE,
    JSON.parse(createThermostatExperiment().text), realAdapters, brief(), timeline);
  const expectation = await createExpectationReference(projectText, realAdapters, PROFILE);
  const created = await createExperimentPackage({ projectText, adapters: realAdapters,
    activeProfile: PROFILE, expectationText: expectation.canonical,
    artifactIdentitySha256: HASH, sourceVariant: 'correct',
    results: timeline.scenarios.map((scenario) => resultFor(scenario)),
    producer: structuredClone(PRODUCER) });
  assert.equal(created.ok, true, created.code);
  assert.deepEqual(created.value.manifest.models.map((item) => item.componentType), [
    'board.atmega328p-16mhz-v1', 'button.momentary-v1', 'led.basic-v1',
    'potentiometer.linear-v1', 'resistor.fixed-v1',
  ]);
});

async function rebindManifest(value) {
  value.manifest.manifestSha256 = await experimentPackageSha256(Object.fromEntries(
    Object.entries(value.manifest).filter(([key]) => key !== 'manifestSha256'),
  ));
  value.bindings.manifestSha256 = value.manifest.manifestSha256;
}

test('X80 rejects independently rebound tampering of every identity class', async (suite) => {
  const { created } = await fixture();
  const cases = [
    ['source', async (value) => { value.manifest.sourceSha256 = '0'.repeat(64); }],
    ['circuit', async (value) => { value.manifest.circuitSha256 = '1'.repeat(64); }],
    ['scenario', async (value) => { value.manifest.scenarioSha256 = '2'.repeat(64); }],
    ['test', async (value) => { value.manifest.testSha256 = '3'.repeat(64); }],
    ['artifact', async (value) => { value.manifest.artifactSha256 = '4'.repeat(64); }],
    ['models', async (value) => {
      value.manifest.models[0].modelId = 'model.tampered-v1';
      value.manifest.modelsSha256 = await experimentPackageSha256(value.manifest.models);
    }],
    ['tools', async (value) => {
      value.manifest.tools.runtime.version = '99.0.0';
      value.manifest.toolsSha256 = await experimentPackageSha256(value.manifest.tools);
    }],
  ];
  for (const [name, mutate] of cases) await suite.test(name, async () => {
    const value = structuredClone(created.value);
    await mutate(value);
    await rebindManifest(value);
    const parsed = await parseExperimentPackage(`${JSON.stringify(value, null, 2)}\n`, adapters);
    assert.equal(parsed.ok, false);
    assert.match(parsed.code, /^EXPERIMENT_MANIFEST_/u);
  });
});

test('X80 rejects missing, extra, duplicate, reordered and stale producer identities', async (suite) => {
  const { created, expectation, text, results } = await fixture();
  for (const [name, source, code] of [
    ['missing manifest', (() => { const value = structuredClone(created.value); delete value.manifest; return `${JSON.stringify(value, null, 2)}\n`; })(), 'EXPERIMENT_PACKAGE_SHAPE'],
    ['extra manifest field', (() => { const value = structuredClone(created.value); value.manifest.extra = true; return `${JSON.stringify(value, null, 2)}\n`; })(), 'EXPERIMENT_MANIFEST_SHAPE'],
    ['duplicate manifest field', created.canonical.replace('    "sourceSha256":', '    "sourceSha256": "0",\n    "sourceSha256":'), 'DUPLICATE_KEY'],
    ['wrong model order', (() => { const value = structuredClone(created.value); value.manifest.models.reverse(); return `${JSON.stringify(value, null, 2)}\n`; })(), 'EXPERIMENT_MANIFEST_MODEL_ORDER'],
    ['wrong manifest key order', (() => {
      const value = structuredClone(created.value);
      value.manifest = { circuitSha256: value.manifest.circuitSha256,
        schema: value.manifest.schema,
        ...Object.fromEntries(Object.entries(value.manifest)
          .filter(([key]) => !['circuitSha256', 'schema'].includes(key))) };
      return `${JSON.stringify(value, null, 2)}\n`;
    })(), 'EXPERIMENT_PACKAGE_NOT_CANONICAL'],
  ]) await suite.test(name, async () => {
    assert.equal((await parseExperimentPackage(source, adapters)).code, code);
  });
  const stale = structuredClone(PRODUCER);
  stale.runtimeIdentity.runtimeGeneration += 1;
  const result = await createExperimentPackage({ projectText: text, adapters,
    activeProfile: PROFILE, expectationText: expectation.canonical,
    artifactIdentitySha256: HASH, sourceVariant: 'correct', results, producer: stale });
  assert.equal(result.code, 'EXPERIMENT_MANIFEST_RUNTIME_IDENTITY');
  for (const mutate of [
    (value) => { value.projectGeneration += 1; },
    (value) => { value.artifactIdentitySha256 = 'e'.repeat(64); },
    (value) => { value.toolchainIdentitySha256 = 'f'.repeat(64); },
  ]) {
    const changed = structuredClone(PRODUCER); mutate(changed);
    const rejected = await createExperimentPackage({ projectText: text, adapters,
      activeProfile: PROFILE, expectationText: expectation.canonical,
      artifactIdentitySha256: HASH, sourceVariant: 'correct', results, producer: changed });
    assert.match(rejected.code, /^EXPERIMENT_MANIFEST_(?:PRODUCER|RUNTIME_IDENTITY)$/u);
  }
  const missing = await createExperimentPackage({ projectText: text, adapters,
    activeProfile: PROFILE, expectationText: expectation.canonical,
    artifactIdentitySha256: HASH, sourceVariant: 'correct', results });
  assert.equal(missing.code, 'EXPERIMENT_MANIFEST_PRODUCER');
});

test('X80 accepts canonical v1 only as incomplete legacy review data', async () => {
  const { created } = await fixture();
  const legacy = structuredClone(created.value);
  legacy.schema = LEGACY_EXPERIMENT_PACKAGE_SCHEMA;
  delete legacy.manifest;
  delete legacy.bindings.manifestSha256;
  legacy.limitations[4] = 'Version 1 supports only the current AVR thermostat authored-scenario workflow.';
  const parsed = await parseExperimentPackage(`${JSON.stringify(legacy, null, 2)}\n`, adapters);
  assert.equal(parsed.ok, true, parsed.code);
  assert.equal(parsed.legacyReviewOnly, true);
  assert.equal(parsed.x80Complete, false);
  assert.equal('manifest' in parsed.value, false);
  assert.deepEqual([parsed.executableAuthority, parsed.runtimeAuthority, parsed.verdictAuthority], [false, false, false]);
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
    artifactIdentitySha256: HASH, sourceVariant: 'correct', results: first.results,
    producer: structuredClone(PRODUCER) });
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
