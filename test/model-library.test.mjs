// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import {
  CircuitRuntime, MODEL_LIBRARY_TEST_AUTHORITY, validateCircuit,
} from '../src/circuit-engine.mjs';
import { RuntimeKernel } from '../src/runtime-kernel.mjs';
import { createRp2040PicoCircuitDraft, validateRp2040PicoCircuit } from '../src/rp2040-pico-circuit.mjs';
import { createEsp32C3CircuitDraft, validateEsp32C3Circuit } from '../src/esp32c3-public-circuit.mjs';
import { createStm32CircuitDraft, validateStm32Circuit } from '../src/stm32-public-circuit.mjs';
import { createContactPersistenceExample } from '../expansion-drafts/contact-persistence-fixture-v1.mjs';
import {
  CHARACTER_LCD_INITIALIZATION, CHARACTER_LCD_SIGNALS, CHARACTER_LCD_TIMING,
} from '../expansion-drafts/character-lcd-16x2-4bit-v1.mjs';
import {
  createTemperatureLcdThresholdExample,
} from '../expansion-drafts/temperature-lcd-threshold-example-v1.mjs';
import {
  CURRENT_MODEL_LIBRARY_LOCK, PRE_RETAINED_BUILD_GUARD_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X92_STM32_SOURCE_CURRENT_MODEL_LIBRARY_LOCK,
  RC113_CURRENT_MODEL_LIBRARY_LOCK,
  RC120_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X47_REPEATABLE_APPLY_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X66_PUBLIC_THERMOSTAT_CREATE_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X66_SUBCIRCUIT_REVIEW_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X66_BOUNDED_SUBCIRCUITS_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X66_LEGACY_OPEN_REVIEW_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X66_NET_LABELS_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_TEACHING_REVIEW_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_TEACHING_BATCH_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X92_DISPATCH_GATE_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X92_RUNTIME_LIFETIME_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X92_REVIEW_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X92_BUDGET_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X55_MODEL_COPY_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X55_SPLIT_EDITOR_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X55_NOOP_APPLY_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X55_BODY_LEAD_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X55_BODY_EDITOR_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X47_MOMENTARY_CONTROL_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X47_REPEATABLE_REJECTION_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X47_REPEATABLE_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X43_STACK_HOTPATH_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X43_STACK_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_UX_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X55_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X47_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X47_UI_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_LOCK,
  PRIOR_CURRENT_MODEL_LIBRARY_LOCK, RETAINED_MODEL_LIBRARY_LOCK,
  compareModelLibraryEntries, modelLibraryMigrationPreview, normalizeModelLibraryLock,
  historicalModelLibraryManifests, modelLibraryExecutionIdentity, resolveModelLibrary,
  runModelLibraryConformance, trustedModelLibraryManifests,
  validateProjectModelLibrary,
} from '../src/model-library.mjs';

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
};
const sha256 = (value) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const profiles = [
  'board.atmega328p-16mhz-v1', 'board.rp2040-pico-v1',
  'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1',
];
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

function lcdTrace(mapping, lines = ['TEMP 25 C', 'RETAINED RC72']) {
  const levels = Object.fromEntries(CHARACTER_LCD_SIGNALS.map((signal) => [signal, false]));
  const events = [];
  const set = (signal, level, cycle) => {
    if (levels[signal] === Boolean(level)) return;
    levels[signal] = Boolean(level);
    events.push({ cycle, pin: Number(mapping[signal].slice(1)), level: Boolean(level) });
  };
  const nibble = (value, rs, cycle) => {
    set('RS', rs, cycle);
    for (let bit = 0; bit < 4; bit += 1) set(`D${bit + 4}`, Boolean(value & (1 << bit)), cycle);
    set('E', true, cycle + 1); set('E', false, cycle + 9);
    return cycle + 9;
  };
  const byte = (value, rs, cycle) => {
    const first = nibble(value >> 4, rs, cycle);
    return nibble(value & 0x0f, rs, first + 16);
  };
  let cycle = CHARACTER_LCD_TIMING.powerOnMinimumCycles;
  cycle = nibble(0x3, false, cycle);
  cycle = nibble(0x3, false, cycle + CHARACTER_LCD_TIMING.firstRepeatedInitGapCycles);
  cycle = nibble(0x3, false, cycle + CHARACTER_LCD_TIMING.laterInitGapCycles);
  cycle = nibble(0x2, false, cycle + CHARACTER_LCD_TIMING.laterInitGapCycles);
  for (const command of CHARACTER_LCD_INITIALIZATION.commands) {
    cycle = byte(command, false, cycle + CHARACTER_LCD_TIMING.instructionMinimumCycles);
    cycle += command === 0x01 ? CHARACTER_LCD_TIMING.clearHomeMinimumCycles
      : CHARACTER_LCD_TIMING.instructionMinimumCycles;
  }
  for (const [index, line] of lines.entries()) {
    cycle = byte(0x80 | (index === 0 ? 0x00 : 0x40), false, cycle);
    cycle += CHARACTER_LCD_TIMING.instructionMinimumCycles;
    for (const character of line.padEnd(16).slice(0, 16)) {
      cycle = byte(character.charCodeAt(0), true, cycle);
      cycle += CHARACTER_LCD_TIMING.instructionMinimumCycles;
    }
  }
  return events;
}

test('trusted immutable snapshots have 25 exact cells and independently recomputable hashes', async () => {
  const manifests = trustedModelLibraryManifests();
  assert.equal(manifests.length, 2);
  for (const manifest of manifests) {
    assert.equal(manifest.entries.length, 25);
    const aggregate = structuredClone(manifest); delete aggregate.manifestSha256;
    assert.equal(sha256(aggregate), manifest.manifestSha256);
    for (const entry of manifest.entries) {
      assert.equal(sha256(entry.semantic), entry.semanticSha256);
      assert.equal(sha256({ semanticSha256: entry.semanticSha256, owner: entry.owner }),
        entry.behaviorContractSha256);
      assert.equal(sha256(entry.renderer), entry.rendererContractSha256);
    }
    for (const member of manifest.implementationMembers) {
      const bytes = await readFile(new URL(`../${member.path}`, import.meta.url));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), member.sha256, member.path);
    }
    assert.equal(sha256(manifest.implementationMembers), manifest.implementationSha256);
  }
});

test('locks resolve only against the trusted catalogue, never a supplied self-hash', () => {
  assert.equal(normalizeModelLibraryLock(CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(normalizeModelLibraryLock(RETAINED_MODEL_LIBRARY_LOCK).ok, true);
  const forged = { ...CURRENT_MODEL_LIBRARY_LOCK, version: 'attacker-9', manifestSha256: 'a'.repeat(64) };
  assert.equal(normalizeModelLibraryLock(forged).code, 'MODEL_LIBRARY_LOCK_UNTRUSTED');
  assert.equal(normalizeModelLibraryLock({ ...CURRENT_MODEL_LIBRARY_LOCK, extra: true }).code,
    'MODEL_LIBRARY_LOCK_SHAPE');
  assert.equal(normalizeModelLibraryLock({ ...CURRENT_MODEL_LIBRARY_LOCK, manifestSha256: 'bad' }).code,
    'MODEL_LIBRARY_LOCK_SHAPE');
});

test('self-rehashed mutations of every manifest identity class remain untrusted', () => {
  const current = trustedModelLibraryManifests()[1];
  const resistorIndex = current.entries.findIndex((entry) => entry.componentType === 'resistor.fixed-v1');
  const mutations = [
    (value) => { value.libraryId = 'forged-library'; },
    (value) => { value.entries[resistorIndex].modelId = 'model.forged-v1'; },
    (value) => { value.entries[resistorIndex].behaviorContractSha256 = '1'.repeat(64); },
    (value) => { value.entries[resistorIndex].semantic.pins[0].role = 'forged-role'; },
    (value) => { value.entries[resistorIndex].semantic.properties.ohms.default += 1; },
    (value) => { value.entries[resistorIndex].supportStatus = 'forged-support'; },
    (value) => { value.entries[resistorIndex].rendererContractSha256 = '2'.repeat(64); },
  ];
  for (const mutate of mutations) {
    const forged = structuredClone(current); mutate(forged); delete forged.manifestSha256;
    forged.manifestSha256 = sha256(forged);
    const lock = { schema: CURRENT_MODEL_LIBRARY_LOCK.schema, libraryId: forged.libraryId,
      version: forged.version, manifestSha256: forged.manifestSha256,
      implementationSha256: forged.implementationSha256 };
    assert.equal(normalizeModelLibraryLock(lock).code, 'MODEL_LIBRARY_LOCK_UNTRUSTED');
  }
});

test('retained and current locks use distinct real resolver instances with matching retained conformance', () => {
  const retained = resolveModelLibrary(RETAINED_MODEL_LIBRARY_LOCK);
  const current = resolveModelLibrary(CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(retained.ok, true); assert.equal(current.ok, true);
  assert.notEqual(retained.implementation, current.implementation);
  assert.notEqual(retained.implementation.id, current.implementation.id);
  const retainedRows = runModelLibraryConformance(RETAINED_MODEL_LIBRARY_LOCK);
  const currentRows = runModelLibraryConformance(CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(retainedRows.ok, true); assert.equal(currentRows.ok, true);
  assert.deepEqual(retainedRows.rows.map((row) => row.actual), currentRows.rows.map((row) => row.actual));
});

test('production electrical and runtime paths dispatch through the exact selected implementation', () => {
  for (const [lock, expected] of [
    [RETAINED_MODEL_LIBRARY_LOCK, 'intent-mcu-model-bundle-retained-rc72@2'],
    [CURRENT_MODEL_LIBRARY_LOCK,
      'intent-mcu-model-bundle-current-retained-build-guard-1@41'],
  ]) {
    const avr = validateCircuit(DEFAULT_CIRCUIT, { modelLibraryLock: lock });
    assert.equal(avr.ok, true);
    assert.equal(avr.modelLibrary.implementationId, expected);
    assert.equal(avr.models.leds[0].currentAmps, (5 - 2) / 220);
    const runtime = new CircuitRuntime(DEFAULT_CIRCUIT, { modelLibraryLock: lock });
    const observed = runtime.observe({ digitalPins: { D13: true } });
    assert.equal(observed.modelLibrary.implementationId, expected);
    assert.equal(observed.leds[0].currentAmps, (5 - 2) / 220);
    const kernel = new RuntimeKernel(':00000001FF', DEFAULT_CIRCUIT, { modelLibraryLock: lock });
    assert.equal(kernel.snapshot().circuit.modelLibrary.implementationId, expected);

    const pico = validateRp2040PicoCircuit(createRp2040PicoCircuitDraft(), { modelLibraryLock: lock });
    const c3 = validateEsp32C3Circuit(createEsp32C3CircuitDraft(), { modelLibraryLock: lock });
    const stm32 = validateStm32Circuit(createStm32CircuitDraft(), { modelLibraryLock: lock });
    for (const result of [pico, c3, stm32]) {
      assert.equal(result.ok, true);
      assert.equal(result.model.modelLibraryImplementationId, expected);
    }
  }
});

test('prior current locks remain exact and data-migratable but cannot authorize execution', () => {
  const historical = historicalModelLibraryManifests();
  assert.equal(historical.length, 37);
  for (const manifest of historical.slice(1)) {
    const lock = { schema: 'intent-mcu-model-library-lock@2', libraryId: manifest.libraryId,
      version: manifest.version, manifestSha256: manifest.manifestSha256,
      implementationSha256: manifest.implementationSha256 };
    assert.equal(normalizeModelLibraryLock(lock).ok, true, manifest.version);
    assert.equal(modelLibraryExecutionIdentity(lock).code,
      'MODEL_LIBRARY_MIGRATION_REQUIRED', manifest.version);
  }
  assert.equal(normalizeModelLibraryLock(RC113_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(
    RC113_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  assert.equal(normalizeModelLibraryLock(RC120_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(resolveModelLibrary(RC120_CURRENT_MODEL_LIBRARY_LOCK).role,
    'rc120-current-migration');
  assert.equal(modelLibraryExecutionIdentity(
    RC120_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  assert.equal(normalizeModelLibraryLock(PRE_RETAINED_BUILD_GUARD_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(
    PRE_RETAINED_BUILD_GUARD_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  assert.equal(normalizeModelLibraryLock(PRE_X92_STM32_SOURCE_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(
    PRE_X92_STM32_SOURCE_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  for (const lock of [PRE_X66_PUBLIC_THERMOSTAT_CREATE_FIX_CURRENT_MODEL_LIBRARY_LOCK,
    PRE_X66_SUBCIRCUIT_REVIEW_FIX_CURRENT_MODEL_LIBRARY_LOCK,
    PRE_X66_BOUNDED_SUBCIRCUITS_CURRENT_MODEL_LIBRARY_LOCK,
    PRE_X66_LEGACY_OPEN_REVIEW_FIX_CURRENT_MODEL_LIBRARY_LOCK,
    PRE_TEACHING_REVIEW_FIX_CURRENT_MODEL_LIBRARY_LOCK,
    PRE_TEACHING_BATCH_CURRENT_MODEL_LIBRARY_LOCK]) {
    assert.equal(normalizeModelLibraryLock(lock).ok, true);
    assert.equal(modelLibraryExecutionIdentity(lock).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  }
  assert.equal(normalizeModelLibraryLock(PRE_X66_NET_LABELS_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(
    PRE_X66_NET_LABELS_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  assert.equal(normalizeModelLibraryLock(PRE_X92_DISPATCH_GATE_FIX_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(
    PRE_X92_DISPATCH_GATE_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  assert.equal(normalizeModelLibraryLock(PRE_X92_RUNTIME_LIFETIME_FIX_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(
    PRE_X92_RUNTIME_LIFETIME_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  assert.equal(normalizeModelLibraryLock(PRE_X92_REVIEW_FIX_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(
    PRE_X92_REVIEW_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  assert.equal(normalizeModelLibraryLock(PRE_X92_BUDGET_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(
    PRE_X92_BUDGET_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  assert.equal(normalizeModelLibraryLock(PRE_X55_MODEL_COPY_FIX_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(
    PRE_X55_MODEL_COPY_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  assert.equal(normalizeModelLibraryLock(PRE_X55_SPLIT_EDITOR_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(
    PRE_X55_SPLIT_EDITOR_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  assert.equal(normalizeModelLibraryLock(PRE_X55_NOOP_APPLY_FIX_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(
    PRE_X55_NOOP_APPLY_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  assert.equal(normalizeModelLibraryLock(PRE_X55_BODY_LEAD_FIX_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(
    PRE_X55_BODY_LEAD_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  assert.equal(normalizeModelLibraryLock(PRE_X55_BODY_EDITOR_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(
    PRE_X55_BODY_EDITOR_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const preRepeatableApply = historical.at(-1);
  assert.equal(preRepeatableApply.version, '2.0.0-x47-momentary-control-fix.1-current');
  assert.equal(normalizeModelLibraryLock(PRE_X47_REPEATABLE_APPLY_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(
    PRE_X47_REPEATABLE_APPLY_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const applyMigration = modelLibraryMigrationPreview(
    PRE_X47_REPEATABLE_APPLY_CURRENT_MODEL_LIBRARY_LOCK,
  );
  assert.equal(applyMigration.ok, true);
  assert.equal(applyMigration.semanticChanges.length, 0);
  assert.equal(applyMigration.rendererChanges.length, 0);
  assert.equal(applyMigration.unchanged.length, 25);
  const preMomentaryControl = historical.at(-2);
  assert.equal(preMomentaryControl.version, '2.0.0-x47-repeatable-inputs-candidate.2-current');
  assert.equal(normalizeModelLibraryLock(PRE_X47_MOMENTARY_CONTROL_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(
    PRE_X47_MOMENTARY_CONTROL_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const momentaryMigration = modelLibraryMigrationPreview(
    PRE_X47_MOMENTARY_CONTROL_CURRENT_MODEL_LIBRARY_LOCK,
  );
  assert.equal(momentaryMigration.ok, true);
  assert.equal(momentaryMigration.semanticChanges.length, 0);
  assert.equal(momentaryMigration.rendererChanges.length, 0);
  assert.equal(momentaryMigration.unchanged.length, 25);
  const preRejection = historical.at(-3);
  assert.equal(preRejection.version, '2.0.0-x47-repeatable-inputs-candidate.1-current');
  assert.equal(normalizeModelLibraryLock(PRE_X47_REPEATABLE_REJECTION_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(
    PRE_X47_REPEATABLE_REJECTION_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const rejectionMigration = modelLibraryMigrationPreview(
    PRE_X47_REPEATABLE_REJECTION_CURRENT_MODEL_LIBRARY_LOCK,
  );
  assert.equal(rejectionMigration.ok, true);
  assert.equal(rejectionMigration.semanticChanges.length, 0);
  assert.equal(rejectionMigration.rendererChanges.length, 0);
  assert.equal(rejectionMigration.unchanged.length, 25);
  const preRepeatable = historical.at(-4);
  assert.equal(preRepeatable.version, '2.0.0-x43-stack-hotpath-candidate.1-current');
  assert.equal(normalizeModelLibraryLock(PRE_X47_REPEATABLE_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(PRE_X47_REPEATABLE_CURRENT_MODEL_LIBRARY_LOCK).code,
    'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const repeatableMigration = modelLibraryMigrationPreview(PRE_X47_REPEATABLE_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(repeatableMigration.ok, true);
  assert.equal(repeatableMigration.semanticChanges.length, 0);
  assert.equal(repeatableMigration.rendererChanges.length, 0);
  assert.equal(repeatableMigration.unchanged.length, 25);
  const preHotpath = historical.find(({ version }) => version === '2.0.0-x43-observed-stack-candidate.1-current');
  assert.equal(preHotpath.version, '2.0.0-x43-observed-stack-candidate.1-current');
  assert.equal(normalizeModelLibraryLock(PRE_X43_STACK_HOTPATH_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(PRE_X43_STACK_HOTPATH_CURRENT_MODEL_LIBRARY_LOCK).code,
    'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const hotpathMigration = modelLibraryMigrationPreview(PRE_X43_STACK_HOTPATH_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(hotpathMigration.ok, true);
  assert.equal(hotpathMigration.semanticChanges.length, 0);
  assert.equal(hotpathMigration.rendererChanges.length, 0);
  assert.equal(hotpathMigration.unchanged.length, 25);

  const preStack = historical.find(({ version }) => version === '2.0.0-ux-public-isolation.1-current');
  assert.equal(preStack.version, '2.0.0-ux-public-isolation.1-current');
  assert.equal(normalizeModelLibraryLock(PRE_X43_STACK_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(PRE_X43_STACK_CURRENT_MODEL_LIBRARY_LOCK).code,
    'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const stackMigration = modelLibraryMigrationPreview(PRE_X43_STACK_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(stackMigration.ok, true);
  assert.equal(stackMigration.semanticChanges.length, 0);
  assert.equal(stackMigration.rendererChanges.length, 0);
  assert.equal(stackMigration.unchanged.length, 25);

  const preControlLabel = historical.find(({ version }) => version === '2.0.0-x55-resistor-appearance.1-current');
  assert.equal(preControlLabel.version, '2.0.0-x55-resistor-appearance.1-current');
  assert.equal(preControlLabel.manifestSha256,
    '5e778f334ccae4ef914927d22675176315ac589a22695f7e500ee32c2f419806');
  assert.equal(normalizeModelLibraryLock(PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_LOCK).code,
    'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const controlLabelMigration = modelLibraryMigrationPreview(
    PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_LOCK,
  );
  assert.equal(controlLabelMigration.ok, true);
  assert.equal(controlLabelMigration.semanticChanges.length, 0);
  assert.equal(controlLabelMigration.rendererChanges.length, 0);
  assert.equal(controlLabelMigration.unchanged.length, 25);

  const preX55 = historical.find(({ version }) => version === '2.0.0-x47-ui-async-epoch.1-current');
  assert.equal(preX55.version, '2.0.0-x47-ui-async-epoch.1-current');
  assert.equal(normalizeModelLibraryLock(PRE_X55_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(PRE_X55_CURRENT_MODEL_LIBRARY_LOCK).code,
    'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const x55Migration = modelLibraryMigrationPreview(PRE_X55_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(x55Migration.ok, true);
  assert.equal(x55Migration.semanticChanges.length, 0);
  assert.equal(x55Migration.rendererChanges.length, 0);
  assert.equal(x55Migration.unchanged.length, 25);

  const prior = historical.find(({ version }) => version === '2.0.0-x56-current');
  assert.equal(prior.version, '2.0.0-x56-current');
  assert.equal(prior.manifestSha256, '5c94ce070526d2e7e417fed0cb152fc28bdea24ee9beb52c65488328d41eac0b');
  assert.equal(prior.implementationSha256, '4e0fc926236de5edda6b3e85c3770b709a4ae3643d47b8cd9b3138c4c1b61633');
  assert.equal(normalizeModelLibraryLock(PRIOR_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(PRIOR_CURRENT_MODEL_LIBRARY_LOCK).code,
    'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const migration = modelLibraryMigrationPreview(PRIOR_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(migration.ok, true);
  assert.equal(migration.migrationRequired, true);
  assert.equal(migration.semanticChanges.length, 0);
  assert.equal(migration.rendererChanges.length, 0);
  assert.equal(migration.unchanged.length, 25);

  const preX47 = historical.find(({ version }) => version === '2.0.0-pico-presentation.1-current');
  assert.equal(preX47.version, '2.0.0-pico-presentation.1-current');
  assert.equal(preX47.manifestSha256,
    '567aebbbf1885d31f9401fa3cf1ae98b7263d1b32f22a6b7886ec686b3c0dac3');
  assert.equal(preX47.implementationSha256,
    '02df48f026feddb9e9af5630d162a76be8660f618d31388b5df53839184125f1');
  assert.equal(normalizeModelLibraryLock(PRE_X47_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(PRE_X47_CURRENT_MODEL_LIBRARY_LOCK).code,
    'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const x47Migration = modelLibraryMigrationPreview(PRE_X47_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(x47Migration.ok, true);
  assert.equal(x47Migration.migrationRequired, true);
  assert.equal(x47Migration.semanticChanges.length, 0);
  assert.equal(x47Migration.rendererChanges.length, 0);
  assert.equal(x47Migration.unchanged.length, 25);

  const preValidation = historical.find(({ version }) => version === '2.0.0-x47-runtime-contract.1-current');
  assert.equal(preValidation.version, '2.0.0-x47-runtime-contract.1-current');
  assert.equal(preValidation.manifestSha256,
    '5e72951afde80c8f0217b6486c7ff2c2ca235dbe34b937a3170597e92cbb8f75');
  assert.equal(preValidation.implementationSha256,
    '6a7c7f3c530613832a553a7e7264e1c1a1af91c69bb5c6b725513b5ad3e0328d');
  assert.equal(normalizeModelLibraryLock(PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_LOCK).code,
    'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const validationMigration = modelLibraryMigrationPreview(PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(validationMigration.ok, true);
  assert.equal(validationMigration.semanticChanges.length, 0);
  assert.equal(validationMigration.rendererChanges.length, 0);
  assert.equal(validationMigration.unchanged.length, 25);

  const preUi = historical.find(({ version }) => version === '2.0.0-x47-receipt-validation.1-current');
  assert.equal(preUi.version, '2.0.0-x47-receipt-validation.1-current');
  assert.equal(preUi.manifestSha256,
    '49792e65a899ee8cb44818ecf2cbcccf5deb86153ac391d9a0600b6c96cd9756');
  assert.equal(preUi.implementationSha256,
    '2e4e0aeb38ffa11050df7e987c71a58a31f124fb442d8721066d79ea112d3cf2');
  assert.equal(normalizeModelLibraryLock(PRE_X47_UI_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(PRE_X47_UI_CURRENT_MODEL_LIBRARY_LOCK).code,
    'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const uiMigration = modelLibraryMigrationPreview(PRE_X47_UI_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(uiMigration.ok, true);
  assert.equal(uiMigration.semanticChanges.length, 0);
  assert.equal(uiMigration.rendererChanges.length, 0);
  assert.equal(uiMigration.unchanged.length, 25);

  const preAsync = historical.find(({ version }) => version === '2.0.0-x47-ui-integration.1-current');
  assert.equal(preAsync.version, '2.0.0-x47-ui-integration.1-current');
  assert.equal(preAsync.manifestSha256,
    '3d3c5f0e53bc3f1c55c6fd5d84c9b8a73bd7444603c5fc0ff9cbdb00d76340d6');
  assert.equal(preAsync.implementationSha256,
    'bf9114b1e9e8f1a26ec7273ee2deffe330646943cc103775844c577ed9fcc1dd');
  assert.equal(normalizeModelLibraryLock(PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_LOCK).code,
    'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const asyncMigration = modelLibraryMigrationPreview(PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(asyncMigration.ok, true);
  assert.equal(asyncMigration.semanticChanges.length, 0);
  assert.equal(asyncMigration.rendererChanges.length, 0);
  assert.equal(asyncMigration.unchanged.length, 25);

  const preUx = historical.find(({ version }) => version === '2.0.0-x55-control-label-fix.1-current');
  assert.equal(preUx.version, '2.0.0-x55-control-label-fix.1-current');
  assert.equal(preUx.manifestSha256,
    '92df2e0d8ab429a7baefd2b713ffbe52616f71bce63be030f416f490b80f23a1');
  assert.equal(normalizeModelLibraryLock(PRE_UX_CURRENT_MODEL_LIBRARY_LOCK).ok, true);
  assert.equal(modelLibraryExecutionIdentity(PRE_UX_CURRENT_MODEL_LIBRARY_LOCK).code,
    'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const uxMigration = modelLibraryMigrationPreview(PRE_UX_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(uxMigration.ok, true);
  assert.equal(uxMigration.semanticChanges.length, 0);
  assert.equal(uxMigration.rendererChanges.length, 0);
  assert.equal(uxMigration.unchanged.length, 25);
});

test('retained behavior is a dependency-closed historical source graph with no current imports', async () => {
  const retainedSource = await readFile(new URL('../src/model-library-retained-resolver.mjs', import.meta.url), 'utf8');
  const currentSource = await readFile(new URL('../src/model-library-current-resolver.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(retainedSource, /model-library-current-resolver|CURRENT_MODEL_LIBRARY/gu);
  assert.doesNotMatch(currentSource, /model-library-retained-resolver|RETAINED_MODEL_LIBRARY/gu);
  const retained = resolveModelLibrary(RETAINED_MODEL_LIBRARY_LOCK).implementation;
  const current = resolveModelLibrary(CURRENT_MODEL_LIBRARY_LOCK).implementation;
  assert.notEqual(retained.evaluateReference, current.evaluateReference);
  const before = retained.evaluateReference('led.basic-v1', { volts: 2, color: 'red' });
  assert.equal(Object.isFrozen(current), true);
  assert.throws(() => { current.evaluateReference = () => ({ ok: true, result: { forwardVolts: 4 } }); }, TypeError);
  assert.deepEqual(retained.evaluateReference('led.basic-v1', { volts: 2, color: 'red' }), before);
  const [retainedManifest, currentManifest] = trustedModelLibraryManifests();
  assert.equal(retainedManifest.implementationMembers.length, 59);
  assert(retainedManifest.implementationMembers.some((item) =>
    item.path === 'src/model-bundles/retained-rc72/source/closure.json'));
  const historicalMembers = retainedManifest.implementationMembers.filter((item) =>
    item.path.startsWith('src/model-bundles/retained-rc72/source/') && !item.path.endsWith('/closure.json'));
  assert.equal(historicalMembers.length, 57);
  for (const member of historicalMembers) {
    const source = await readFile(new URL(`../${member.path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /model-library-(?:current-)?resolver|src\/model-library/u, member.path);
  }
  for (const required of ['src/circuit-engine.mjs', 'src/simulator.worker.mjs',
    'src/candidate-project-session.mjs', 'src/atmega328p-adapter.mjs',
    'src/x43-avr-stack-profile.mjs', 'src/x47-runtime-transaction.mjs',
    'src/strict-json.mjs', 'staging/main.mjs']) {
    assert(currentManifest.implementationMembers.some((item) => item.path === required), required);
  }
  assert.doesNotMatch(retainedSource, /https?:|dynamic import|\beval\b|WebAssembly|child_process|package:/u);
});

test('all four profiles are admitted by their exact lock and invalid properties or pins fail closed', () => {
  const manifest = trustedModelLibraryManifests()[1];
  for (const profile of profiles) {
    const entry = manifest.entries.find((item) => item.profile === profile && item.componentType === profile);
    assert(entry, profile);
    const component = { id: 'board-1', type: profile, properties: {}, controls: {} };
    const project = { circuit: { components: [component], nets: [] } };
    assert.equal(validateProjectModelLibrary(CURRENT_MODEL_LIBRARY_LOCK, profile, project).ok, true);
    const unknown = structuredClone(project); unknown.circuit.components[0].properties.extra = true;
    assert.equal(validateProjectModelLibrary(CURRENT_MODEL_LIBRARY_LOCK, profile, unknown).code,
      'MODEL_LIBRARY_PROPERTY_KEYS');
    const badPin = structuredClone(project); badPin.circuit.nets = [
      { id: 'net-1', endpoints: [{ component: 'board-1', pin: 'NOT_A_PIN' }] },
    ];
    assert.equal(validateProjectModelLibrary(CURRENT_MODEL_LIBRARY_LOCK, profile, badPin).code,
      'MODEL_LIBRARY_PIN_UNKNOWN');
  }
});

test('all 25 cells admit exact defaults and all 19 model types execute through each bundle', () => {
  const manifests = trustedModelLibraryManifests();
  const inputs = {
    'board.atmega328p-16mhz-v1': {}, 'board.rp2040-pico-v1': {},
    'board.esp32-c3-devmodule-v1': {}, 'board.stm32f429zi-nucleo144-v1': {},
    'resistor.fixed-v1': { volts: 3, ohms: 220 },
    'led.basic-v1': { volts: 3, color: 'red' },
    'button.momentary-v1': { pressed: true },
    'potentiometer.linear-v1': { supplyVolts: 5, position: 0.5 },
    'reference.ground-v1': {}, 'switch.toggle-spst-v1': { closed: true },
    'switch.changeover-spdt-v1': { selectedThrow: 'A' },
    'sensor.light-analogue-v1': { lightLevel: 0.5 },
    'sensor.temperature-analogue-v1': { temperatureC: 25 },
    'sensor.light-threshold-digital-v1': { lightLevelPercent: 60,
      thresholdPercent: 50, hysteresisPercentagePoints: 5, currentActive: false },
    'output.rgb-led-common-cathode-v1': { duties: { R: 1, G: 0.5, B: 0 } },
    'output.active-buzzer-module-v1': { level: true },
    'output.seven-segment-common-cathode-v1': { digit: 8 },
    'output.character-lcd-16x2-4bit-v1': { lines: ['READY', '25 C'] },
    'input.rotary-encoder-quadrature-v1': { direction: 'cw' },
  };
  assert.equal(Object.keys(inputs).length, 19);
  for (const [manifest, lock] of [[manifests[0], RETAINED_MODEL_LIBRARY_LOCK],
    [manifests[1], CURRENT_MODEL_LIBRARY_LOCK]]) {
    assert.equal(manifest.entries.length, 25);
    for (const entry of manifest.entries) {
      const properties = Object.fromEntries(Object.entries(entry.semantic.properties)
        .map(([key, contract]) => [key, structuredClone(contract.default)]));
      const controls = Object.fromEntries(Object.entries(entry.semantic.controls)
        .map(([key, contract]) => [key, structuredClone(contract.default)]));
      const component = { id: 'fixture-1', type: entry.componentType, properties, controls };
      assert.equal(validateProjectModelLibrary(lock, entry.profile,
        { circuit: { components: [component], nets: [] } }).ok, true,
      `${entry.profile}/${entry.componentType}`);
      component.controls.unapproved = true;
      assert.equal(validateProjectModelLibrary(lock, entry.profile,
        { circuit: { components: [component], nets: [] } }).ok, false);
    }
    const implementation = resolveModelLibrary(lock).implementation;
    for (const [type, input] of Object.entries(inputs)) {
      assert.equal(implementation.evaluateProduction(type, input).ok, true, type);
      assert.equal(implementation.evaluateProduction(type, { invalid: true }).ok, false, `${type}:invalid`);
    }
  }
});

test('hostile current orchestrator mutation changes live paths while retained production closure stays invariant', () => {
  const retained = resolveModelLibrary(RETAINED_MODEL_LIBRARY_LOCK).implementation;
  const retainedBefore = {
    electrical: retained.validateAvrCircuit(DEFAULT_CIRCUIT),
    rgb: retained.observeRgb({ R: 1.2, G: 0.5, B: -1 }),
    encoder: retained.rotaryEncoderSequence({ phaseCycles: 16_000,
      phases: { A: { boardPinNumber: 2 }, B: { boardPinNumber: 3 } } }, 'cw'),
    lcd: retained.createCharacterLcdDecoder(
      { RS: 'D3', E: 'D4', D4: 'D5', D5: 'D6', D6: 'D7', D7: 'D8' },
    ).snapshot(),
    pico: retained.validateProfile('board.rp2040-pico-v1', createRp2040PicoCircuitDraft()),
  };
  const current = resolveModelLibrary(CURRENT_MODEL_LIBRARY_LOCK).implementation;
  const hostile = Object.freeze({
    ...current,
    id: 'test-only-hostile-current-bundle',
    definition: current.definition.bind(current),
    evaluateProduction: current.evaluateProduction.bind(current),
    evaluateReference(type, input) {
      if (type === 'led.basic-v1') {
        return { ok: true, code: 'OK', result: { forwardVolts: 4, lit: input.volts >= 4 } };
      }
      return current.evaluateReference(type, input);
    },
    observeRgb() { return { R: 0, G: 0, B: 1 }; },
    createCharacterLcdDecoder() {
      return { snapshot: () => ({ status: 'hostile-current-decoder', lines: ['MUTATED', 'CURRENT'] }) };
    },
    validateProfile() { return { ok: false, code: 'HOSTILE_CURRENT_PROFILE' }; },
  });
  const changed = validateCircuit(DEFAULT_CIRCUIT, {
    modelLibraryLock: CURRENT_MODEL_LIBRARY_LOCK,
    modelLibraryImplementation: hostile,
    testAuthority: MODEL_LIBRARY_TEST_AUTHORITY,
  });
  assert.equal(changed.ok, true);
  assert.equal(changed.modelLibrary.implementationId, hostile.id);
  assert.equal(changed.models.leds[0].currentAmps, (5 - 4) / 220);
  assert.deepEqual(hostile.observeRgb({ R: 1, G: 0, B: 0 }), { R: 0, G: 0, B: 1 });
  assert.equal(hostile.createCharacterLcdDecoder({}).snapshot().status, 'hostile-current-decoder');
  assert.equal(hostile.validateProfile('board.rp2040-pico-v1', {}).code, 'HOSTILE_CURRENT_PROFILE');
  const retainedAfter = {
    electrical: retained.validateAvrCircuit(DEFAULT_CIRCUIT),
    rgb: retained.observeRgb({ R: 1.2, G: 0.5, B: -1 }),
    encoder: retained.rotaryEncoderSequence({ phaseCycles: 16_000,
      phases: { A: { boardPinNumber: 2 }, B: { boardPinNumber: 3 } } }, 'cw'),
    lcd: retained.createCharacterLcdDecoder(
      { RS: 'D3', E: 'D4', D4: 'D5', D5: 'D6', D6: 'D7', D7: 'D8' },
    ).snapshot(),
    pico: retained.validateProfile('board.rp2040-pico-v1', createRp2040PicoCircuitDraft()),
  };
  assert.deepEqual(retainedAfter, retainedBefore);
  assert.equal(validateCircuit(DEFAULT_CIRCUIT, {
    modelLibraryLock: CURRENT_MODEL_LIBRARY_LOCK, modelLibraryImplementation: hostile,
  }).code, 'MODEL_LIBRARY_TEST_OVERRIDE_FORBIDDEN');
  assert.equal(resolveModelLibrary({ ...CURRENT_MODEL_LIBRARY_LOCK,
    manifestSha256: 'f'.repeat(64) }).ok, false);
});

test('real retained candidate pipeline, controls, runtime inputs and nonempty LCD trace survive hostile current source mutation', async () => {
  const temperatureExample = createTemperatureLcdThresholdExample();
  const contactExample = createContactPersistenceExample();
  assert.equal(contactExample.ok, true);
  const unsafe = structuredClone(temperatureExample.project);
  const ground = unsafe.candidateCircuit.nets.find((net) => net.id === 'net-example-ground');
  const supply = unsafe.candidateCircuit.nets.find((net) => net.id === 'net-example-5v');
  ground.endpoints = ground.endpoints.filter(
    (endpoint) => !(endpoint.component === 'board-1' && endpoint.pin === 'GND1'),
  );
  supply.endpoints.push({ component: 'board-1', pin: 'GND1' });

  const retainedJourney = (implementation) => {
    const opened = implementation.openCandidateUiSession(temperatureExample.text, {
      modelLibraryLock: RETAINED_MODEL_LIBRARY_LOCK,
    });
    assert.equal(opened.ok, true, `${opened.code}:${JSON.stringify(opened.details ?? [])}`);
    assert.equal(opened.session.runnable.ok, true);
    const lcdSupport = opened.session.runtimeSupport.find(
      (item) => item.componentId === 'character-lcd-1',
    );
    const mapping = Object.fromEntries(Object.entries(lcdSupport.runtimeProjection.signals)
      .map(([signal, record]) => [signal, record.sourcePin]));
    const lcd = implementation.createCharacterLcdDecoder(mapping).consume(lcdTrace(mapping));
    assert.equal(lcd.status, 'ready');
    assert.deepEqual(lcd.lines, ['TEMP 25 C       ', 'RETAINED RC72   ']);

    const temperatureControl = implementation.candidateContactControl(
      opened.session, 'temperature-sensor-1', 'temperatureC', 100,
    );
    assert.equal(temperatureControl.ok, true);
    assert.deepEqual(temperatureControl.worker,
      { command: 'control', componentId: 'temperature-sensor-1', key: 'position', value: 0.75 });
    const appliedTemperature = opened.session.apply({
      ...temperatureControl.command, revision: opened.session.revision,
    });
    assert.equal(appliedTemperature.ok, true);
    const temperatureProjection = opened.session.runtimeSupport.find(
      (item) => item.componentId === 'temperature-sensor-1',
    ).runtimeProjection;
    assert.equal(temperatureProjection.temperatureC, 100);
    assert.equal(temperatureProjection.voltage, 3.75);

    const contacts = implementation.openCandidateUiSession(JSON.stringify(contactExample.project), {
      modelLibraryLock: RETAINED_MODEL_LIBRARY_LOCK,
    });
    assert.equal(contacts.ok, true);
    const inputsBefore = implementation.candidateRuntimeInputs(contacts.session);
    const selectorBefore = inputsBefore.find((item) => item.componentId === 'selector-1');
    assert.deepEqual({ pinLabel: selectorBefore.pinLabel, level: selectorBefore.level,
      selectedThrow: selectorBefore.selectedThrow }, { pinLabel: 'D4', level: false, selectedThrow: 'A' });
    const selectorControl = implementation.candidateContactControl(
      contacts.session, 'selector-1', 'selectedThrow', 'B',
    );
    assert.equal(selectorControl.ok, true);
    assert.deepEqual(selectorControl.transition.frames.map((frame) => frame.state), ['A', 'BREAK', 'B']);
    assert.equal(contacts.session.apply({
      ...selectorControl.command, revision: contacts.session.revision,
    }).ok, true);
    const selectorAfter = implementation.candidateRuntimeInputs(contacts.session)
      .find((item) => item.componentId === 'selector-1');
    assert.deepEqual({ pinLabel: selectorAfter.pinLabel, level: selectorAfter.level,
      selectedThrow: selectorAfter.selectedThrow }, { pinLabel: 'D4', level: true, selectedThrow: 'B' });

    const unsafeResult = implementation.openCandidateUiSession(JSON.stringify(unsafe), {
      modelLibraryLock: RETAINED_MODEL_LIBRARY_LOCK,
    });
    assert.equal(unsafeResult.ok, false);
    assert.equal(unsafeResult.code, 'PROJECT_CONTACT_POWER_SHORT');
    return stable({
      initialProject: opened.session.saveText(),
      runtimeProject: opened.session.runtimeProject,
      runtimeSupport: opened.session.runtimeSupport,
      temperatureWorker: temperatureControl.worker,
      lcd: { status: lcd.status, lines: lcd.lines, latchedBytes: lcd.latchedBytes },
      selectorBefore,
      selectorTransition: selectorControl.transition,
      selectorAfter,
      unsafeCode: unsafeResult.code,
    });
  };

  const retainedBefore = retainedJourney(resolveModelLibrary(RETAINED_MODEL_LIBRARY_LOCK).implementation);
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'x56-hostile-current-'));
  try {
    await symlink(join(repositoryRoot, 'node_modules'), join(temporaryRoot, 'node_modules'), 'dir');
    for (const directory of ['src', 'expansion-drafts', 'c3', 'compiler', 'stm32']) {
      await cp(join(repositoryRoot, directory), join(temporaryRoot, directory), { recursive: true });
    }
    const resolverPath = join(temporaryRoot, 'src/model-library-current-resolver.mjs');
    const original = await readFile(resolverPath, 'utf8');
    const hostile = original.replace(
        'createCharacterLcdDecoder(mapping) { return createCharacterLcd4BitDecoder(mapping); },',
        `createCharacterLcdDecoder() { return {
          consume: () => ({ status: 'hostile-current', initialized: true, displayOn: true,
            lines: ['MUTATED', 'CURRENT'], latchedBytes: 0, error: null }),
          snapshot: () => ({ status: 'hostile-current', initialized: true, displayOn: true,
            lines: ['MUTATED', 'CURRENT'], latchedBytes: 0, error: null }),
        }; },`,
      );
    assert.notEqual(hostile, original);
    assert.match(hostile, /status: 'hostile-current'/u);
    await writeFile(resolverPath, hostile);
    const temperaturePath = join(temporaryRoot,
      'expansion-drafts/temperature-analogue-sensor-v1.mjs');
    const temperatureSource = await readFile(temperaturePath, 'utf8');
    const hostileTemperature = temperatureSource.replace(
      'return (temperatureC - TEMPERATURE_ZERO_VOLT_C) / TEMPERATURE_C_PER_VOLT;',
      'return 4.999;',
    );
    assert.notEqual(hostileTemperature, temperatureSource);
    await writeFile(temperaturePath, hostileTemperature);
    const hostileLibrary = await import(`${pathToFileURL(join(temporaryRoot,
      'src/model-library.mjs')).href}?hostile=${Date.now()}`);
    const hostileCurrent = hostileLibrary.resolveModelLibrary(
      hostileLibrary.CURRENT_MODEL_LIBRARY_LOCK,
    ).implementation;
    const hostileTemperatureModule = await import(`${pathToFileURL(temperaturePath).href}?hostile=${Date.now()}`);
    assert.equal(hostileTemperatureModule.temperatureCToVoltage(25), 4.999);
    assert.equal(hostileCurrent.evaluateProduction('sensor.temperature-analogue-v1', {
      temperatureC: 25,
    }).result.outputVolts, 1.875);
    const hostileDraft = hostileCurrent.validateCandidateDraft(JSON.parse(temperatureExample.text), {
      modelLibraryLock: hostileLibrary.CURRENT_MODEL_LIBRARY_LOCK,
    });
    assert.equal(hostileDraft.ok, true);
    assert.equal(hostileDraft.code, 'PROJECT_CONTACT_DRAFT');
    assert.equal(hostileDraft.reconstruction.runnable.ok, false);
    assert.equal(hostileDraft.reconstruction.runnable.code, 'MODEL_LIBRARY_PRODUCTION_MISMATCH');
    const hostileOpen = hostileCurrent.openCandidateUiSession(temperatureExample.text, {
      modelLibraryLock: hostileLibrary.CURRENT_MODEL_LIBRARY_LOCK,
    });
    assert.equal(hostileOpen.ok, true);
    assert.equal(hostileOpen.session.runnable.ok, false);
    assert.equal(hostileOpen.session.runnable.code, 'MODEL_LIBRARY_PRODUCTION_MISMATCH');
    const hostileLcd = hostileCurrent.createCharacterLcdDecoder({}).consume([]);
    assert.deepEqual(hostileLcd.lines, ['MUTATED', 'CURRENT']);

    const retainedAfter = retainedJourney(hostileLibrary.resolveModelLibrary(
      hostileLibrary.RETAINED_MODEL_LIBRARY_LOCK,
    ).implementation);
    assert.deepEqual(retainedAfter, retainedBefore);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('approved AVR candidate envelope validates its authored candidate graph without nested-object guessing', () => {
  const profile = profiles[0];
  const component = { id: 'board-1', type: profile, properties: {}, controls: {} };
  const envelope = { schema: 'intent-mcu-project-contact-persistence@1',
    project: { unrelated: true }, candidateCircuit: { components: [component], nets: [] } };
  assert.equal(validateProjectModelLibrary(CURRENT_MODEL_LIBRARY_LOCK, profile, envelope).ok, true);
  const arbitrary = { wrapper: { circuit: envelope.candidateCircuit } };
  assert.equal(validateProjectModelLibrary(CURRENT_MODEL_LIBRARY_LOCK, profile, arbitrary).code,
    'MODEL_LIBRARY_PROJECT_COMPONENTS');
});

test('trusted migration reports unchanged real semantics while controlled test-only deltas stay classified', () => {
  const preview = modelLibraryMigrationPreview(RETAINED_MODEL_LIBRARY_LOCK, CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(preview.ok, true);
  assert.equal(preview.migrationRequired, true);
  assert.equal(preview.semanticChanges.length, 0);
  assert.equal(preview.rendererChanges.length, 0);
  assert.equal(preview.unchanged.length, 25);

  const [retained] = trustedModelLibraryManifests();
  const semantic = structuredClone(retained.entries);
  const resistorIndex = semantic.findIndex((entry) => entry.componentType === 'resistor.fixed-v1');
  const buttonIndex = semantic.findIndex((entry) => entry.componentType === 'button.momentary-v1');
  assert.notEqual(resistorIndex, -1); assert.notEqual(buttonIndex, -1);
  semantic[resistorIndex].semantic.pins[0].role = 'changed-test-role';
  semantic[resistorIndex].semantic.properties.ohms.default += 1;
  semantic[resistorIndex].semantic.support.status = 'controlled-test-status';
  semantic[resistorIndex].semantic.support.limitations.push('Controlled test-only limitation');
  semantic[resistorIndex].semantic.internalTerminalGroups = [{ pin: 'A', terminals: ['A-test'] }];
  semantic[resistorIndex].behaviorContractSha256 = 'b'.repeat(64);
  semantic[buttonIndex].semantic.controls = [];
  semantic[buttonIndex].behaviorContractSha256 = 'd'.repeat(64);
  const renderer = structuredClone(semantic);
  const rendererIndex = renderer.findIndex((_, index) => index !== resistorIndex && index !== buttonIndex);
  renderer[rendererIndex].rendererContractSha256 = 'c'.repeat(64);
  const diff = compareModelLibraryEntries(retained.entries, renderer);
  assert.equal(diff.semanticChanges.length, 2);
  assert.equal(diff.semanticChanges[0].kind, 'behavior-contract');
  const categories = diff.semanticChanges.flatMap((change) => change.changes.map((item) => item.category));
  for (const category of ['pin-role', 'property-default', 'profile-support',
    'documented-limitations', 'internal-connectivity', 'control-removed']) assert(categories.includes(category), category);
  assert.equal(diff.rendererChanges.length, 1);
  assert.equal(diff.rendererChanges[0].kind, 'renderer-only');
  assert.equal(diff.unchanged.length, 22);
});
