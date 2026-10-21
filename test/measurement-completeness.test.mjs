// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  MEASUREMENT_COMPLETENESS_SCHEMA,
  MEASUREMENT_PRODUCER_REGISTRY,
  completenessAcademicStatus,
  createMeasurementCompleteness,
  createMeasurementReportEnvelope,
  known,
  measurementSha256,
  measurementRequirementStatus,
  projectMeasurementOutcome,
  stableMeasurementStringify,
  unavailable,
  unknown,
  validateMeasurementCompleteness,
  validateMeasurementReportEnvelope,
} from '../src/measurement-completeness.mjs';
import {
  THERMOSTAT_SCENARIOS, evaluateThermostatObservation, thermostatExpectedSerialLine,
  thermostatScenarioControls,
} from '../src/thermostat-experiment-contract.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
const clone = (value) => structuredClone(value);
const retainedAuthoredReport = async () => JSON.parse(await readFile(
  new URL('fixtures/x80-authored-scenario-report.json', import.meta.url), 'utf8'));

const REPORT_SCHEMAS = [
  'intent-mcu-regression-report@1',
  'intent-mcu-x26-version-regression@1',
  'intent-mcu-coverage-report@1',
  'intent-mcu-long-duration-report@1',
  'intent-mcu-time-invariance-report@1',
  'intent-mcu-event-order-report@1',
  'intent-mcu-reset-class-report@1',
  'intent-mcu-unsupported-access-report@1',
  'intent-mcu-digital-state-report@1',
  'intent-mcu-x33-runtime-digital-state-report@1',
  'intent-mcu-x34-instrumented-precision-report@1',
  'intent-mcu-x35-causal-chain-report@1',
  'intent-mcu-x36-failure-replay-report@1',
  'intent-mcu-x23-usart-response-report@1',
  'intent-mcu-authored-scenario-report@1',
];

const longReport = () => ({
  schema: 'intent-mcu-long-duration-report@1',
  profile: 'board.atmega328p-16mhz-v1',
  semanticSha256: 'a'.repeat(64),
  sourceSha256: 'b'.repeat(64),
  artifactSha256: 'c'.repeat(64),
  results: [{ rawVirtualTime: { cycle: 10 }, outcome: { academicStatus: 'passed' } },
    { rawVirtualTime: { cycle: 20 }, outcome: { academicStatus: 'passed' } }],
  knownBad: { outcome: { academicStatus: 'failed' } },
});

const completeFacts = (ids) => Object.fromEntries(ids.map((id) => [id, {
  retained: known(2), dropped: known(0),
  sampled: known(false), truncated: known(false),
}]));

test('registry enumerates all fifteen current downloadable schemas exactly once', () => {
  assert.equal(MEASUREMENT_PRODUCER_REGISTRY.reportOwners.length, 15);
  assert.deepEqual(MEASUREMENT_PRODUCER_REGISTRY.reportOwners.map((item) => item.reportSchema), REPORT_SCHEMAS);
  assert.equal(new Set(MEASUREMENT_PRODUCER_REGISTRY.reportOwners.map((item) => item.producerId)).size, 15);
  assert.ok(MEASUREMENT_PRODUCER_REGISTRY.surfaceOwners.some(
    (item) => item.reportSchema === 'intent-mcu-bounded-test-evidence@1'));
  assert.ok(MEASUREMENT_PRODUCER_REGISTRY.surfaceOwners.some(
    (item) => item.reportSchema === 'intent-mcu-external-client-result@1'));
});

test('known zero, unknown and unavailable remain distinct canonical values', async () => {
  assert.notEqual(stableMeasurementStringify(known(0)), stableMeasurementStringify(unknown('not reported')));
  assert.notEqual(stableMeasurementStringify(known(0)), stableMeasurementStringify(unavailable('not applicable')));
  assert.notEqual(await measurementSha256(unknown('not reported')),
    await measurementSha256(unavailable('not applicable')));
});

test('complete native facts and interval produce a validated complete projection', async () => {
  const ids = MEASUREMENT_PRODUCER_REGISTRY.reportOwners.find(
    (item) => item.reportSchema === longReport().schema).channels;
  const projection = await createMeasurementCompleteness(longReport(), {
    channelFacts: completeFacts(ids), observedFrom: known(10), observedThrough: known(20),
    requiredFrom: known(10), requiredThrough: known(20),
  });
  assert.equal(projection.schema, MEASUREMENT_COMPLETENESS_SCHEMA);
  assert.equal(projection.completeForRequirements, true);
  assert.deepEqual(projection.missingEvidence, []);
  assert.equal((await validateMeasurementCompleteness(projection, longReport().schema)).projectionSha256,
    projection.projectionSha256);
});

test('missing, dropped, sampled, truncated and reversed-window evidence fail closed', async () => {
  const ids = MEASUREMENT_PRODUCER_REGISTRY.reportOwners.find(
    (item) => item.reportSchema === longReport().schema).channels;
  const facts = completeFacts(ids);
  facts.input.dropped = unknown('producer omitted counter');
  facts.gpio.dropped = known(3);
  facts.serial.sampled = known(true, { strategy: 'every-second-record', sufficientForRequirements: false });
  facts.logic.truncated = known(true, { boundary: 'retention-limit' });
  const projection = await createMeasurementCompleteness(longReport(), {
    channelFacts: facts, observedFrom: known(20), observedThrough: known(10),
    requiredFrom: known(10), requiredThrough: known(20),
  });
  assert.equal(projection.completeForRequirements, false);
  assert.ok(projection.missingEvidence.includes('input:dropped:unknown'));
  assert.ok(projection.missingEvidence.includes('gpio:dropped:3'));
  assert.ok(projection.missingEvidence.includes('serial:sampling-insufficient'));
  assert.ok(projection.missingEvidence.includes('logic:truncated'));
  assert.ok(projection.missingEvidence.includes('interval:explicit:observed-reversed'));
  assert.equal(completenessAcademicStatus('passed', projection), 'indeterminate');
});

test('legacy reports are wrapped without mutation and reported pass cannot escape incomplete evidence', async () => {
  const report = longReport();
  const before = stableMeasurementStringify(report);
  const envelope = await createMeasurementReportEnvelope(report);
  assert.equal(stableMeasurementStringify(report), before);
  assert.equal(envelope.reportSchema, report.schema);
  assert.equal(envelope.reportedAcademicStatus, 'passed');
  assert.equal(envelope.measurementCompleteness.completeForRequirements, false);
  assert.equal(envelope.effectiveAcademicStatus, 'indeterminate');
  await validateMeasurementReportEnvelope(envelope);
});

test('self-consistent forged completeness cannot upgrade an unchanged retained report', async () => {
  const report = longReport();
  const envelope = clone(await createMeasurementReportEnvelope(report));
  const forged = envelope.measurementCompleteness;
  forged.channels = forged.channels.map((channel) => ({
    ...channel,
    retained: known(2), dropped: known(0), sampled: known(false), truncated: known(false),
  }));
  forged.observedFrom = known(10);
  forged.observedThrough = known(20);
  forged.intervals = [{ id: 'forged-complete-window', mode: 'contains-required',
    observedFrom: known(10), observedThrough: known(20),
    requiredFrom: known(10), requiredThrough: known(20) }];
  forged.missingEvidence = [];
  forged.completeForRequirements = true;
  delete forged.projectionSha256;
  forged.projectionSha256 = await measurementSha256(forged);
  envelope.effectiveAcademicStatus = 'passed';

  assert.equal((await validateMeasurementCompleteness(forged, report.schema)).completeForRequirements, true);
  assert.equal(envelope.reportSha256, await measurementSha256(report));
  assert.equal(envelope.reportedAcademicStatus, 'passed');
  await assert.rejects(validateMeasurementReportEnvelope(envelope),
    { code: 'MEASUREMENT_REPORT_ENVELOPE_NONCANONICAL_COMPLETENESS' });
});

test('strict validation rejects hash mutation, stale identity and channel drift', async () => {
  const envelope = await createMeasurementReportEnvelope(longReport());
  const hashMutation = clone(envelope);
  hashMutation.measurementCompleteness.limitations[0] += ' changed';
  await assert.rejects(validateMeasurementReportEnvelope(hashMutation),
    { code: 'MEASUREMENT_COMPLETENESS_INTEGRITY' });

  const stale = clone(envelope);
  stale.report.artifactSha256 = 'd'.repeat(64);
  stale.reportSha256 = await measurementSha256(stale.report);
  await assert.rejects(validateMeasurementReportEnvelope(stale),
    { code: 'MEASUREMENT_REPORT_ENVELOPE_STALE_IDENTITY' });

  const reordered = clone(envelope.measurementCompleteness);
  reordered.channels.reverse();
  reordered.requiredEvidence.reverse();
  const withoutHash = clone(reordered); delete withoutHash.projectionSha256;
  reordered.projectionSha256 = await measurementSha256(withoutHash);
  await assert.rejects(validateMeasurementCompleteness(reordered, envelope.reportSchema),
    { code: 'MEASUREMENT_COMPLETENESS_OWNER' });
});

test('static, reviewed, mixed C3 and STM32 instruction-order inputs never receive invented time', async () => {
  const staticProjection = await createMeasurementCompleteness({
    schema: 'intent-mcu-digital-state-report@1', rows: [],
  });
  assert.equal(staticProjection.timeBasis, 'static-no-time');
  assert.equal(staticProjection.observedFrom.state, 'unavailable');

  const reviewed = await createMeasurementCompleteness({
    schema: 'intent-mcu-x26-version-regression@1', conclusion: { status: 'passed' },
  });
  assert.equal(reviewed.evidenceClass, 'reviewed-import');
  assert.equal(reviewed.observedThrough.state, 'unavailable');

  const c3Mixed = await createMeasurementCompleteness({
    schema: 'intent-mcu-regression-report@1', results: [{ profile: 'board.esp32c3-v1',
      producer: 'QEMU UART plus separate project-owned GPIO2 model', rawVirtualTime: { values: [1, 2] } }],
  });
  assert.equal(c3Mixed.timeBasis, 'unavailable');
  assert.equal(c3Mixed.evidenceClass, 'derived-projection');

  const stm32 = await createMeasurementCompleteness({
    schema: 'intent-mcu-x36-failure-replay-report@1', profile: 'board.stm32f429zi-v1',
    repeats: [{ instructionOrdinal: 44, cycle: 900 }],
  });
  assert.equal(stm32.timeBasis, 'instruction-order-only');
  assert.equal(stm32.observedFrom.state, 'unavailable');
  assert.equal(stm32.observedThrough.state, 'unavailable');
});

test('unregistered report and invalid numeric facts are rejected', async () => {
  await assert.rejects(createMeasurementCompleteness({ schema: 'third-party-report@1' }),
    { code: 'MEASUREMENT_PRODUCER_UNREGISTERED' });
  const projection = await createMeasurementCompleteness(longReport());
  const invalid = clone(projection);
  invalid.channels[0].retained = known(-1);
  const withoutHash = clone(invalid); delete withoutHash.projectionSha256;
  invalid.projectionSha256 = await measurementSha256(withoutHash);
  await assert.rejects(validateMeasurementCompleteness(invalid, longReport().schema),
    { code: 'MEASUREMENT_COMPLETENESS_CHANNEL' });
});

test('thermostat outcome flags cannot invent loss, identity or interval completeness', async () => {
  const scenario = THERMOSTAT_SCENARIOS.scenarios[0];
  const controls = thermostatScenarioControls(scenario.id).map((control, index) => ({
    sequence: index + 1, targetCycle: 0, type: 'control',
    componentId: control.componentId, key: control.key, value: control.value,
  }));
  const observation = evaluateThermostatObservation(scenario.id, {
    cycle: 2_560_000,
    pins: [{ pin: 'D13', mode: 'OUTPUT', level: scenario.expectedD13 }],
    eventLog: { pending: [], log: controls, dropped: 0 },
    instruments: { serial: { text: `${thermostatExpectedSerialLine(scenario.id)}\n`, dropped: 0 } },
  });
  assert.equal(observation.status, 'passed');
  const status = measurementRequirementStatus(observation);
  assert.equal(status.completeForRequirements, false);
  assert.ok(status.missingEvidence.includes('identity:source:unknown'));
  assert.ok(status.missingEvidence.includes('input:dropped:unknown'));
  assert.equal(projectMeasurementOutcome(observation.outcome, observation).academicStatus, 'indeterminate');
  const incompleteEnvelope = await createMeasurementReportEnvelope(observation);
  assert.equal(incompleteEnvelope.reportedAcademicStatus, 'passed');
  assert.equal(incompleteEnvelope.effectiveAcademicStatus, 'indeterminate');

  const missing = clone(observation);
  missing.checks.serialObserved = false;
  assert.equal(measurementRequirementStatus(missing).completeForRequirements, false);
  const projected = projectMeasurementOutcome(missing.outcome, missing);
  assert.equal(projected.academicStatus, 'indeterminate');
  assert.equal(projected.evidenceStatus, 'incomplete');
  assert.ok(projected.reasons.includes('MEASUREMENT_COMPLETENESS_REQUIRED'));
});

test('retained X80 report stays complete while deleted native facts and arbitrary targets fail closed', async () => {
  const retained = await retainedAuthoredReport();
  const before = stableMeasurementStringify(retained);
  const envelope = await createMeasurementReportEnvelope(retained);
  assert.equal(stableMeasurementStringify(retained), before);
  assert.equal(envelope.measurementCompleteness.completeForRequirements, true);
  assert.equal(envelope.effectiveAcademicStatus, 'passed');
  assert.equal(envelope.measurementCompleteness.intervals.length, 4);
  assert.ok(envelope.measurementCompleteness.intervals.every((item) => item.id.startsWith('THERM-SCENARIO-')));
  await validateMeasurementReportEnvelope(envelope);

  const mutations = [
    ['drop counter', (value) => { delete value.results[0].retention.inputEventsDropped; }],
    ['identity', (value) => { delete value.artifactIdentitySha256; }],
    ['observed window', (value) => { delete value.results[0].observed.windowEndMilliseconds; }],
  ];
  for (const [name, mutate] of mutations) {
    const changed = clone(retained); mutate(changed);
    changed.results[0].targetCycle = 9_999_999_999;
    changed.results[0].requestedDurationCycles = 8_888_888_888;
    const projected = await createMeasurementReportEnvelope(changed);
    assert.equal(projected.measurementCompleteness.completeForRequirements, false, name);
    assert.equal(projected.effectiveAcademicStatus, 'indeterminate', name);
    assert.notEqual(projected.measurementCompleteness.observedThrough.value, 9_999_999_999, name);
  }
});

test('retained X34 sampling members are not replaced by passed outcomes or target cycles', async () => {
  const retained = JSON.parse(await readFile(new URL(
    'fixtures/x34-two-repeat-runtime.json',
    import.meta.url), 'utf8'));
  const report = { ...retained, schema: 'intent-mcu-x34-instrumented-precision-report@1',
    sourceSha256: retained.sourceSha256, artifactIdentity: retained.artifactIdentity,
    repeats: retained.repeats.map((repeat) => ({ ...repeat,
      control: { targetCycle: 9_999_999_999 }, adc: repeat.transaction.adc,
      outcome: { academicStatus: 'passed', jobStatus: 'completed' } })) };
  const baseline = measurementRequirementStatus(report);
  assert.equal(baseline.completeForRequirements, false);
  const missingSample = clone(report);
  delete missingSample.repeats[0].adc.sampleCycles;
  const changed = measurementRequirementStatus(missingSample);
  assert.equal(changed.completeForRequirements, false);
  assert.ok(changed.missingEvidence.includes('adc:sampled:unknown'));
  assert.ok(changed.missingEvidence.some((item) => item.startsWith('interval:')));
});

test('retained X29-X32 evidence cannot turn verdicts or requested targets into completeness', async () => {
  const fixtures = [
    ['x29-private-browser-evidence.json', 'intent-mcu-time-invariance-report@1',
      (value) => { delete value.executions[0].actual.finalCpuCycles; }],
    ['x30-private-browser-evidence.json', 'intent-mcu-event-order-report@1',
      (value) => { delete value.executions[0].phases[3].producer.cpuCycles; }],
    ['x31-private-browser-evidence.json', 'intent-mcu-reset-class-report@1',
      (value) => { delete value.executions[0].after.cpuCycles; }],
    ['x32-private-browser-evidence.json', 'intent-mcu-unsupported-access-report@1',
      (value) => { delete value.executions[0].stop.cycle; }],
  ];
  for (const [filename, schema, mutate] of fixtures) {
    const retained = JSON.parse(await readFile(new URL(`fixtures/${filename}`, import.meta.url), 'utf8'));
    retained.schema = schema;
    retained.sourceSha256 ??= 'b'.repeat(64);
    retained.artifactSha256 ??= retained.artifactIdentity ?? 'a'.repeat(64);
    const passedOutcomeExists = JSON.stringify(retained).includes('"academicStatus":"passed"')
      || JSON.stringify(retained).includes('"academicStatus":"unsupported"');
    assert.equal(passedOutcomeExists, true, filename);
    const baseline = measurementRequirementStatus(retained);
    assert.equal(baseline.completeForRequirements, false, filename);
    const changed = clone(retained);
    mutate(changed);
    changed.targetCycle = 9_999_999_999;
    changed.requestedDurationCycles = 8_888_888_888;
    const projected = measurementRequirementStatus(changed);
    assert.equal(projected.completeForRequirements, false, filename);
    assert.notEqual(projected.observedFrom.value, 9_999_999_999, filename);
    assert.notEqual(projected.observedThrough.value, 9_999_999_999, filename);
  }
});

test('current report renderers apply the shared measurement presentation boundary', async () => {
  const source = await readFile(new URL('../staging/main.mjs', import.meta.url), 'utf8');
  assert.ok((source.match(/applyMeasurementPresentation\(/gu) ?? []).length >= 15);
  assert.match(source, /historical source/u);
  assert.match(source, /createMeasurementReportEnvelope/u);
});
