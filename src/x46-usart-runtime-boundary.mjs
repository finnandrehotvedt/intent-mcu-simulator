// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { validateX46UsartConfigurationSource } from './x46-usart-configuration-producer.mjs';
import { validateX46UsartRxSnapshotCompatibility } from './x46-usart-rx-contract.mjs';

const SNAPSHOT_KINDS = new Set(['ready', 'status', 'paused', 'reset', 'step']);

function reject(code) {
  throw Object.assign(new Error(code), { code });
}

export function acceptX46UsartRuntimeSnapshot(message, { currentModel = false } = {}) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    reject('X46_USART_RUNTIME_MESSAGE_INVALID');
  }
  const snapshotKind = SNAPSHOT_KINDS.has(message.kind);
  if (!snapshotKind) return structuredClone(message);
  if (message.usartConfiguration === undefined) {
    if (currentModel) reject('X46_USART_RUNTIME_SOURCE_MISSING');
    return structuredClone(message);
  }
  if (!message.runtimeIdentity) reject('X46_USART_RUNTIME_IDENTITY_MISSING');
  const source = validateX46UsartConfigurationSource(message.usartConfiguration, {
    runtimeIdentity: message.runtimeIdentity,
    resetEpoch: message.usartConfiguration.resetEpoch,
  }, { requireRecords: false });
  if (currentModel && message.serial !== undefined) {
    validateX46UsartRxSnapshotCompatibility({ ...message, usartConfiguration: source });
  }
  return structuredClone({ ...message, usartConfiguration: source });
}
