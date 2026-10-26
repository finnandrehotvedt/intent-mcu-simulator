// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const PUBLIC_ERROR = /^(?:API|PROJECT_CONTACT|MODEL_LIBRARY|EDITOR|COMPONENT_PROPERTY|RP2040|C3|STM32)_[A-Z0-9_]+$/u;

export function publicSessionErrorCode(error) {
  return typeof error?.message === 'string' && PUBLIC_ERROR.test(error.message)
    ? error.message : 'API_SESSION_FAILED';
}

export function validateDiscoveredPlan(candidate, components, catalog) {
  const typeById = new Map(components.components.map((item) => [item.id, item.type]));
  for (const command of candidate.commands) if (command?.command === 'component.add') {
    typeById.set(command.id, command.type);
  }
  for (const command of candidate.commands) if (command?.command === 'component.duplicate') {
    const sourceType = typeById.get(command.component_id);
    if (!sourceType) throw new Error('API_PLAN_COMPONENT_UNKNOWN');
    typeById.set(command.id, sourceType);
  }
  for (const command of candidate.commands) {
    if (command?.command === 'component.property.set') {
      const type = typeById.get(command.component_id);
      if (!type) throw new Error('API_PLAN_COMPONENT_UNKNOWN');
      const definition = catalog.components[type];
      if (!definition?.propertyKeys?.includes(command.key)) throw new Error('API_PLAN_PROPERTY_UNKNOWN');
    }
    const endpoints = command?.command === 'wire.connect' ? [command.from, command.to]
      : ['wire.branch.connect', 'wire.disconnect'].includes(command?.command) && command.endpoint
        ? [command.endpoint] : [];
    for (const endpointValue of endpoints) {
      const type = typeById.get(endpointValue?.component); const pins = catalog.components[type]?.pins;
      if (!type || !pins?.some((pin) => pin.id === endpointValue?.pin)) {
        throw new Error('API_PLAN_NAMED_PIN_UNKNOWN');
      }
    }
  }
}
