// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { createExampleProject, exampleCatalog } from '../src/example-projects.mjs';
import { canonicalProjectJson, parseProjectV2, validateProjectV2 } from '../src/project-v2.mjs';
import {
  ARTIFACT_REFERENCE_SCHEMA,
  PROJECT_V3_LIMIT,
  canonicalProjectV3Json,
  migrateProjectV2ToV3,
  parseProjectV3,
  projectV3ControllerProfileStatus,
  validateProjectV3,
} from '../expansion-drafts/project-v3-envelope.mjs';

const clone = (value) => structuredClone(value);

function migratedExample(id = 'blink') {
  const example = createExampleProject(id).project;
  const validated = validateProjectV2(example);
  assert.equal(validated.ok, true, id);
  const migrated = migrateProjectV2ToV3(validated.project);
  assert.equal(migrated.ok, true, id);
  return { v2: validated.project, migrated };
}

test('all real validated examples migrate without changing v2 source graph layout or instruments', () => {
  for (const { id } of exampleCatalog()) {
    const example = createExampleProject(id).project;
    const before = JSON.stringify(example);
    const validated = validateProjectV2(example);
    const migrated = migrateProjectV2ToV3(example);
    assert.equal(validated.ok, true, id);
    assert.equal(migrated.ok, true, id);
    assert.equal(JSON.stringify(example), before, `${id} v2 input mutated`);
    assert.deepEqual(migrated.project.source, validated.project.source, id);
    assert.deepEqual(migrated.project.circuit, validated.project.circuit, id);
    assert.deepEqual(migrated.project.layout, validated.project.layout, id);
    assert.deepEqual(migrated.project.instruments, validated.project.instruments, id);
    assert.equal(migrated.report.originalInputUntouched, true);
    assert.equal(migrated.report.oneWay, true);
    assert.deepEqual(migrated.project.artifact, {
      schema: ARTIFACT_REFERENCE_SCHEMA,
      status: 'dirty', profile: null,
      inputIdentitySha256: null, artifactIdentitySha256: null,
    });
  }
});

test('migration and v3 canonical roundtrip are deterministic while v2 remains accepted', () => {
  const { v2 } = migratedExample('pwm');
  const v2Text = canonicalProjectJson(v2);
  const first = migrateProjectV2ToV3(v2Text);
  const second = migrateProjectV2ToV3(v2Text);
  assert.equal(first.ok, true);
  assert.deepEqual(first, second);
  const canonical = canonicalProjectV3Json(first.project);
  const reopened = parseProjectV3(canonical);
  assert.equal(reopened.ok, true);
  assert.equal(canonicalProjectV3Json(reopened.project), canonical);
  assert.equal(parseProjectV2(v2Text).ok, true, 'existing production v2 importer regressed');
  assert.equal(v2Text, canonicalProjectJson(v2), 'v2 bytes changed after migration');
});

test('controller envelope is explicit and tied to the approved AVR adapter contract', () => {
  const { migrated } = migratedExample('adc');
  assert.equal(migrated.project.controller.profile, 'board.atmega328p-16mhz-v1');
  assert.equal(migrated.project.controller.adapterContract, 'intent-mcu-controller-adapter@1');
  assert.equal(migrated.project.controller.status, 'simulated');
  assert.equal(migrated.project.controller.capabilities.length > 0, true);
  assert.equal(migrated.project.controller.capabilities.some((item) => item.id === 'adc' && item.status === 'simulated'), true);
});

test('known compile candidates reject runtime distinctly and unknown profiles never fall back', () => {
  for (const profile of [
    'board.esp32-c3-devmodule-v1', 'board.rp2040-pico-v1',
    'board.stm32f429zi-nucleo144-v1',
  ]) {
    const { migrated } = migratedExample('blink');
    migrated.project.controller.profile = profile;
    migrated.project.controller.status = 'unsupported';
    migrated.project.controller.capabilities = [];
    const result = validateProjectV3(migrated.project);
    assert.equal(result.ok, false, profile);
    assert.equal(result.code, 'PROJECT_V3_CONTROLLER_RUNTIME_UNSUPPORTED', profile);
    assert.equal(projectV3ControllerProfileStatus(profile).known, true, profile);
    assert.equal(projectV3ControllerProfileStatus(profile).runtimeAllowed, false, profile);
  }
  assert.deepEqual(projectV3ControllerProfileStatus('board.esp32-c3-devmodule-v1'), {
    known: true,
    profile: 'board.esp32-c3-devmodule-v1',
    adapterStatus: 'unsupported',
    compilerStatus: 'pre-adoption-probe',
    compileCandidate: true,
    runtimeAllowed: false,
  });
  const { migrated } = migratedExample('blink');
  migrated.project.controller.profile = 'board.unknown-v1';
  migrated.project.controller.status = 'unsupported';
  migrated.project.controller.capabilities = [];
  assert.equal(validateProjectV3(migrated.project).code, 'PROJECT_V3_CONTROLLER_UNSUPPORTED');
  assert.equal(projectV3ControllerProfileStatus('board.unknown-v1').known, false);
});

test('controller capability, catalogue and exact top-level shape tampering fail closed', () => {
  const { migrated } = migratedExample('button');
  const missing = clone(migrated.project); delete missing.controller;
  assert.equal(validateProjectV3(missing).code, 'PROJECT_V3_SHAPE');
  const unknown = clone(migrated.project); unknown.untrusted = true;
  assert.equal(validateProjectV3(unknown).code, 'PROJECT_V3_SHAPE');
  const capability = clone(migrated.project); capability.controller.capabilities[0].status = 'unsupported';
  assert.equal(validateProjectV3(capability).code, 'PROJECT_V3_CONTROLLER');
  const catalogue = clone(migrated.project); catalogue.catalogue.version = 'future';
  assert.equal(validateProjectV3(catalogue).code, 'PROJECT_V3_CATALOGUE');
  const version = clone(migrated.project); version.schema = 'intent-mcu-project@4';
  assert.equal(validateProjectV3(version).code, 'PROJECT_V3_VERSION');
});

test('artifact identity remains a separate bounded reference and migration never trusts v2 build state', () => {
  const example = createExampleProject('blink').project;
  example.build = { status: 'succeeded', inputIdentity: 'a'.repeat(64), artifactIdentity: 'b'.repeat(64) };
  const migrated = migrateProjectV2ToV3(example);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.report.artifactIdentityCleared, true);
  const sourceBefore = JSON.stringify(migrated.project.source);
  const circuitBefore = JSON.stringify(migrated.project.circuit);
  const withArtifact = clone(migrated.project);
  withArtifact.artifact = {
    schema: ARTIFACT_REFERENCE_SCHEMA,
    status: 'succeeded', profile: withArtifact.controller.profile,
    inputIdentitySha256: 'c'.repeat(64), artifactIdentitySha256: 'd'.repeat(64),
  };
  assert.equal(validateProjectV3(withArtifact).ok, true);
  assert.equal(JSON.stringify(withArtifact.source), sourceBefore);
  assert.equal(JSON.stringify(withArtifact.circuit), circuitBefore);
  const incomplete = clone(withArtifact); incomplete.artifact.artifactIdentitySha256 = null;
  assert.equal(validateProjectV3(incomplete).code, 'PROJECT_V3_ARTIFACT');
  const wrongProfile = clone(withArtifact); wrongProfile.artifact.profile = 'board.rp2040-pico-v1';
  assert.equal(validateProjectV3(wrongProfile).code, 'PROJECT_V3_ARTIFACT');
});

test('malformed duplicate oversized and invalid v2/v3 inputs reject with bounded codes', () => {
  assert.equal(parseProjectV3('{').code, 'MALFORMED_JSON');
  assert.equal(parseProjectV3('{"schema":"intent-mcu-project@3","schema":"intent-mcu-project@3"}').code, 'DUPLICATE_KEY');
  assert.equal(parseProjectV3(`{"padding":"${'x'.repeat(PROJECT_V3_LIMIT)}"}`).code, 'INPUT_LIMIT');
  assert.equal(migrateProjectV2ToV3('{').code, 'V2_TO_V3_MALFORMED_JSON');
  assert.equal(migrateProjectV2ToV3(`{"padding":"${'x'.repeat(PROJECT_V3_LIMIT)}"}`).code, 'V2_TO_V3_INPUT_LIMIT');
  const missing = createExampleProject('blink').project; delete missing.source;
  assert.equal(migrateProjectV2ToV3(missing).code, 'V2_TO_V3_PROJECT_SHAPE');
  const wrongBoard = createExampleProject('blink').project; wrongBoard.boardProfile = 'board.rp2040-pico-v1';
  assert.equal(migrateProjectV2ToV3(wrongBoard).code, 'V2_TO_V3_PROJECT_VERSION');
});

test('v3 validator delegates nested project limits rather than weakening v2 rules', () => {
  const { migrated } = migratedExample('blink');
  const noMain = clone(migrated.project); noMain.source.files[0].name = 'helper.cpp';
  assert.equal(validateProjectV3(noMain).code, 'PROJECT_V3_PROJECT_SOURCE');
  const missingPosition = clone(migrated.project);
  delete missingPosition.layout.positions[missingPosition.circuit.components[0].id];
  assert.equal(validateProjectV3(missingPosition).code, 'PROJECT_V3_PROJECT_LAYOUT');
});
