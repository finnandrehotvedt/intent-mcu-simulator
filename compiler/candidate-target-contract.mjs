// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import {
  CANDIDATE_BUILD_REQUEST_SCHEMA,
  ESP32C3_PROFILE,
  ESP32C3_RUNTIME_REJECT_CODE,
  UNAVAILABLE_TARGET_REJECT_CODE,
  candidateCompilerTarget,
} from '../src/compile-targets.mjs';
export {
  AVR_PROFILE,
  CANDIDATE_BUILD_REQUEST_SCHEMA,
  CANDIDATE_COMPILER_TARGETS,
  ESP32C3_FQBN,
  ESP32C3_PROFILE,
  ESP32C3_RUNTIME_REJECT_CODE,
  ESP32C3_TOOLCHAIN_IDENTITY,
  RP2040_PROFILE,
  STM32F429ZI_PROFILE,
  TARGET_AVAILABILITY_REVISION,
  TARGET_AVAILABILITY_SCHEMA,
  UNAVAILABLE_TARGET_REJECT_CODE,
  candidateCompilerTarget,
  firstMissingTargetPrerequisite,
  targetAvailabilitySnapshot,
  validateTargetAvailabilitySnapshot,
} from '../src/compile-targets.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

export function validateCandidateTarget(value) {
  if (!exactKeys(value, ['profile', 'fqbn', 'toolchainIdentitySha256'])) return null;
  const target = candidateCompilerTarget(value.profile);
  if (!target || !target.compileAvailable || target.requestSchema !== CANDIDATE_BUILD_REQUEST_SCHEMA
    || value.fqbn !== target.fqbn
    || value.toolchainIdentitySha256 !== target.toolchainIdentitySha256) return null;
  return target;
}

export function validateUnavailableCandidateTarget(value) {
  if (!exactKeys(value, ['profile', 'fqbn', 'toolchainIdentitySha256'])) return null;
  const target = candidateCompilerTarget(value.profile);
  if (!target || target.compileAvailable
    || value.fqbn !== target.fqbn
    || value.toolchainIdentitySha256 !== target.toolchainIdentitySha256) return null;
  return target;
}

export function unavailableTargetError(target) {
  const missing = target?.availability?.installedCompiler;
  return Object.freeze({
    code: UNAVAILABLE_TARGET_REJECT_CODE,
    detail: missing?.detail ?? 'The selected compiler target is unavailable.',
  });
}

export function candidateArtifactIdentity({ inputIdentity, target, artifact }) {
  return createHash('sha256').update(JSON.stringify({
    inputIdentity,
    profile: target.profile,
    fqbn: target.fqbn,
    toolchainIdentitySha256: target.toolchainIdentitySha256,
    artifact,
  })).digest('hex');
}

function validArtifactFile(value, format) {
  return exactKeys(value, ['format', 'sha256', 'bytes'])
    && value.format === format && SHA256.test(value.sha256)
    && Number.isSafeInteger(value.bytes) && value.bytes > 0;
}

export function validateCandidateCompileArtifact(value, targetProfile = ESP32C3_PROFILE) {
  const target = candidateCompilerTarget(targetProfile);
  return Boolean(target?.compileOnly
    && exactKeys(value, [
      'schema', 'profile', 'fqbn', 'toolchainIdentitySha256', 'runtimeStatus',
      'runtimeRejectCode', 'files',
    ])
    && value.schema === 'intent-mcu-compile-artifact-manifest@1'
    && value.profile === target.profile
    && value.fqbn === target.fqbn
    && value.toolchainIdentitySha256 === target.toolchainIdentitySha256
    && value.runtimeStatus === 'unsupported'
    && value.runtimeRejectCode === ESP32C3_RUNTIME_REJECT_CODE
    && exactKeys(value.files, ['firmware', 'debug', 'mergedFlash'])
    && validArtifactFile(value.files.firmware, 'flash-image')
    && validArtifactFile(value.files.debug, 'elf')
    && validArtifactFile(value.files.mergedFlash, 'merged-flash-image')
    && !JSON.stringify(value).includes('base64')
    && !Object.hasOwn(value, 'source'));
}
