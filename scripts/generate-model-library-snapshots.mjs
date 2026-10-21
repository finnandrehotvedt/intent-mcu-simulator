// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { COMPONENT_CATALOG } from '../src/component-catalog.mjs';
import { CANDIDATE_UI_COMPONENTS } from '../src/candidate-existing-ui-adapter.mjs';
import { COMPONENT_SUPPORT_CELLS } from '../src/component-support-matrix.mjs';
import { RP2040_PICO_COMPONENT_CATALOG } from '../src/rp2040-pico-circuit.mjs';
import { ESP32C3_PUBLIC_COMPONENT_CATALOG } from '../src/esp32c3-public-circuit.mjs';
import { STM32_PUBLIC_COMPONENT_CATALOG } from '../src/stm32-public-circuit.mjs';
import { controlContractsFor } from '../src/model-control-contracts.mjs';
import * as existingSnapshots from '../src/model-library-snapshots.mjs';

const { RETAINED_MODEL_LIBRARY_MANIFEST } = existingSnapshots;
const PRE_X43_HEAP_WORKER_PACKAGE_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X43_HEAP_WORKER_PACKAGE_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X43_HEAP_PROVENANCE_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X43_HEAP_PROVENANCE_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X43_HEAP_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X43_HEAP_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X43_STACK_HOTPATH_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X43_STACK_HOTPATH_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X43_STACK_CURRENT_MODEL_LIBRARY_MANIFEST = existingSnapshots.PRE_X43_STACK_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRIOR_CURRENT_MODEL_LIBRARY_MANIFEST = existingSnapshots.PRIOR_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X47_CURRENT_MODEL_LIBRARY_MANIFEST = existingSnapshots.PRE_X47_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X47_UI_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X47_UI_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X55_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X55_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_UX_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_UX_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;

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
    controls: controlContractsFor(definition.type, definition.controlKeys),
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
      semanticSha256: sha256(semantic), rendererContractSha256: sha256(renderer),
      semantic, renderer });
  }).sort((left, right) => `${left.profile}/${left.componentType}`.localeCompare(`${right.profile}/${right.componentType}`));

const CURRENT_CLOSURE = Object.freeze([
  '../src/component-catalog.mjs', '../src/circuit-engine.mjs', '../src/runtime-kernel.mjs',
  '../src/atmega328p-adapter.mjs', '../src/x43-avr-stack-profile.mjs',
  '../src/x43-avr-heap-profile.mjs',
  '../compiler/avr-allocator-provenance.mjs', '../compiler/build-coordinator.mjs',
  '../compiler/build-worker.mjs', '../compiler/build-protocol.mjs', '../Dockerfile.toolchain',
  '../src/x47-runtime-transaction.mjs',
  '../src/x47-ui-integration.mjs', '../src/strict-json.mjs',
  '../src/component-appearance.mjs', '../src/project-v2.mjs', '../src/project-editor.mjs',
  '../src/lifecycle.mjs', '../staging/component-artwork.mjs',
  '../src/model-library.mjs', '../src/model-bundle-registry.mjs', '../src/project-envelope.mjs',
  '../src/model-control-contracts.mjs', '../src/simulator.worker.mjs', '../staging/main.mjs',
  '../src/rp2040-snapshot-pacer.mjs', '../src/rp2040-experimental-runtime.mjs',
  '../src/runtime-identity.mjs',
  '../src/candidate-project-session.mjs', '../src/candidate-spdt-runtime.mjs',
  '../src/candidate-existing-ui-adapter.mjs', '../src/rp2040-pico-circuit.mjs',
  '../src/esp32c3-public-circuit.mjs', '../src/stm32-public-circuit.mjs',
  '../src/rp2040-public-workbench.mjs', '../src/esp32c3-public-workbench.mjs',
  '../src/stm32-public-workbench.mjs',
  '../expansion-drafts/controller-runtime-bridge-v1.mjs',
  '../expansion-drafts/rp2040-runtime-bridge-adapter-v1.mjs',
  '../expansion-drafts/rp2040-conformance-fixtures-v1.mjs',
  '../expansion-drafts/rp2040-firmware-artifact-v1.mjs',
  '../expansion-drafts/project-v3-contact-persistence.mjs',
  '../expansion-drafts/ground-reference-integration-v1.mjs',
  '../expansion-drafts/toggle-switch-integration-v1.mjs',
  '../expansion-drafts/switch-contact-graph-v1.mjs',
  '../expansion-drafts/ideal-three-pin-analogue-module-v1.mjs',
  '../expansion-drafts/light-analogue-sensor-v1.mjs',
  '../expansion-drafts/temperature-analogue-sensor-v1.mjs',
  '../expansion-drafts/digital-light-threshold-module-v1.mjs',
  '../expansion-drafts/common-cathode-rgb-led-v1.mjs',
  '../expansion-drafts/active-buzzer-module-v1.mjs',
  '../expansion-drafts/seven-segment-common-cathode-v1.mjs',
  '../expansion-drafts/character-lcd-16x2-4bit-v1.mjs',
  '../expansion-drafts/rotary-encoder-quadrature-v1.mjs',
]);

async function implementationClosure(paths) {
  const members = [];
  for (const path of paths) {
    const bytes = await readFile(new URL(path, import.meta.url));
    members.push({ path: path.replace(/^\.\.\//u, ''), sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  return stable({ members, sha256: sha256(members) });
}

function manifest(version, implementationId, implementation, lineage = null) {
  const ownedEntries = entries.map((entry) => {
    const pipelineId = entry.profile === 'board.atmega328p-16mhz-v1'
      ? (entry.componentType.startsWith('board.') || ['resistor.fixed-v1', 'led.basic-v1',
        'button.momentary-v1', 'potentiometer.linear-v1'].includes(entry.componentType)
        ? 'avr-base-circuit-runtime-v1' : 'avr-candidate-reconstruction-ordered-v1')
      : `${entry.profile}-validation-observation-v1`;
    const observerId = entry.componentType.startsWith('output.')
      ? `${entry.componentType}-observer-v1` : `${entry.componentType}-state-v1`;
    const owner = { implementationId, pipelineId, observerId };
    return stable({ ...entry, owner,
      behaviorContractSha256: sha256({ semanticSha256: entry.semanticSha256, owner }) });
  });
  const value = { schema: 'intent-mcu-model-library-manifest@2',
    libraryId: 'intent-mcu-public-models', version, implementationId,
    implementationSha256: implementation.sha256, implementationMembers: implementation.members,
    ...(lineage ? { lineage: stable(lineage) } : {}),
    runtimeContracts: ['avr8js@0.21.1', 'rp2040js@1.4.0', 'esp32c3-qemu@project-pinned',
      'renode@1.17.0'], entries: ownedEntries };
  return stable({ ...value, manifestSha256: sha256(value) });
}

const retainedSourceClosure = JSON.parse(await readFile(new URL(
  '../src/model-bundles/retained-rc72/source/closure.json', import.meta.url), 'utf8'));
const retainedImplementation = await implementationClosure([
  '../src/model-library-retained-resolver.mjs',
  '../src/model-bundles/retained-rc72/source/closure.json',
  ...retainedSourceClosure.members.map((member) =>
    `../src/model-bundles/retained-rc72/source/${member.path}`),
]);
const currentImplementation = await implementationClosure([...CURRENT_CLOSURE,
  '../src/model-library-current-resolver.mjs']);
const retained = process.argv.includes('--refresh-retained')
  ? manifest('2.0.0-rc.72-retained', 'intent-mcu-model-bundle-retained-rc72@2', retainedImplementation)
  : RETAINED_MODEL_LIBRARY_MANIFEST;
const current = manifest(
  '2.0.0-x43-heap-worker-package-fix.1-current',
  'intent-mcu-model-bundle-current-x43-heap-worker-package-fix-1@15',
  currentImplementation,
  {
    priorVersion: PRE_X43_HEAP_WORKER_PACKAGE_CURRENT_MODEL_LIBRARY_MANIFEST.version,
    priorManifestSha256: PRE_X43_HEAP_WORKER_PACKAGE_CURRENT_MODEL_LIBRARY_MANIFEST.manifestSha256,
    compatibility: 'explicit-data-only-migration; runtime-and-verdict-authority-cleared',
    semanticDisposition: 'component, electrical, runtime and allocator-provenance semantics are unchanged; only the existing worker import closure is packaged',
    presentationDisposition: 'no UI change; the pinned private worker can start and validate jobs with its complete static module graph',
    baselineClosureDisposition: 'accepted public rc.98 identity remains immutable and migration-only',
  },
);
const output = `// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
// Generated immutable snapshots. Regenerate only through an explicitly reviewed library release.

export const RETAINED_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(retained, null, 2)});
export const PRE_X43_HEAP_WORKER_PACKAGE_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X43_HEAP_WORKER_PACKAGE_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X43_HEAP_PROVENANCE_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X43_HEAP_PROVENANCE_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X43_HEAP_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X43_HEAP_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X43_STACK_HOTPATH_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X43_STACK_HOTPATH_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X43_STACK_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X43_STACK_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRIOR_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRIOR_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X47_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X47_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X47_UI_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X47_UI_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X55_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X55_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_UX_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_UX_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(current, null, 2)});
`;
await writeFile(new URL('../src/model-library-snapshots.mjs', import.meta.url), output);
console.log(JSON.stringify({ retained: retained.manifestSha256, current: current.manifestSha256,
  entries: entries.length }));
