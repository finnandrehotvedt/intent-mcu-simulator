// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { COMPONENT_CATALOG } from '../src/component-catalog.mjs';
import { CANDIDATE_UI_COMPONENTS } from '../src/candidate-existing-ui-adapter.mjs';
import { COMPONENT_SUPPORT_CELLS } from '../src/component-support-matrix.mjs';
import { RP2040_PICO_COMPONENT_CATALOG } from '../src/rp2040-pico-circuit.mjs';
import { ESP32C3_PUBLIC_COMPONENT_CATALOG } from '../src/esp32c3-public-circuit.mjs';
import { STM32_PUBLIC_COMPONENT_CATALOG } from '../src/stm32-public-circuit.mjs';

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
};
const sha256 = (value) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const definitions = { ...COMPONENT_CATALOG, ...CANDIDATE_UI_COMPONENTS,
  ...RP2040_PICO_COMPONENT_CATALOG, ...ESP32C3_PUBLIC_COMPONENT_CATALOG,
  ...STM32_PUBLIC_COMPONENT_CATALOG };

function semanticContract(definition) {
  return stable({
    componentVersion: definition.version,
    modelId: definition.modelRef,
    modelVersion: definition.version,
    pins: definition.pins.map((pin) => ({ id: pin.id, role: pin.role ?? 'unspecified',
      signals: [...(pin.signals ?? pin.capabilities ?? [])], constraints: { ...(pin.constraints ?? {}) } })),
    properties: Object.fromEntries(definition.propertyKeys.map((key) =>
      [key, { ...definition.propertySchema[key] }])),
    controls: [...definition.controlKeys],
    internalTerminalGroups: definition.internalTerminalGroups.map((group) =>
      ({ pin: group.pin, terminals: [...group.terminals] })),
    support: { status: definition.support.status, limitations: [...definition.support.limitations] },
  });
}

function rendererContract(definition) {
  return stable({ renderer: definition.artwork.renderer, thumbnail: definition.artwork.thumbnail ?? definition.artwork.renderer,
    viewBox: [...(definition.artwork.viewBox ?? [0, 0, definition.artwork.cssWidth ?? 1, definition.artwork.cssHeight ?? 1])],
    cssWidth: definition.artwork.cssWidth ?? null, cssHeight: definition.artwork.cssHeight ?? null });
}

const entries = COMPONENT_SUPPORT_CELLS.filter((cell) => cell.available)
  .map((cell) => {
    const definition = definitions[cell.model];
    if (!definition) throw new Error(`MODEL_LIBRARY_DEFINITION_MISSING:${cell.model}`);
    const semantic = semanticContract(definition);
    const renderer = rendererContract(definition);
    return stable({ profile: cell.profile, componentType: cell.model,
      componentVersion: definition.version, modelId: definition.modelRef,
      modelVersion: definition.version, supportStatus: cell.status,
      behaviorContractSha256: sha256(semantic), rendererContractSha256: sha256(renderer),
      semantic, renderer });
  }).sort((left, right) => `${left.profile}/${left.componentType}`.localeCompare(`${right.profile}/${right.componentType}`));

function manifest(version, implementationId) {
  const value = { schema: 'intent-mcu-model-library-manifest@1',
    libraryId: 'intent-mcu-public-models', version, implementationId, entries };
  return stable({ ...value, manifestSha256: sha256(value) });
}

const retained = manifest('1.1.0-rc.72.pre-x56', 'intent-mcu-model-resolver-retained-rc72@1');
const current = manifest('1.1.0-rc.72+x56', 'intent-mcu-model-resolver-current-x56@1');
const output = `// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
// Generated immutable snapshots. Regenerate only through an explicitly reviewed library release.

export const RETAINED_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(retained, null, 2)});
export const CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(current, null, 2)});
`;
await writeFile(new URL('../src/model-library-snapshots.mjs', import.meta.url), output);
console.log(JSON.stringify({ retained: retained.manifestSha256, current: current.manifestSha256,
  entries: entries.length }));
