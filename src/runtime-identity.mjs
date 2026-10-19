// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';

export const RUNTIME_BINDING_SCHEMA = 'intent-mcu-runtime-binding@1';
export const WORKER_RUNTIME_IDENTITY_SCHEMA = 'intent-mcu-worker-runtime-identity@1';
export const MODEL_RUNTIME_BINDING_SCHEMA = 'intent-mcu-runtime-binding@2';
export const MODEL_WORKER_RUNTIME_IDENTITY_SCHEMA = 'intent-mcu-worker-runtime-identity@2';
const HASH = /^[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
const clone = (value) => structuredClone(value);
function reject(code) { throw Object.assign(new Error(code), { code }); }

export function runtimeInitBinding(value) {
  const modelBound = value?.schema === MODEL_RUNTIME_BINDING_SCHEMA;
  const keys = modelBound
    ? ['schema', 'projectGeneration', 'runtimeGeneration', 'artifactIdentity',
      'modelImplementationSha256', 'modelExecutionContextSha256']
    : ['schema', 'projectGeneration', 'runtimeGeneration', 'artifactIdentity'];
  if (!exactKeys(value, keys)
      || ![RUNTIME_BINDING_SCHEMA, MODEL_RUNTIME_BINDING_SCHEMA].includes(value.schema)
      || !Number.isSafeInteger(value.projectGeneration) || value.projectGeneration < 1
      || !Number.isSafeInteger(value.runtimeGeneration) || value.runtimeGeneration < 1
      || !HASH.test(value.artifactIdentity)
      || (modelBound && (!HASH.test(value.modelImplementationSha256)
        || !HASH.test(value.modelExecutionContextSha256)))) reject('RUNTIME_BINDING_INVALID');
  return clone(value);
}

export function createWorkerRuntimeIdentity(value, workerInitialization, cryptoImpl = crypto) {
  const binding = runtimeInitBinding(value);
  if (!Number.isSafeInteger(workerInitialization) || workerInitialization < 1
      || typeof cryptoImpl?.getRandomValues !== 'function') reject('RUNTIME_WORKER_IDENTITY_INVALID');
  const nonceBytes = new Uint8Array(16);
  cryptoImpl.getRandomValues(nonceBytes);
  const workerInstanceNonce = [...nonceBytes]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return Object.freeze({
    schema: binding.schema === MODEL_RUNTIME_BINDING_SCHEMA
      ? MODEL_WORKER_RUNTIME_IDENTITY_SCHEMA : WORKER_RUNTIME_IDENTITY_SCHEMA,
    projectGeneration: binding.projectGeneration,
    runtimeGeneration: binding.runtimeGeneration,
    artifactIdentity: binding.artifactIdentity,
    ...(binding.schema === MODEL_RUNTIME_BINDING_SCHEMA ? {
      modelImplementationSha256: binding.modelImplementationSha256,
      modelExecutionContextSha256: binding.modelExecutionContextSha256,
    } : {}),
    workerInitialization,
    workerInstanceNonce,
  });
}

export function validateWorkerRuntimeIdentity(value, binding, expectedNonce = null) {
  const accepted = runtimeInitBinding(binding);
  const modelBound = accepted.schema === MODEL_RUNTIME_BINDING_SCHEMA;
  const keys = modelBound
    ? ['schema', 'projectGeneration', 'runtimeGeneration', 'artifactIdentity',
      'modelImplementationSha256', 'modelExecutionContextSha256', 'workerInitialization', 'workerInstanceNonce']
    : ['schema', 'projectGeneration', 'runtimeGeneration', 'artifactIdentity',
      'workerInitialization', 'workerInstanceNonce'];
  if (!exactKeys(value, keys)
      || value.schema !== (modelBound ? MODEL_WORKER_RUNTIME_IDENTITY_SCHEMA : WORKER_RUNTIME_IDENTITY_SCHEMA)
      || value.projectGeneration !== accepted.projectGeneration
      || value.runtimeGeneration !== accepted.runtimeGeneration
      || value.artifactIdentity !== accepted.artifactIdentity
      || (modelBound && (value.modelImplementationSha256 !== accepted.modelImplementationSha256
        || value.modelExecutionContextSha256 !== accepted.modelExecutionContextSha256))
      || !Number.isSafeInteger(value.workerInitialization) || value.workerInitialization < 1
      || !NONCE.test(value.workerInstanceNonce)
      || (expectedNonce !== null && value.workerInstanceNonce !== expectedNonce)) {
    reject('RUNTIME_WORKER_IDENTITY_STALE');
  }
  return clone(value);
}
