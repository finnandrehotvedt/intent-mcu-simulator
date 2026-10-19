// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  CURRENT_MODEL_LIBRARY_LOCK, RETAINED_MODEL_LIBRARY_LOCK,
  compareModelLibraryEntries, modelLibraryMigrationPreview, normalizeModelLibraryLock,
  resolveModelLibrary, runModelLibraryConformance, trustedModelLibraryManifests,
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

test('trusted immutable snapshots have 25 exact cells and independently recomputable hashes', () => {
  const manifests = trustedModelLibraryManifests();
  assert.equal(manifests.length, 2);
  for (const manifest of manifests) {
    assert.equal(manifest.entries.length, 25);
    const aggregate = structuredClone(manifest); delete aggregate.manifestSha256;
    assert.equal(sha256(aggregate), manifest.manifestSha256);
    for (const entry of manifest.entries) {
      assert.equal(sha256(entry.semantic), entry.behaviorContractSha256);
      assert.equal(sha256(entry.renderer), entry.rendererContractSha256);
    }
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
      version: forged.version, manifestSha256: forged.manifestSha256 };
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
