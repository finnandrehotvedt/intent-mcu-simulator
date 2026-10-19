// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  MEASUREMENT_PRODUCER_REGISTRY,
  createMeasurementReportEnvelope,
  known,
  measurementSha256,
  stableMeasurementStringify,
  unavailable,
  unknown,
  validateMeasurementReportEnvelope,
} from './measurement-completeness.mjs';
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

function at(value, path) {
  return path.split('.').filter(Boolean).reduce((item, key) => item?.[key], value);
}

function scalar(value) {
  if (value === null || value === undefined) return null;
  if (['string', 'number', 'boolean'].includes(typeof value) && (typeof value !== 'number' || Number.isFinite(value))) {
    return value;
  }
  return stableMeasurementStringify(value);
}

const spec = (reportSchema, adapterId, {
  collection = null, valuePath, idPath = null, label, kind = 'state', channelId,
  unit = null, limitation,
}) => ({ reportSchema, adapterId, collection, valuePath, idPath, label, kind, channelId, unit, limitation });

// Every current report/surface owner has one explicit adapter and one finite,
// allowlisted native path. Missing paths remain unavailable; no recursive scan
// or field-name inference is permitted.
const ADAPTER_SPECS = [
  spec('intent-mcu-regression-report@1', 'x82-regression-actual-v1', { collection: 'results', valuePath: 'actual', idPath: 'caseId', label: 'Profile-native actual observation', kind: 'state', channelId: 'matrix-results', limitation: 'Mixed profile observations retain their source-native timebases and are never compared numerically.' }),
  spec('intent-mcu-x26-version-regression@1', 'x82-reviewed-version-result-v1', { collection: 'results', valuePath: 'outcomeStableAcrossReleases', idPath: 'caseId', label: 'Reviewed outcome stability', kind: 'comparison', channelId: 'reviewed-release-reports', limitation: 'Reviewed imports are historical evidence and never become a fresh execution.' }),
  spec('intent-mcu-coverage-report@1', 'x82-coverage-count-v1', { valuePath: 'counts.executed', label: 'Executed declared partitions', kind: 'count', channelId: 'regression-evidence', unit: 'partitions', limitation: 'Declared input partitions are not instruction or physical-behaviour coverage.' }),
  spec('intent-mcu-long-duration-report@1', 'x82-long-duration-cycle-v1', { collection: 'results', valuePath: 'rawVirtualTime.cycle', idPath: 'cellId', label: 'Observed final virtual cycle', kind: 'timepoint', channelId: 'logic', unit: 'cpu-cycle', limitation: 'Accelerated virtual cycles are not physical elapsed time or durability evidence.' }),
  spec('intent-mcu-time-invariance-report@1', 'x82-time-final-cycle-v1', { collection: 'executions', valuePath: 'actual.finalCpuCycles', idPath: 'executionId', label: 'Final CPU cycle', kind: 'timepoint', channelId: 'clock', unit: 'cpu-cycle', limitation: 'Pacing diagnostics are not a wall-time or physical-time measurement.' }),
  spec('intent-mcu-event-order-report@1', 'x82-event-order-phases-v1', { collection: 'executions', valuePath: 'phases', idPath: 'executionId', label: 'Ordered producer phases', kind: 'state', channelId: 'input', limitation: 'Phase order is one bounded paused AVR epoch, not universal asynchronous ordering.' }),
  spec('intent-mcu-reset-class-report@1', 'x82-reset-after-cycle-v1', { collection: 'executions', valuePath: 'after.cpuCycles', idPath: 'executionId', label: 'Post-reset CPU cycle', kind: 'timepoint', channelId: 'memory', unit: 'cpu-cycle', limitation: 'Reset classes are simulator contracts and do not claim physical reset timing or SRAM retention.' }),
  spec('intent-mcu-unsupported-access-report@1', 'x82-unsupported-stop-cycle-v1', { collection: 'executions', valuePath: 'stop.cycle', idPath: 'executionId', label: 'Capability-stop cycle', kind: 'timepoint', channelId: 'unsupported-access', unit: 'cpu-cycle', limitation: 'One detected unsupported access is not exhaustive register or opcode coverage.' }),
  spec('intent-mcu-digital-state-report@1', 'x82-static-resolution-v1', { collection: 'repeats.0.rows', valuePath: 'resolution', idPath: 'caseId', label: 'Static ideal-net resolution', kind: 'state', channelId: 'resolver', limitation: 'Static ideal-net classification is not runtime or physical voltage evidence.' }),
  spec('intent-mcu-x33-runtime-digital-state-report@1', 'x82-runtime-digital-row-v1', { collection: 'repeats.0.rows', valuePath: 'resolution', idPath: 'caseId', label: 'Runtime-backed ideal-net classification', kind: 'state', channelId: 'topology', limitation: 'Actual worker pin producers remain separate from the project-owned ideal topology.' }),
  spec('intent-mcu-x34-instrumented-precision-report@1', 'x82-precision-adc-v1', { collection: 'repeats', valuePath: 'transaction.adc.sampleCycles', idPath: 'repeat', label: 'ADC sample cycles', kind: 'state', channelId: 'adc', unit: 'cpu-cycle', limitation: 'The instrumented fixture is bounded and does not establish analogue or physical precision.' }),
  spec('intent-mcu-x35-causal-chain-report@1', 'x82-causal-led-v1', { collection: 'repeats', valuePath: 'causalChain.ledModel', idPath: 'repeat', label: 'LED-model causal observation', kind: 'state', channelId: 'led-model', limitation: 'The causal chain is one project-owned ideal model, not electrical or physical proof.' }),
  spec('intent-mcu-x36-failure-replay-report@1', 'x82-replay-instruction-v1', { collection: 'repeats', valuePath: 'fault.instructionOrdinal', idPath: 'repeat', label: 'Fault instruction ordinal', kind: 'timepoint', channelId: 'instruction', unit: 'instruction-order', limitation: 'Instruction order has no accepted numeric cycle or elapsed-time equivalence.' }),
  spec('intent-mcu-x23-usart-response-report@1', 'x82-usart-response-byte-v1', { collection: 'repeats', valuePath: 'response.actualByte', idPath: 'repeat', label: 'Observed USART response byte', kind: 'byte-record', channelId: 'uart-rx', unit: 'byte', limitation: 'The bounded USART fixture is not generic bus, SPI or I2C evidence.' }),
  spec('intent-mcu-authored-scenario-report@1', 'x82-authored-gpio-v1', { collection: 'results', valuePath: 'observed.level', idPath: 'scenarioId', label: 'Observed authored-scenario GPIO level', kind: 'digital-level', channelId: 'gpio', unit: 'logic-level', limitation: 'The thermostat uses ideal teaching inputs and an LED command indicator, not room or heater physics.' }),
  spec('intent-mcu-thermostat-observation-result@1', 'x82-thermostat-gpio-v1', { valuePath: 'observed.level', label: 'Observed thermostat GPIO level', kind: 'digital-level', channelId: 'gpio', unit: 'logic-level', limitation: 'One thermostat observation is bounded to its declared ideal scenario and interval.' }),
  spec('intent-mcu-scenario-observation-result@1', 'x82-scenario-gpio-v1', { valuePath: 'observed.level', label: 'Observed scenario GPIO level', kind: 'digital-level', channelId: 'gpio', unit: 'logic-level', limitation: 'Scenario observations do not imply unmeasured component or physical behaviour.' }),
  spec('intent-mcu-x39-failure-location@1', 'x82-failure-location-time-v1', { valuePath: 'time.virtualMilliseconds', label: 'Failure observation coordinate', kind: 'timepoint', channelId: 'source-observation', unit: 'virtual-millisecond', limitation: 'The locator is transient derived navigation, not a debugger or replay authority.' }),
  spec('intent-mcu-x40-avr-shared-timeline@1', 'x82-shared-timeline-cycle-v1', { collection: 'records', valuePath: 'cycle', idPath: 'sequence', label: 'Shared timeline cycle', kind: 'timepoint', channelId: 'test', unit: 'cpu-cycle', limitation: 'The shared timeline is one AVR worker axis and cannot be compared with unlike profiles.' }),
  spec('intent-mcu-instrument-evidence@1', 'x82-instrument-cycle-v1', { valuePath: 'snapshot.cycle', label: 'Instrument snapshot cycle', kind: 'timepoint', channelId: 'instrument', unit: 'cpu-cycle', limitation: 'Instrument evidence retains its owning producer and cannot create missing runtime authority.' }),
  spec('intent-mcu-shared-instrument-summary@1', 'x82-instrument-summary-v1', { valuePath: 'classification', label: 'Shared instrument classification', kind: 'state', channelId: 'instrument', limitation: 'A summary is a derived view and cannot strengthen its source evidence.' }),
  spec('intent-mcu-shared-instrument-view@1', 'x82-instrument-view-v1', { valuePath: 'classification', label: 'Instrument view classification', kind: 'state', channelId: 'instrument', limitation: 'A rendered instrument view is not an independent measurement producer.' }),
  spec('intent-mcu-runtime-trace@1', 'x82-runtime-trace-records-v1', { collection: 'records', valuePath: 'level', idPath: 'sequence', label: 'Runtime trace level', kind: 'digital-level', channelId: 'logic', unit: 'logic-level', limitation: 'Trace retention and native timebase remain mandatory; display rows do not prove completeness.' }),
  spec('intent-mcu-headless-experiment-result@1', 'x82-headless-status-v1', { valuePath: 'outcome.academicStatus', label: 'Headless academic status', kind: 'state', channelId: 'source-result', limitation: 'A derived headless status is not itself a native measurement.' }),
  spec('intent-mcu-headless-counterexample-reduction-result@1', 'x82-counterexample-status-v1', { valuePath: 'outcome.academicStatus', label: 'Counterexample academic status', kind: 'state', channelId: 'source-result', limitation: 'Reduced counterexample output cannot increase source evidence authority.' }),
  spec('intent-mcu-external-client-result@1', 'x82-external-status-v1', { valuePath: 'outcome.academicStatus', label: 'External-client academic status', kind: 'state', channelId: 'source-result', limitation: 'The local client projects existing evidence and is not an independent producer.' }),
  spec('intent-mcu-control-runtime-evidence@1', 'x82-control-catalogue-count-v1', { collection: 'records', valuePath: 'observableEffect', idPath: 'id', label: 'Documented control effect', kind: 'state', channelId: 'capability-catalogue', limitation: 'Static control capability text is not proof that firmware executed.' }),
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
  sourcePath: item.collection ? `${item.collection}[].${item.valuePath}` : item.valuePath,
  channelId: item.channelId,
})));

const adapterFor = (schema) => ADAPTER_SPECS.find((item) => item.reportSchema === schema) ?? null;
const ownerFor = (schema) => expectedOwners.find((item) => item.reportSchema === schema) ?? null;

function valueState(value, sourcePath) {
  const normalized = scalar(value);
  return normalized === null
    ? unavailable(`Source field ${sourcePath} is unavailable; no measurement was guessed.`)
    : known(normalized);
}

function unitState(unit, sourcePath) {
  return unit ? known(unit) : unavailable(`Source field ${sourcePath} has no accepted unit.`);
}

function measurementsFor(report, envelope, adapter) {
  const collection = adapter.collection ? at(report, adapter.collection) : null;
  const items = adapter.collection && Array.isArray(collection) ? collection : adapter.collection ? [] : [report];
  const sourcePath = adapter.collection ? `${adapter.collection}[].${adapter.valuePath}` : adapter.valuePath;
  if (items.length === 0) items.push(null);
  return items.map((item, index) => {
    const value = item === null ? null : at(item, adapter.valuePath);
    const rawId = item && adapter.idPath ? at(item, adapter.idPath) : index + 1;
    return {
      id: `${adapter.adapterId}-${idPart(rawId ?? index + 1)}`,
      label: adapter.label,
      kind: adapter.kind,
      channelId: adapter.channelId,
      value: valueState(value, sourcePath),
      unit: unitState(adapter.unit, sourcePath),
      timeBasis: envelope.measurementCompleteness.timeBasis,
      observation: clone(envelope.measurementCompleteness.observedThrough),
      sourcePath,
      provenance: `${envelope.measurementCompleteness.producerId}:${sourcePath}`,
      limitations: [adapter.limitation],
    };
  });
}

function modelContextFor(lock) {
  if (lock === undefined || lock === null) {
    return unknown('Source evidence did not carry a validated model-library lock; current was not assumed.');
  }
  const resolved = normalizeModelLibraryLock(lock);
  if (!resolved.ok) throw Object.assign(new Error(resolved.code), { code: resolved.code });
  return { state: 'known', lock: clone(resolved.lock) };
}

function limitationRows(envelope, adapter, modelContext) {
  const rows = envelope.measurementCompleteness.limitations.map((text, index) => ({
    id: `completeness-${index + 1}`, owner: envelope.measurementCompleteness.producerId,
    category: 'measurement-completeness', text,
  }));
  rows.push({ id: 'source-owner-1', owner: adapter.adapterId,
    category: 'source-owner', text: adapter.limitation });
  const profile = envelope.measurementCompleteness.provenance.profile;
  const controller = publicControllerView(profile);
  if (controller) rows.push({ id: 'profile-1', owner: profile,
    category: 'profile', text: controller.limitation });
  else rows.push({ id: 'profile-unknown-1', owner: 'profile-context', category: 'profile',
    text: `Profile ${profile || 'unknown'} has no exact installed public-profile limitation authority.` });
  if (modelContext.state === 'known') {
    const resolved = normalizeModelLibraryLock(modelContext.lock);
    const entries = resolved.ok ? resolved.manifest.entries.filter((entry) => entry.profile === profile) : [];
    const seen = new Set();
    for (const entry of entries) for (const text of entry.semantic.support?.limitations ?? []) {
      if (seen.has(text)) continue;
      seen.add(text); rows.push({ id: `model-${rows.length + 1}`, owner: entry.modelId,
        category: 'model', text });
    }
    if (entries.length === 0) rows.push({ id: 'model-profile-unavailable-1', owner: modelContext.lock.libraryId,
      category: 'model', text: `The validated model-library lock has no entry for profile ${profile}; no model limit was inferred.` });
  } else rows.push({ id: 'model-unknown-1', owner: 'model-library-context', category: 'model', text: modelContext.reason });
  return rows;
}

function reportWithoutHash(value) {
  const copy = clone(value);
  copy.integrity.reportSha256 = '';
  return copy;
}

async function draftReport(envelope, modelContext) {
  const adapter = adapterFor(envelope.reportSchema);
  const owner = ownerFor(envelope.reportSchema);
  if (!adapter || !owner) throw Object.assign(new Error('CHECKABLE_EVIDENCE_OWNER_UNREGISTERED'),
    { code: 'CHECKABLE_EVIDENCE_OWNER_UNREGISTERED' });
  const profileId = envelope.measurementCompleteness.provenance.profile;
  const profile = publicControllerView(profileId) ? known(profileId)
    : unknown(`Source profile ${profileId || 'unknown'} is not one exact installed public profile.`);
  return {
    schema: CHECKABLE_EVIDENCE_REPORT_SCHEMA,
    version: CHECKABLE_EVIDENCE_REPORT_VERSION,
    reportId: `${owner.producerId}:${envelope.reportSha256.slice(0, 16)}`,
    profile,
    producer: {
      reportSchema: owner.reportSchema, producerId: owner.producerId,
      evidenceClass: owner.evidenceClass, timeBasis: owner.timeBasis, adapterId: adapter.adapterId,
    },
    modelContext: clone(modelContext),
    sourceEnvelope: clone(envelope),
    measurements: measurementsFor(envelope.report, envelope, adapter),
    limitations: limitationRows(envelope, adapter, modelContext),
    outcome: {
      reportedAcademicStatus: envelope.reportedAcademicStatus,
      effectiveAcademicStatus: envelope.effectiveAcademicStatus,
    },
    integrity: {
      sourceReportSha256: envelope.reportSha256,
      completenessProjectionSha256: envelope.measurementCompleteness.projectionSha256,
      reportSha256: '',
    },
    truthBoundary: CHECKABLE_EVIDENCE_TRUTH_BOUNDARY,
  };
}

export async function createCheckableEvidenceReport(report, { modelLibraryLock = null } = {}) {
  const envelope = await createMeasurementReportEnvelope(report);
  await validateMeasurementReportEnvelope(envelope);
  const value = await draftReport(envelope, modelContextFor(modelLibraryLock));
  value.integrity.reportSha256 = await measurementSha256(reportWithoutHash(value));
  return freeze(value);
}

function validTagged(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !['known', 'unknown', 'unavailable'].includes(value.state)) return false;
  if (value.state === 'known') return exactKeys(value, ['state', 'value'])
    && ['string', 'number', 'boolean'].includes(typeof value.value)
    && (typeof value.value !== 'number' || Number.isFinite(value.value));
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
    ? modelContextFor(value.modelContext.lock) : modelContextFor(null);
  if (value.modelContext?.state !== modelContext.state
      || stableMeasurementStringify(value.modelContext) !== stableMeasurementStringify(modelContext)) {
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

export function canonicalCheckableEvidenceText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function checkableEvidenceDownloadSha256(value) {
  await validateCheckableEvidenceReport(value);
  return measurementSha256(canonicalCheckableEvidenceText(value));
}

export function checkableEvidenceDisclosure(value) {
  if (!value) return 'No current evidence report. Build and Run are never started by this disclosure.';
  const knownRows = value.measurements.filter((row) => row.value.state === 'known').length;
  return `${knownRows}/${value.measurements.length} measurement rows available · ${value.producer.evidenceClass} · ${value.producer.timeBasis}. Hashes bind identity/integrity, not truth.`;
}
