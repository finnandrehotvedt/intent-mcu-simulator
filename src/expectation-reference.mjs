// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys, parseStrictJson } from './strict-json.mjs';
import {
  emptyProjectBrief, normalizeProjectBrief, prepareProjectEnvelope,
} from './project-envelope.mjs';
import {
  SCENARIO_TIMELINE_PROFILE, normalizeScenarioTimeline,
} from './scenario-timeline.mjs';
import { THERMOSTAT_EXPERIMENT_ID } from './thermostat-experiment-contract.mjs';

export const EXPECTATION_REFERENCE_SCHEMA = 'intent-mcu-expectation-reference@1';
export const EXPECTATION_REFERENCE_LIMIT = 256 * 1024;

const clone = (value) => structuredClone(value);
const failure = (code, details = []) => ({ ok: false, code, details });
const FORBIDDEN_KEYS = new Set([
  'artifact', 'artifactBytes', 'capability', 'elf', 'executable', 'firmwareBytes',
  'firmwareHex', 'flash', 'runtime', 'runtimeState', 'sessionId', 'token',
  'password', 'secret', 'verdict', 'experimentResults', 'observations', 'results',
]);

function rejectAuthorityAndUrls(value, path = '$') {
  if (typeof value === 'string') {
    if (value.includes('://')) throw Object.assign(new Error('EXPECTATION_REFERENCE_URL'), { details: [path] });
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectAuthorityAndUrls(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key) || /base64$/iu.test(key)) {
      throw Object.assign(new Error('EXPECTATION_REFERENCE_AUTHORITY'), { details: [`${path}.${key}`] });
    }
    rejectAuthorityAndUrls(child, `${path}.${key}`);
  }
}

async function sha256(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeReference(value) {
  rejectAuthorityAndUrls(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, ['schema', 'profile', 'experimentId', 'originProjectSha256',
        'acceptanceCriteria', 'boundaryCases', 'scenarioTimeline'])
      || value.schema !== EXPECTATION_REFERENCE_SCHEMA) {
    throw Object.assign(new Error('EXPECTATION_REFERENCE_SHAPE'), { details: ['$reference'] });
  }
  if (value.profile !== SCENARIO_TIMELINE_PROFILE
      || value.experimentId !== THERMOSTAT_EXPERIMENT_ID) {
    throw Object.assign(new Error('EXPECTATION_REFERENCE_PROFILE'), {
      details: [value.profile ?? null, value.experimentId ?? null],
    });
  }
  if (typeof value.originProjectSha256 !== 'string'
      || !/^[a-f0-9]{64}$/u.test(value.originProjectSha256)) {
    throw Object.assign(new Error('EXPECTATION_REFERENCE_ORIGIN_IDENTITY'),
      { details: ['$reference.originProjectSha256'] });
  }
  const brief = normalizeProjectBrief({
    ...emptyProjectBrief(),
    acceptanceCriteria: value.acceptanceCriteria,
    boundaryCases: value.boundaryCases,
  });
  const scenarioTimeline = normalizeScenarioTimeline(value.scenarioTimeline, value.profile);
  if (!scenarioTimeline) {
    throw Object.assign(new Error('EXPECTATION_REFERENCE_TIMELINE_REQUIRED'),
      { details: ['$reference.scenarioTimeline'] });
  }
  return {
    schema: EXPECTATION_REFERENCE_SCHEMA,
    profile: value.profile,
    experimentId: value.experimentId,
    originProjectSha256: value.originProjectSha256,
    acceptanceCriteria: brief.acceptanceCriteria,
    boundaryCases: brief.boundaryCases,
    scenarioTimeline,
  };
}

function canonical(reference) {
  return `${JSON.stringify(reference, null, 2)}\n`;
}

export function expectationReferenceContent(reference) {
  const normalized = normalizeReference(reference);
  return {
    acceptanceCriteria: clone(normalized.acceptanceCriteria),
    boundaryCases: clone(normalized.boundaryCases),
    scenarioTimeline: clone(normalized.scenarioTimeline),
  };
}

export function expectationContentFromPrepared(prepared) {
  if (!prepared?.ok || prepared.profile !== SCENARIO_TIMELINE_PROFILE
      || !prepared.scenarioTimeline
      || prepared.scenarioTimeline.experimentId !== THERMOSTAT_EXPERIMENT_ID) {
    throw Object.assign(new Error('EXPECTATION_REFERENCE_PROJECT_REQUIRED'),
      { details: [prepared?.profile ?? null] });
  }
  return {
    acceptanceCriteria: clone(prepared.brief.acceptanceCriteria),
    boundaryCases: clone(prepared.brief.boundaryCases),
    scenarioTimeline: clone(prepared.scenarioTimeline),
  };
}

export function expectationReferenceMatchesPrepared(reference, prepared) {
  try {
    return JSON.stringify(expectationReferenceContent(reference))
      === JSON.stringify(expectationContentFromPrepared(prepared));
  } catch {
    return false;
  }
}

export async function parseExpectationReference(source) {
  try {
    const value = parseStrictJson(source, EXPECTATION_REFERENCE_LIMIT);
    const reference = normalizeReference(value);
    const canonicalText = canonical(reference);
    return {
      ok: true,
      code: 'EXPECTATION_REFERENCE_ACCEPTED',
      reference,
      canonical: canonicalText,
      sha256: await sha256(canonicalText),
      executableAuthority: false,
      verdictAuthority: false,
    };
  } catch (error) {
    return failure(error.code ?? error.message ?? 'EXPECTATION_REFERENCE_INVALID', error.details ?? []);
  }
}

export async function createExpectationReference(projectText, adapters, activeProfile) {
  try {
    const prepared = prepareProjectEnvelope(projectText, adapters);
    if (!prepared.ok || prepared.profile !== activeProfile) {
      return failure('EXPECTATION_REFERENCE_PROJECT_INVALID', [prepared.code ?? null]);
    }
    const content = expectationContentFromPrepared(prepared);
    const reference = normalizeReference({
      schema: EXPECTATION_REFERENCE_SCHEMA,
      profile: prepared.profile,
      experimentId: THERMOSTAT_EXPERIMENT_ID,
      originProjectSha256: await sha256(prepared.canonical),
      ...content,
    });
    const canonicalText = canonical(reference);
    return {
      ok: true,
      code: 'EXPECTATION_REFERENCE_CREATED',
      reference,
      canonical: canonicalText,
      sha256: await sha256(canonicalText),
      executableAuthority: false,
      verdictAuthority: false,
    };
  } catch (error) {
    return failure(error.code ?? error.message ?? 'EXPECTATION_REFERENCE_INVALID', error.details ?? []);
  }
}
