// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { parseStrictJson } from '../src/strict-json.mjs';

const HASH = /^[0-9a-f]{64}$/u;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/u;

export function normalizeCompilerImageLock(lock) {
  const runtimeImageIds = lock?.runtimeImageIds ?? [];
  if (!lock || lock.schema !== 'teach-lab-compiler-image-lock@1'
      || !IMAGE_ID.test(lock.imageId) || !Array.isArray(runtimeImageIds) || runtimeImageIds.length > 4
      || runtimeImageIds.some((value) => !IMAGE_ID.test(value))
      || new Set([lock.imageId, ...runtimeImageIds]).size !== runtimeImageIds.length + 1
      || !HASH.test(lock.toolchainManifestSha256) || typeof lock.image !== 'string' || !lock.image) {
    throw Object.assign(new Error('INVALID_IMAGE_LOCK'), { code: 'INVALID_IMAGE_LOCK' });
  }
  return Object.freeze({ ...lock, runtimeImageIds: Object.freeze([...runtimeImageIds]) });
}

export function parseCompilerImageLock(source) {
  return normalizeCompilerImageLock(parseStrictJson(source, 32 * 1024));
}
