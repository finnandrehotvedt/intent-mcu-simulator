// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const MEASUREMENT_COMPLETENESS_SCHEMA = 'intent-mcu-measurement-completeness@1';
export const MEASUREMENT_REPORT_ENVELOPE_SCHEMA = 'intent-mcu-measurement-report-envelope@1';

const REPORT_OWNERS = [
  ['intent-mcu-regression-report@1', 'x26-regression-matrix', 'derived-projection', 'unavailable', ['matrix-results']],
  ['intent-mcu-x26-version-regression@1', 'x26-reviewed-version-regression', 'reviewed-import', 'unavailable', ['reviewed-release-reports']],
  ['intent-mcu-coverage-report@1', 'x27-coverage-projection', 'derived-projection', 'unavailable', ['regression-evidence']],
  ['intent-mcu-long-duration-report@1', 'x28-long-duration-avr', 'actual-runtime', 'cpu-cycle', ['input', 'gpio', 'serial', 'logic']],
  ['intent-mcu-time-invariance-report@1', 'x29-time-invariance-avr', 'actual-runtime', 'cpu-cycle', ['gpio', 'serial', 'clock']],
  ['intent-mcu-event-order-report@1', 'x30-event-order-avr', 'actual-runtime', 'cpu-cycle', ['input', 'gpio', 'serial']],
  ['intent-mcu-reset-class-report@1', 'x31-reset-class-avr', 'actual-runtime', 'reset-epoch-sequence', ['memory', 'controls', 'input', 'gpio']],
  ['intent-mcu-unsupported-access-report@1', 'x32-unsupported-access-avr', 'actual-runtime', 'cpu-cycle', ['cpu', 'gpio', 'unsupported-access']],
  ['intent-mcu-digital-state-report@1', 'x33-static-digital-state', 'static-model', 'static-no-time', ['annotations', 'topology', 'resolver']],
  ['intent-mcu-x33-runtime-digital-state-report@1', 'x33-runtime-digital-state-avr', 'actual-runtime', 'cpu-cycle', ['gpio', 'topology']],
  ['intent-mcu-x34-instrumented-precision-report@1', 'x34-instrumented-precision-avr', 'actual-runtime', 'cpu-cycle', ['sram', 'adc', 'gpio']],
  ['intent-mcu-x35-causal-chain-report@1', 'x35-causal-chain-avr', 'actual-runtime', 'cpu-cycle', ['instruction', 'register', 'gpio', 'net-model', 'led-model']],
  ['intent-mcu-x36-failure-replay-report@1', 'x36-failure-replay-avr', 'actual-runtime', 'instruction-order-only', ['instruction', 'fault', 'pending-input']],
  ['intent-mcu-x23-usart-response-report@1', 'x23-usart-response-avr', 'actual-runtime', 'cpu-cycle', ['uart-tx', 'fixture-rx', 'uart-rx', 'gpio', 'serial']],
  ['intent-mcu-authored-scenario-report@1', 'authored-scenario-avr', 'actual-runtime', 'virtual-millisecond', ['input', 'gpio', 'serial']],
];

const SURFACE_OWNERS = [
  ['intent-mcu-bounded-test-evidence@1', 'bounded-thermostat-suite-avr', 'actual-runtime', 'reset-epoch-sequence', ['input', 'gpio', 'serial']],
  ['intent-mcu-thermostat-observation-result@1', 'thermostat-observation-avr', 'actual-runtime', 'virtual-millisecond', ['input', 'gpio', 'serial']],
  ['intent-mcu-scenario-observation-result@1', 'scenario-observation-avr', 'actual-runtime', 'virtual-millisecond', ['input', 'gpio']],
  ['intent-mcu-x39-failure-location@1', 'x39-failure-location', 'derived-projection', 'virtual-millisecond', ['source-observation']],
  ['intent-mcu-x40-avr-shared-timeline@1', 'x40-shared-timeline-avr', 'actual-runtime', 'cpu-cycle', ['reset', 'input', 'gpio', 'serial', 'test']],
  ['intent-mcu-instrument-evidence@1', 'shared-instrument-evidence', 'derived-projection', 'unavailable', ['instrument']],
  ['intent-mcu-shared-instrument-summary@1', 'shared-instrument-summary', 'derived-projection', 'unavailable', ['instrument']],
  ['intent-mcu-shared-instrument-view@1', 'shared-instrument-view', 'derived-projection', 'unavailable', ['instrument']],
  ['intent-mcu-runtime-trace@1', 'runtime-trace-view', 'derived-projection', 'unavailable', ['logic']],
  ['intent-mcu-headless-experiment-result@1', 'headless-experiment-result', 'derived-projection', 'unavailable', ['source-result']],
  ['intent-mcu-headless-counterexample-reduction-result@1', 'headless-counterexample-result', 'derived-projection', 'unavailable', ['source-result']],
  ['intent-mcu-external-client-result@1', 'external-client-result', 'derived-projection', 'unavailable', ['source-result']],
  ['intent-mcu-control-runtime-evidence@1', 'control-runtime-evidence', 'static-model', 'static-no-time', ['capability-catalogue']],
];

const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

const owner = ([reportSchema, producerId, evidenceClass, timeBasis, channels]) => ({
  reportSchema, producerId, evidenceClass, timeBasis, channels: [...channels],
});

export const MEASUREMENT_PRODUCER_REGISTRY = freeze({
  schema: 'intent-mcu-measurement-producer-registry@1',
  reportOwners: REPORT_OWNERS.map(owner),
  surfaceOwners: SURFACE_OWNERS.map(owner),
});

const REQUIRED_IDENTITIES = Object.freeze(Object.fromEntries([
  ...REPORT_OWNERS.filter(([, , evidenceClass]) => evidenceClass === 'actual-runtime')
    .map(([schema]) => [schema, ['source', 'artifact']]),
  ['intent-mcu-authored-scenario-report@1', ['project', 'artifact']],
  ['intent-mcu-thermostat-observation-result@1', ['source', 'artifact']],
  ['intent-mcu-scenario-observation-result@1', ['source', 'artifact']],
  ['intent-mcu-x40-avr-shared-timeline@1', ['source', 'artifact']],
  ['intent-mcu-bounded-test-evidence@1', ['source', 'artifact']],
]));

const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const HASH = /^[a-f0-9]{64}$/u;
const NON_NEGATIVE = (value) => Number.isSafeInteger(value) && value >= 0;

export function stableMeasurementStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableMeasurementStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stableMeasurementStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export async function measurementSha256(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : stableMeasurementStringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const known = (value, detail = undefined) => detail === undefined
  ? { state: 'known', value } : { state: 'known', value, detail };
export const unknown = (reason) => ({ state: 'unknown', reason });
export const unavailable = (reason) => ({ state: 'unavailable', reason });

function registryOwner(schema) {
  return [...MEASUREMENT_PRODUCER_REGISTRY.reportOwners,
    ...MEASUREMENT_PRODUCER_REGISTRY.surfaceOwners].find((item) => item.reportSchema === schema) ?? null;
}

function tagged(value, kind) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !['known', 'unknown', 'unavailable'].includes(value.state)) return false;
  if (value.state !== 'known') return exactKeys(value, ['state', 'reason'])
    && typeof value.reason === 'string' && value.reason.length > 0;
  if (!exactKeys(value, value.detail === undefined ? ['state', 'value'] : ['state', 'value', 'detail'])) return false;
  if (kind === 'count' || kind === 'bound') return NON_NEGATIVE(value.value);
  if (kind === 'string') return typeof value.value === 'string' && value.value.length > 0;
  if (kind === 'boolean') return typeof value.value === 'boolean'
    && (value.detail === undefined || (value.detail && typeof value.detail === 'object' && !Array.isArray(value.detail)));
  return false;
}

function identity(value, reason) {
  return typeof value === 'string' && value.length > 0 ? known(value) : unknown(reason);
}

function provenance(report) {
  const profile = report.profile ?? report.project?.profile ?? report.producer?.profile ?? 'mixed-or-not-declared';
  const identities = [
    ['report-schema', report.schema],
    ['semantic-report', report.semanticSha256],
    ['project', report.projectSha256 ?? report.bindings?.projectSha256],
    ['source', report.sourceSha256 ?? report.sourceIdentity ?? report.bindings?.sourceSha256],
    ['artifact', report.artifactSha256 ?? report.artifactIdentity ?? report.artifactIdentitySha256
      ?? report.bindings?.artifactIdentitySha256],
    ['topology', report.topologySha256 ?? report.graphSha256],
    ['runtime', report.runtimeIdentity?.artifactIdentity],
  ].map(([kind, value]) => ({ kind, value: identity(value, `${kind} identity is not carried by this report`) }));
  return { profile, identities };
}

function unavailableBounds(reason) {
  return { from: unavailable(reason), through: unavailable(reason) };
}

function unknownBounds(reason) {
  return { from: unknown(`${reason} lower bound`), through: unknown(`${reason} upper bound`) };
}

function bound(value, reason) {
  return NON_NEGATIVE(value) ? known(value) : unknown(reason);
}

function interval(id, observedFrom, observedThrough, requiredFrom, requiredThrough,
  mode = 'contains-required') {
  return { id, mode, observedFrom, observedThrough, requiredFrom, requiredThrough };
}

function observedIntervals(report, timeBasis) {
  if (timeBasis === 'static-no-time') return {
    bounds: unavailableBounds('static model has no runtime interval'),
    intervals: [interval('static', unavailable('static model has no runtime interval'),
      unavailable('static model has no runtime interval'), unavailable('static requirement has no runtime interval'),
      unavailable('static requirement has no runtime interval'))],
  };
  if (timeBasis === 'instruction-order-only') return {
    bounds: unavailableBounds('instruction-order evidence has no accepted numeric time unit'),
    intervals: [interval('instruction-order',
      unavailable('instruction-order evidence has no accepted numeric time unit'),
      unavailable('instruction-order evidence has no accepted numeric time unit'),
      unavailable('instruction-order requirement has no accepted numeric time unit'),
      unavailable('instruction-order requirement has no accepted numeric time unit'))],
  };
  if (timeBasis === 'unavailable') return {
    bounds: unavailableBounds('owner combines or derives evidence without one comparable native timebase'),
    intervals: [interval('derived',
      unavailable('derived evidence has no comparable native interval'),
      unavailable('derived evidence has no comparable native interval'),
      unavailable('derived requirement has no comparable native interval'),
      unavailable('derived requirement has no comparable native interval'))],
  };
  if (['reset-epoch-sequence', 'adapter-epoch-sequence'].includes(timeBasis)) return {
    bounds: unavailableBounds(`${timeBasis} keeps independent epochs rather than one numeric interval`),
    intervals: (report.executions ?? report.repeats ?? report.results ?? [{}]).map((_, index) => interval(
      `${timeBasis}-${index + 1}`,
      unavailable(`${timeBasis} has no cross-epoch numeric lower bound`),
      unavailable(`${timeBasis} has no cross-epoch numeric upper bound`),
      unavailable(`${timeBasis} requirement is sequence based`),
      unavailable(`${timeBasis} requirement is sequence based`),
    )),
  };
  if (report.schema === 'intent-mcu-authored-scenario-report@1' && Array.isArray(report.results)) {
    const intervals = report.results.map((result, index) => interval(
      result.scenarioId ?? `scenario-${index + 1}`,
      bound(result.observed?.windowStartMilliseconds, 'scenario observed start is missing'),
      bound(result.observed?.windowEndMilliseconds, 'scenario observed end is missing'),
      bound(result.expected?.windowStartMilliseconds, 'scenario required start is missing'),
      bound(result.expected?.windowEndMilliseconds, 'scenario required end is missing'),
    ));
    return {
      bounds: intervals.length === 1 ? { from: intervals[0].observedFrom, through: intervals[0].observedThrough }
        : unavailableBounds('scenario reports use independent runtime epochs; see per-scenario intervals'),
      intervals,
    };
  }
  if (report.schema === 'intent-mcu-scenario-observation-result@1') {
    const observed = report.observed?.captureWindow;
    const required = report.expected?.observationWindow;
    const item = interval(report.scenarioId ?? 'scenario',
      bound(observed?.minimumMilliseconds, 'scenario observed start is missing'),
      bound(observed?.maximumMilliseconds, 'scenario observed end is missing'),
      bound(required?.startMilliseconds, 'scenario required start is missing'),
      bound(required?.endMilliseconds, 'scenario required end is missing'));
    return { bounds: { from: item.observedFrom, through: item.observedThrough }, intervals: [item] };
  }
  if (report.schema === 'intent-mcu-time-invariance-report@1' && Array.isArray(report.executions)) {
    const intervals = report.executions.map((execution, index) => interval(
      execution.executionId ?? `execution-${index + 1}`,
      bound(execution.ready?.cpuCycles, 'execution observed start cycle is missing'),
      bound(execution.actual?.finalCpuCycles, 'execution observed final cycle is missing'),
      bound(execution.requirement?.observationStartCycle, 'execution required start cycle is missing'),
      bound(execution.requirement?.observationEndCycle, 'execution required end cycle is missing')));
    return { bounds: unavailableBounds('executions use independent worker epochs; see per-execution intervals'), intervals };
  }
  const reason = `owner does not expose explicit comparable ${timeBasis} observation and requirement bounds`;
  return { bounds: unknownBounds(reason), intervals: [interval('report',
    unknown(`${reason}: observed start`), unknown(`${reason}: observed end`),
    unknown(`${reason}: required start`), unknown(`${reason}: required end`))] };
}

function unknownChannelFacts(reason = 'producer report does not expose this channel fact') {
  return {
    retained: unknown(`${reason}: retained count`),
    dropped: unknown(`${reason}: dropped count`),
    sampled: unknown(`${reason}: sampling strategy`),
    truncated: unknown(`${reason}: truncation boundary`),
  };
}

function fullRetentionFacts(retained, dropped, proof, { sampled, samplingStrategy }) {
  if (!NON_NEGATIVE(retained) || !NON_NEGATIVE(dropped) || typeof sampled !== 'boolean'
      || typeof samplingStrategy !== 'string' || samplingStrategy.length === 0) return null;
  const sampledDetail = sampled
    ? { strategy: samplingStrategy, sufficientForRequirements: true, proof }
    : { strategy: samplingStrategy, sufficientForRequirements: true, proof };
  return {
    retained: known(retained),
    dropped: known(dropped),
    sampled: known(sampled, sampledDetail),
    truncated: known(dropped > 0, { boundary: dropped > 0 ? 'producer drop counter' : 'none', proof }),
  };
}

function explicitOwnerFacts(report, channelId) {
  if (report.schema === 'intent-mcu-bounded-test-evidence@1') {
    const observations = report.observations;
    const hash = /^[a-f0-9]{64}$/u;
    const statuses = new Set(['passed', 'failed', 'indeterminate', 'unsupported']);
    const validTop = Array.isArray(observations) && observations.length === 4
      && new Set(observations.map((item) => item?.scenarioId)).size === observations.length
      && hash.test(report.sourceIdentity ?? '') && hash.test(report.artifactIdentity ?? '')
      && Number.isSafeInteger(report.projectGeneration) && report.projectGeneration >= 1
      && Number.isSafeInteger(report.runtimeGeneration) && report.runtimeGeneration >= 1
      && report.outcome?.schema === 'intent-mcu-experiment-outcome@1'
      && report.outcome?.jobStatus === 'completed' && report.outcome?.evidenceStatus === 'complete'
      && statuses.has(report.status) && report.status === report.outcome.academicStatus
      && report.jobStatus === 'completed'
      && observations.some((item) => item?.scenarioId === report.primaryObservation?.scenarioId
        && item?.status === report.primaryObservation?.status);
    const validRows = validTop && observations.every((item) => {
      const retention = item.retention;
      const retentionValid = retention === undefined || (NON_NEGATIVE(retention.inputEventsDropped)
        && NON_NEGATIVE(retention.serialEventsDropped)
        && retention.inputEventsDropped === 0 && retention.serialEventsDropped === 0);
      return item?.schema === 'intent-mcu-thermostat-observation-result@1'
        && item.experimentId === report.experimentId && typeof item.scenarioId === 'string'
        && statuses.has(item.status) && item.status === item.outcome?.academicStatus
        && item.outcome?.schema === 'intent-mcu-experiment-outcome@1'
        && item.outcome?.jobStatus === 'completed' && item.outcome?.evidenceStatus === 'complete'
        && Number.isFinite(item.virtualMilliseconds) && item.virtualMilliseconds >= 0
        && item.checks?.timeInWindow === true && item.checks?.inputsComplete === true
        && item.checks?.pinObserved === true && item.checks?.serialObserved === true
        && Array.isArray(item.observed?.inputControls) && item.observed.inputControls.length > 0
        && item.observed.inputControls.every((control) => typeof control?.componentId === 'string'
          && typeof control?.key === 'string' && Number.isSafeInteger(control?.targetCycle))
        && item.observed?.d13Mode === 'OUTPUT' && typeof item.observed?.d13 === 'boolean'
        && typeof item.observed?.serialText === 'string' && item.observed.serialText.length > 0
        && retentionValid;
    });
    if (!validRows) return null;
    const aggregate = observations.some((item) => item.status === 'failed') ? 'failed'
      : observations.some((item) => item.status === 'indeterminate') ? 'indeterminate'
      : observations.some((item) => item.status === 'unsupported') ? 'unsupported'
      : observations.every((item) => item.status === 'passed') ? 'passed' : 'indeterminate';
    if (aggregate !== report.status) return null;
    if (channelId === 'input') return fullRetentionFacts(
      observations.reduce((count, item) => count + item.observed.inputControls.length, 0), 0,
      'bounded-test-evidence@1 retains producer-confirmed complete input controls for every reset-isolated row',
      { sampled: false, samplingStrategy: 'full retained input-control set per scenario' });
    if (channelId === 'gpio') return fullRetentionFacts(observations.length, 0,
      'bounded-test-evidence@1 retains one producer-confirmed D13 observation per scenario',
      { sampled: true, samplingStrategy: 'one requirement-owned pin observation per scenario' });
    if (channelId === 'serial') return fullRetentionFacts(observations.length, 0,
      'bounded-test-evidence@1 retains producer-confirmed Serial evidence for every scenario',
      { sampled: false, samplingStrategy: 'full retained Serial text per scenario' });
    return null;
  }
  if (report.schema === 'intent-mcu-authored-scenario-report@1') {
    const results = report.results;
    if (!Array.isArray(results) || !NON_NEGATIVE(report.resultCount)
        || report.resultCount !== results.length || report.completeness?.allEvidenceComplete !== true
        || report.completeness?.scenariosReported !== results.length) return null;
    const validRetention = results.every((result) => NON_NEGATIVE(result.retention?.inputEventsDropped)
      && NON_NEGATIVE(result.retention?.serialEventsDropped));
    if (!validRetention) return null;
    if (channelId === 'input') return fullRetentionFacts(results.length,
      results.reduce((sum, result) => sum + result.retention.inputEventsDropped, 0),
      'authored-scenario-report@1 requires one complete declared input observation and explicit input loss per result',
      { sampled: false, samplingStrategy: 'full retained input-event set per scenario' });
    if (channelId === 'serial') return fullRetentionFacts(results.length,
      results.reduce((sum, result) => sum + result.retention.serialEventsDropped, 0),
      'authored-scenario-report@1 retains an explicit Serial loss counter per result',
      { sampled: false, samplingStrategy: 'full retained Serial evidence set per scenario' });
    if (channelId === 'gpio' && results.every((result) => typeof result.observed?.level === 'boolean'
        && result.checks?.pinObserved === true)) return fullRetentionFacts(results.length, 0,
      'authored-scenario-report@1 requires exactly one accepted pin observation per result',
      { sampled: true, samplingStrategy: 'one requirement-owned capture window per scenario' });
    return null;
  }
  if (report.schema === 'intent-mcu-scenario-observation-result@1') {
    if (channelId === 'input' && Array.isArray(report.observed?.inputControls)
        && NON_NEGATIVE(report.retention?.inputEventsDropped)) return fullRetentionFacts(
      report.observed.inputControls.length, report.retention.inputEventsDropped,
      'scenario-observation-result@1 carries the retained control records and explicit event-log drop counter',
      { sampled: false, samplingStrategy: 'full retained input-event set for the scenario' });
    if (channelId === 'gpio' && typeof report.observed?.level === 'boolean'
        && report.checks?.pinObserved === true) return fullRetentionFacts(1, 0,
      'scenario-observation-result@1 requires exactly one pin capture for its requirement-owned window',
      { sampled: true, samplingStrategy: 'one requirement-owned pin capture window' });
    return null;
  }
  if (report.schema === 'intent-mcu-x40-avr-shared-timeline@1') {
    const names = { input: ['requestedInputs', 'appliedInputs'], gpio: ['gpio'], serial: ['serial'] }[channelId];
    if (!names) return null;
    const records = names.map((name) => report.retention?.[name]);
    if (!records.every((value) => NON_NEGATIVE(value?.retained) && NON_NEGATIVE(value?.dropped))) return null;
    return fullRetentionFacts(records.reduce((sum, value) => sum + value.retained, 0),
      records.reduce((sum, value) => sum + value.dropped, 0),
      `x40-avr-shared-timeline@1 carries explicit ${names.join('+')} retained and dropped counters`,
      { sampled: false, samplingStrategy: 'full retained shared-timeline class' });
  }
  return null;
}

function inferredChannelFacts(report, item, channelId) {
  const explicit = explicitOwnerFacts(report, channelId);
  if (explicit) return explicit;
  if (item.evidenceClass === 'static-model') return {
    retained: unavailable('static evidence has no runtime retention counter'),
    dropped: unavailable('static evidence has no runtime drop counter'),
    sampled: unavailable('static evidence has no runtime sampling process'),
    truncated: unavailable('static evidence has no runtime truncation process'),
  };
  if (item.evidenceClass === 'reviewed-import') return {
    retained: unknown('historical reviewed report did not declare retained measurements'),
    dropped: unknown('historical reviewed report did not declare dropped measurements'),
    sampled: unknown('historical reviewed report did not declare sampling'),
    truncated: unknown('historical reviewed report did not declare truncation'),
  };
  return unknownChannelFacts(`${item.producerId}:${channelId} lacks explicit native facts`);
}

function factMissing(channel, fact) {
  const value = channel[fact];
  if (value.state !== 'known') return `${channel.id}:${fact}:${value.state}`;
  if (fact === 'dropped' && value.value > 0) return `${channel.id}:dropped:${value.value}`;
  if (fact === 'truncated' && value.value) return `${channel.id}:truncated`;
  if (fact === 'sampled' && value.value && value.detail?.sufficientForRequirements !== true) {
    return `${channel.id}:sampling-insufficient`;
  }
  return null;
}

function projectionWithoutHash(value) {
  const projected = structuredClone(value);
  delete projected.projectionSha256;
  return projected;
}

function intervalMissingEvidence(intervals, timeBasis) {
  if (['static-no-time', 'instruction-order-only', 'unavailable',
    'reset-epoch-sequence', 'adapter-epoch-sequence'].includes(timeBasis)) return [];
  const missing = [];
  for (const item of intervals) {
    for (const [name, value] of [['observedFrom', item.observedFrom], ['observedThrough', item.observedThrough],
      ['requiredFrom', item.requiredFrom], ['requiredThrough', item.requiredThrough]]) {
      if (value.state !== 'known') missing.push(`interval:${item.id}:${name}:${value.state}`);
    }
    if ([item.observedFrom, item.observedThrough, item.requiredFrom, item.requiredThrough]
      .some((value) => value.state !== 'known')) continue;
    if (item.observedFrom.value > item.observedThrough.value) missing.push(`interval:${item.id}:observed-reversed`);
    if (item.requiredFrom.value > item.requiredThrough.value) missing.push(`interval:${item.id}:required-reversed`);
    if (item.mode === 'contains-required'
        && (item.observedFrom.value > item.requiredFrom.value
          || item.observedThrough.value < item.requiredThrough.value)) {
      missing.push(`interval:${item.id}:required-not-covered`);
    }
    if (item.mode === 'point-within-required'
        && (item.observedFrom.value !== item.observedThrough.value
          || item.observedFrom.value < item.requiredFrom.value
          || item.observedThrough.value > item.requiredThrough.value)) {
      missing.push(`interval:${item.id}:point-outside-required`);
    }
  }
  return missing;
}

function identityMissingEvidence(value, schema) {
  const required = REQUIRED_IDENTITIES[schema] ?? [];
  const identities = new Map(value.identities.map((item) => [item.kind, item.value]));
  return required.filter((kind) => identities.get(kind)?.state !== 'known')
    .map((kind) => `identity:${kind}:${identities.get(kind)?.state ?? 'missing'}`);
}

function measurementCompletenessDraft(report, {
  channelFacts = {}, observedFrom, observedThrough, requiredFrom, requiredThrough,
  intervals: suppliedIntervals, limitations = [],
} = {}) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('MEASUREMENT_REPORT_REQUIRED');
  const item = registryOwner(report.schema);
  if (!item) throw Object.assign(new Error('MEASUREMENT_PRODUCER_UNREGISTERED'), { code: 'MEASUREMENT_PRODUCER_UNREGISTERED' });
  const observations = observedIntervals(report, item.timeBasis);
  const channels = item.channels.map((id) => ({
    id,
    provenance: `${item.producerId}:${id}`,
    ...structuredClone(channelFacts[id] ?? inferredChannelFacts(report, item, id)),
  }));
  const reportProvenance = provenance(report);
  const missingEvidence = identityMissingEvidence(reportProvenance, report.schema);
  for (const channel of channels) for (const fact of ['retained', 'dropped', 'sampled', 'truncated']) {
    const missing = factMissing(channel, fact);
    if (missing) missingEvidence.push(missing);
  }
  const from = observedFrom ?? observations.bounds.from;
  const through = observedThrough ?? observations.bounds.through;
  const intervals = suppliedIntervals ?? (observedFrom || observedThrough || requiredFrom || requiredThrough
    ? [interval('explicit', from, through,
      requiredFrom ?? unknown('required interval lower bound was not supplied'),
      requiredThrough ?? unknown('required interval upper bound was not supplied'))]
    : observations.intervals);
  missingEvidence.push(...intervalMissingEvidence(intervals, item.timeBasis));
  return {
    schema: MEASUREMENT_COMPLETENESS_SCHEMA,
    producerId: item.producerId,
    evidenceClass: item.evidenceClass,
    provenance: reportProvenance,
    timeBasis: item.timeBasis,
    observedFrom: structuredClone(from),
    observedThrough: structuredClone(through),
    intervals: structuredClone(intervals),
    channels,
    requiredEvidence: [...item.channels],
    missingEvidence,
    completeForRequirements: missingEvidence.length === 0,
    limitations: [
      'Completeness describes declared retention and interval evidence; it does not prove measurement truth.',
      'The projection hash binds identity and integrity only, not physical equivalence or correctness.',
      ...limitations,
    ],
    projectionSha256: '',
  };
}

export function measurementRequirementStatus(report, options = {}) {
  const projection = measurementCompletenessDraft(report, options);
  return freeze({
    completeForRequirements: projection.completeForRequirements,
    missingEvidence: structuredClone(projection.missingEvidence),
    timeBasis: projection.timeBasis,
    observedFrom: structuredClone(projection.observedFrom),
    observedThrough: structuredClone(projection.observedThrough),
    intervals: structuredClone(projection.intervals),
  });
}

export async function createMeasurementCompleteness(report, options = {}) {
  const projection = measurementCompletenessDraft(report, options);
  projection.projectionSha256 = await measurementSha256(projectionWithoutHash(projection));
  return freeze(projection);
}

export async function validateMeasurementCompleteness(value, reportSchema = null) {
  const topKeys = ['schema', 'producerId', 'evidenceClass', 'provenance', 'timeBasis',
    'observedFrom', 'observedThrough', 'intervals', 'channels', 'requiredEvidence', 'missingEvidence',
    'completeForRequirements', 'limitations', 'projectionSha256'];
  if (!exactKeys(value, topKeys) || value.schema !== MEASUREMENT_COMPLETENESS_SCHEMA
      || !HASH.test(value.projectionSha256 ?? '') || !Array.isArray(value.channels)
      || !value.channels.length || !Array.isArray(value.requiredEvidence)
      || !Array.isArray(value.missingEvidence) || !Array.isArray(value.limitations)
      || !value.limitations.length || typeof value.completeForRequirements !== 'boolean'
      || !Array.isArray(value.intervals) || value.intervals.length === 0
      || !exactKeys(value.provenance, ['profile', 'identities'])
      || typeof value.provenance.profile !== 'string' || !Array.isArray(value.provenance.identities)
      || !tagged(value.observedFrom, 'bound') || !tagged(value.observedThrough, 'bound')) {
    throw Object.assign(new Error('MEASUREMENT_COMPLETENESS_SHAPE'), { code: 'MEASUREMENT_COMPLETENESS_SHAPE' });
  }
  const identityKinds = ['report-schema', 'semantic-report', 'project', 'source', 'artifact', 'topology', 'runtime'];
  if (JSON.stringify(value.provenance.identities.map((item) => item?.kind)) !== JSON.stringify(identityKinds)
      || value.provenance.identities.some((item) => !exactKeys(item, ['kind', 'value'])
        || !tagged(item.value, 'string'))) {
    throw Object.assign(new Error('MEASUREMENT_COMPLETENESS_PROVENANCE'),
      { code: 'MEASUREMENT_COMPLETENESS_PROVENANCE' });
  }
  const item = reportSchema ? registryOwner(reportSchema) : [...MEASUREMENT_PRODUCER_REGISTRY.reportOwners,
    ...MEASUREMENT_PRODUCER_REGISTRY.surfaceOwners].find((candidate) => candidate.producerId === value.producerId);
  if (!item || value.producerId !== item.producerId || value.evidenceClass !== item.evidenceClass
      || value.timeBasis !== item.timeBasis
      || JSON.stringify(value.requiredEvidence) !== JSON.stringify(item.channels)
      || JSON.stringify(value.channels.map((channel) => channel.id)) !== JSON.stringify(item.channels)) {
    throw Object.assign(new Error('MEASUREMENT_COMPLETENESS_OWNER'), { code: 'MEASUREMENT_COMPLETENESS_OWNER' });
  }
  for (const channel of value.channels) {
    if (!exactKeys(channel, ['id', 'provenance', 'retained', 'dropped', 'sampled', 'truncated'])
        || typeof channel.provenance !== 'string'
        || !tagged(channel.retained, 'count') || !tagged(channel.dropped, 'count')
        || !tagged(channel.sampled, 'boolean') || !tagged(channel.truncated, 'boolean')) {
      throw Object.assign(new Error('MEASUREMENT_COMPLETENESS_CHANNEL'), { code: 'MEASUREMENT_COMPLETENESS_CHANNEL' });
    }
  }
  for (const observed of value.intervals) {
    if (!exactKeys(observed, ['id', 'mode', 'observedFrom', 'observedThrough', 'requiredFrom', 'requiredThrough'])
        || typeof observed.id !== 'string' || observed.id.length === 0
        || !['contains-required', 'point-within-required'].includes(observed.mode)
        || !tagged(observed.observedFrom, 'bound') || !tagged(observed.observedThrough, 'bound')
        || !tagged(observed.requiredFrom, 'bound') || !tagged(observed.requiredThrough, 'bound')) {
      throw Object.assign(new Error('MEASUREMENT_COMPLETENESS_INTERVAL'),
        { code: 'MEASUREMENT_COMPLETENESS_INTERVAL' });
    }
  }
  const computedMissing = identityMissingEvidence(value.provenance, reportSchema ?? item.reportSchema);
  for (const channel of value.channels) for (const fact of ['retained', 'dropped', 'sampled', 'truncated']) {
    const missing = factMissing(channel, fact);
    if (missing) computedMissing.push(missing);
  }
  computedMissing.push(...intervalMissingEvidence(value.intervals, value.timeBasis));
  if (JSON.stringify(value.missingEvidence) !== JSON.stringify(computedMissing)
      || value.completeForRequirements !== (computedMissing.length === 0)
      || value.projectionSha256 !== await measurementSha256(projectionWithoutHash(value))) {
    throw Object.assign(new Error('MEASUREMENT_COMPLETENESS_INTEGRITY'), { code: 'MEASUREMENT_COMPLETENESS_INTEGRITY' });
  }
  return freeze(structuredClone(value));
}

function reportedAcademicStatus(report) {
  const schema = report.schema;
  if (schema === 'intent-mcu-long-duration-report@1') {
    return report.results?.every((item) => item.outcome?.academicStatus === 'passed')
      && report.knownBad?.outcome?.academicStatus === 'failed' ? 'passed' : 'indeterminate';
  }
  if (schema === 'intent-mcu-time-invariance-report@1') {
    return report.executions?.every((item) => item.outcome?.academicStatus === 'passed')
      ? 'passed' : 'indeterminate';
  }
  if (schema === 'intent-mcu-event-order-report@1') {
    return report.executions?.every((item) => item.outcome?.academicStatus === 'passed')
      && report.evidenceFailureProbe?.outcome?.academicStatus === 'failed' ? 'passed' : 'indeterminate';
  }
  if (schema === 'intent-mcu-reset-class-report@1') {
    return report.executions?.every((item) => item.outcome?.academicStatus === 'passed')
      && report.evidenceFailureProbe?.outcome?.academicStatus === 'failed' ? 'passed' : 'indeterminate';
  }
  if (schema === 'intent-mcu-unsupported-access-report@1'
      || schema === 'intent-mcu-x36-failure-replay-report@1') return 'unsupported';
  if (schema === 'intent-mcu-digital-state-report@1') {
    return report.repeats?.every((repeat) => repeat.rows?.[0]?.outcome?.academicStatus === 'passed')
      ? 'passed' : 'indeterminate';
  }
  if (schema === 'intent-mcu-x33-runtime-digital-state-report@1') {
    return report.repeats?.every((repeat) => repeat.rows?.[1]?.requirement?.academicVerdict === 'passed')
      ? 'passed' : 'indeterminate';
  }
  if (['intent-mcu-x34-instrumented-precision-report@1',
    'intent-mcu-x35-causal-chain-report@1'].includes(schema)) {
    return report.repeats?.every((repeat) => repeat.outcome?.academicStatus === 'passed')
      ? 'passed' : 'indeterminate';
  }
  if (schema === 'intent-mcu-x23-usart-response-report@1') {
    return report.runs?.slice(0, 4).every((run) => run.classifications?.academic?.academicStatus === 'passed')
      && report.runs?.[4]?.classifications?.academic?.academicStatus === 'failed'
      ? 'passed' : 'indeterminate';
  }
  if (schema === 'intent-mcu-authored-scenario-report@1') return report.aggregate?.academicStatus ?? 'indeterminate';
  if (schema === 'intent-mcu-coverage-report@1') {
    if (report.counts?.failed > 0) return 'failed';
    return report.counts?.passed === report.counts?.declared ? 'passed' : 'indeterminate';
  }
  if (schema === 'intent-mcu-x26-version-regression@1') return report.conclusion?.status ?? 'indeterminate';
  if (schema === 'intent-mcu-x39-failure-location@1') return report.outcome?.academicStatus ?? 'indeterminate';
  if (schema === 'intent-mcu-x40-avr-shared-timeline@1') return report.scenario?.status ?? 'indeterminate';
  if (['intent-mcu-thermostat-observation-result@1', 'intent-mcu-scenario-observation-result@1',
    'intent-mcu-headless-experiment-result@1'].includes(schema)) return report.status ?? 'indeterminate';
  if (schema === 'intent-mcu-external-client-result@1') return report.testVerdict?.status ?? 'indeterminate';
  const statuses = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if ((key === 'academicStatus' || (key === 'status' && value === report.conclusion))
          && ['passed', 'failed', 'indeterminate', 'unsupported'].includes(child)) statuses.push(child);
      else if (child && typeof child === 'object') visit(child);
    }
  };
  visit(report);
  if (statuses.includes('failed')) return 'failed';
  if (statuses.includes('unsupported')) return 'unsupported';
  if (statuses.includes('indeterminate')) return 'indeterminate';
  return statuses.includes('passed') ? 'passed' : 'indeterminate';
}

export function completenessAcademicStatus(reportedStatus, completeness) {
  if (reportedStatus === 'unsupported') return 'unsupported';
  if (!completeness?.completeForRequirements) return 'indeterminate';
  return ['passed', 'failed', 'indeterminate'].includes(reportedStatus) ? reportedStatus : 'indeterminate';
}

export function projectMeasurementOutcome(outcome, report) {
  if (!outcome || typeof outcome !== 'object') return outcome;
  const completeness = measurementRequirementStatus(report);
  const academicStatus = completenessAcademicStatus(outcome.academicStatus, completeness);
  if (academicStatus === outcome.academicStatus) return freeze(structuredClone(outcome));
  return freeze({
    ...structuredClone(outcome),
    academicStatus: 'indeterminate',
    academicCode: 'ACADEMIC_INDETERMINATE',
    evidenceStatus: 'incomplete',
    reasons: [...new Set([...(Array.isArray(outcome.reasons) ? outcome.reasons : []),
      'MEASUREMENT_COMPLETENESS_REQUIRED'])],
  });
}

export async function createMeasurementReportEnvelope(report) {
  const measurementCompleteness = await createMeasurementCompleteness(report);
  const reportedStatus = reportedAcademicStatus(report);
  return freeze({
    schema: MEASUREMENT_REPORT_ENVELOPE_SCHEMA,
    reportSchema: report.schema,
    reportSha256: await measurementSha256(report),
    report: structuredClone(report),
    measurementCompleteness,
    reportedAcademicStatus: reportedStatus,
    effectiveAcademicStatus: completenessAcademicStatus(reportedStatus, measurementCompleteness),
  });
}

export async function validateMeasurementReportEnvelope(value) {
  if (!exactKeys(value, ['schema', 'reportSchema', 'reportSha256', 'report',
    'measurementCompleteness', 'reportedAcademicStatus', 'effectiveAcademicStatus'])
      || value.schema !== MEASUREMENT_REPORT_ENVELOPE_SCHEMA || value.reportSchema !== value.report?.schema
      || !HASH.test(value.reportSha256 ?? '') || value.reportSha256 !== await measurementSha256(value.report)) {
    throw Object.assign(new Error('MEASUREMENT_REPORT_ENVELOPE_SHAPE'), { code: 'MEASUREMENT_REPORT_ENVELOPE_SHAPE' });
  }
  const completeness = await validateMeasurementCompleteness(value.measurementCompleteness, value.reportSchema);
  if (stableMeasurementStringify(completeness.provenance)
      !== stableMeasurementStringify(provenance(value.report))) {
    throw Object.assign(new Error('MEASUREMENT_REPORT_ENVELOPE_STALE_IDENTITY'),
      { code: 'MEASUREMENT_REPORT_ENVELOPE_STALE_IDENTITY' });
  }
  const canonicalCompleteness = await createMeasurementCompleteness(value.report);
  if (stableMeasurementStringify(completeness)
      !== stableMeasurementStringify(canonicalCompleteness)) {
    throw Object.assign(new Error('MEASUREMENT_REPORT_ENVELOPE_NONCANONICAL_COMPLETENESS'),
      { code: 'MEASUREMENT_REPORT_ENVELOPE_NONCANONICAL_COMPLETENESS' });
  }
  const reported = reportedAcademicStatus(value.report);
  if (value.reportedAcademicStatus !== reported
      || value.effectiveAcademicStatus !== completenessAcademicStatus(reported, completeness)) {
    throw Object.assign(new Error('MEASUREMENT_REPORT_ENVELOPE_DISPOSITION'), { code: 'MEASUREMENT_REPORT_ENVELOPE_DISPOSITION' });
  }
  return freeze(structuredClone(value));
}

export async function deriveMeasurementCompleteness(source, report, limitations = []) {
  const validatedSource = await validateMeasurementCompleteness(source);
  const item = registryOwner(report?.schema);
  if (!item || !['derived-projection', 'reviewed-import'].includes(item.evidenceClass)) {
    throw Object.assign(new Error('MEASUREMENT_DERIVATION_OWNER'), { code: 'MEASUREMENT_DERIVATION_OWNER' });
  }
  const knownForEverySource = (fact) => validatedSource.channels.every(
    (channel) => channel[fact].state === 'known');
  const facts = Object.fromEntries(item.channels.map((id) => [id, {
    retained: knownForEverySource('retained')
      ? known(validatedSource.channels.reduce((sum, channel) => sum + channel.retained.value, 0))
      : unknown('one or more source retained counts are unknown'),
    dropped: knownForEverySource('dropped')
      ? known(validatedSource.channels.reduce((sum, channel) => sum + channel.dropped.value, 0))
      : unknown('one or more source dropped counts are unknown'),
    sampled: knownForEverySource('sampled') ? known(validatedSource.channels.some(
      (channel) => channel.sampled.value), {
      strategy: 'weakest-source projection',
      sufficientForRequirements: validatedSource.channels.every((channel) => channel.sampled.value === false
        || channel.sampled.detail?.sufficientForRequirements === true),
    }) : unknown('one or more source sampling states are unknown'),
    truncated: knownForEverySource('truncated')
      ? known(validatedSource.channels.some((channel) => channel.truncated.value), {
        boundary: 'weakest-source projection',
      }) : unknown('one or more source truncation states are unknown'),
  }]));
  const projected = await createMeasurementCompleteness(report, {
    channelFacts: facts,
    observedFrom: structuredClone(validatedSource.observedFrom),
    observedThrough: structuredClone(validatedSource.observedThrough),
    intervals: structuredClone(validatedSource.intervals),
    limitations: ['Derived evidence cannot increase the source evidence class or completeness.', ...limitations],
  });
  if (projected.completeForRequirements && !validatedSource.completeForRequirements) {
    throw Object.assign(new Error('MEASUREMENT_DERIVATION_AUTHORITY_GAIN'), { code: 'MEASUREMENT_DERIVATION_AUTHORITY_GAIN' });
  }
  return projected;
}

export function measurementCompletenessDisclosure(value) {
  if (!value) return 'Measurement completeness unavailable; no affected requirement may pass.';
  const state = value.completeForRequirements ? 'complete' : `incomplete (${value.missingEvidence.length} declared gaps)`;
  return `Measurement evidence ${state}; time basis ${value.timeBasis}. Retention, loss, sampling and truncation are explicit. The hash binds identity/integrity, not truth.`;
}
