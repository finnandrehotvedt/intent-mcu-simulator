// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  EXPERIMENT_PACKAGE_SCHEMA,
  parseExperimentPackage,
} from './experiment-package.mjs';

export const GUIDED_EXPERIMENT_REPLAY_SCHEMA = 'intent-mcu-guided-historical-replay@1';

const clone = (value) => structuredClone(value);
const failure = (code, details = []) => ({ ok: false, code, details });

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function recordedInput(event) {
  if (event.kind === 'input.temperature-c') return {
    id: event.id,
    at: event.atMilliseconds,
    timeUnit: 'virtual millisecond',
    kind: event.kind,
    componentId: event.componentId,
    value: event.valueC,
    unit: '°C',
    text: `${event.valueC} °C at ${event.atMilliseconds} virtual ms`,
  };
  if (event.kind === 'input.button-pressed') return {
    id: event.id,
    at: event.atMilliseconds,
    timeUnit: 'virtual millisecond',
    kind: event.kind,
    componentId: event.componentId,
    value: event.pressed,
    unit: null,
    text: `${event.pressed ? 'pressed' : 'released'} at ${event.atMilliseconds} virtual ms`,
  };
  return null;
}

function recordedExplanation(result) {
  const observed = result.observed.level ? 'HIGH' : 'LOW';
  const expected = result.expected.level ? 'HIGH' : 'LOW';
  const window = `${result.expected.windowStartMilliseconds}–${result.expected.windowEndMilliseconds} virtual ms`;
  if (result.academicStatus === 'passed') {
    return `Recorded D13 ${observed} matched expected ${expected} in the ${window} observation window.`;
  }
  return `Recorded D13 ${observed} did not match expected ${expected} in the ${window} observation window. Recorded reason: ${result.reasons.join(', ')}.`;
}

export async function createGuidedExperimentReplay(source, adapters) {
  const parsed = await parseExperimentPackage(source, adapters);
  if (!parsed.ok) return failure(parsed.code, parsed.details);
  if (parsed.value.schema !== EXPERIMENT_PACKAGE_SCHEMA || parsed.legacyReviewOnly) {
    return failure('GUIDED_REPLAY_STRICT_V3_REQUIRED');
  }
  const { value } = parsed;
  const timeline = value.project.scenarioTimeline;
  if (!timeline || timeline.scenarios.length !== value.report.results.length) {
    return failure('GUIDED_REPLAY_TIMELINE_MISMATCH');
  }
  const requirementIds = value.expectation.acceptanceCriteria.map((criterion) => criterion.id);
  const steps = timeline.scenarios.map((scenario, index) => {
    const result = value.report.results[index];
    if (scenario.id !== result.scenarioId) return null;
    const inputs = scenario.events.map(recordedInput).filter(Boolean);
    if (!inputs.length) return null;
    return {
      index,
      number: index + 1,
      total: timeline.scenarios.length,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      requirementIds: [...requirementIds],
      requirementState: requirementIds.length ? 'recorded' : 'unavailable',
      inputs,
      observedAt: result.virtualMilliseconds,
      timeUnit: 'virtual millisecond',
      expected: clone(result.expected),
      observed: clone(result.observed),
      recordedOutcome: result.academicStatus,
      evidenceStatus: result.evidenceStatus,
      reasons: [...result.reasons],
      explanation: recordedExplanation(result),
      beginning: index === 0,
      end: index === timeline.scenarios.length - 1,
    };
  });
  if (steps.some((step) => !step)) return failure('GUIDED_REPLAY_INPUT_SEQUENCE_UNAVAILABLE');
  const replay = {
    schema: GUIDED_EXPERIMENT_REPLAY_SCHEMA,
    historical: true,
    packageSha256: parsed.sha256,
    profile: value.profile,
    experimentId: value.experimentId,
    sourceVariant: value.report.sourceVariant,
    projectName: value.project.project.project.metadata.name,
    identities: {
      projectSha256: value.bindings.projectSha256,
      expectationSha256: value.bindings.expectationSha256,
      reportSha256: value.bindings.reportSha256,
      manifestSha256: value.bindings.manifestSha256,
      sourceSha256: value.manifest.sourceSha256,
      circuitSha256: value.manifest.circuitSha256,
      artifactSha256: value.manifest.artifactSha256,
      modelLibrary: clone(value.manifest.modelLibrary),
    },
    capture: {
      capturedAt: null,
      capturedAtState: 'unavailable-not-recorded',
      timeBasis: 'virtual-millisecond',
      completeness: clone(value.report.completeness),
    },
    recordedAggregate: clone(value.report.aggregate),
    steps,
    authority: { currentVerdict: false, build: false, run: false, runtime: false, mutation: false },
    limitation: 'Historical recorded evidence only. It is not a current verdict, does not rerun firmware, and does not establish who created the file or whether its claims are true.',
  };
  return { ok: true, code: 'GUIDED_REPLAY_READY', replay: deepFreeze(replay),
    canonicalPackage: parsed.canonical, packageSha256: parsed.sha256 };
}
