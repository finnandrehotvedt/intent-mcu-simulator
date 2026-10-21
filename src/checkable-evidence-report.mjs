// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  MEASUREMENT_PRODUCER_REGISTRY, createMeasurementReportEnvelope, known,
  measurementSha256, stableMeasurementStringify, unavailable, unknown,
  validateMeasurementReportEnvelope,
} from './measurement-completeness.mjs';
import { experimentPackageSha256 } from './experiment-package.mjs';
import { normalizeModelLibraryLock } from './model-library.mjs';
import { publicControllerView } from './public-controller-workbench-view.mjs';

export const CHECKABLE_EVIDENCE_REPORT_SCHEMA = 'intent-mcu-checkable-evidence-report@1';
export const CHECKABLE_EVIDENCE_REPORT_VERSION = '1.0.0';
export const CHECKABLE_EVIDENCE_TRUTH_BOUNDARY = 'Hashes bind identity and integrity only; they do not prove measurement truth, physical equivalence or correctness.';

const clone = (value) => structuredClone(value);
const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const HASH = /^[a-f0-9]{64}$/u;
const idPart = (value) => String(value).replace(/[^a-z0-9-]+/giu, '-').replace(/^-|-$/gu, '').toLowerCase();
const scalar = (value) => ['string', 'boolean'].includes(typeof value)
  || (typeof value === 'number' && Number.isFinite(value));
const at = (value, path) => path.split('.').filter(Boolean).reduce((item, key) => item?.[key], value);
const row = (valuePath, label, kind, channelId, options = {}) => (
  { valuePath, label, kind, channelId, ...options });
const adapter = (reportSchema, adapterId, limitation, rows) => (
  { reportSchema, adapterId, limitation, rows });

// Primitive-only allowlisted maps. Outcome labels are deliberately absent;
// no map recursively scans or serializes an object into a fake measurement.
const ADAPTER_SPECS = [
  adapter('intent-mcu-regression-report@1', 'x82-regression-native-v2', 'Mixed profile observations retain source-native timebases and are never compared numerically.', [
    row('actual.scenariosPassed', 'Observed AVR scenarios', 'count', 'matrix-results', { unit: 'scenarios', collection: 'results', idPath: 'caseId', timeBasisPath: 'rawVirtualTime.timebase' }),
    row('actual.gpio0', 'Observed RP2040 GPIO0', 'digital-level', 'matrix-results', { unit: 'logic-level', collection: 'results', idPath: 'caseId', timeBasisPath: 'rawVirtualTime.timebase' }),
    row('actual.qemuMarker', 'Observed C3 QEMU UART marker', 'text-record', 'matrix-results', { unit: 'text', collection: 'results', idPath: 'caseId', timeBasisPath: 'rawVirtualTime.timebase' }),
    row('actual.modeledLedCode', 'Observed C3 project-model LED code', 'state', 'matrix-results', { unit: 'state', collection: 'results', idPath: 'caseId', timeBasisPath: 'rawVirtualTime.timebase', limitation: 'Project-owned GPIO2 model; not QEMU pin-state evidence.' }),
    row('actual.pb0', 'Observed STM32 PB0', 'digital-level', 'matrix-results', { unit: 'logic-level', collection: 'results', idPath: 'caseId', timeBasisPath: 'rawVirtualTime.timebase' }),
  ]),
  adapter('intent-mcu-x26-version-regression@1', 'x82-reviewed-version-comparison-v2', 'Reviewed imports are historical comparison evidence and never become a fresh execution.', [
    row('sameRequirementIdentity', 'Reviewed requirement identity comparison', 'comparison', 'reviewed-release-reports', { unit: 'boolean', collection: 'results', idPath: 'caseId' }),
    row('outcomeStableAcrossReleases', 'Reviewed outcome stability comparison', 'comparison', 'reviewed-release-reports', { unit: 'boolean', collection: 'results', idPath: 'caseId' }),
  ]),
  adapter('intent-mcu-coverage-report@1', 'x82-coverage-count-v2', 'Declared input partitions are not instruction or physical-behaviour coverage.', [
    row('counts.executed', 'Executed declared partitions', 'count', 'regression-evidence', { unit: 'partitions' }),
    row('counts.failed', 'Exercised failed partitions', 'count', 'regression-evidence', { unit: 'partitions' }),
  ]),
  adapter('intent-mcu-long-duration-report@1', 'x82-long-duration-native-v2', 'Accelerated virtual cycles are not physical elapsed time or durability evidence.', [
    row('rawVirtualTime.virtualMilliseconds', 'Observed final virtual time', 'timepoint', 'logic', { unit: 'virtual-millisecond', collection: 'results', idPath: 'cellId', observationPath: 'rawVirtualTime.cycle', timeBasisPath: 'rawVirtualTime.timebase' }),
    row('rawVirtualTime.finalCycle', 'Observed final CPU cycle', 'timepoint', 'logic', { unit: 'cpu-cycle', collection: 'results', idPath: 'cellId', observationPath: 'rawVirtualTime.finalCycle', timeBasisPath: 'rawVirtualTime.timebase' }),
  ]),
  adapter('intent-mcu-time-invariance-report@1', 'x82-time-final-cycle-v2', 'Pacing diagnostics are not wall-time or physical-time measurements.', [
    row('actual.finalCpuCycles', 'Final CPU cycle', 'timepoint', 'clock', { unit: 'cpu-cycle', collection: 'executions', idPath: 'executionId', observationPath: 'actual.finalCpuCycles' }),
    row('actual.finalVirtualNanoseconds', 'Final virtual time', 'timepoint', 'clock', { unit: 'virtual-nanosecond', collection: 'executions', idPath: 'executionId', observationPath: 'actual.finalCpuCycles' }),
  ]),
  adapter('intent-mcu-event-order-report@1', 'x82-event-order-native-v2', 'Phase order is one bounded paused AVR epoch, not universal asynchronous ordering.', [
    row('phases.3.producer.cpuCycles', 'Execution-phase CPU cycle', 'timepoint', 'input', { unit: 'cpu-cycle', collection: 'executions', idPath: 'executionId', observationPath: 'phases.3.producer.cpuCycles' }),
    row('phases.3.phaseOrdinal', 'Execution-phase ordinal', 'timepoint', 'input', { unit: 'phase-order', collection: 'executions', idPath: 'executionId', observationPath: 'phases.3.producer.cpuCycles' }),
  ]),
  adapter('intent-mcu-reset-class-report@1', 'x82-reset-after-cycle-v2', 'Reset classes are simulator contracts and do not claim physical reset timing or SRAM retention.', [
    row('after.cpuCycles', 'Post-reset CPU cycle', 'timepoint', 'memory', { unit: 'cpu-cycle', collection: 'executions', idPath: 'executionId', observationPath: 'after.cpuCycles' }),
    row('after.volatileByte', 'Post-reset volatile byte', 'byte-record', 'memory', { unit: 'byte', collection: 'executions', idPath: 'executionId', observationPath: 'after.cpuCycles' }),
  ]),
  adapter('intent-mcu-unsupported-access-report@1', 'x82-unsupported-native-v2', 'One detected unsupported access is not exhaustive register or opcode coverage.', [
    row('stop.cycle', 'Capability-stop cycle', 'timepoint', 'unsupported-access', { unit: 'cpu-cycle', collection: 'executions', idPath: 'executionId', observationPath: 'stop.cycle' }),
    row('access.address', 'Unsupported register address', 'state', 'unsupported-access', { unit: 'register-address', collection: 'executions', idPath: 'executionId', observationPath: 'access.cycle' }),
  ]),
  adapter('intent-mcu-digital-state-report@1', 'x82-static-resolution-v2', 'Static ideal-net classification is not runtime or physical voltage evidence.', [
    row('resolution', 'Static ideal-net resolution', 'state', 'resolver', { unit: 'state', collection: 'repeats.0.rows', idPath: 'caseId' }),
  ]),
  adapter('intent-mcu-x33-runtime-digital-state-report@1', 'x82-runtime-digital-v2', 'Actual worker pin producers remain separate from the project-owned ideal topology.', [
    row('resolution', 'Runtime-backed ideal-net classification', 'state', 'topology', { unit: 'state', collection: 'repeats.0.rows', idPath: 'rowId' }),
  ]),
  adapter('intent-mcu-x34-instrumented-precision-report@1', 'x82-precision-native-v2', 'The instrumented fixture is bounded and does not establish analogue or physical precision.', [
    row('adc.value', 'Observed ADC result', 'analogue-value', 'adc', { unit: 'adc-count', collection: 'repeats', idPath: 'repeat', observationPath: 'adc.completionCycle' }),
    row('voltage.value', 'Ideal fixture voltage', 'analogue-value', 'adc', { unit: 'volt', collection: 'repeats', idPath: 'repeat', observationPath: 'adc.completionCycle' }),
  ]),
  adapter('intent-mcu-x35-causal-chain-report@1', 'x82-causal-native-v2', 'The causal chain is one project-owned ideal model, not electrical or physical proof.', [
    row('chain.pin.level', 'Observed D13 producer level', 'digital-level', 'gpio', { unit: 'logic-level', collection: 'repeats', idPath: 'repeat', observationPath: 'chain.callback.rawCycle' }),
    row('chain.componentProjection.on', 'Projected ideal LED state', 'digital-level', 'led-model', { unit: 'logic-level', collection: 'repeats', idPath: 'repeat', observationPath: 'chain.callback.rawCycle', limitation: 'Synchronous project-owned ideal LED projection; not physical light output.' }),
  ]),
  adapter('intent-mcu-x36-failure-replay-report@1', 'x82-replay-native-v2', 'Instruction order has no accepted numeric cycle or elapsed-time equivalence.', [
    row('fault.instructionOrdinal', 'Fault instruction ordinal', 'timepoint', 'instruction', { unit: 'instruction-order', collection: 'repeats', idPath: 'repeat', observationPath: 'fault.instructionOrdinal' }),
    row('fault.address', 'Faulting register address', 'state', 'fault', { unit: 'register-address', collection: 'repeats', idPath: 'repeat', observationPath: 'fault.instructionOrdinal' }),
  ]),
  adapter('intent-mcu-x23-usart-response-report@1', 'x82-usart-native-v2', 'The bounded USART fixture is not generic bus, SPI or I2C evidence.', [
    row('rxRequest.value', 'Observed USART RX response byte', 'byte-record', 'uart-rx', { unit: 'byte', collection: 'runs', idPath: 'label', observationPath: 'rxComplete.cycle' }),
    row('consumer.d13', 'Observed consumer D13 level', 'digital-level', 'gpio', { unit: 'logic-level', collection: 'runs', idPath: 'label', observationPath: 'consumer.finalCycle' }),
  ]),
  adapter('intent-mcu-authored-scenario-report@1', 'x82-authored-gpio-v2', 'The thermostat uses ideal teaching inputs and an LED command indicator, not room or heater physics.', [
    row('observed.level', 'Observed authored-scenario GPIO level', 'digital-level', 'gpio', { unit: 'logic-level', collection: 'results', idPath: 'scenarioId', observationPath: 'virtualMilliseconds' }),
    row('observed.mode', 'Observed authored-scenario GPIO mode', 'digital-mode', 'gpio', { unit: 'mode', collection: 'results', idPath: 'scenarioId', observationPath: 'virtualMilliseconds' }),
  ]),
  adapter('intent-mcu-bounded-test-evidence@1', 'x82-bounded-test-suite-v1', 'The bounded suite joins reset-isolated producer rows; it is not an independent runtime producer.', [
    row('observed.d13', 'Observed bounded-suite D13 level', 'digital-level', 'gpio', { unit: 'logic-level', collection: 'observations', idPath: 'scenarioId', observationPath: 'virtualMilliseconds' }),
    row('observed.serialText', 'Observed bounded-suite Serial text', 'text-record', 'serial', { unit: 'text', collection: 'observations', idPath: 'scenarioId', observationPath: 'virtualMilliseconds' }),
    row('checks.inputsComplete', 'Producer-confirmed bounded-suite input capture', 'state', 'input', { unit: 'boolean', collection: 'observations', idPath: 'scenarioId', observationPath: 'virtualMilliseconds' }),
  ]),
  adapter('intent-mcu-thermostat-observation-result@1', 'x82-thermostat-native-v2', 'One thermostat observation is bounded to its declared ideal scenario and interval.', [
    row('observed.d13', 'Observed thermostat D13 level', 'digital-level', 'gpio', { unit: 'logic-level', observationPath: 'virtualMilliseconds' }),
    row('observed.d13Mode', 'Observed thermostat D13 mode', 'digital-mode', 'gpio', { unit: 'mode', observationPath: 'virtualMilliseconds' }),
  ]),
  adapter('intent-mcu-scenario-observation-result@1', 'x82-scenario-native-v2', 'Scenario observations do not imply unmeasured component or physical behaviour.', [
    row('observed.level', 'Observed scenario GPIO level', 'digital-level', 'gpio', { unit: 'logic-level', observationPath: 'virtualMilliseconds' }),
    row('observed.mode', 'Observed scenario GPIO mode', 'digital-mode', 'gpio', { unit: 'mode', observationPath: 'virtualMilliseconds' }),
  ]),
  adapter('intent-mcu-x39-failure-location@1', 'x82-failure-location-native-v2', 'The locator is transient derived navigation, not a debugger or replay authority.', [
    row('pin.actualLevel', 'Located observed pin level', 'digital-level', 'source-observation', { unit: 'logic-level', observationPath: 'observation.actualMilliseconds' }),
  ]),
  adapter('intent-mcu-x40-avr-shared-timeline@1', 'x82-shared-timeline-native-v2', 'The shared timeline is one AVR worker axis and cannot be compared with unlike profiles.', [
    row('cycle', 'Shared timeline cycle', 'timepoint', 'test', { unit: 'cpu-cycle', collection: 'rows', idPath: 'sameCycleSequence', observationPath: 'cycle' }),
  ]),
  adapter('intent-mcu-instrument-evidence@1', 'x82-instrument-native-v2', 'Instrument evidence retains its owning producer and cannot create missing runtime authority.', [
    row('cycle', 'Instrument snapshot cycle', 'timepoint', 'instrument', { unit: 'cpu-cycle', observationPath: 'cycle' }),
    row('virtualMilliseconds', 'Instrument snapshot virtual time', 'timepoint', 'instrument', { unit: 'virtual-millisecond', observationPath: 'cycle' }),
  ]),
  adapter('intent-mcu-shared-instrument-summary@1', 'x82-instrument-summary-native-v2', 'A summary is a derived view and cannot strengthen its source evidence.', [
    row('channels.serial.retention.retained', 'Retained serial records', 'count', 'instrument', { unit: 'records', observationPath: 'channels.serial.time.cycle', timeBasisPath: 'channels.serial.time.basis' }),
    row('channels.gpio.retention.retained', 'Retained GPIO records', 'count', 'instrument', { unit: 'records', observationPath: 'channels.gpio.time.cycle', timeBasisPath: 'channels.gpio.time.basis' }),
  ]),
  adapter('intent-mcu-shared-instrument-view@1', 'x82-instrument-view-native-v2', 'A rendered instrument view is not an independent measurement producer.', [
    row('pin.fields.level.value', 'Selected pin level', 'digital-level', 'instrument', { unit: 'logic-level', observationPath: 'pin.time.cycle', timeBasisPath: 'pin.time.basis' }),
    row('serial.retainedTextLength', 'Retained serial text length', 'count', 'instrument', { unit: 'characters', observationPath: 'serial.time.cycle', timeBasisPath: 'serial.time.basis' }),
  ]),
  adapter('intent-mcu-runtime-trace@1', 'x82-runtime-trace-native-v2', 'Trace retention and native timebase remain mandatory; display rows do not prove completeness.', [
    row('level', 'Runtime trace level', 'digital-level', 'logic', { unit: 'logic-level', collection: 'records', idPath: 'sequence', observationPath: 'cycle' }),
  ]),
  adapter('intent-mcu-headless-experiment-result@1', 'x82-headless-native-v2', 'A derived headless result is not itself a new measurement producer.', [
    row('observed.level', 'Headless source observation GPIO level', 'digital-level', 'source-result', { unit: 'logic-level', collection: 'observations', idPath: 'scenarioId', observationPath: 'virtualMilliseconds' }),
  ]),
  adapter('intent-mcu-headless-counterexample-reduction-result@1', 'x82-counterexample-native-v2', 'Reduced counterexample output cannot increase source evidence authority.', [
    row('reduction.reduced.scenarioCount', 'Reduced scenario count', 'count', 'source-result', { unit: 'scenarios' }),
    row('reduction.reduced.eventCount', 'Reduced event count', 'count', 'source-result', { unit: 'events' }),
  ]),
  adapter('intent-mcu-external-client-result@1', 'x82-external-native-v2', 'The local client projects existing evidence and is not an independent producer.', [
    row('authoritativeResult.result.observation.observed.d13', 'External-client source observation D13', 'digital-level', 'source-result', { unit: 'logic-level', observationPath: 'authoritativeResult.result.observation.virtualMilliseconds' }),
    row('authoritativeResult.result.observation.observed.level', 'External-client source observation level', 'digital-level', 'source-result', { unit: 'logic-level', observationPath: 'authoritativeResult.result.observation.virtualMilliseconds' }),
  ]),
  adapter('intent-mcu-control-runtime-evidence@1', 'x82-control-catalogue-native-v2', 'Static control capability text is not proof that firmware executed.', [
    row('runtimeMeasurement', 'Runtime measurement', 'unsupported-observation', 'capability-catalogue', { limitation: 'This static catalogue carries no runtime measurement; value and coordinate remain unavailable.' }),
  ]),
];

const expectedOwners = [...MEASUREMENT_PRODUCER_REGISTRY.reportOwners,
  ...MEASUREMENT_PRODUCER_REGISTRY.surfaceOwners];
if (ADAPTER_SPECS.length !== expectedOwners.length
    || new Set(ADAPTER_SPECS.map((item) => item.reportSchema)).size !== expectedOwners.length
    || expectedOwners.some((owner) => !ADAPTER_SPECS.some((item) => item.reportSchema === owner.reportSchema))) {
  throw new Error('CHECKABLE_EVIDENCE_ADAPTER_COVERAGE');
}

export const CHECKABLE_EVIDENCE_ADAPTERS = freeze(ADAPTER_SPECS.map((item) => ({
  reportSchema: item.reportSchema,
  adapterId: item.adapterId,
  rowMaps: item.rows.map((map) => ({
    sourcePath: map.collection ? `${map.collection}[].${map.valuePath}` : map.valuePath,
    observationPath: map.observationPath
      ? (map.collection ? `${map.collection}[].${map.observationPath}` : map.observationPath) : null,
    channelId: map.channelId,
  })),
})));

const adapterFor = (schema) => ADAPTER_SPECS.find((item) => item.reportSchema === schema) ?? null;
const ownerFor = (schema) => expectedOwners.find((item) => item.reportSchema === schema) ?? null;
const taggedValue = (value, path) => scalar(value) ? known(value)
  : unavailable(`Source field ${path} is unavailable as an accepted primitive measurement; no value was guessed or serialized.`);
const taggedUnit = (unit, path) => unit ? known(unit)
  : unavailable(`Source field ${path} has no accepted measurement unit.`);

function measurementsFor(report, envelope, spec) {
  const rows = [];
  for (const map of spec.rows) {
    const collection = map.collection ? at(report, map.collection) : null;
    const items = map.collection && Array.isArray(collection) ? [...collection] : map.collection ? [] : [report];
    if (items.length === 0) items.push(null);
    for (const [index, item] of items.entries()) {
      const sourcePath = map.collection ? `${map.collection}[].${map.valuePath}` : map.valuePath;
      const observationPath = map.observationPath
        ? (map.collection ? `${map.collection}[].${map.observationPath}` : map.observationPath) : null;
      const rawId = item && map.idPath ? at(item, map.idPath) : index + 1;
      const timeBasis = item && map.timeBasisPath && scalar(at(item, map.timeBasisPath))
        ? at(item, map.timeBasisPath) : envelope.measurementCompleteness.timeBasis;
      rows.push({
        id: `${spec.adapterId}-${idPart(map.valuePath)}-${idPart(rawId ?? index + 1)}`,
        label: map.label, kind: map.kind, channelId: map.channelId,
        value: taggedValue(item === null ? null : at(item, map.valuePath), sourcePath),
        unit: taggedUnit(map.unit, sourcePath), timeBasis,
        observation: observationPath
          ? taggedValue(item === null ? null : at(item, map.observationPath), observationPath)
          : unavailable(`Source owner ${spec.adapterId} exposes no accepted scalar observation coordinate for ${sourcePath}.`),
        sourcePath, provenance: `${envelope.measurementCompleteness.producerId}:${sourcePath}`,
        limitations: [map.limitation ?? spec.limitation],
      });
    }
  }
  return rows;
}

async function modelContextFor(report, sourceProject) {
  if (sourceProject === undefined || sourceProject === null) {
    return unknown('Source evidence did not carry a validated, report-bound model-library project; current was not assumed.');
  }
  const sourceProjectSha256 = await experimentPackageSha256(sourceProject);
  if (!HASH.test(report.projectSha256 ?? '') || report.projectSha256 !== sourceProjectSha256) {
    throw Object.assign(new Error('CHECKABLE_EVIDENCE_MODEL_PROJECT_BINDING'),
      { code: 'CHECKABLE_EVIDENCE_MODEL_PROJECT_BINDING' });
  }
  const resolved = normalizeModelLibraryLock(sourceProject.modelLibrary);
  if (!resolved.ok) throw Object.assign(new Error(resolved.code), { code: resolved.code });
  return { state: 'known', lock: clone(resolved.lock), sourceProject: clone(sourceProject), sourceProjectSha256 };
}

function limitationRows(envelope, spec, modelContext) {
  const rows = envelope.measurementCompleteness.limitations.map((text, index) => ({
    id: `completeness-${index + 1}`, owner: envelope.measurementCompleteness.producerId,
    category: 'measurement-completeness', text,
  }));
  rows.push({ id: 'source-owner-1', owner: spec.adapterId, category: 'source-owner', text: spec.limitation });
  const profile = envelope.measurementCompleteness.provenance.profile;
  const controller = publicControllerView(profile);
  if (controller) rows.push({ id: 'profile-1', owner: profile, category: 'profile', text: controller.limitation });
  else rows.push({ id: 'profile-unknown-1', owner: 'profile-context', category: 'profile',
    text: `Profile ${profile || 'unknown'} has no exact installed public-profile limitation authority.` });
  if (modelContext.state === 'known') {
    const resolved = normalizeModelLibraryLock(modelContext.lock);
    const entries = resolved.ok ? resolved.manifest.entries.filter((entry) => entry.profile === profile) : [];
    const seen = new Set();
    for (const entry of entries) for (const text of entry.semantic.support?.limitations ?? []) {
      if (seen.has(text)) continue;
      seen.add(text);
      rows.push({ id: `model-${rows.length + 1}`, owner: entry.modelId, category: 'model', text });
    }
    if (entries.length === 0) rows.push({ id: 'model-profile-unavailable-1', owner: modelContext.lock.libraryId,
      category: 'model', text: `The report-bound validated model-library project has no entry for profile ${profile}; no model limit was inferred.` });
  } else rows.push({ id: 'model-unknown-1', owner: 'model-library-context', category: 'model', text: modelContext.reason });
  return rows;
}

function reportWithoutHash(value) {
  const copy = clone(value); copy.integrity.reportSha256 = ''; return copy;
}

async function draftReport(envelope, modelContext) {
  const spec = adapterFor(envelope.reportSchema); const owner = ownerFor(envelope.reportSchema);
  if (!spec || !owner) throw Object.assign(new Error('CHECKABLE_EVIDENCE_OWNER_UNREGISTERED'),
    { code: 'CHECKABLE_EVIDENCE_OWNER_UNREGISTERED' });
  const profileId = envelope.measurementCompleteness.provenance.profile;
  const profile = publicControllerView(profileId) ? known(profileId)
    : unknown(`Source profile ${profileId || 'unknown'} is not one exact installed public profile.`);
  return {
    schema: CHECKABLE_EVIDENCE_REPORT_SCHEMA, version: CHECKABLE_EVIDENCE_REPORT_VERSION,
    reportId: `${owner.producerId}:${envelope.reportSha256.slice(0, 16)}`, profile,
    producer: { reportSchema: owner.reportSchema, producerId: owner.producerId,
      evidenceClass: owner.evidenceClass, timeBasis: owner.timeBasis, adapterId: spec.adapterId },
    modelContext: clone(modelContext), sourceEnvelope: clone(envelope),
    measurements: measurementsFor(envelope.report, envelope, spec),
    limitations: limitationRows(envelope, spec, modelContext),
    outcome: { reportedAcademicStatus: envelope.reportedAcademicStatus,
      effectiveAcademicStatus: envelope.effectiveAcademicStatus },
    integrity: { sourceReportSha256: envelope.reportSha256,
      completenessProjectionSha256: envelope.measurementCompleteness.projectionSha256, reportSha256: '' },
    truthBoundary: CHECKABLE_EVIDENCE_TRUTH_BOUNDARY,
  };
}

export async function createCheckableEvidenceReport(report, { sourceProject = null } = {}) {
  const envelope = await createMeasurementReportEnvelope(report);
  await validateMeasurementReportEnvelope(envelope);
  const value = await draftReport(envelope, await modelContextFor(report, sourceProject));
  value.integrity.reportSha256 = await measurementSha256(reportWithoutHash(value));
  return freeze(value);
}

function validTagged(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !['known', 'unknown', 'unavailable'].includes(value.state)) return false;
  if (value.state === 'known') return exactKeys(value, ['state', 'value']) && scalar(value.value);
  return exactKeys(value, ['state', 'reason']) && typeof value.reason === 'string' && value.reason.length > 0;
}

export async function validateCheckableEvidenceReport(value) {
  const top = ['schema', 'version', 'reportId', 'profile', 'producer', 'modelContext', 'sourceEnvelope',
    'measurements', 'limitations', 'outcome', 'integrity', 'truthBoundary'];
  if (!exactKeys(value, top) || value.schema !== CHECKABLE_EVIDENCE_REPORT_SCHEMA
      || value.version !== CHECKABLE_EVIDENCE_REPORT_VERSION || typeof value.reportId !== 'string'
      || !validTagged(value.profile) || !Array.isArray(value.measurements) || !value.measurements.length
      || !Array.isArray(value.limitations) || !value.limitations.length
      || value.truthBoundary !== CHECKABLE_EVIDENCE_TRUTH_BOUNDARY
      || !exactKeys(value.integrity, ['sourceReportSha256', 'completenessProjectionSha256', 'reportSha256'])
      || Object.values(value.integrity).some((hash) => !HASH.test(hash))) {
    throw Object.assign(new Error('CHECKABLE_EVIDENCE_REPORT_SHAPE'), { code: 'CHECKABLE_EVIDENCE_REPORT_SHAPE' });
  }
  const envelope = await validateMeasurementReportEnvelope(value.sourceEnvelope);
  const modelContext = value.modelContext?.state === 'known'
    ? await modelContextFor(envelope.report, value.modelContext.sourceProject)
    : await modelContextFor(envelope.report, null);
  if (stableMeasurementStringify(value.modelContext) !== stableMeasurementStringify(modelContext)) {
    throw Object.assign(new Error('CHECKABLE_EVIDENCE_MODEL_CONTEXT'), { code: 'CHECKABLE_EVIDENCE_MODEL_CONTEXT' });
  }
  const expected = await draftReport(envelope, modelContext);
  expected.integrity.reportSha256 = await measurementSha256(reportWithoutHash(expected));
  if (stableMeasurementStringify(value) !== stableMeasurementStringify(expected)) {
    throw Object.assign(new Error('CHECKABLE_EVIDENCE_REPORT_NONCANONICAL'),
      { code: 'CHECKABLE_EVIDENCE_REPORT_NONCANONICAL' });
  }
  return freeze(clone(value));
}

export function canonicalCheckableEvidenceText(value) { return `${JSON.stringify(value, null, 2)}\n`; }
export async function checkableEvidenceDownloadSha256(value) {
  await validateCheckableEvidenceReport(value);
  return measurementSha256(canonicalCheckableEvidenceText(value));
}
export function checkableEvidenceDisclosure(value) {
  if (!value) return 'No current evidence report. Build and Run are never started by this disclosure.';
  const knownRows = value.measurements.filter((item) => item.value.state === 'known').length;
  return `${knownRows}/${value.measurements.length} measurement rows available · ${value.producer.evidenceClass} · ${value.producer.timeBasis}. Hashes bind identity/integrity, not truth.`;
}
