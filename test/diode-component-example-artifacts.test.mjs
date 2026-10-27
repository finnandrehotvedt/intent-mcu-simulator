// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateDiodeAuthoringGraph } from '../expansion-drafts/diode-components-v1.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { validateBounded3v3AuthoringGraph } from '../src/bounded-3v3-authoring-contracts.mjs';
import { Esp32C3CircuitEditor, ESP32C3_BOARD_DEFINITION } from '../src/esp32c3-public-circuit.mjs';
import { C3_PUBLIC_PROJECT_SCHEMA, normalizeEsp32C3PublicProject } from '../src/esp32c3-public-workbench.mjs';
import { prepareProjectEnvelope } from '../src/project-envelope.mjs';
import { Rp2040PicoCircuitEditor, RP2040_PICO_BOARD_DEFINITION } from '../src/rp2040-pico-circuit.mjs';
import { RP2040_PUBLIC_PROJECT_SCHEMA, normalizeRp2040PublicProject } from '../src/rp2040-public-workbench.mjs';
import { Stm32CircuitEditor, STM32_BOARD_DEFINITION } from '../src/stm32-public-circuit.mjs';
import { STM32_EDITABLE_PROJECT_SCHEMA, normalizeStm32PublicProject } from '../src/stm32-public-workbench.mjs';

await import('../scripts/generate-diode-component-examples.mjs');
const ROOT = new URL('../examples/diode-components/', import.meta.url);
const AVR = 'board.atmega328p-16mhz-v1';
const TYPES = ['diode.rectifier-v1', 'diode.schottky-v1', 'diode.zener-v1'];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const narrow = {
  'board.rp2040-pico-v1': { schema: RP2040_PUBLIC_PROJECT_SCHEMA, normalize: normalizeRp2040PublicProject,
    Editor: Rp2040PicoCircuitEditor, board: RP2040_PICO_BOARD_DEFINITION },
  'board.esp32-c3-devmodule-v1': { schema: C3_PUBLIC_PROJECT_SCHEMA, normalize: normalizeEsp32C3PublicProject,
    Editor: Esp32C3CircuitEditor, board: ESP32C3_BOARD_DEFINITION },
  'board.stm32f429zi-nucleo144-v1': { schema: STM32_EDITABLE_PROJECT_SCHEMA, normalize: normalizeStm32PublicProject,
    Editor: Stm32CircuitEditor, board: STM32_BOARD_DEFINITION },
};
const adapters = {
  [AVR]: { schemas: ['intent-mcu-project-contact-persistence@1'], prepare(value) {
    const opened = openCandidateUiSession(JSON.stringify(value));
    if (!opened.ok) throw Object.assign(new Error(opened.code), opened);
    return { project: JSON.parse(opened.session.saveText()), prepared: opened.session };
  }, authoringAdmission: ({ project }) => validateDiodeAuthoringGraph(project.candidateCircuit) },
  ...Object.fromEntries(Object.entries(narrow).map(([profile, item]) => [profile, {
    schemas: [item.schema], prepare: (value) => ({ project: item.normalize(value) }),
    authoringAdmission: ({ project }) => validateBounded3v3AuthoringGraph({
      board: item.board, components: project.circuit.components, nets: project.circuit.nets,
    }),
  }])),
};

test('CMP-007/008/009 provide one hashed canonical authoring example for each exact profile', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  assert.equal(manifest.schema, 'intent-mcu-diode-component-example-manifest@1');
  assert.deepEqual(manifest.requirementIds, ['CMP-007', 'CMP-008', 'CMP-009']);
  assert.equal(manifest.entries.length, 4);
  assert.deepEqual(Object.keys(manifest.profileBehavior).sort(), [AVR, ...Object.keys(narrow)].sort());
  assert(Object.values(manifest.profileBehavior).every((value) => /authoring-only.*no nonlinear I-V/u.test(value)));
  for (const entry of manifest.entries) {
    const bytes = await readFile(new URL(entry.file, ROOT), 'utf8');
    assert.equal(sha256(bytes), entry.projectSha256, entry.id);
    assert.deepEqual(entry.requirementIds, manifest.requirementIds);
    assert.deepEqual(entry.componentTypes, TYPES);
    assert.equal(entry.runtimeUnavailableCode, 'DIODE_NONLINEAR_MODEL_UNAVAILABLE');
    assert.equal(entry.namedChain.length, 4);
    assert.match(entry.limitations, /No nonlinear I-V solver/u);
    const opened = prepareProjectEnvelope(bytes, adapters);
    assert.equal(opened.ok, true, `${entry.id}:${opened.code}`);
    assert.equal(opened.report.modelLibrary.authoringOnly, true, entry.id);
    assert.equal(opened.report.modelLibrary.executableAuthority, false, entry.id);
    assert.equal(opened.report.modelLibrary.runtimeUnavailableCode, 'MODEL_LIBRARY_COMPONENT_UNAVAILABLE', entry.id);
    const sourceText = entry.profile === AVR
      ? opened.project.project.source.files[0].content : opened.project.source;
    assert.equal(sha256(sourceText), entry.sourceSha256, `${entry.id}:source`);
    const circuit = entry.profile === AVR ? opened.project.candidateCircuit : opened.project.circuit;
    assert.deepEqual(circuit.components.filter(({ type }) => TYPES.includes(type)).map(({ type }) => type).sort(),
      [...TYPES].sort());
    for (const id of entry.componentIds) {
      assert.equal(circuit.nets.flatMap(({ endpoints }) => endpoints)
        .filter(({ component }) => component === id).length, 2, `${entry.id}:${id}`);
    }
  }
});

test('all four diode examples reopen in their owning editor and remain non-executable', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', ROOT), 'utf8'));
  for (const entry of manifest.entries) {
    const envelope = JSON.parse(await readFile(new URL(entry.file, ROOT), 'utf8'));
    if (entry.profile === AVR) {
      const opened = openCandidateUiSession(JSON.stringify(envelope.project));
      assert.equal(opened.ok, true, opened.code);
      assert.equal(opened.session.runnable.code, 'DIODE_NONLINEAR_MODEL_UNAVAILABLE');
      assert.deepEqual(opened.session.runnable.details, [...entry.componentIds].sort());
    } else {
      const owner = narrow[entry.profile];
      const project = owner.normalize(envelope.project);
      const editor = new owner.Editor(project.circuit);
      assert.deepEqual(editor.snapshot().draft, project.circuit);
      assert.equal(editor.snapshot().validation.ok, false);
      assert.match(editor.snapshot().validation.code, /MODEL_LIBRARY_COMPONENT_UNAVAILABLE/u);
    }
  }
});

