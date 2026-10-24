// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const ACTIVE_OUTPUT_ROLES = new Set(['power-out', 'digital-out', 'analogue-out']);

export function pinTargetGuidance(sourceRole, targetRole) {
  if (sourceRole === targetRole && ACTIVE_OUTPUT_ROLES.has(sourceRole)) return 'blocked';
  if (sourceRole === 'ground' && targetRole === 'ground') return 'recommended';
  if (new Set([sourceRole, targetRole]).size === 2
    && [sourceRole, targetRole].includes('power-out')
    && [sourceRole, targetRole].includes('power-in')) return 'recommended';
  return 'possible';
}
