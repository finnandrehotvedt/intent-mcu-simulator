// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { parseStrictJson } from '../src/strict-json.mjs';
import {
  VISUINO_PRIVATE_MOUNT_PATH,
  VISUINO_WATER_TANK_INTAKE_SOURCE_SHA256,
  VISUINO_WATER_TANK_MANIFEST_SHA256,
  VISUINO_WATER_TANK_POLICY_ID,
  VISUINO_WATER_TANK_SOURCE_CONTENT_SHA256,
} from './visuino-private-policy.mjs';

const HASH = /^[0-9a-f]{64}$/u;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/u;
const PRIVATE_SOURCE_PATH = /^\/srv\/(?:codex-workspaces\/(?:intentforce-station|rust-station)\/handoffs|intent-mcu-progress-preview\/private-dependencies)\/[A-Za-z0-9][A-Za-z0-9._-]{0,159}\/private-dependencies$/u;
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

function invalid() {
  throw Object.assign(new Error('INVALID_IMAGE_LOCK'), { code: 'INVALID_IMAGE_LOCK' });
}

function normalizePrivateDependency(value) {
  if (value === undefined) return null;
  if (!exactKeys(value, [
    'schema', 'policyId', 'sourcePath', 'mountPath', 'manifestSha256',
    'intakeSourceSha256', 'sourceContentSha256', 'readOnly',
  ]) || value.schema !== 'intent-private-dependency-mount@1'
      || value.policyId !== VISUINO_WATER_TANK_POLICY_ID
      || typeof value.sourcePath !== 'string' || !PRIVATE_SOURCE_PATH.test(value.sourcePath)
      || value.mountPath !== VISUINO_PRIVATE_MOUNT_PATH
      || value.manifestSha256 !== VISUINO_WATER_TANK_MANIFEST_SHA256
      || value.intakeSourceSha256 !== VISUINO_WATER_TANK_INTAKE_SOURCE_SHA256
      || value.sourceContentSha256 !== VISUINO_WATER_TANK_SOURCE_CONTENT_SHA256
      || value.readOnly !== true) invalid();
  return Object.freeze({ ...value });
}

export function normalizeCompilerImageLock(lock) {
  const runtimeImageIds = lock?.runtimeImageIds ?? [];
  if (!lock || lock.schema !== 'teach-lab-compiler-image-lock@1'
      || !IMAGE_ID.test(lock.imageId) || !Array.isArray(runtimeImageIds) || runtimeImageIds.length > 4
      || runtimeImageIds.some((value) => !IMAGE_ID.test(value))
      || new Set([lock.imageId, ...runtimeImageIds]).size !== runtimeImageIds.length + 1
      || !HASH.test(lock.toolchainManifestSha256) || typeof lock.image !== 'string' || !lock.image) {
    invalid();
  }
  const privateDependency = normalizePrivateDependency(lock.privateDependency);
  return Object.freeze({
    ...lock,
    runtimeImageIds: Object.freeze([...runtimeImageIds]),
    ...(privateDependency ? { privateDependency } : {}),
  });
}

export function parseCompilerImageLock(source) {
  return normalizeCompilerImageLock(parseStrictJson(source, 32 * 1024));
}
