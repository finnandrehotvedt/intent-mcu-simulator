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
const PRE_CMP020_MANUAL_MIXED_REPAIR_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_CMP020_MANUAL_MIXED_REPAIR_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_CMP020_PUBLIC_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_CMP020_PUBLIC_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_CMP003_PUBLIC_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_CMP003_PUBLIC_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_CMP041_PUBLIC_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_CMP041_PUBLIC_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_CMP043_PUBLIC_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_CMP043_PUBLIC_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_CMP092_DHT11_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_CMP092_DHT11_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_CMP091_DS18B20_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_CMP091_DS18B20_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_DHT11_PUBLIC_VISIBILITY_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_DHT11_PUBLIC_VISIBILITY_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_THUMBNAIL_ARTWORK_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_THUMBNAIL_ARTWORK_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_LCD_END_TO_END_CURRENT_MODEL_LIBRARY_MANIFEST = JSON.parse(await readFile(new URL(
  '../src/model-bundles/pre-lcd-current-manifest.json', import.meta.url), 'utf8'));
const PRE_LCD_API_DUPLICATE_FIX_CURRENT_MODEL_LIBRARY_MANIFEST = JSON.parse(await readFile(new URL(
  '../src/model-bundles/pre-lcd-api-duplicate-fix-current-manifest.json', import.meta.url), 'utf8'));
const PRE_LCD_PERSISTENCE_FIX_CURRENT_MODEL_LIBRARY_MANIFEST = JSON.parse(await readFile(new URL(
  '../src/model-bundles/pre-lcd-persistence-fix-current-manifest.json', import.meta.url), 'utf8'));
const PRE_PRESERVED_DRAFT_EXPORT_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_PRESERVED_DRAFT_EXPORT_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_COMPONENT_IMAGE_PARITY_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_COMPONENT_IMAGE_PARITY_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;

const { RETAINED_MODEL_LIBRARY_MANIFEST } = existingSnapshots;
const PRE_RETAINED_BUILD_GUARD_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_RETAINED_BUILD_GUARD_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_RUNTIME_CONTROLS_SERIAL_UI_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_RUNTIME_CONTROLS_SERIAL_UI_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_PWM_LED_SHORT_ROUTING_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_PWM_LED_SHORT_ROUTING_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X46_USART_CONFIG_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X46_USART_CONFIG_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X46_USART_RX_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X46_USART_RX_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_RUNTIME_READY_DEADLINE_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_RUNTIME_READY_DEADLINE_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X92_STM32_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X92_STM32_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const RC111_CURRENT_MODEL_LIBRARY_MANIFEST = JSON.parse(await readFile(new URL(
  '../src/model-bundles/rc111-current-manifest.json', import.meta.url), 'utf8'));
const RC112_CURRENT_MODEL_LIBRARY_MANIFEST = JSON.parse(await readFile(new URL(
  '../src/model-bundles/rc112-current-manifest.json', import.meta.url), 'utf8'));
const RC113_CURRENT_MODEL_LIBRARY_MANIFEST = JSON.parse(await readFile(new URL(
  '../src/model-bundles/rc113-current-manifest.json', import.meta.url), 'utf8'));
const RC120_CURRENT_MODEL_LIBRARY_MANIFEST = JSON.parse(await readFile(new URL(
  '../src/model-bundles/rc120-current-manifest.json', import.meta.url), 'utf8'));
const RC124_CURRENT_MODEL_LIBRARY_MANIFEST = JSON.parse(await readFile(new URL(
  '../src/model-bundles/rc124-current-manifest.json', import.meta.url), 'utf8'));
const RC128_CURRENT_MODEL_LIBRARY_MANIFEST = JSON.parse(await readFile(new URL(
  '../src/model-bundles/rc128-current-manifest.json', import.meta.url), 'utf8'));
const PRE_TEACHING_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_TEACHING_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X66_NET_LABELS_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X66_NET_LABELS_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X66_LEGACY_OPEN_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X66_LEGACY_OPEN_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X66_BOUNDED_SUBCIRCUITS_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X66_BOUNDED_SUBCIRCUITS_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X66_SUBCIRCUIT_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X66_SUBCIRCUIT_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X66_PUBLIC_THERMOSTAT_CREATE_FIX_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X66_PUBLIC_THERMOSTAT_CREATE_FIX_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_TEACHING_BATCH_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_TEACHING_BATCH_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X92_DISPATCH_GATE_FIX_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X92_DISPATCH_GATE_FIX_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X92_RUNTIME_LIFETIME_FIX_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X92_RUNTIME_LIFETIME_FIX_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X92_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X92_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X92_BUDGET_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X92_BUDGET_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X47_REPEATABLE_REJECTION_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X47_REPEATABLE_REJECTION_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X47_MOMENTARY_CONTROL_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X47_MOMENTARY_CONTROL_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X47_REPEATABLE_APPLY_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X47_REPEATABLE_APPLY_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X47_REPAUSE_STATE_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X47_REPAUSE_STATE_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X55_ALL_PROFILE_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X55_ALL_PROFILE_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X55_LED_OUTLINE_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X55_LED_OUTLINE_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X55_BODY_EDITOR_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X55_BODY_EDITOR_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X55_BODY_LEAD_FIX_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X55_BODY_LEAD_FIX_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X55_NOOP_APPLY_FIX_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X55_NOOP_APPLY_FIX_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X55_SPLIT_EDITOR_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X55_SPLIT_EDITOR_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X55_MODEL_COPY_FIX_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X55_MODEL_COPY_FIX_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X47_REPEATABLE_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X47_REPEATABLE_CURRENT_MODEL_LIBRARY_MANIFEST
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
const PRE_X48_AUTHORITY_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X48_AUTHORITY_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.CURRENT_MODEL_LIBRARY_MANIFEST;
const PRE_X48_CURRENT_MODEL_LIBRARY_MANIFEST =
  existingSnapshots.PRE_X48_CURRENT_MODEL_LIBRARY_MANIFEST
  ?? existingSnapshots.PRE_X66_PUBLIC_THERMOSTAT_CREATE_FIX_CURRENT_MODEL_LIBRARY_MANIFEST
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
  '../src/canvas-annotations.mjs', '../src/bounded-subcircuits.mjs',
  '../src/atmega328p-adapter.mjs', '../src/x43-avr-stack-profile.mjs',
  '../src/x46-usart-configuration-producer.mjs',
  '../src/x46-usart-runtime-boundary.mjs',
  '../src/x46-usart-rx-limits.mjs',
  '../src/x46-usart-rx-contract.mjs',
  '../src/x47-runtime-transaction.mjs',
  '../src/x47-ui-integration.mjs', '../src/strict-json.mjs',
  '../src/x47-repeatable-inputs.mjs',
  '../src/component-appearance.mjs', '../src/project-v2.mjs', '../src/project-editor.mjs',
  '../src/lifecycle.mjs', '../staging/component-artwork.mjs',
  '../src/model-library.mjs', '../src/model-bundle-registry.mjs', '../src/project-envelope.mjs',
  '../src/model-control-contracts.mjs', '../src/simulator.worker.mjs', '../staging/main.mjs',
  '../src/x48-ideal-room-plant.mjs', '../src/x92-experiment-budget.mjs',
  '../src/x92-c3-budget-integration.mjs', '../src/shared-workbench-shell.mjs',
  '../src/rp2040-snapshot-pacer.mjs', '../src/rp2040-experimental-runtime.mjs',
  '../src/runtime-identity.mjs',
  '../src/candidate-project-session.mjs', '../src/candidate-spdt-runtime.mjs',
  '../src/candidate-existing-ui-adapter.mjs', '../src/rp2040-pico-circuit.mjs',
  '../src/bounded-3v3-authoring-contracts.mjs', '../src/named-series-led-circuit-editor.mjs',
  '../src/esp32c3-public-circuit.mjs', '../src/stm32-public-circuit.mjs',
  '../src/rp2040-public-workbench.mjs', '../src/esp32c3-public-workbench.mjs',
  '../src/stm32-public-workbench.mjs', '../c3/public-service.mjs',
  '../expansion-drafts/controller-runtime-bridge-v1.mjs',
  '../expansion-drafts/rp2040-runtime-bridge-adapter-v1.mjs',
  '../expansion-drafts/rp2040-conformance-fixtures-v1.mjs',
  '../expansion-drafts/rp2040-firmware-artifact-v1.mjs',
  '../expansion-drafts/project-v3-contact-persistence.mjs',
  '../expansion-drafts/joystick-keypads-v1.mjs',
  '../expansion-drafts/joystick-keypads-artwork-v1.mjs',
  '../expansion-drafts/digital-presence-sensors-v1.mjs',
  '../expansion-drafts/digital-presence-sensors-artwork-v1.mjs',
  '../expansion-drafts/digital-pulse-sensors-v1.mjs',
  '../expansion-drafts/digital-pulse-sensors-artwork-v1.mjs',
  '../expansion-drafts/digital-reflective-sensors-v1.mjs',
  '../expansion-drafts/digital-reflective-sensors-artwork-v1.mjs',
  '../expansion-drafts/dht11-temperature-humidity-v1.mjs',
  '../expansion-drafts/dht11-temperature-humidity-artwork-v1.mjs',
  '../expansion-drafts/ds18b20-temperature-v1.mjs',
  '../expansion-drafts/ds18b20-temperature-artwork-v1.mjs',
  '../expansion-drafts/analogue-moisture-level-sensors-v1.mjs',
  '../expansion-drafts/analogue-moisture-level-sensors-artwork-v1.mjs',
  '../expansion-drafts/analogue-detection-sensors-v1.mjs',
  '../expansion-drafts/analogue-detection-sensors-artwork-v1.mjs',
  '../expansion-drafts/analogue-direction-field-sensors-v1.mjs',
  '../expansion-drafts/analogue-direction-field-sensors-artwork-v1.mjs',
  '../expansion-drafts/analogue-temperature-ic-sensors-v1.mjs',
  '../expansion-drafts/analogue-temperature-ic-sensors-artwork-v1.mjs',
  '../expansion-drafts/resistive-divider-sensors-v1.mjs',
  '../expansion-drafts/resistive-divider-sensors-artwork-v1.mjs',
  '../expansion-drafts/passive-energy-storage-components-v1.mjs',
  '../expansion-drafts/passive-energy-storage-components-artwork-v1.mjs',
  '../expansion-drafts/diode-components-v1.mjs',
  '../expansion-drafts/diode-components-artwork-v1.mjs',
  '../expansion-drafts/transistor-components-v1.mjs',
  '../expansion-drafts/transistor-components-artwork-v1.mjs',
  '../expansion-drafts/circuit-protection-components-v1.mjs',
  '../expansion-drafts/circuit-protection-components-artwork-v1.mjs',
  '../expansion-drafts/semiconductor-active-components-v1.mjs',
  '../expansion-drafts/semiconductor-active-components-artwork-v1.mjs',
  '../expansion-drafts/contact-sensors-v1.mjs',
  '../expansion-drafts/contact-sensors-artwork-v1.mjs',
  '../expansion-drafts/ground-reference-integration-v1.mjs',
  '../expansion-drafts/power-reference-integration-v1.mjs',
  '../expansion-drafts/power-reference-artwork-v1.mjs',
  '../expansion-drafts/toggle-switch-integration-v1.mjs',
  '../expansion-drafts/switch-contact-graph-v1.mjs',
  '../expansion-drafts/ideal-three-pin-analogue-module-v1.mjs',
  '../expansion-drafts/light-analogue-sensor-v1.mjs',
  '../expansion-drafts/temperature-analogue-sensor-v1.mjs',
  '../expansion-drafts/digital-light-threshold-module-v1.mjs',
  '../expansion-drafts/common-cathode-rgb-led-v1.mjs',
  '../expansion-drafts/traffic-light-module-v1.mjs',
  '../expansion-drafts/traffic-light-module-artwork-v1.mjs',
  '../expansion-drafts/active-buzzer-module-v1.mjs',
  '../expansion-drafts/seven-segment-common-cathode-v1.mjs',
  '../expansion-drafts/seven-segment-four-digit-common-cathode-v1.mjs',
  '../expansion-drafts/seven-segment-four-digit-common-cathode-artwork-v1.mjs',
  '../expansion-drafts/character-lcd-16x2-4bit-v1.mjs',
  '../expansion-drafts/character-lcd-20x4-4bit-v1.mjs',
  '../expansion-drafts/character-lcd-20x4-4bit-artwork-v1.mjs',
  '../expansion-drafts/pcf8574-lcd-backpack-v1.mjs',
  '../expansion-drafts/pcf8574-lcd-backpack-artwork-v1.mjs',
  '../expansion-drafts/pcf8574-lcd-hello-example-v1.mjs',
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
        'button.momentary-v1', 'potentiometer.linear-v1', 'potentiometer.trimmer-v1'].includes(entry.componentType)
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
  '2.0.0-dht11-public-visibility.1-current',
  'intent-mcu-model-bundle-current-dht11-public-visibility-1@53',
  currentImplementation,
  {
    priorVersion: PRE_DHT11_PUBLIC_VISIBILITY_CURRENT_MODEL_LIBRARY_MANIFEST.version,
    priorManifestSha256: PRE_DHT11_PUBLIC_VISIBILITY_CURRENT_MODEL_LIBRARY_MANIFEST.manifestSha256,
    compatibility: 'strict-versioned-data-only migration; runtime-and-verdict-authority-cleared',
    semanticDisposition: 'retains the complete DS18B20 and DHT11 component contracts without electrical, protocol or runtime semantic changes',
    presentationDisposition: 'makes the DHT11 example directly visible in Simple view and features its simulator controls in the shared Parts drawer',
    baselineClosureDisposition: 'source rc144 DS18B20 head 0172198 and every earlier identity remain immutable migration-only anchors; public rc143 remains the rollback release until acceptance',
  },
);
const output = `// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce
// Generated immutable snapshots. Regenerate only through an explicitly reviewed library release.

export const RETAINED_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(retained, null, 2)});
export const RC111_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(RC111_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const RC112_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(RC112_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const RC113_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(RC113_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const RC120_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(RC120_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const RC124_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(RC124_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const RC128_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(RC128_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X92_STM32_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X92_STM32_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_RETAINED_BUILD_GUARD_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_RETAINED_BUILD_GUARD_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_RUNTIME_CONTROLS_SERIAL_UI_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_RUNTIME_CONTROLS_SERIAL_UI_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_PWM_LED_SHORT_ROUTING_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_PWM_LED_SHORT_ROUTING_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X46_USART_CONFIG_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X46_USART_CONFIG_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X46_USART_RX_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X46_USART_RX_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_THUMBNAIL_ARTWORK_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_THUMBNAIL_ARTWORK_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_LCD_END_TO_END_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_LCD_END_TO_END_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_LCD_API_DUPLICATE_FIX_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_LCD_API_DUPLICATE_FIX_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_LCD_PERSISTENCE_FIX_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_LCD_PERSISTENCE_FIX_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_PRESERVED_DRAFT_EXPORT_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_PRESERVED_DRAFT_EXPORT_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_COMPONENT_IMAGE_PARITY_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_COMPONENT_IMAGE_PARITY_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_RUNTIME_READY_DEADLINE_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_RUNTIME_READY_DEADLINE_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X43_STACK_HOTPATH_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X43_STACK_HOTPATH_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X43_STACK_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X43_STACK_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRIOR_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRIOR_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X47_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X47_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X47_UI_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X47_UI_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X55_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X55_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X48_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X48_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X48_AUTHORITY_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X48_AUTHORITY_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_UX_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_UX_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X47_REPEATABLE_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X47_REPEATABLE_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X47_REPEATABLE_REJECTION_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X47_REPEATABLE_REJECTION_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X47_MOMENTARY_CONTROL_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X47_MOMENTARY_CONTROL_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X47_REPEATABLE_APPLY_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X47_REPEATABLE_APPLY_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X47_REPAUSE_STATE_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X47_REPAUSE_STATE_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X55_ALL_PROFILE_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X55_ALL_PROFILE_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X55_LED_OUTLINE_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X55_LED_OUTLINE_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X55_BODY_EDITOR_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X55_BODY_EDITOR_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X55_BODY_LEAD_FIX_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X55_BODY_LEAD_FIX_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X55_NOOP_APPLY_FIX_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X55_NOOP_APPLY_FIX_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X55_SPLIT_EDITOR_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X55_SPLIT_EDITOR_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X55_MODEL_COPY_FIX_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X55_MODEL_COPY_FIX_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X92_BUDGET_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X92_BUDGET_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X92_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X92_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X92_RUNTIME_LIFETIME_FIX_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X92_RUNTIME_LIFETIME_FIX_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X92_DISPATCH_GATE_FIX_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X92_DISPATCH_GATE_FIX_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_TEACHING_BATCH_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_TEACHING_BATCH_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_TEACHING_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_TEACHING_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X66_NET_LABELS_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X66_NET_LABELS_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X66_LEGACY_OPEN_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X66_LEGACY_OPEN_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X66_BOUNDED_SUBCIRCUITS_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X66_BOUNDED_SUBCIRCUITS_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X66_SUBCIRCUIT_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X66_SUBCIRCUIT_REVIEW_FIX_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_X66_PUBLIC_THERMOSTAT_CREATE_FIX_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_X66_PUBLIC_THERMOSTAT_CREATE_FIX_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_CMP020_MANUAL_MIXED_REPAIR_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_CMP020_MANUAL_MIXED_REPAIR_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_CMP020_PUBLIC_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_CMP020_PUBLIC_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_CMP003_PUBLIC_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_CMP003_PUBLIC_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_CMP041_PUBLIC_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_CMP041_PUBLIC_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_CMP043_PUBLIC_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_CMP043_PUBLIC_SOURCE_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_CMP092_DHT11_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_CMP092_DHT11_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_CMP091_DS18B20_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_CMP091_DS18B20_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const PRE_DHT11_PUBLIC_VISIBILITY_CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(PRE_DHT11_PUBLIC_VISIBILITY_CURRENT_MODEL_LIBRARY_MANIFEST, null, 2)});
export const CURRENT_MODEL_LIBRARY_MANIFEST = Object.freeze(${JSON.stringify(current, null, 2)});
`;
await writeFile(new URL('../src/model-library-snapshots.mjs', import.meta.url), output);
console.log(JSON.stringify({ retained: retained.manifestSha256, current: current.manifestSha256,
  entries: entries.length }));
