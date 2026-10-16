// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import {
  CONTROLLER_ADAPTER_PROFILES,
  EXECUTABLE_ARTIFACT_SCHEMA,
} from './controller-adapter-contract-v1.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/u;

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function createExecutableArtifactDescriptor({
  profile, inputIdentitySha256, toolchainImageId, executable, debug,
}) {
  const selected = CONTROLLER_ADAPTER_PROFILES.find((item) => item.profile === profile);
  if (!selected || selected.status !== 'simulated') throw new Error('ADAPTER_PROFILE_UNSUPPORTED');
  if (!Buffer.isBuffer(executable) || !Buffer.isBuffer(debug)) throw new Error('ADAPTER_ARTIFACT_INVALID');
  const identity = {
    schema: EXECUTABLE_ARTIFACT_SCHEMA,
    profile,
    architecture: selected.mcu.architecture,
    mcuVariant: selected.mcu.variant,
    inputIdentitySha256,
    toolchainImageId,
    executable: { format: 'intel-hex', sha256: sha256(executable), bytes: executable.length },
    debug: { format: 'elf', sha256: sha256(debug), bytes: debug.length },
  };
  const descriptor = { ...identity, artifactIdentitySha256: sha256(JSON.stringify(identity)) };
  if (!validateExecutableArtifactDescriptor(descriptor)) throw new Error('ADAPTER_ARTIFACT_INVALID');
  return deepFreeze(descriptor);
}

export function validateExecutableArtifactDescriptor(value) {
  const selected = CONTROLLER_ADAPTER_PROFILES.find((item) => item.profile === value?.profile);
  const identity = value ? {
    schema: value.schema,
    profile: value.profile,
    architecture: value.architecture,
    mcuVariant: value.mcuVariant,
    inputIdentitySha256: value.inputIdentitySha256,
    toolchainImageId: value.toolchainImageId,
    executable: value.executable,
    debug: value.debug,
  } : null;
  return Boolean(exactKeys(value, [
    'schema', 'profile', 'architecture', 'mcuVariant', 'inputIdentitySha256',
    'toolchainImageId', 'artifactIdentitySha256', 'executable', 'debug',
  ]) && value.schema === EXECUTABLE_ARTIFACT_SCHEMA && selected?.status === 'simulated'
    && value.architecture === selected.mcu.architecture && value.mcuVariant === selected.mcu.variant
    && SHA256.test(value.inputIdentitySha256) && IMAGE_ID.test(value.toolchainImageId)
    && SHA256.test(value.artifactIdentitySha256)
    && exactKeys(value.executable, ['format', 'sha256', 'bytes'])
    && value.executable.format === 'intel-hex' && SHA256.test(value.executable.sha256)
    && Number.isInteger(value.executable.bytes) && value.executable.bytes > 0
    && exactKeys(value.debug, ['format', 'sha256', 'bytes'])
    && value.debug.format === 'elf' && SHA256.test(value.debug.sha256)
    && Number.isInteger(value.debug.bytes) && value.debug.bytes > 0
    && value.artifactIdentitySha256 === sha256(JSON.stringify(identity)));
}
