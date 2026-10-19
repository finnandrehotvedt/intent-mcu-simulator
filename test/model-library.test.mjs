// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DEFAULT_CIRCUIT } from '../src/default-circuit.mjs';
import {
  CircuitRuntime, MODEL_LIBRARY_TEST_AUTHORITY, validateCircuit,
} from '../src/circuit-engine.mjs';
import { RuntimeKernel } from '../src/runtime-kernel.mjs';
import { createRp2040PicoCircuitDraft, validateRp2040PicoCircuit } from '../src/rp2040-pico-circuit.mjs';
import { createEsp32C3CircuitDraft, validateEsp32C3Circuit } from '../src/esp32c3-public-circuit.mjs';
import { createStm32CircuitDraft, validateStm32Circuit } from '../src/stm32-public-circuit.mjs';
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
    [CURRENT_MODEL_LIBRARY_LOCK, 'intent-mcu-model-bundle-current-x56@2'],
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
    'src/candidate-project-session.mjs', 'staging/main.mjs']) {
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
