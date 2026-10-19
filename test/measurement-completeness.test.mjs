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
  });
  assert.equal(projection.completeForRequirements, false);
  assert.ok(projection.missingEvidence.includes('input:dropped:unknown'));
  assert.ok(projection.missingEvidence.includes('gpio:dropped:3'));
  assert.ok(projection.missingEvidence.includes('serial:sampling-insufficient'));
  assert.ok(projection.missingEvidence.includes('logic:truncated'));
  assert.ok(projection.missingEvidence.includes('observedInterval:reversed'));
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

test('current outcome projection retains a complete pass and blocks a stale pass with missing evidence', async () => {
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
  assert.equal(measurementRequirementStatus(observation).completeForRequirements, true);
  assert.equal(projectMeasurementOutcome(observation.outcome, observation).academicStatus, 'passed');
  const completeEnvelope = await createMeasurementReportEnvelope(observation);
  assert.equal(completeEnvelope.reportedAcademicStatus, 'passed');
  assert.equal(completeEnvelope.effectiveAcademicStatus, 'passed');

  const missing = clone(observation);
  missing.checks.serialObserved = false;
  assert.equal(measurementRequirementStatus(missing).completeForRequirements, false);
  const projected = projectMeasurementOutcome(missing.outcome, missing);
  assert.equal(projected.academicStatus, 'indeterminate');
  assert.equal(projected.evidenceStatus, 'incomplete');
  assert.ok(projected.reasons.includes('MEASUREMENT_COMPLETENESS_REQUIRED'));
});

test('current report renderers apply the shared measurement presentation boundary', async () => {
  const source = await readFile(new URL('../staging/main.mjs', import.meta.url), 'utf8');
  assert.ok((source.match(/applyMeasurementPresentation\(/gu) ?? []).length >= 15);
  assert.match(source, /historical source/u);
  assert.match(source, /createMeasurementReportEnvelope/u);
});
