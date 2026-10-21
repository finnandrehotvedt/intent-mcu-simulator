// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { AVR_PROFILE, candidateCompilerTarget } from './compile-targets.mjs';
import { createThermostatExperiment, isThermostatExperimentProject } from './thermostat-experiment.mjs';
import { THERMOSTAT_EXPERIMENT_SOURCE } from './thermostat-source.mjs';
import {
  instrumentX49ThermostatSource,
  validateX49RuntimeProbe,
  X49_INSTRUMENTED_FIXTURE_ID,
  X49_INSTRUMENTED_SOURCE_SHA256,
  X49_RUNTIME_PROBE_SCHEMA,
} from './x49-instrumented-fixture-contract.mjs';
import { parseX49ProbeSymbol } from './x49-avr-probe-symbol.mjs';
import {
  x49PrivateExecutionContext,
  x49PrivateObservation,
} from './x49-private-runtime-contract.mjs';
import {
  sealX49Report,
  stableX49Stringify,
  validateX49AcceptedNativeReport,
  x49Sha256,
  X49_CASES,
  X49_CONTRACT_ID,
  X49_EXPERIMENT_BINDING_SCHEMA,
  X49_FIXTURE_CLASS,
  X49_REPORT_SCHEMA,
} from './x49-sensor-offset.mjs';
import { MODEL_RUNTIME_BINDING_SCHEMA } from './runtime-identity.mjs';
import { CONTACT_PERSISTENCE_SCHEMA } from '../expansion-drafts/project-v3-contact-persistence.mjs';

export const X49_PUBLIC_RUN_AUTHORITY_SCHEMA = 'intent-mcu-x49-public-run-authority@1';
export const X49_PUBLIC_TOOLCHAIN_IMAGE = 'sha256:62e4324594b63e88b17052a17eb9edf52593aff7d907647bc1e9c2fd809fbc74';
export const X49_PUBLIC_TOOLCHAIN_IDENTITY = candidateCompilerTarget(AVR_PROFILE).toolchainIdentitySha256;

const HASH = /^[a-f0-9]{64}$/u;
const IMAGE = /^sha256:[a-f0-9]{64}$/u;
const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };

function projectSurface(project) {
  if (project?.schema === CONTACT_PERSISTENCE_SCHEMA) {
    return {
      profile: project.project?.controller?.profile,
      files: project.project?.source?.files,
      graph: project.candidateCircuit,
    };
  }
  return { profile: project?.boardProfile, files: project?.source?.files, graph: project?.circuit };
}

const X49_PUBLIC_GRAPH_CANONICAL = stableX49Stringify(
  projectSurface(createThermostatExperiment().project).graph,
);

function mainSource(files) {
  if (!Array.isArray(files) || files.length !== 1 || files[0]?.name !== 'main.ino'
      || typeof files[0].content !== 'string') reject('X49_PUBLIC_SOURCE_FILES_INVALID');
  return files[0].content;
}

function lifecycleIsBusy(state) {
  return state?.buildState === 'building'
    || ['building', 'running', 'resetting'].includes(state?.lifecycle?.phase);
}

export async function captureX49PublicAuthority(state, cryptoImpl = globalThis.crypto) {
  if (!state || state.compilerTarget !== AVR_PROFILE || state.compileAvailable !== true
      || !Number.isSafeInteger(state.revision) || state.revision < 0
      || !Number.isSafeInteger(state.lifecycle?.projectGeneration)
      || state.lifecycle.projectGeneration < 1) reject('X49_PUBLIC_PROFILE_AUTHORITY_INVALID');
  if (lifecycleIsBusy(state)) reject('X49_PUBLIC_NORMAL_OPERATION_ACTIVE');
  const project = clone(state.project);
  if (!isThermostatExperimentProject(project)) reject('X49_PUBLIC_GRAPH_AUTHORITY_INVALID');
  const surface = projectSurface(project);
  if (surface.profile !== AVR_PROFILE) reject('X49_PUBLIC_PROFILE_AUTHORITY_INVALID');
  const source = mainSource(surface.files);
  if (source !== THERMOSTAT_EXPERIMENT_SOURCE) reject('X49_PUBLIC_SOURCE_AUTHORITY_INVALID');
  const sourceSha256 = await x49Sha256(source, cryptoImpl);
  const graphCanonical = stableX49Stringify(surface.graph);
  if (graphCanonical !== X49_PUBLIC_GRAPH_CANONICAL) reject('X49_PUBLIC_GRAPH_AUTHORITY_INVALID');
  const graphIdentity = `sha256:${await x49Sha256(graphCanonical, cryptoImpl)}`;
  return Object.freeze({
    schema: X49_PUBLIC_RUN_AUTHORITY_SCHEMA,
    profile: AVR_PROFILE,
    revision: state.revision,
    projectGeneration: state.lifecycle.projectGeneration,
    source,
    sourceSha256,
    graphCanonical,
    graphIdentity,
    toolchainIdentitySha256: X49_PUBLIC_TOOLCHAIN_IDENTITY,
  });
}

export async function x49PublicAuthorityStillCurrent(authority, state, cryptoImpl = globalThis.crypto) {
  try {
    const current = await captureX49PublicAuthority(state, cryptoImpl);
    return stableX49Stringify(current) === stableX49Stringify(authority);
  } catch {
    return false;
  }
}

export async function prepareX49PublicBuild(authority, cryptoImpl = globalThis.crypto) {
  if (authority?.schema !== X49_PUBLIC_RUN_AUTHORITY_SCHEMA) reject('X49_PUBLIC_AUTHORITY_REQUIRED');
  const instrumentedSource = instrumentX49ThermostatSource(authority.source);
  if (await x49Sha256(instrumentedSource, cryptoImpl) !== X49_INSTRUMENTED_SOURCE_SHA256) {
    reject('X49_PUBLIC_INSTRUMENTED_SOURCE_HASH_INVALID');
  }
  return Object.freeze({
    schema: 'teach-lab-build-request@1',
    board: AVR_PROFILE,
    files: Object.freeze([{ name: 'main.ino', content: instrumentedSource }]),
  });
}

export async function expectedX49BuildInputIdentity(request, cryptoImpl = globalThis.crypto) {
  if (request?.schema !== 'teach-lab-build-request@1' || request.board !== AVR_PROFILE
      || !Array.isArray(request.files) || request.files.length !== 1
      || request.files[0]?.name !== 'main.ino' || typeof request.files[0]?.content !== 'string') {
    reject('X49_PUBLIC_BUILD_REQUEST_INVALID');
  }
  const files = request.files.map(({ name, content }) => ({
    name,
    content: content.normalize('NFC').replace(/\r\n?/gu, '\n'),
  }));
  const sourceDigest = await x49Sha256(JSON.stringify({
    schema: request.schema,
    board: request.board,
    files,
  }), cryptoImpl);
  return x49Sha256(JSON.stringify({
    sourceDigest,
    board: request.board,
    toolchainManifestSha256: X49_PUBLIC_TOOLCHAIN_IDENTITY,
    toolchainImageId: X49_PUBLIC_TOOLCHAIN_IMAGE,
    fixedBuildFlags: candidateCompilerTarget(AVR_PROFILE).fixedBuildFlags,
  }), cryptoImpl);
}

export function validateX49BuildClaim(value) {
  if (!value || typeof value.jobId !== 'string' || !value.jobId
      || typeof value.capability !== 'string' || !value.capability
      || !HASH.test(value.inputIdentity ?? '')) reject('X49_PUBLIC_BUILD_CLAIM_INVALID');
  return clone({ jobId: value.jobId, capability: value.capability, inputIdentity: value.inputIdentity });
}

export async function acceptX49PublicArtifact({ claim, result, request, authority, manifest },
  cryptoImpl = globalThis.crypto) {
  validateX49BuildClaim(claim);
  const expectedInputIdentity = await expectedX49BuildInputIdentity(request, cryptoImpl);
  if (claim.inputIdentity !== expectedInputIdentity
      || !result || result.inputIdentity !== expectedInputIdentity
      || !HASH.test(result.artifactIdentity ?? '')
      || result.toolchainIdentitySha256 !== X49_PUBLIC_TOOLCHAIN_IDENTITY
      || result.toolchainImageId !== X49_PUBLIC_TOOLCHAIN_IMAGE
      || !IMAGE.test(result.toolchainImageId ?? '')
      || typeof result.artifact?.hex !== 'string'
      || !HASH.test(result.artifact?.hexSha256 ?? '')
      || typeof result.artifact?.elfBase64 !== 'string'
      || !HASH.test(result.artifact?.elfSha256 ?? '')) reject('X49_PUBLIC_BUILD_RESULT_INVALID');
  if (await x49Sha256(result.artifact.hex, cryptoImpl) !== result.artifact.hexSha256) {
    reject('X49_PUBLIC_HEX_HASH_INVALID');
  }
  const artifactIdentity = await x49Sha256(JSON.stringify({
    inputIdentity: result.inputIdentity,
    hexSha256: result.artifact.hexSha256,
    elfSha256: result.artifact.elfSha256,
  }), cryptoImpl);
  if (artifactIdentity !== result.artifactIdentity) reject('X49_PUBLIC_ARTIFACT_IDENTITY_INVALID');
  const symbol = await parseX49ProbeSymbol({
    elfBase64: result.artifact.elfBase64,
    elfSha256: result.artifact.elfSha256,
  }, cryptoImpl);
  const probe = validateX49RuntimeProbe({
    schema: X49_RUNTIME_PROBE_SCHEMA,
    fixtureId: X49_INSTRUMENTED_FIXTURE_ID,
    sourceSha256: X49_INSTRUMENTED_SOURCE_SHA256,
    artifactIdentity: result.artifactIdentity,
    symbol,
  });
  const provisional = {
    schema: X49_EXPERIMENT_BINDING_SCHEMA,
    profile: AVR_PROFILE,
    projectGeneration: authority.projectGeneration,
    graphIdentity: authority.graphIdentity,
    sourceSha256: X49_INSTRUMENTED_SOURCE_SHA256,
    artifactIdentity: result.artifactIdentity,
    modelImplementationSha256: manifest.implementationSha256,
    modelExecutionContextSha256: '0'.repeat(64),
    fixtureClass: X49_FIXTURE_CLASS,
    componentId: 'temperature-sensor-1',
    boardPin: 'A1',
  };
  const modelExecutionContextSha256 = await x49PrivateExecutionContext({
    manifest, probe, experimentBinding: provisional, hexSha256: result.artifact.hexSha256,
  }, cryptoImpl);
  const experimentBinding = Object.freeze({ ...provisional, modelExecutionContextSha256 });
  return Object.freeze({
    artifactIdentity: result.artifactIdentity,
    inputIdentity: result.inputIdentity,
    hex: result.artifact.hex,
    hexSha256: result.artifact.hexSha256,
    elfSha256: result.artifact.elfSha256,
    probe,
    experimentBinding,
  });
}

export function createX49PublicWorkerInit({ acceptedArtifact, manifest, caseId,
  runtimeGeneration, receiptNonce }) {
  if (!X49_CASES.some((item) => item.caseId === caseId)
      || !Number.isSafeInteger(runtimeGeneration) || runtimeGeneration < 1
      || !/^[a-f0-9]{32}$/u.test(receiptNonce ?? '')) reject('X49_PUBLIC_WORKER_INIT_INVALID');
  return {
    command: 'init',
    manifest: clone(manifest),
    hex: acceptedArtifact.hex,
    hexSha256: acceptedArtifact.hexSha256,
    probe: clone(acceptedArtifact.probe),
    caseId,
    experimentBinding: clone(acceptedArtifact.experimentBinding),
    runtimeBinding: {
      schema: MODEL_RUNTIME_BINDING_SCHEMA,
      projectGeneration: acceptedArtifact.experimentBinding.projectGeneration,
      runtimeGeneration,
      artifactIdentity: acceptedArtifact.artifactIdentity,
      modelImplementationSha256: acceptedArtifact.experimentBinding.modelImplementationSha256,
      modelExecutionContextSha256: acceptedArtifact.experimentBinding.modelExecutionContextSha256,
    },
    receiptNonce,
  };
}

export async function sealX49PublicNativeResult({ acceptedArtifact, acceptedInits, terminals },
  cryptoImpl = globalThis.crypto) {
  if (acceptedInits.length !== X49_CASES.length || terminals.length !== X49_CASES.length) {
    reject('X49_PUBLIC_CASE_COUNT_INVALID');
  }
  const observations = terminals.map((terminal, index) => x49PrivateObservation(
    acceptedInits[index], terminal,
  ));
  const report = await sealX49Report({
    schema: X49_REPORT_SCHEMA,
    contractId: X49_CONTRACT_ID,
    experimentBinding: clone(acceptedArtifact.experimentBinding),
    cases: observations,
    semanticSha256: '',
  }, cryptoImpl);
  const projection = await validateX49AcceptedNativeReport(report);
  return Object.freeze({ report, projection });
}
