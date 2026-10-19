// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  PROJECT_SCHEMA,
  canonicalProjectJson,
  parseProjectV2,
  validateProjectV2,
} from '../src/project-v2.mjs';
import { exactKeys, parseStrictJson } from '../src/strict-json.mjs';
import {
  CONTROLLER_ADAPTER_PROFILES,
  CONTROLLER_ADAPTER_SCHEMA,
  CONTROLLER_COMPILER_PROFILES,
} from './controller-adapter-contract-v1.mjs';

export const PROJECT_V3_SCHEMA = 'intent-mcu-project@3';
export const PROJECT_V3_LIMIT = 1024 * 1024;
export const CATALOGUE_REFERENCE_SCHEMA = 'intent-mcu-catalogue-ref@1';
export const CATALOGUE_VERSION = 'intent-mcu-catalogue@2';
export const ARTIFACT_REFERENCE_SCHEMA = 'intent-mcu-project-artifact-ref@1';

const SHA256 = /^[0-9a-f]{64}$/u;
const clone = (value) => structuredClone(value);
const failure = (code, details = []) => ({ ok: false, code, details });

function activeProfile(profileId) {
  return CONTROLLER_ADAPTER_PROFILES.find((profile) => profile.profile === profileId && profile.status === 'simulated') ?? null;
}

export function projectV3ControllerProfileStatus(profileId) {
  const adapter = CONTROLLER_ADAPTER_PROFILES.find((profile) => profile.profile === profileId) ?? null;
  const compiler = CONTROLLER_COMPILER_PROFILES.find((profile) => profile.profile === profileId) ?? null;
  if (!adapter || !compiler) return {
    known: false, profile: profileId, adapterStatus: null, compilerStatus: null,
    compileCandidate: false, runtimeAllowed: false,
  };
  return {
    known: true,
    profile: profileId,
    adapterStatus: adapter.status,
    compilerStatus: compiler.status,
    compileCandidate: compiler.status === 'pre-adoption-probe',
    runtimeAllowed: adapter.status === 'simulated' && compiler.runtimeLoadable === true,
  };
}

function capabilityDeclaration(profile) {
  return profile.capabilities.map(({ id, status }) => ({ id, status }));
}

function dirtyArtifact() {
  return {
    schema: ARTIFACT_REFERENCE_SCHEMA,
    status: 'dirty',
    profile: null,
    inputIdentitySha256: null,
    artifactIdentitySha256: null,
  };
}

function normalizedEnvelope(project, artifact = dirtyArtifact()) {
  const profile = activeProfile(project.boardProfile);
  if (!profile) return null;
  return {
    schema: PROJECT_V3_SCHEMA,
    metadata: clone(project.metadata),
    catalogue: {
      schema: CATALOGUE_REFERENCE_SCHEMA,
      version: CATALOGUE_VERSION,
    },
    controller: {
      profile: profile.profile,
      adapterContract: CONTROLLER_ADAPTER_SCHEMA,
      status: profile.status,
      capabilities: capabilityDeclaration(profile),
    },
    source: clone(project.source),
    circuit: clone(project.circuit),
    layout: clone(project.layout),
    instruments: clone(project.instruments),
    artifact: clone(artifact),
  };
}

function validateArtifactReference(value, profile) {
  if (!exactKeys(value, [
    'schema', 'status', 'profile', 'inputIdentitySha256', 'artifactIdentitySha256',
  ]) || value.schema !== ARTIFACT_REFERENCE_SCHEMA || !['dirty', 'succeeded'].includes(value.status)) return false;
  if (value.status === 'dirty') {
    return value.profile === null && value.inputIdentitySha256 === null && value.artifactIdentitySha256 === null;
  }
  return value.profile === profile && SHA256.test(value.inputIdentitySha256)
    && SHA256.test(value.artifactIdentitySha256);
}

export function validateProjectV3(value) {
  try {
    if (!exactKeys(value, [
      'schema', 'metadata', 'catalogue', 'controller', 'source', 'circuit',
      'layout', 'instruments', 'artifact',
    ])) return failure('PROJECT_V3_SHAPE');
    if (value.schema !== PROJECT_V3_SCHEMA) return failure('PROJECT_V3_VERSION');
    if (!exactKeys(value.catalogue, ['schema', 'version'])
      || value.catalogue.schema !== CATALOGUE_REFERENCE_SCHEMA
      || value.catalogue.version !== CATALOGUE_VERSION) return failure('PROJECT_V3_CATALOGUE');
    if (!exactKeys(value.controller, ['profile', 'adapterContract', 'status', 'capabilities'])) {
      return failure('PROJECT_V3_CONTROLLER');
    }
    const profileStatus = projectV3ControllerProfileStatus(value.controller.profile);
    if (!profileStatus.known) return failure('PROJECT_V3_CONTROLLER_UNSUPPORTED', [value.controller.profile]);
    if (!profileStatus.runtimeAllowed) {
      return failure('PROJECT_V3_CONTROLLER_RUNTIME_UNSUPPORTED', [
        value.controller.profile, profileStatus.compilerStatus,
      ]);
    }
    const profile = activeProfile(value.controller.profile);
    if (value.controller.adapterContract !== CONTROLLER_ADAPTER_SCHEMA
      || value.controller.status !== 'simulated'
      || JSON.stringify(value.controller.capabilities) !== JSON.stringify(capabilityDeclaration(profile))) {
      return failure('PROJECT_V3_CONTROLLER');
    }
    if (!validateArtifactReference(value.artifact, profile.profile)) return failure('PROJECT_V3_ARTIFACT');

    const projectedV2 = {
      schema: PROJECT_SCHEMA,
      metadata: clone(value.metadata),
      boardProfile: profile.profile,
      source: clone(value.source),
      circuit: clone(value.circuit),
      layout: clone(value.layout),
      instruments: clone(value.instruments),
      build: value.artifact.status === 'succeeded' ? {
        status: 'succeeded',
        inputIdentity: value.artifact.inputIdentitySha256,
        artifactIdentity: value.artifact.artifactIdentitySha256,
      } : { status: 'dirty', inputIdentity: null, artifactIdentity: null },
    };
    const validated = validateProjectV2(projectedV2);
    if (!validated.ok) return failure(`PROJECT_V3_${validated.code}`, validated.details);
    return {
      ok: true,
      code: 'OK',
      project: normalizedEnvelope(validated.project, value.artifact),
    };
  } catch {
    return failure('PROJECT_V3_INVALID');
  }
}

export function parseProjectV3(source) {
  try {
    return validateProjectV3(parseStrictJson(source, PROJECT_V3_LIMIT));
  } catch (error) {
    return failure(error.code ?? 'MALFORMED_JSON');
  }
}

export function canonicalProjectV3Json(project) {
  const validated = validateProjectV3(project);
  if (!validated.ok) throw new Error(validated.code);
  return JSON.stringify(validated.project);
}

export function migrateProjectV2ToV3(source) {
  const before = typeof source === 'string' ? source : clone(source);
  const validated = typeof source === 'string' ? parseProjectV2(source) : validateProjectV2(clone(source));
  if (!validated.ok) return failure(`V2_TO_V3_${validated.code}`, validated.details);
  const project = normalizedEnvelope(validated.project);
  const accepted = validateProjectV3(project);
  if (!accepted.ok) return accepted;
  const originalUnchanged = typeof source === 'string'
    ? source === before
    : JSON.stringify(source) === JSON.stringify(before);
  return {
    ...accepted,
    report: {
      code: 'V2_TO_V3_MIGRATED',
      inputSchema: PROJECT_SCHEMA,
      outputSchema: PROJECT_V3_SCHEMA,
      controllerProfile: validated.project.boardProfile,
      sourcePreserved: JSON.stringify(accepted.project.source) === JSON.stringify(validated.project.source),
      circuitPreserved: JSON.stringify(accepted.project.circuit) === JSON.stringify(validated.project.circuit),
      layoutPreserved: JSON.stringify(accepted.project.layout) === JSON.stringify(validated.project.layout),
      instrumentsPreserved: JSON.stringify(accepted.project.instruments) === JSON.stringify(validated.project.instruments),
      artifactIdentityCleared: accepted.project.artifact.status === 'dirty'
        && accepted.project.artifact.inputIdentitySha256 === null
        && accepted.project.artifact.artifactIdentitySha256 === null,
      originalInputUntouched: originalUnchanged,
      oneWay: true,
    },
  };
}

export function canonicalV2InputForMigration(project) {
  return canonicalProjectJson(project);
}
