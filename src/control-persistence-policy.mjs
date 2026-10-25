// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { COMPONENT_CATALOG } from './component-catalog.mjs';
import { CANDIDATE_UI_COMPONENTS } from './candidate-existing-ui-adapter.mjs';
import {
  COMPONENT_SUPPORT_CELLS,
  COMPONENT_SUPPORT_MODELS,
  COMPONENT_SUPPORT_PROFILES,
} from './component-support-matrix.mjs';
import { ESP32C3_PUBLIC_COMPONENT_CATALOG } from './esp32c3-public-circuit.mjs';
import { RP2040_PICO_COMPONENT_CATALOG } from './rp2040-pico-circuit.mjs';
import { STM32_PUBLIC_COMPONENT_CATALOG } from './stm32-public-circuit.mjs';
import { BOUNDED_3V3_UI_COMPONENTS } from './bounded-3v3-authoring-contracts.mjs';

export const CONTROL_PERSISTENCE_POLICY_SCHEMA = 'intent-mcu-control-persistence-policy@1';

const definitions = new Map([
  ...Object.values(COMPONENT_CATALOG),
  ...Object.values(CANDIDATE_UI_COMPONENTS),
  ...Object.values(RP2040_PICO_COMPONENT_CATALOG),
  ...Object.values(ESP32C3_PUBLIC_COMPONENT_CATALOG),
  ...Object.values(STM32_PUBLIC_COMPONENT_CATALOG),
  ...Object.values(BOUNDED_3V3_UI_COMPONENTS),
].map((definition) => [definition.type, definition]));

const retainedState = new Set(['sensor.light-threshold-digital-v1.outputActive']);
const noEventReplay = new Set([
  'button.momentary-v1.pressed',
  'input.rotary-encoder-quadrature-v1.detent',
]);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function controlPolicy(type, key) {
  const identity = `${type}.${key}`;
  return {
    key,
    persistence: retainedState.has(identity) ? 'validated-retained-state' : 'canonical-authored-data',
    runtimeReplay: 'never',
    eventReplay: noEventReplay.has(identity) ? 'never' : 'not-applicable',
  };
}

export const CONTROL_PERSISTENCE_POLICY = deepFreeze({
  schema: CONTROL_PERSISTENCE_POLICY_SCHEMA,
  projectData: 'validated-controls-are-canonical-authored-data',
  openAuthority: 'fresh-build-required',
  excludedAuthority: [
    'compiled-artifact', 'runtime-session', 'undo-redo-history', 'serial-output',
    'gpio-observation', 'momentary-edge', 'encoder-phase-event',
  ],
  profiles: COMPONENT_SUPPORT_PROFILES.map((profile) => ({
    profile: profile.id,
    cells: COMPONENT_SUPPORT_CELLS.filter((cell) => cell.profile === profile.id).map((cell) => {
      const definition = definitions.get(cell.model);
      if (!definition || !COMPONENT_SUPPORT_MODELS.some((model) => model.type === cell.model)) {
        throw new Error(`CONTROL_PERSISTENCE_DEFINITION_MISSING:${cell.model}`);
      }
      const controls = cell.available
        ? definition.controlKeys.map((key) => controlPolicy(cell.model, key))
        : [];
      return {
        type: cell.model,
        available: cell.available,
        policy: !cell.available ? 'unavailable' : controls.length ? 'controls-persist' : 'controls-empty',
        controls,
      };
    }),
  })),
});

export function controlPersistenceInventory() {
  return structuredClone(CONTROL_PERSISTENCE_POLICY.profiles.flatMap((profile) => profile.cells.map(
    (cell) => ({ profile: profile.profile, ...cell }),
  )));
}

export function controlPersistenceSummary() {
  const inventory = controlPersistenceInventory();
  const available = inventory.filter((cell) => cell.available);
  return {
    profiles: CONTROL_PERSISTENCE_POLICY.profiles.length,
    cells: inventory.length,
    available: available.length,
    unavailable: inventory.length - available.length,
    controlBearing: available.filter((cell) => cell.controls.length > 0).length,
    controlsEmpty: available.filter((cell) => cell.controls.length === 0).length,
    controls: available.reduce((count, cell) => count + cell.controls.length, 0),
  };
}
