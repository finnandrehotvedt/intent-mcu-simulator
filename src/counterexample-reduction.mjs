// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  SEEDED_PROPERTY_ALGORITHM, SEEDED_PROPERTY_CASE_COUNT, SEEDED_PROPERTY_RESOURCE_BUDGET,
  generateSeededPropertyScenarios, seededPropertySuite,
} from './seeded-property-suite.mjs';
import { exactKeys } from './strict-json.mjs';

export const COUNTEREXAMPLE_REDUCTION_SCHEMA = 'intent-mcu-counterexample-reduction@1';
export const COUNTEREXAMPLE_REDUCTION_PROVENANCE_SCHEMA = 'intent-mcu-counterexample-reduction-provenance@1';
export const REDUCED_SCENARIO_TIMELINE_SCHEMA = 'intent-mcu-scenario-timeline@4';
export const COUNTEREXAMPLE_REDUCER_ID = 'x24-avr-thermostat-counterexample-reduction-v1';
export const COUNTEREXAMPLE_REDUCTION_SEED = 305_419_896;
export const COUNTEREXAMPLE_REDUCTION_LIMITS = Object.freeze({
  sourceScenarios: 8,
  sourceEvents: 24,
  candidateReplays: 7,
  attemptedScenarioRemovals: 8,
  reducedScenarios: 1,
  reducedEvents: 3,
  maximumVirtualMillisecondsPerReplay: 350,
});
export const COUNTEREXAMPLE_REDUCTION_AUTHORITY = 'inert-provenance-fresh-build-and-replay-required';

const PROFILE = 'board.atmega328p-16mhz-v1';
const EXPERIMENT = 'avr-thermostat-boundary-v1';
const SHA256 = /^[a-f0-9]{64}$/u;
const clone = (value) => structuredClone(value);
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const failure = (code, details = []) => Object.assign(new Error(code), { code, details });

async function sha256Text(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function expectedScenarios() {
  return generateSeededPropertyScenarios(seededPropertySuite(COUNTEREXAMPLE_REDUCTION_SEED));
}

function eventCount(scenarios) {
  return scenarios.reduce((count, scenario) => count + scenario.events.length, 0);
}

function normalizedPin(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const output = {};
  for (const key of ['pin', 'mode', 'level', 'adc', 'voltage', 'externalDrive', 'faultState']) {
    if (Object.hasOwn(value, key)) output[key] = value[key];
  }
  return output;
}

function failureObservation(observations) {
  if (!Array.isArray(observations)) throw failure('COUNTEREXAMPLE_OBSERVATIONS_INVALID');
  const failures = observations.filter((item) => item?.status === 'failed');
  if (failures.length !== 1 || observations.some((item) => !['passed', 'failed'].includes(item?.status))) {
    throw failure('COUNTEREXAMPLE_FAILURE_SET_INVALID');
  }
  const observation = failures[0];
  if (observation.outcome?.academicStatus !== 'failed'
      || observation.outcome?.jobStatus !== 'completed'
      || !observation.outcome?.reasons?.includes('EXPECTED_PIN_LEVEL_MISMATCH')
      || observation.expected?.pin !== 'D13'
      || typeof observation.expected?.level !== 'boolean'
      || observation.observed?.pin !== 'D13'
      || typeof observation.observed?.level !== 'boolean'
      || observation.observed.level === observation.expected.level
      || observation.checks?.inputsComplete !== true
      || observation.checks?.pinObserved !== true) {
    throw failure('COUNTEREXAMPLE_PRODUCER_FAILURE_REQUIRED');
  }
  return observation;
}

export function counterexampleFailureSignature(observation, {
  sourceBuildInputSha256, artifactSha256,
} = {}) {
  if (!SHA256.test(sourceBuildInputSha256 ?? '') || !SHA256.test(artifactSha256 ?? '')) {
    throw failure('COUNTEREXAMPLE_ASSOCIATION_INVALID');
  }
  const controls = Array.isArray(observation?.observed?.inputControls)
    ? observation.observed.inputControls.map(({ componentId, key, value, targetCycle }) => (
      { componentId, key, value, targetCycle }
    )) : [];
  return {
    profile: PROFILE,
    experimentId: EXPERIMENT,
    sourceBuildInputSha256,
    artifactSha256,
    academicStatus: observation.outcome.academicStatus,
    failingAssertionCode: 'EXPECTED_PIN_LEVEL_MISMATCH',
    scenarioId: observation.scenarioId,
    expectedD13: observation.expected.level,
    actualD13: observation.observed.level,
    producerInputs: {
      controls,
      d2: normalizedPin(observation.observed.actualInputs?.d2),
      a1: normalizedPin(observation.observed.actualInputs?.a1),
    },
  };
}

function provenanceAttempt(value, index, order) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, ['scenarioId', 'decision', 'code'])
      || value.scenarioId !== order[index]
      || !['removed', 'retained'].includes(value.decision)
      || (index < order.length - 1 && (value.decision !== 'removed' || value.code !== 'FAILURE_SIGNATURE_PRESERVED'))
      || (index === order.length - 1 && (value.decision !== 'retained' || value.code !== 'FINAL_SCENARIO_REQUIRED'))) {
    throw failure('COUNTEREXAMPLE_PROVENANCE_ATTEMPT', [`$scenarioTimeline.reductionProvenance.attempts[${index}]`]);
  }
  return { scenarioId: value.scenarioId, decision: value.decision, code: value.code };
}

export function normalizeCounterexampleReductionProvenance(value) {
  const order = expectedScenarios().map((scenario) => scenario.id);
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, [
        'schema', 'reducerId', 'seed', 'algorithm', 'originalScenarioCount', 'originalEventCount',
        'reducedScenarioCount', 'reducedEventCount', 'originalTimelineSha256', 'reducedScenarioSha256',
        'scenarioRemovalOrder', 'attempts', 'oneMinimality', 'stopReason', 'authority',
      ])
      || value.schema !== COUNTEREXAMPLE_REDUCTION_PROVENANCE_SCHEMA
      || value.reducerId !== COUNTEREXAMPLE_REDUCER_ID
      || value.seed !== COUNTEREXAMPLE_REDUCTION_SEED
      || value.algorithm !== SEEDED_PROPERTY_ALGORITHM
      || value.originalScenarioCount !== COUNTEREXAMPLE_REDUCTION_LIMITS.sourceScenarios
      || value.originalEventCount !== COUNTEREXAMPLE_REDUCTION_LIMITS.sourceEvents
      || value.reducedScenarioCount !== COUNTEREXAMPLE_REDUCTION_LIMITS.reducedScenarios
      || value.reducedEventCount !== COUNTEREXAMPLE_REDUCTION_LIMITS.reducedEvents
      || !SHA256.test(value.originalTimelineSha256)
      || !SHA256.test(value.reducedScenarioSha256)
      || !same(value.scenarioRemovalOrder, order)
      || !Array.isArray(value.attempts) || value.attempts.length !== order.length
      || !Array.isArray(value.oneMinimality) || value.oneMinimality.length !== 3
      || value.stopReason !== 'ONE_MINIMAL_PRODUCER_FAILURE_PRESERVED'
      || value.authority !== COUNTEREXAMPLE_REDUCTION_AUTHORITY) {
    throw failure('COUNTEREXAMPLE_PROVENANCE_SHAPE', ['$scenarioTimeline.reductionProvenance']);
  }
  const attempts = value.attempts.map((attempt, index) => provenanceAttempt(attempt, index, order));
  const finalEvents = expectedScenarios().at(-1).events;
  const oneMinimality = value.oneMinimality.map((attempt, index) => {
    if (!attempt || typeof attempt !== 'object' || Array.isArray(attempt)
        || !exactKeys(attempt, ['eventId', 'decision', 'code'])
        || attempt.eventId !== finalEvents[index].id || attempt.decision !== 'retained'
        || attempt.code !== 'SCENARIO_SHAPE') {
      throw failure('COUNTEREXAMPLE_ONE_MINIMALITY', [`$scenarioTimeline.reductionProvenance.oneMinimality[${index}]`]);
    }
    return { eventId: attempt.eventId, decision: attempt.decision, code: attempt.code };
  });
  return { ...clone(value), scenarioRemovalOrder: [...order], attempts, oneMinimality };
}

export function reducedCounterexampleTimeline(scenario, reductionProvenance) {
  return {
    schema: REDUCED_SCENARIO_TIMELINE_SCHEMA,
    profile: PROFILE,
    experimentId: EXPERIMENT,
    reductionProvenance: normalizeCounterexampleReductionProvenance(reductionProvenance),
    scenarios: [clone(scenario)],
  };
}

function candidateTimeline(scenarios) {
  return { schema: 'intent-mcu-scenario-timeline@1', profile: PROFILE,
    experimentId: EXPERIMENT, scenarios: clone(scenarios) };
}

export async function reduceThermostatCounterexample({
  sourceTimeline, baselineObservations, sourceBuildInputSha256, artifactSha256, replay,
} = {}) {
  const expected = expectedScenarios();
  if (!sourceTimeline || sourceTimeline.schema !== 'intent-mcu-scenario-timeline@2'
      || sourceTimeline.profile !== PROFILE || sourceTimeline.experimentId !== EXPERIMENT
      || sourceTimeline.propertySuite?.seed !== COUNTEREXAMPLE_REDUCTION_SEED
      || sourceTimeline.propertySuite?.algorithm !== SEEDED_PROPERTY_ALGORITHM
      || sourceTimeline.propertySuite?.resourceBudget?.maximumVirtualMilliseconds
        !== SEEDED_PROPERTY_RESOURCE_BUDGET.maximumVirtualMilliseconds
      || !same(sourceTimeline.scenarios, expected)
      || sourceTimeline.scenarios.length !== COUNTEREXAMPLE_REDUCTION_LIMITS.sourceScenarios
      || eventCount(sourceTimeline.scenarios) !== COUNTEREXAMPLE_REDUCTION_LIMITS.sourceEvents
      || typeof replay !== 'function') {
    throw failure('COUNTEREXAMPLE_SOURCE_UNSUPPORTED');
  }
  const baseline = failureObservation(baselineObservations);
  const signature = counterexampleFailureSignature(baseline, { sourceBuildInputSha256, artifactSha256 });
  let remaining = clone(sourceTimeline.scenarios);
  const attempts = [];
  let candidateReplays = 0;
  for (const scenarioId of sourceTimeline.scenarios.map((scenario) => scenario.id)) {
    const candidate = remaining.filter((scenario) => scenario.id !== scenarioId);
    if (!candidate.length) {
      attempts.push({ scenarioId, beforeScenarioCount: remaining.length, candidateScenarioCount: 0,
        replayed: false, decision: 'retained', code: 'FINAL_SCENARIO_REQUIRED' });
      continue;
    }
    const observations = await replay(candidateTimeline(candidate));
    candidateReplays += 1;
    let candidateSignature = null;
    try {
      if (observations.length !== candidate.length) throw failure('COUNTEREXAMPLE_OBSERVATION_COUNT');
      candidateSignature = counterexampleFailureSignature(failureObservation(observations), {
        sourceBuildInputSha256, artifactSha256,
      });
    } catch {
      // A candidate without the exact complete producer-backed failure is retained.
    }
    const preserved = candidateSignature && same(candidateSignature, signature);
    attempts.push({ scenarioId, beforeScenarioCount: remaining.length,
      candidateScenarioCount: candidate.length, replayed: true,
      decision: preserved ? 'removed' : 'retained',
      code: preserved ? 'FAILURE_SIGNATURE_PRESERVED' : 'FAILURE_SIGNATURE_NOT_PRESERVED' });
    if (preserved) remaining = candidate;
  }
  if (candidateReplays !== COUNTEREXAMPLE_REDUCTION_LIMITS.candidateReplays
      || remaining.length !== 1 || remaining[0].id !== signature.scenarioId
      || remaining[0].events.length !== COUNTEREXAMPLE_REDUCTION_LIMITS.reducedEvents) {
    throw failure('COUNTEREXAMPLE_REDUCTION_INCOMPLETE');
  }
  const finalScenario = remaining[0];
  const oneMinimality = finalScenario.events.map((event) => {
    const candidate = { ...clone(finalScenario), events: finalScenario.events.filter((item) => item.id !== event.id) };
    const structurallyInvalid = candidate.events.length < 3;
    if (!structurallyInvalid) throw failure('COUNTEREXAMPLE_ONE_MINIMALITY_UNPROVEN', [event.id]);
    return { eventId: event.id, replayed: false, decision: 'retained', code: 'SCENARIO_SHAPE' };
  });
  const originalTimelineSha256 = await sha256Text(`${JSON.stringify(sourceTimeline)}\n`);
  const reducedScenarioSha256 = await sha256Text(`${JSON.stringify(finalScenario)}\n`);
  const provenance = normalizeCounterexampleReductionProvenance({
    schema: COUNTEREXAMPLE_REDUCTION_PROVENANCE_SCHEMA,
    reducerId: COUNTEREXAMPLE_REDUCER_ID,
    seed: COUNTEREXAMPLE_REDUCTION_SEED,
    algorithm: SEEDED_PROPERTY_ALGORITHM,
    originalScenarioCount: sourceTimeline.scenarios.length,
    originalEventCount: eventCount(sourceTimeline.scenarios),
    reducedScenarioCount: 1,
    reducedEventCount: finalScenario.events.length,
    originalTimelineSha256,
    reducedScenarioSha256,
    scenarioRemovalOrder: sourceTimeline.scenarios.map((scenario) => scenario.id),
    attempts: attempts.map(({ scenarioId, decision, code }) => ({ scenarioId, decision, code })),
    oneMinimality: oneMinimality.map(({ eventId, decision, code }) => ({ eventId, decision, code })),
    stopReason: 'ONE_MINIMAL_PRODUCER_FAILURE_PRESERVED',
    authority: COUNTEREXAMPLE_REDUCTION_AUTHORITY,
  });
  return {
    schema: COUNTEREXAMPLE_REDUCTION_SCHEMA,
    reducerId: COUNTEREXAMPLE_REDUCER_ID,
    profile: PROFILE,
    experimentId: EXPERIMENT,
    seed: COUNTEREXAMPLE_REDUCTION_SEED,
    limits: clone(COUNTEREXAMPLE_REDUCTION_LIMITS),
    association: { sourceBuildInputSha256, artifactSha256 },
    failureSignature: signature,
    original: { scenarioCount: sourceTimeline.scenarios.length,
      eventCount: eventCount(sourceTimeline.scenarios), timelineSha256: originalTimelineSha256 },
    reduced: { scenarioCount: 1, eventCount: finalScenario.events.length,
      scenarioSha256: reducedScenarioSha256 },
    attempts,
    oneMinimality,
    stopReason: provenance.stopReason,
    reducedTimeline: reducedCounterexampleTimeline(finalScenario, provenance),
  };
}
