// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys, parseStrictJson } from './strict-json.mjs';
import { PROJECT_ENVELOPE_LIMIT, prepareProjectEnvelope } from './project-envelope.mjs';
import { projectTextSha256 } from './project-patch.mjs';
import { evaluateThermostatObservation } from './thermostat-experiment-contract.mjs';
import { isThermostatExperimentProject } from './thermostat-experiment.mjs';
import { evaluateScenarioTimelineObservation } from './scenario-timeline.mjs';

export const SHARED_DOMAIN_ENGINE_SCHEMA = 'intent-mcu-shared-domain-engine@1';
export const DOMAIN_REQUEST_SCHEMA = 'intent-mcu-domain-request@1';
export const DOMAIN_REQUEST_LIMIT = PROJECT_ENVELOPE_LIMIT * 3;

const failure = (code, details = []) => ({ ok: false, code, details,
  engine: SHARED_DOMAIN_ENGINE_SCHEMA, evaluated: false, buildAuthority: false });
const clone = (value) => structuredClone(value);

function parseRequest(source) {
  const value = typeof source === 'string' ? parseStrictJson(source, DOMAIN_REQUEST_LIMIT)
    : parseStrictJson(JSON.stringify(source), DOMAIN_REQUEST_LIMIT);
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.schema !== DOMAIN_REQUEST_SCHEMA || typeof value.action !== 'string') {
    throw Object.assign(new Error('DOMAIN_REQUEST_SHAPE'), { details: ['$request'] });
  }
  const keys = value.action === 'validate-project'
    ? ['schema', 'action', 'projectText']
    : ['evaluate-thermostat-observation', 'evaluate-scenario-timeline-observation'].includes(value.action)
      ? ['schema', 'action', 'projectText', 'scenarioId', 'snapshot'] : null;
  if (!keys || !exactKeys(value, keys)) {
    throw Object.assign(new Error(keys ? 'DOMAIN_REQUEST_SHAPE' : 'DOMAIN_ACTION_UNSUPPORTED'),
      { details: ['$request'] });
  }
  if (typeof value.projectText !== 'string') {
    throw Object.assign(new Error('DOMAIN_PROJECT_TEXT'), { details: ['$request.projectText'] });
  }
  if (value.action.startsWith('evaluate-')
      && (typeof value.scenarioId !== 'string' || !value.snapshot
        || typeof value.snapshot !== 'object' || Array.isArray(value.snapshot))) {
    throw Object.assign(new Error('DOMAIN_TEST_INPUT'), { details: ['$request.scenarioId', '$request.snapshot'] });
  }
  return value;
}

async function admitProject(request, adapters, activeProfile) {
  const prepared = prepareProjectEnvelope(request.projectText, adapters);
  if (!prepared.ok) return failure('DOMAIN_PROJECT_REJECTED', [prepared.code, ...(prepared.details ?? [])]);
  if (prepared.profile !== activeProfile) {
    return failure('DOMAIN_PROFILE_MISMATCH', [activeProfile, prepared.profile]);
  }
  const electricalOwner = adapters[activeProfile]?.electrical;
  if (typeof electricalOwner !== 'function') return failure('DOMAIN_ELECTRICAL_OWNER_MISSING', [activeProfile]);
  const electrical = electricalOwner(prepared);
  if (!electrical?.ok) {
    return failure('DOMAIN_ELECTRICAL_REJECTED', [electrical?.code ?? 'ELECTRICAL_INVALID',
      ...(electrical?.diagnostics ?? electrical?.details ?? [])]);
  }
  return { ok: true, prepared, electrical: clone(electrical),
    projectSha256: await projectTextSha256(prepared.canonical) };
}

export async function executeDomainRequest(source, adapters, activeProfile, caller = 'ui') {
  try {
    if (!['ui', 'agent'].includes(caller)) return failure('DOMAIN_CALLER_UNSUPPORTED', [caller]);
    const request = parseRequest(source);
    const admitted = await admitProject(request, adapters, activeProfile);
    if (!admitted.ok) return admitted;
    const base = {
      ok: true,
      schema: 'intent-mcu-domain-result@1',
      engine: SHARED_DOMAIN_ENGINE_SCHEMA,
      requestSchema: DOMAIN_REQUEST_SCHEMA,
      action: request.action,
      caller,
      profile: activeProfile,
      projectSha256: admitted.projectSha256,
      stages: {
        project: 'prepareProjectEnvelope',
        electrical: admitted.electrical.code ?? 'PROFILE_ELECTRICAL_ACCEPTED',
        tests: request.action === 'evaluate-thermostat-observation'
          ? 'evaluateThermostatObservation'
          : request.action === 'evaluate-scenario-timeline-observation'
            ? 'evaluateScenarioTimelineObservation' : 'not-requested',
      },
      mutation: false,
      evaluated: false,
      buildAuthority: false,
    };
    if (request.action === 'validate-project') {
      return { ...base, code: 'DOMAIN_PROJECT_ACCEPTED',
        thermostatTestAvailable: isThermostatExperimentProject(admitted.prepared.project) };
    }
    if (!isThermostatExperimentProject(admitted.prepared.project)) {
      return failure('DOMAIN_TEST_PROJECT_UNSUPPORTED', [activeProfile]);
    }
    const scenario = admitted.prepared.scenarioTimeline?.scenarios.find(
      (item) => item.id === request.scenarioId,
    );
    if (request.action === 'evaluate-scenario-timeline-observation' && !scenario) {
      return failure('DOMAIN_SCENARIO_NOT_FOUND', [request.scenarioId]);
    }
    const observation = request.action === 'evaluate-scenario-timeline-observation'
      ? evaluateScenarioTimelineObservation(scenario, request.snapshot)
      : evaluateThermostatObservation(request.scenarioId, request.snapshot);
    return { ...base, code: 'DOMAIN_TEST_EVALUATED', evaluated: true,
      observation: clone(observation) };
  } catch (error) {
    return failure(error.code ?? error.message ?? 'DOMAIN_REQUEST_INVALID', error.details ?? []);
  }
}

export function domainRequest(action, projectText, details = {}) {
  return JSON.stringify({ schema: DOMAIN_REQUEST_SCHEMA, action, projectText, ...details });
}
