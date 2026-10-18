// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  EXPECTATION_REFERENCE_SCHEMA,
  createExpectationReference,
  parseExpectationReference,
} from '../src/expectation-reference.mjs';
import {
  PROJECT_BRIEF_SCHEMA, canonicalProjectEnvelope,
} from '../src/project-envelope.mjs';
import {
  PROJECT_PATCH_SCHEMA, REFERENCED_PROJECT_PATCH_SCHEMA,
  projectTextSha256, reviewProjectPatch,
} from '../src/project-patch.mjs';
import {
  SCENARIO_TIMELINE_PROFILE, defaultThermostatScenarioTimeline,
} from '../src/scenario-timeline.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const PROFILE = SCENARIO_TIMELINE_PROFILE;
const adapters = Object.freeze({
  [PROFILE]: Object.freeze({
    schemas: Object.freeze(['x25-test-project@1']),
    prepare(value) {
      if (!value || value.schema !== 'x25-test-project@1' || value.profile !== PROFILE
          || typeof value.source !== 'string' || !Array.isArray(value.components)
          || !Array.isArray(value.nets)) throw new Error('X25_TEST_PROJECT_INVALID');
      return { project: structuredClone(value) };
    },
  }),
});

function project(source = 'if (temperature < 30) heat();') {
  return {
    schema: 'x25-test-project@1', profile: PROFILE, source,
    components: [{ id: 'controller-1', type: 'board' }],
    nets: [{ id: 'net-d13', endpoints: ['controller-1:D13', 'led-1:A'] }],
  };
}

function brief() {
  return {
    schema: PROJECT_BRIEF_SCHEMA,
    purpose: 'Verify the thermostat boundary.',
    inputs: ['A1 temperature', 'D2 button'],
    outputs: ['D13 heater indicator'],
    boundaryCases: ['Below', 'Equal', 'Above', 'Disabled'],
    acceptanceCriteria: [{
      id: 'REQ-THERMOSTAT', text: 'D13 is HIGH only below the threshold while enabled.',
      codeRefs: ['main.ino:1'], testRefs: ['TEST-EQUALITY'],
    }],
    openAssumptions: [],
    requiredCapabilities: [],
  };
}

function envelope(source = 'if (temperature < 30) heat();', timeline = defaultThermostatScenarioTimeline()) {
  return canonicalProjectEnvelope(PROFILE, project(source), adapters, brief(), timeline);
}

async function reference() {
  const result = await createExpectationReference(envelope(), adapters, PROFILE);
  assert.equal(result.ok, true);
  return result;
}

async function referencedPatch(proposedProject, overrides = {}) {
  const locked = await reference();
  const current = envelope();
  return {
    current, locked,
    value: {
      schema: REFERENCED_PROJECT_PATCH_SCHEMA,
      profile: PROFILE,
      baseProjectSha256: await projectTextSha256(current),
      expectationReferenceSha256: locked.sha256,
      description: 'Change only the thermostat firmware.',
      proposedProject,
      ...overrides,
    },
  };
}

test('X25 canonical reference round-trips exactly and one expected D13 bit changes identity', async () => {
  const locked = await reference();
  assert.equal(locked.reference.schema, EXPECTATION_REFERENCE_SCHEMA);
  assert.equal(locked.executableAuthority, false);
  assert.equal(locked.verdictAuthority, false);
  const reopened = await parseExpectationReference(locked.canonical);
  assert.equal(reopened.ok, true);
  assert.equal(reopened.canonical, locked.canonical);
  assert.equal(reopened.sha256, locked.sha256);

  const changed = JSON.parse(locked.canonical);
  const equality = changed.scenarioTimeline.scenarios
    .find((scenario) => scenario.id === 'THERM-SCENARIO-EQUALITY-ENABLED');
  equality.events.at(-1).level = !equality.events.at(-1).level;
  const changedResult = await parseExpectationReference(JSON.stringify(changed));
  assert.equal(changedResult.ok, true);
  assert.notEqual(changedResult.sha256, locked.sha256);
});

test('X25 reference rejects duplicate keys, unknown data, URLs and executable or verdict authority', async () => {
  const locked = await reference();
  const value = JSON.parse(locked.canonical);
  const duplicate = locked.canonical.replace(
    `"schema": "${EXPECTATION_REFERENCE_SCHEMA}"`,
    `"schema": "${EXPECTATION_REFERENCE_SCHEMA}",\n  "schema": "${EXPECTATION_REFERENCE_SCHEMA}"`,
  );
  assert.equal((await parseExpectationReference(duplicate)).code, 'DUPLICATE_KEY');
  assert.equal((await parseExpectationReference(JSON.stringify({ ...value, extra: true }))).code,
    'EXPECTATION_REFERENCE_SHAPE');
  assert.equal((await parseExpectationReference(JSON.stringify({ ...value, verdict: 'passed' }))).code,
    'EXPECTATION_REFERENCE_AUTHORITY');
  assert.equal((await parseExpectationReference(JSON.stringify({ ...value, firmwareBytes: 'AA==' }))).code,
    'EXPECTATION_REFERENCE_AUTHORITY');
  assert.equal((await parseExpectationReference(JSON.stringify({
    ...value, boundaryCases: ['See https://example.invalid'],
  }))).code, 'EXPECTATION_REFERENCE_URL');
});

test('X25 referenced source-only patch is applicable and keeps tests separate and unchanged', async () => {
  const proposed = JSON.parse(envelope('if (temperature <= 30) heat();'));
  const { current, locked, value } = await referencedPatch(proposed);
  const reviewed = await reviewProjectPatch(JSON.stringify(value), current, adapters, PROFILE, locked);
  assert.equal(reviewed.ok, true);
  assert.equal(reviewed.expectationReferenceState, 'locked');
  assert.equal(reviewed.expectationReferenceSha256, locked.sha256);
  assert.deepEqual(reviewed.implementationChanges.map(({ kind, action }) => ({ kind, action })),
    [{ kind: 'source', action: 'changed' }]);
  assert.deepEqual(reviewed.testExpectationChanges, []);
  assert.equal(reviewed.applyBlocked, false);
});

test('X25 changed equality expectation is visible separately and blocks combined Apply', async () => {
  const timeline = defaultThermostatScenarioTimeline();
  const equality = timeline.scenarios.find((scenario) => scenario.id === 'THERM-SCENARIO-EQUALITY-ENABLED');
  equality.events.at(-1).level = true;
  const proposed = JSON.parse(envelope('if (temperature <= 30) heat();', timeline));
  const { current, locked, value } = await referencedPatch(proposed);
  const reviewed = await reviewProjectPatch(JSON.stringify(value), current, adapters, PROFILE, locked);
  assert.equal(reviewed.ok, true);
  assert.equal(reviewed.implementationChanges.length, 1);
  assert.equal(reviewed.testExpectationChanges.length, 1);
  assert.equal(reviewed.testExpectationChanges[0].kind, 'expectation');
  assert.equal(reviewed.testExpectationChanges[0].summary,
    'Expected D13 level changed from LOW to HIGH');
  assert.equal(reviewed.applyBlocked, true);
  assert.equal(reviewed.applyBlockCode, 'PROJECT_PATCH_EXPECTATIONS_CHANGED');

  const testOnly = structuredClone(value);
  testOnly.proposedProject.project.source = project().source;
  const testOnlyReview = await reviewProjectPatch(JSON.stringify(testOnly), current, adapters, PROFILE, locked);
  assert.equal(testOnlyReview.ok, true);
  assert.equal(testOnlyReview.implementationChanges.length, 0);
  assert.equal(testOnlyReview.testExpectationChanges.length, 1);
});

test('X25 stale and missing references fail while v1 remains explicitly unlocked', async () => {
  const proposed = JSON.parse(envelope('if (temperature <= 30) heat();'));
  const { current, locked, value } = await referencedPatch(proposed);
  assert.equal((await reviewProjectPatch(JSON.stringify(value), current, adapters, PROFILE, null)).code,
    'PROJECT_PATCH_EXPECTATION_REFERENCE_REQUIRED');
  const stale = { ...value, expectationReferenceSha256: '0'.repeat(64) };
  assert.equal((await reviewProjectPatch(JSON.stringify(stale), current, adapters, PROFILE, locked)).code,
    'PROJECT_PATCH_EXPECTATION_REFERENCE_STALE');

  const v1 = {
    schema: PROJECT_PATCH_SCHEMA,
    profile: PROFILE,
    baseProjectSha256: await projectTextSha256(current),
    description: 'Change only the thermostat firmware.',
    proposedProject: proposed,
  };
  const reviewed = await reviewProjectPatch(JSON.stringify(v1), current, adapters, PROFILE);
  assert.equal(reviewed.ok, true);
  assert.equal(reviewed.expectationReferenceState, 'unlocked-v1');
  assert.equal(reviewed.expectationReferenceSha256, null);
});
