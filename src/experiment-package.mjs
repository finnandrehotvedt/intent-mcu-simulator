// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { aggregateExperimentOutcomes } from './experiment-outcomes.mjs';
import {
  expectationReferenceMatchesPrepared,
  parseExpectationReference,
} from './expectation-reference.mjs';
import { prepareProjectEnvelope } from './project-envelope.mjs';
import { exactKeys, parseStrictJson } from './strict-json.mjs';
import { THERMOSTAT_EXPERIMENT_ID } from './thermostat-experiment-contract.mjs';
import {
  createExperimentManifest,
  normalizeExperimentManifest,
} from './experiment-manifest.mjs';

export const LEGACY_EXPERIMENT_PACKAGE_SCHEMA = 'intent-mcu-experiment-package@1';
export const EXPERIMENT_PACKAGE_SCHEMA = 'intent-mcu-experiment-package@2';
export const EXPERIMENT_REPORT_SCHEMA = 'intent-mcu-authored-scenario-report@1';
export const EXPERIMENT_PACKAGE_PROFILE = 'board.atmega328p-16mhz-v1';
export const EXPERIMENT_PACKAGE_LIMIT = 2 * 1024 * 1024;

export const EXPERIMENT_PACKAGE_LIMITATIONS = Object.freeze([
  'Automatic executable, runtime, capability, session, file-handle and credential fields are excluded; human-authored source and descriptions still require the user to review their own text for sensitive content.',
  'This file is created as a local browser download. The package feature does not upload or store it on the server.',
  'SHA-256 values bind member bytes for identity and integrity; they do not prove that a measurement or claim is true.',
  'The report is review evidence only. It cannot restore firmware, a runtime, a green state or a requirement verdict.',
  'Version 2 supports only the current AVR thermostat authored-scenario workflow and binds seven identity classes in its manifest.',
]);
const LEGACY_EXPERIMENT_PACKAGE_LIMITATIONS = Object.freeze([
  'Automatic executable, runtime, capability, session, file-handle and credential fields are excluded; human-authored source and descriptions still require the user to review their own text for sensitive content.',
  'This file is created as a local browser download. The package feature does not upload or store it on the server.',
  'SHA-256 values bind member bytes for identity and integrity; they do not prove that a measurement or claim is true.',
  'The report is review evidence only. It cannot restore firmware, a runtime, a green state or a requirement verdict.',
  'Version 1 supports only the current AVR thermostat authored-scenario workflow.',
]);

const HASH = /^[a-f0-9]{64}$/u;
const CODE = /^[A-Z][A-Z0-9_-]{1,95}$/u;
const RESULT_CHECK_KEYS = Object.freeze([
  'timeInWindow', 'inputsComplete', 'pinObserved', 'primaryExecutedPin',
  'faultRequestsComplete', 'faultProducerEvidenceComplete', 'faultBehaviorMatched',
]);
const clone = (value) => structuredClone(value);
const failure = (code, details = []) => ({ ok: false, code, details });
const reject = (code, details = []) => {
  throw Object.assign(new Error(code), { code, details });
};

export async function experimentPackageSha256(value) {
  const source = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hash(value, path) {
  if (typeof value !== 'string' || !HASH.test(value)) reject('EXPERIMENT_PACKAGE_HASH', [path]);
  return value;
}

function count(value, path) {
  if (!Number.isSafeInteger(value) || value < 0) reject('EXPERIMENT_REPORT_COUNT', [path]);
  return value;
}

function finite(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) reject('EXPERIMENT_REPORT_NUMBER', [path]);
  return value;
}

function scenarioExpectation(scenario) {
  const expected = scenario?.events?.at(-1);
  if (!expected || expected.kind !== 'expect.pin-level') reject('EXPERIMENT_REPORT_SCENARIO', [scenario?.id ?? null]);
  return expected;
}

function normalizeReasons(value, path) {
  if (!Array.isArray(value) || value.length > 24
      || value.some((item) => typeof item !== 'string' || !CODE.test(item))) {
    reject('EXPERIMENT_REPORT_REASONS', [path]);
  }
  return [...value];
}

function normalizeChecks(value, path) {
  if (!exactKeys(value, RESULT_CHECK_KEYS)
      || RESULT_CHECK_KEYS.some((key) => typeof value[key] !== 'boolean')) {
    reject('EXPERIMENT_REPORT_CHECKS', [path]);
  }
  return Object.fromEntries(RESULT_CHECK_KEYS.map((key) => [key, value[key]]));
}

function normalizeRetention(value, path) {
  if (!exactKeys(value, ['inputEventsDropped', 'serialEventsDropped'])) {
    reject('EXPERIMENT_REPORT_RETENTION', [path]);
  }
  return {
    inputEventsDropped: count(value.inputEventsDropped, `${path}.inputEventsDropped`),
    serialEventsDropped: count(value.serialEventsDropped, `${path}.serialEventsDropped`),
  };
}

function expectedAssertionOutcome(checks, observedLevel, expectedLevel) {
  if (checks.primaryExecutedPin !== (observedLevel === expectedLevel)) {
    reject('EXPERIMENT_REPORT_ASSERTION_MISMATCH');
  }
  const reasons = [];
  if (!checks.primaryExecutedPin) reasons.push('EXPECTED_PIN_LEVEL_MISMATCH');
  if (!checks.faultBehaviorMatched) reasons.push('EXPECTED_FAULT_BEHAVIOR_MISMATCH');
  return { academicStatus: reasons.length ? 'failed' : 'passed', reasons };
}

function projectResult(result, scenario, index) {
  const path = `$results[${index}]`;
  const expectation = scenarioExpectation(scenario);
  if (!result || result.schema !== 'intent-mcu-scenario-observation-result@1'
      || result.scenarioId !== scenario.id || !['passed', 'failed'].includes(result.status)
      || result.outcome?.academicStatus !== result.status
      || result.outcome?.jobStatus !== 'completed'
      || result.outcome?.evidenceStatus !== 'complete') {
    reject('EXPERIMENT_REPORT_RESULT_INCOMPLETE', [scenario.id]);
  }
  if (result.expected?.eventId !== expectation.id || result.expected?.pin !== expectation.pin
      || result.expected?.level !== expectation.level
      || result.expected?.observationWindow?.startMilliseconds !== expectation.atMilliseconds
      || result.expected?.observationWindow?.endMilliseconds !== expectation.throughMilliseconds) {
    reject('EXPERIMENT_REPORT_EXPECTATION_MISMATCH', [scenario.id]);
  }
  const checks = normalizeChecks(result.checks, `${path}.checks`);
  if (!checks.timeInWindow || !checks.inputsComplete || !checks.pinObserved
      || !checks.faultRequestsComplete || !checks.faultProducerEvidenceComplete) {
    reject('EXPERIMENT_REPORT_RESULT_INCOMPLETE', [scenario.id]);
  }
  if (!result.observed || result.observed.pin !== expectation.pin
      || result.observed.mode !== 'OUTPUT' || typeof result.observed.level !== 'boolean'
      || result.observed.captureWindow?.minimumMilliseconds !== expectation.atMilliseconds
      || result.observed.captureWindow?.maximumMilliseconds !== expectation.throughMilliseconds) {
    reject('EXPERIMENT_REPORT_OBSERVATION_MISMATCH', [scenario.id]);
  }
  const retention = normalizeRetention(result.retention, `${path}.retention`);
  if (retention.inputEventsDropped !== 0) reject('EXPERIMENT_REPORT_INPUT_LOSS', [scenario.id]);
  const assertion = expectedAssertionOutcome(checks, result.observed.level, expectation.level);
  if (result.status !== assertion.academicStatus
      || JSON.stringify(result.outcome.reasons) !== JSON.stringify(assertion.reasons)) {
    reject('EXPERIMENT_REPORT_ASSERTION_MISMATCH', [scenario.id]);
  }
  if (result.virtualMilliseconds < expectation.atMilliseconds
      || result.virtualMilliseconds > expectation.throughMilliseconds) {
    reject('EXPERIMENT_REPORT_OBSERVATION_MISMATCH', [scenario.id]);
  }
  return {
    scenarioId: scenario.id,
    academicStatus: result.status,
    jobStatus: result.outcome.jobStatus,
    evidenceStatus: result.outcome.evidenceStatus,
    reasons: normalizeReasons(result.outcome.reasons, `${path}.reasons`),
    virtualMilliseconds: finite(result.virtualMilliseconds, `${path}.virtualMilliseconds`),
    expected: {
      pin: expectation.pin,
      level: expectation.level,
      windowStartMilliseconds: expectation.atMilliseconds,
      windowEndMilliseconds: expectation.throughMilliseconds,
    },
    observed: {
      pin: result.observed.pin,
      mode: result.observed.mode,
      level: result.observed.level,
      windowStartMilliseconds: result.observed.captureWindow.minimumMilliseconds,
      windowEndMilliseconds: result.observed.captureWindow.maximumMilliseconds,
    },
    checks,
    retention,
  };
}

function normalizePackagedResult(value, scenario, index) {
  const path = `$report.results[${index}]`;
  if (!exactKeys(value, ['scenarioId', 'academicStatus', 'jobStatus', 'evidenceStatus',
    'reasons', 'virtualMilliseconds', 'expected', 'observed', 'checks', 'retention'])
      || value.scenarioId !== scenario.id || !['passed', 'failed'].includes(value.academicStatus)
      || value.jobStatus !== 'completed' || value.evidenceStatus !== 'complete') {
    reject('EXPERIMENT_REPORT_RESULT_SHAPE', [path]);
  }
  const expectation = scenarioExpectation(scenario);
  if (!exactKeys(value.expected, ['pin', 'level', 'windowStartMilliseconds', 'windowEndMilliseconds'])
      || value.expected.pin !== expectation.pin || value.expected.level !== expectation.level
      || value.expected.windowStartMilliseconds !== expectation.atMilliseconds
      || value.expected.windowEndMilliseconds !== expectation.throughMilliseconds
      || !exactKeys(value.observed, ['pin', 'mode', 'level', 'windowStartMilliseconds', 'windowEndMilliseconds'])
      || value.observed.pin !== expectation.pin || value.observed.mode !== 'OUTPUT'
      || typeof value.observed.level !== 'boolean'
      || value.observed.windowStartMilliseconds !== expectation.atMilliseconds
      || value.observed.windowEndMilliseconds !== expectation.throughMilliseconds) {
    reject('EXPERIMENT_REPORT_OBSERVATION_MISMATCH', [scenario.id]);
  }
  const checks = normalizeChecks(value.checks, `${path}.checks`);
  if (!checks.timeInWindow || !checks.inputsComplete || !checks.pinObserved
      || !checks.faultRequestsComplete || !checks.faultProducerEvidenceComplete) {
    reject('EXPERIMENT_REPORT_RESULT_INCOMPLETE', [scenario.id]);
  }
  const retention = normalizeRetention(value.retention, `${path}.retention`);
  if (retention.inputEventsDropped !== 0) reject('EXPERIMENT_REPORT_INPUT_LOSS', [scenario.id]);
  const assertion = expectedAssertionOutcome(checks, value.observed.level, expectation.level);
  if (value.academicStatus !== assertion.academicStatus
      || JSON.stringify(value.reasons) !== JSON.stringify(assertion.reasons)
      || value.virtualMilliseconds < expectation.atMilliseconds
      || value.virtualMilliseconds > expectation.throughMilliseconds) {
    reject('EXPERIMENT_REPORT_ASSERTION_MISMATCH', [scenario.id]);
  }
  return {
    scenarioId: value.scenarioId,
    academicStatus: value.academicStatus,
    jobStatus: value.jobStatus,
    evidenceStatus: value.evidenceStatus,
    reasons: normalizeReasons(value.reasons, `${path}.reasons`),
    virtualMilliseconds: finite(value.virtualMilliseconds, `${path}.virtualMilliseconds`),
    expected: clone(value.expected), observed: clone(value.observed), checks, retention,
  };
}

function reportFromResults({ projectSha256, expectationSha256, artifactIdentitySha256,
  sourceVariant, timeline, results }) {
  if (!['correct', 'known-bad-equality'].includes(sourceVariant)) {
    reject('EXPERIMENT_REPORT_SOURCE_VARIANT', [sourceVariant ?? null]);
  }
  if (!Array.isArray(results) || results.length !== timeline.scenarios.length) {
    reject('EXPERIMENT_REPORT_RESULT_COUNT', [timeline.scenarios.length, results?.length ?? null]);
  }
  const projected = timeline.scenarios.map((scenario, index) => projectResult(results[index], scenario, index));
  const aggregate = aggregateExperimentOutcomes(results);
  const starts = projected.map((item) => item.observed.windowStartMilliseconds);
  const ends = projected.map((item) => item.observed.windowEndMilliseconds);
  return {
    schema: EXPERIMENT_REPORT_SCHEMA,
    profile: EXPERIMENT_PACKAGE_PROFILE,
    experimentId: THERMOSTAT_EXPERIMENT_ID,
    projectSha256,
    expectationSha256,
    artifactIdentitySha256,
    sourceVariant,
    resultCount: projected.length,
    aggregate: {
      academicStatus: aggregate.academicStatus,
      jobStatus: aggregate.jobStatus,
      evidenceStatus: aggregate.evidenceStatus,
      reasons: [...aggregate.reasons],
    },
    results: projected,
    completeness: {
      scenariosExpected: timeline.scenarios.length,
      scenariosReported: projected.length,
      allEvidenceComplete: true,
      anyDataLoss: projected.some((item) => item.retention.inputEventsDropped > 0
        || item.retention.serialEventsDropped > 0),
      observedFromMilliseconds: Math.min(...starts),
      observedThroughMilliseconds: Math.max(...ends),
    },
    authority: { executable: false, runtime: false, verdict: false },
  };
}

function normalizeReport(value, timeline, bindings) {
  if (!exactKeys(value, ['schema', 'profile', 'experimentId', 'projectSha256',
    'expectationSha256', 'artifactIdentitySha256', 'sourceVariant', 'resultCount',
    'aggregate', 'results', 'completeness', 'authority'])
      || value.schema !== EXPERIMENT_REPORT_SCHEMA
      || value.profile !== EXPERIMENT_PACKAGE_PROFILE
      || value.experimentId !== THERMOSTAT_EXPERIMENT_ID
      || value.projectSha256 !== bindings.projectSha256
      || value.expectationSha256 !== bindings.expectationSha256
      || !['correct', 'known-bad-equality'].includes(value.sourceVariant)
      || !Array.isArray(value.results) || value.results.length !== timeline.scenarios.length
      || value.resultCount !== value.results.length) {
    reject('EXPERIMENT_REPORT_SHAPE');
  }
  hash(value.artifactIdentitySha256, '$report.artifactIdentitySha256');
  const results = timeline.scenarios.map((scenario, index) => normalizePackagedResult(
    value.results[index], scenario, index,
  ));
  if (!exactKeys(value.aggregate, ['academicStatus', 'jobStatus', 'evidenceStatus', 'reasons'])
      || !['passed', 'failed'].includes(value.aggregate.academicStatus)
      || value.aggregate.jobStatus !== 'completed' || value.aggregate.evidenceStatus !== 'complete') {
    reject('EXPERIMENT_REPORT_AGGREGATE');
  }
  const expectedReasons = results.filter((item) => item.academicStatus !== 'passed')
    .flatMap((item) => item.reasons.map((reason) => `${item.scenarioId}:${reason}`));
  if (JSON.stringify(value.aggregate.reasons) !== JSON.stringify(expectedReasons)) {
    reject('EXPERIMENT_REPORT_AGGREGATE');
  }
  const expectedAcademic = results.some((item) => item.academicStatus === 'failed') ? 'failed' : 'passed';
  if (value.aggregate.academicStatus !== expectedAcademic) reject('EXPERIMENT_REPORT_AGGREGATE');
  const starts = results.map((item) => item.observed.windowStartMilliseconds);
  const ends = results.map((item) => item.observed.windowEndMilliseconds);
  const anyDataLoss = results.some((item) => item.retention.inputEventsDropped > 0
    || item.retention.serialEventsDropped > 0);
  if (!exactKeys(value.completeness, ['scenariosExpected', 'scenariosReported',
    'allEvidenceComplete', 'anyDataLoss', 'observedFromMilliseconds', 'observedThroughMilliseconds'])
      || value.completeness.scenariosExpected !== timeline.scenarios.length
      || value.completeness.scenariosReported !== results.length
      || value.completeness.allEvidenceComplete !== true
      || value.completeness.anyDataLoss !== anyDataLoss
      || value.completeness.observedFromMilliseconds !== Math.min(...starts)
      || value.completeness.observedThroughMilliseconds !== Math.max(...ends)
      || !exactKeys(value.authority, ['executable', 'runtime', 'verdict'])
      || value.authority.executable !== false || value.authority.runtime !== false
      || value.authority.verdict !== false) {
    reject('EXPERIMENT_REPORT_COMPLETENESS');
  }
  return { ...clone(value), results };
}

function packageLimitations(value) {
  if (!Array.isArray(value)
      || JSON.stringify(value) !== JSON.stringify(EXPERIMENT_PACKAGE_LIMITATIONS)) {
    reject('EXPERIMENT_PACKAGE_LIMITATIONS');
  }
  return [...EXPERIMENT_PACKAGE_LIMITATIONS];
}

export async function createExperimentPackage({ projectText, adapters, activeProfile,
  expectationText, artifactIdentitySha256, sourceVariant, results, producer }) {
  try {
    const prepared = prepareProjectEnvelope(projectText, adapters);
    if (!prepared.ok || prepared.profile !== activeProfile
        || activeProfile !== EXPERIMENT_PACKAGE_PROFILE || !prepared.scenarioTimeline
        || prepared.scenarioTimeline.experimentId !== THERMOSTAT_EXPERIMENT_ID) {
      return failure('EXPERIMENT_PACKAGE_PROJECT', [prepared.code ?? null, activeProfile ?? null]);
    }
    const expectation = await parseExpectationReference(expectationText);
    if (!expectation.ok || !expectationReferenceMatchesPrepared(expectation.reference, prepared)) {
      return failure('EXPERIMENT_PACKAGE_EXPECTATION', [expectation.code ?? null]);
    }
    const projectSha256 = await experimentPackageSha256(prepared.canonical);
    if (expectation.reference.originProjectSha256 !== projectSha256) {
      return failure('EXPERIMENT_PACKAGE_EXPECTATION_STALE');
    }
    const expectationSha256 = await experimentPackageSha256(expectation.canonical);
    if (expectation.sha256 !== expectationSha256) return failure('EXPERIMENT_PACKAGE_EXPECTATION_HASH');
    hash(artifactIdentitySha256, '$artifactIdentitySha256');
    const report = reportFromResults({ projectSha256, expectationSha256,
      artifactIdentitySha256, sourceVariant, timeline: prepared.scenarioTimeline, results });
    const reportSha256 = await experimentPackageSha256(report);
    const { manifest } = await createExperimentManifest({ prepared, expectation,
      artifactIdentitySha256, producer, sha256: experimentPackageSha256 });
    const value = {
      schema: EXPERIMENT_PACKAGE_SCHEMA,
      profile: prepared.profile,
      experimentId: THERMOSTAT_EXPERIMENT_ID,
      project: parseStrictJson(prepared.canonical),
      expectation: clone(expectation.reference),
      report,
      manifest,
      bindings: { projectSha256, expectationSha256, reportSha256,
        manifestSha256: manifest.manifestSha256 },
      limitations: [...EXPERIMENT_PACKAGE_LIMITATIONS],
    };
    const canonical = `${JSON.stringify(value, null, 2)}\n`;
    if (new TextEncoder().encode(canonical).length > EXPERIMENT_PACKAGE_LIMIT) {
      return failure('EXPERIMENT_PACKAGE_LIMIT');
    }
    return { ok: true, code: 'EXPERIMENT_PACKAGE_CREATED', value, canonical,
      sha256: await experimentPackageSha256(canonical), executableAuthority: false,
      runtimeAuthority: false, verdictAuthority: false, serverStored: false };
  } catch (error) {
    return failure(error.code ?? error.message ?? 'EXPERIMENT_PACKAGE_INVALID', error.details ?? []);
  }
}

export async function parseExperimentPackage(source, adapters) {
  try {
    const value = parseStrictJson(source, EXPERIMENT_PACKAGE_LIMIT);
    const legacy = value?.schema === LEGACY_EXPERIMENT_PACKAGE_SCHEMA;
    const expectedKeys = legacy
      ? ['schema', 'profile', 'experimentId', 'project', 'expectation', 'report', 'bindings', 'limitations']
      : ['schema', 'profile', 'experimentId', 'project', 'expectation', 'report', 'manifest', 'bindings', 'limitations'];
    if (!exactKeys(value, expectedKeys)
        || ![EXPERIMENT_PACKAGE_SCHEMA, LEGACY_EXPERIMENT_PACKAGE_SCHEMA].includes(value.schema)
        || value.profile !== EXPERIMENT_PACKAGE_PROFILE
        || value.experimentId !== THERMOSTAT_EXPERIMENT_ID
        || !exactKeys(value.bindings, legacy
          ? ['projectSha256', 'expectationSha256', 'reportSha256']
          : ['projectSha256', 'expectationSha256', 'reportSha256', 'manifestSha256'])) {
      return failure('EXPERIMENT_PACKAGE_SHAPE');
    }
    const projectText = `${JSON.stringify(value.project, null, 2)}\n`;
    const prepared = prepareProjectEnvelope(projectText, adapters);
    if (!prepared.ok) return failure(prepared.code ?? 'EXPERIMENT_PACKAGE_PROJECT', prepared.details ?? []);
    if (prepared.profile !== value.profile || !prepared.scenarioTimeline) return failure('EXPERIMENT_PACKAGE_PROJECT');
    const expectationText = `${JSON.stringify(value.expectation, null, 2)}\n`;
    const expectation = await parseExpectationReference(expectationText);
    if (!expectation.ok || !expectationReferenceMatchesPrepared(expectation.reference, prepared)) {
      return failure('EXPERIMENT_PACKAGE_EXPECTATION', [expectation.code ?? null]);
    }
    const projectSha256 = await experimentPackageSha256(prepared.canonical);
    const expectationSha256 = await experimentPackageSha256(expectation.canonical);
    if (value.bindings.projectSha256 !== projectSha256
        || value.bindings.expectationSha256 !== expectationSha256
        || expectation.reference.originProjectSha256 !== projectSha256) {
      return failure('EXPERIMENT_PACKAGE_BINDING');
    }
    const report = normalizeReport(value.report, prepared.scenarioTimeline,
      { projectSha256, expectationSha256 });
    const reportSha256 = await experimentPackageSha256(report);
    if (value.bindings.reportSha256 !== reportSha256) return failure('EXPERIMENT_PACKAGE_BINDING');
    let manifest = null;
    if (!legacy) {
      manifest = await normalizeExperimentManifest(value.manifest, { prepared, expectation,
        artifactIdentitySha256: report.artifactIdentitySha256,
        sha256: experimentPackageSha256 });
      if (value.bindings.manifestSha256 !== manifest.manifestSha256) {
        return failure('EXPERIMENT_PACKAGE_BINDING');
      }
    }
    const normalized = {
      schema: legacy ? LEGACY_EXPERIMENT_PACKAGE_SCHEMA : EXPERIMENT_PACKAGE_SCHEMA,
      profile: prepared.profile,
      experimentId: THERMOSTAT_EXPERIMENT_ID,
      project: parseStrictJson(prepared.canonical), expectation: clone(expectation.reference),
      report,
      ...(legacy ? {} : { manifest }),
      bindings: legacy
        ? { projectSha256, expectationSha256, reportSha256 }
        : { projectSha256, expectationSha256, reportSha256,
          manifestSha256: manifest.manifestSha256 },
      limitations: legacy
        ? (JSON.stringify(value.limitations) === JSON.stringify(LEGACY_EXPERIMENT_PACKAGE_LIMITATIONS)
          ? [...LEGACY_EXPERIMENT_PACKAGE_LIMITATIONS]
          : reject('EXPERIMENT_PACKAGE_LIMITATIONS'))
        : packageLimitations(value.limitations),
    };
    const canonical = `${JSON.stringify(normalized, null, 2)}\n`;
    if (canonical !== source) return failure('EXPERIMENT_PACKAGE_NOT_CANONICAL');
    return { ok: true, code: 'EXPERIMENT_PACKAGE_ACCEPTED', value: normalized,
      canonical, sha256: await experimentPackageSha256(canonical),
      executableAuthority: false, runtimeAuthority: false, verdictAuthority: false,
      serverStored: false, legacyReviewOnly: legacy, x80Complete: !legacy };
  } catch (error) {
    return failure(error.code ?? error.message ?? 'EXPERIMENT_PACKAGE_INVALID', error.details ?? []);
  }
}
