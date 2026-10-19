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
  ['intent-mcu-thermostat-observation-result@1', 'thermostat-observation-avr', 'actual-runtime', 'virtual-millisecond', ['input', 'gpio', 'serial']],
  ['intent-mcu-scenario-observation-result@1', 'scenario-observation-avr', 'actual-runtime', 'virtual-millisecond', ['input', 'gpio', 'serial']],
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
    ['source', report.sourceSha256 ?? report.bindings?.sourceSha256],
    ['artifact', report.artifactSha256 ?? report.artifactIdentity ?? report.bindings?.artifactIdentitySha256],
    ['topology', report.topologySha256 ?? report.graphSha256],
    ['runtime', report.runtimeIdentity?.artifactIdentity],
  ].map(([kind, value]) => ({ kind, value: identity(value, `${kind} identity is not carried by this report`) }));
  return { profile, identities };
}

function numbersForKeys(value, matcher, output = []) {
  if (!value || typeof value !== 'object') return output;
  for (const [key, child] of Object.entries(value)) {
    if (NON_NEGATIVE(child) && matcher.test(key)) output.push(child);
    else if (child && typeof child === 'object') numbersForKeys(child, matcher, output);
  }
  return output;
}

function observedBounds(report, timeBasis) {
  if (timeBasis === 'static-no-time') return {
    from: unavailable('static model has no runtime interval'),
    through: unavailable('static model has no runtime interval'),
  };
  if (timeBasis === 'instruction-order-only') return {
    from: unavailable('instruction-order evidence has no accepted numeric time unit'),
    through: unavailable('instruction-order evidence has no accepted numeric time unit'),
  };
  if (timeBasis === 'unavailable') return {
    from: unavailable('owner combines or derives evidence without one comparable native timebase'),
    through: unavailable('owner combines or derives evidence without one comparable native timebase'),
  };
  if (['reset-epoch-sequence', 'adapter-epoch-sequence'].includes(timeBasis)) {
    const count = Array.isArray(report.executions) ? report.executions.length
      : Array.isArray(report.repeats) ? report.repeats.length
        : Array.isArray(report.results) ? report.results.length : null;
    return count === null ? {
      from: unknown(`report does not expose a ${timeBasis} lower bound`),
      through: unknown(`report does not expose a ${timeBasis} upper bound`),
    } : { from: known(0), through: known(Math.max(0, count - 1)) };
  }
  const matcher = timeBasis === 'virtual-millisecond'
    ? /(?:at|start|from|through|end|observation|virtual)Milliseconds$/iu
    : timeBasis === 'virtual-nanosecond' ? /(?:virtual|finalVirtual)Nanoseconds$/u
      : timeBasis === 'cpu-cycle' ? /(?:^cycle|Cycle$|Cycles$)/u
        : /(?:epoch|sequence|ordinal)$/iu;
  const values = numbersForKeys(report, matcher);
  if (!values.length) return {
    from: unknown(`report does not expose a ${timeBasis} lower bound`),
    through: unknown(`report does not expose a ${timeBasis} upper bound`),
  };
  return { from: known(Math.min(...values)), through: known(Math.max(...values)) };
}

function explicitDropValues(report) {
  return numbersForKeys(report, /(?:dropped|dropCount|lostCount)$/iu);
}

function completeFacts(retained, { dropped = 0, sampled = false, sampledDetail, truncated = false } = {}) {
  return {
    retained: known(retained),
    dropped: known(dropped),
    sampled: sampledDetail === undefined ? known(sampled) : known(sampled, sampledDetail),
    truncated: known(truncated),
  };
}

function outcomeEvidenceComplete(value) {
  const outcomes = [];
  const visit = (item) => {
    if (!item || typeof item !== 'object') return;
    if (item.schema === 'intent-mcu-experiment-outcome@1') outcomes.push(item);
    for (const child of Object.values(item)) if (child && typeof child === 'object') visit(child);
  };
  visit(value);
  return outcomes.length > 0 && outcomes.every((item) => item.jobStatus === 'completed'
    && item.evidenceStatus === 'complete' && ['passed', 'failed'].includes(item.academicStatus));
}

function sumNamed(report, names) {
  const matcher = new RegExp(`^(?:${names.join('|')})$`, 'u');
  const values = numbersForKeys(report, matcher);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function closedOwnerFacts(report, item, channelId) {
  const rows = Array.isArray(report.results) ? report.results.length
    : Array.isArray(report.executions) ? report.executions.length
      : Array.isArray(report.repeats) ? report.repeats.length
        : Array.isArray(report.rows) ? report.rows.length : 1;
  const schema = report.schema;
  if (schema === 'intent-mcu-authored-scenario-report@1') {
    const input = sumNamed(report, ['inputEventsDropped']);
    const serial = sumNamed(report, ['serialEventsDropped']);
    if (report.completeness?.allEvidenceComplete !== true || input === null || serial === null) return null;
    return completeFacts(rows, { dropped: channelId === 'input' ? input : channelId === 'serial' ? serial : 0 });
  }
  if (['intent-mcu-thermostat-observation-result@1',
    'intent-mcu-scenario-observation-result@1'].includes(schema)) {
    if (schema === 'intent-mcu-thermostat-observation-result@1') {
      const complete = report.outcome?.evidenceStatus === 'complete'
        && report.checks?.timeInWindow === true && report.checks?.inputsComplete === true
        && report.checks?.pinObserved === true && report.checks?.serialObserved === true;
      return complete ? completeFacts(1) : null;
    }
    const input = sumNamed(report, ['inputEventsDropped']);
    const serial = sumNamed(report, ['serialEventsDropped']);
    if (report.outcome?.evidenceStatus !== 'complete' || input === null || serial === null) return null;
    return completeFacts(1, { dropped: channelId === 'input' ? input : channelId === 'serial' ? serial : 0 });
  }
  if (schema === 'intent-mcu-x40-avr-shared-timeline@1') {
    const mapping = { reset: null, input: ['requestedInputs', 'appliedInputs'], gpio: ['gpio'], serial: ['serial'], test: null };
    const groups = mapping[channelId];
    const records = groups ? groups.map((name) => report.retention?.[name]).filter(Boolean) : [];
    if (groups && records.length !== groups.length) return null;
    const dropped = records.reduce((sum, value) => sum + value.dropped, 0);
    const retained = records.length ? records.reduce((sum, value) => sum + value.retained, 0) : rows;
    if (!records.every((value) => NON_NEGATIVE(value.retained) && NON_NEGATIVE(value.dropped))) return null;
    return completeFacts(retained, { dropped });
  }
  if (schema === 'intent-mcu-x39-failure-location@1') {
    const complete = report.outcome?.evidenceStatus === 'complete'
      && report.completeness?.inputsComplete === true
      && report.completeness?.serialObserved === true
      && report.completeness?.inputDrops === 0
      && report.completeness?.serialDrops === 0;
    return complete ? completeFacts(1) : null;
  }
  if (schema === 'intent-mcu-long-duration-report@1' && outcomeEvidenceComplete(report)) {
    const names = channelId === 'input' ? ['droppedInputs']
      : channelId === 'serial' ? ['droppedSerial']
        : channelId === 'logic' ? ['droppedLogic'] : [];
    const dropped = names.length ? sumNamed(report, names) : 0;
    return dropped === null ? null : completeFacts(rows, { dropped });
  }
  if (schema === 'intent-mcu-x23-usart-response-report@1') {
    const drops = sumNamed(report, ['logic', 'serial', 'adc', 'unsupported']);
    const accepted = report.runs?.length === 5 && report.runs.every((run) =>
      run.retentionDrops && Object.values(run.retentionDrops).every((value) => value === 0)
      && run.classifications?.validation?.status === 'accepted');
    return accepted && drops !== null ? completeFacts(report.runs.length, { dropped: drops }) : null;
  }
  if (schema === 'intent-mcu-x35-causal-chain-report@1') {
    const drops = sumNamed(report, ['logic', 'serial', 'adc', 'unsupported']);
    return report.repeats?.length === 2 && drops !== null && report.repeats.every((repeat) =>
      repeat.outcome?.academicStatus === 'passed' && repeat.outcome?.jobStatus === 'completed')
      ? completeFacts(report.repeats.length, { dropped: drops }) : null;
  }
  if (schema === 'intent-mcu-x36-failure-replay-report@1') {
    const drops = report.recipe?.retentionDrops
      ? Object.values(report.recipe.retentionDrops).reduce((sum, value) => sum + value, 0) : null;
    return report.repeats?.length === 2 && drops !== null ? completeFacts(2, { dropped: drops }) : null;
  }
  if (schema === 'intent-mcu-x34-instrumented-precision-report@1' && report.repeats?.length === 2
      && report.repeats.every((repeat) => repeat.outcome?.academicStatus === 'passed'
        && repeat.outcome?.jobStatus === 'completed')) {
    return channelId === 'adc'
      ? completeFacts(2, { sampled: true, sampledDetail: {
        strategy: 'firmware-bound ADC conversion window', sufficientForRequirements: true,
      } }) : completeFacts(2);
  }
  if (schema === 'intent-mcu-x33-runtime-digital-state-report@1'
      && report.repeats?.length === 2 && report.repeats.every((repeat) =>
        repeat.drops && Object.values(repeat.drops).every((value) => value === 0)
        && repeat.rows?.[1]?.requirement?.academicVerdict === 'passed')) return completeFacts(2);
  if (schema === 'intent-mcu-digital-state-report@1'
      && report.repeats?.length === 2 && report.repeats.every((repeat) =>
        repeat.rows?.[0]?.outcome?.academicStatus === 'passed'
        && repeat.rows?.[1]?.outcome?.academicStatus === 'indeterminate'
        && repeat.rows?.[2]?.outcome === null
        && repeat.rows?.[3]?.outcome?.academicStatus === 'indeterminate')) return completeFacts(2);
  if (schema === 'intent-mcu-time-invariance-report@1'
      && report.executions?.length === 3 && outcomeEvidenceComplete(report)) return completeFacts(3);
  if (schema === 'intent-mcu-event-order-report@1'
      && report.executions?.length === 2 && outcomeEvidenceComplete(report)) return completeFacts(2);
  if (schema === 'intent-mcu-reset-class-report@1'
      && report.executions?.length === 6 && outcomeEvidenceComplete(report)) return completeFacts(6);
  if (schema === 'intent-mcu-unsupported-access-report@1'
      && report.executions?.length === 2 && report.executions.every((execution) =>
        execution.outcome?.academicStatus === 'unsupported'
        && execution.outcome?.jobStatus === 'completed')) return completeFacts(report.executions.length);
  return null;
}

function inferredChannelFacts(report, item, channelId) {
  const closed = closedOwnerFacts(report, item, channelId);
  if (closed) return closed;
  const dropValues = explicitDropValues(report);
  const rowCount = Array.isArray(report.results) ? report.results.length
    : Array.isArray(report.executions) ? report.executions.length
      : Array.isArray(report.repeats) ? report.repeats.length
        : Array.isArray(report.rows) ? report.rows.length : null;
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
  return {
    retained: rowCount === null
      ? unknown('producer report does not expose a retained count for this channel') : known(rowCount),
    dropped: dropValues.length
      ? known(dropValues.reduce((sum, value) => sum + value, 0))
      : unknown('producer report does not expose a drop counter for this channel'),
    sampled: unknown('producer report does not prove a sampling strategy for this channel'),
    truncated: unknown('producer report does not prove a truncation boundary for this channel'),
  };
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

function measurementCompletenessDraft(report, {
  channelFacts = {}, observedFrom, observedThrough, limitations = [],
} = {}) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('MEASUREMENT_REPORT_REQUIRED');
  const item = registryOwner(report.schema);
  if (!item) throw Object.assign(new Error('MEASUREMENT_PRODUCER_UNREGISTERED'), { code: 'MEASUREMENT_PRODUCER_UNREGISTERED' });
  const bounds = observedBounds(report, item.timeBasis);
  const channels = item.channels.map((id) => ({
    id,
    provenance: `${item.producerId}:${id}`,
    ...structuredClone(channelFacts[id] ?? inferredChannelFacts(report, item, id)),
  }));
  const missingEvidence = [];
  for (const channel of channels) for (const fact of ['retained', 'dropped', 'sampled', 'truncated']) {
    const missing = factMissing(channel, fact);
    if (missing) missingEvidence.push(missing);
  }
  const from = observedFrom ?? bounds.from;
  const through = observedThrough ?? bounds.through;
  const numericIntervalRequired = !['static-no-time', 'instruction-order-only', 'unavailable'].includes(item.timeBasis);
  if (numericIntervalRequired && from.state !== 'known') missingEvidence.push(`observedFrom:${from.state}`);
  if (numericIntervalRequired && through.state !== 'known') missingEvidence.push(`observedThrough:${through.state}`);
  if (from.state === 'known' && through.state === 'known' && from.value > through.value) {
    missingEvidence.push('observedInterval:reversed');
  }
  return {
    schema: MEASUREMENT_COMPLETENESS_SCHEMA,
    producerId: item.producerId,
    evidenceClass: item.evidenceClass,
    provenance: provenance(report),
    timeBasis: item.timeBasis,
    observedFrom: structuredClone(from),
    observedThrough: structuredClone(through),
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
  });
}

export async function createMeasurementCompleteness(report, options = {}) {
  const projection = measurementCompletenessDraft(report, options);
  projection.projectionSha256 = await measurementSha256(projectionWithoutHash(projection));
  return freeze(projection);
}

export async function validateMeasurementCompleteness(value, reportSchema = null) {
  const topKeys = ['schema', 'producerId', 'evidenceClass', 'provenance', 'timeBasis',
    'observedFrom', 'observedThrough', 'channels', 'requiredEvidence', 'missingEvidence',
    'completeForRequirements', 'limitations', 'projectionSha256'];
  if (!exactKeys(value, topKeys) || value.schema !== MEASUREMENT_COMPLETENESS_SCHEMA
      || !HASH.test(value.projectionSha256 ?? '') || !Array.isArray(value.channels)
      || !value.channels.length || !Array.isArray(value.requiredEvidence)
      || !Array.isArray(value.missingEvidence) || !Array.isArray(value.limitations)
      || !value.limitations.length || typeof value.completeForRequirements !== 'boolean'
      || !exactKeys(value.provenance, ['profile', 'identities'])
      || typeof value.provenance.profile !== 'string' || !Array.isArray(value.provenance.identities)
      || !tagged(value.observedFrom, 'bound') || !tagged(value.observedThrough, 'bound')) {
    throw Object.assign(new Error('MEASUREMENT_COMPLETENESS_SHAPE'), { code: 'MEASUREMENT_COMPLETENESS_SHAPE' });
  }
  const identityKinds = ['report-schema', 'semantic-report', 'source', 'artifact', 'topology', 'runtime'];
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
  const computedMissing = [];
  for (const channel of value.channels) for (const fact of ['retained', 'dropped', 'sampled', 'truncated']) {
    const missing = factMissing(channel, fact);
    if (missing) computedMissing.push(missing);
  }
  const numericIntervalRequired = !['static-no-time', 'instruction-order-only', 'unavailable'].includes(value.timeBasis);
  if (numericIntervalRequired && value.observedFrom.state !== 'known') computedMissing.push(`observedFrom:${value.observedFrom.state}`);
  if (numericIntervalRequired && value.observedThrough.state !== 'known') computedMissing.push(`observedThrough:${value.observedThrough.state}`);
  if (value.observedFrom.state === 'known' && value.observedThrough.state === 'known'
      && value.observedFrom.value > value.observedThrough.value) computedMissing.push('observedInterval:reversed');
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
  const facts = Object.fromEntries(item.channels.map((id) => [id, {
    retained: unavailable('derived owner does not have an independent retained counter'),
    dropped: validatedSource.completeForRequirements ? known(0) : unknown('source completeness is incomplete'),
    sampled: validatedSource.completeForRequirements ? known(false) : unknown('source sampling completeness is incomplete'),
    truncated: validatedSource.completeForRequirements ? known(false) : unknown('source truncation completeness is incomplete'),
  }]));
  const projected = await createMeasurementCompleteness(report, {
    channelFacts: facts,
    observedFrom: structuredClone(validatedSource.observedFrom),
    observedThrough: structuredClone(validatedSource.observedThrough),
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
