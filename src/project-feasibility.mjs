// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { controllerCapability, PERIPHERAL_KEYS } from './controller-capabilities.mjs';
import { COMPONENT_SUPPORT_MODELS, componentSupportCell } from './component-support-matrix.mjs';

export const PROJECT_FEASIBILITY_SCHEMA = 'intent-mcu-project-feasibility@1';
export const FEASIBILITY_STATES = Object.freeze(['available', 'unsupported', 'unknown', 'unresolved']);

const knownComponents = new Set(COMPONENT_SUPPORT_MODELS.map((model) => model.type));

export function evaluateProjectFeasibility(profile, requiredCapabilities = []) {
  const controller = controllerCapability(profile);
  const items = requiredCapabilities.map((need) => {
    const base = { id: need.id, kind: need.kind, target: need.target,
      requirementIds: [...need.requirementIds] };
    if (need.target === '?') return { ...base, state: 'unresolved', authorityStatus: null,
      reason: 'The required target is unresolved. Name one exact peripheral or component before relying on support.' };
    if (need.kind === 'peripheral') {
      if (!controller || !PERIPHERAL_KEYS.includes(need.target)) return { ...base, state: 'unknown', authorityStatus: null,
        reason: `No project-owned peripheral capability named ${need.target} exists for this preflight.` };
      const authority = controller.peripherals[need.target];
      return authority.status === 'unavailable'
        ? { ...base, state: 'unsupported', authorityStatus: authority.status, reason: authority.boundary }
        : { ...base, state: 'available', authorityStatus: authority.status, reason: authority.boundary };
    }
    if (!knownComponents.has(need.target)) return { ...base, state: 'unknown', authorityStatus: null,
      reason: `No project-owned component model named ${need.target} exists for this preflight.` };
    const authority = componentSupportCell(profile, need.target);
    return authority?.available
      ? { ...base, state: 'available', authorityStatus: authority.status,
        reason: `${authority.projectMode}. ${authority.limitations.join(' ')}` }
      : { ...base, state: 'unsupported', authorityStatus: authority?.status ?? 'unavailable',
        reason: authority?.limitations.join(' ') ?? 'This component is unavailable for the selected profile.' };
  });
  const counts = Object.fromEntries(FEASIBILITY_STATES.map((state) =>
    [state, items.filter((item) => item.state === state).length]));
  return { schema: PROJECT_FEASIBILITY_SCHEMA, profile, evaluated: false, buildAuthority: false,
    items, counts, ready: items.length > 0 && items.every((item) => item.state === 'available') };
}
