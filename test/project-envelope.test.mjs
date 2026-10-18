// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_PROJECT_BRIEF_SCHEMA, LEGACY_PROJECT_ENVELOPE_SCHEMA,
  PREVIOUS_PROJECT_ENVELOPE_SCHEMA, PROJECT_BRIEF_SCHEMA, PROJECT_ENVELOPE_SCHEMA,
  canonicalProjectEnvelope, emptyProjectBrief, prepareProjectEnvelope,
} from '../src/project-envelope.mjs';

const profile = 'board.example-v1';
const adapters = {
  [profile]: {
    schemas: ['example-project@1'],
    prepare(value) {
      if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['layout', 'name', 'profile', 'schema'].sort())
        || value.schema !== 'example-project@1' || value.profile !== profile
        || typeof value.name !== 'string' || typeof value.layout?.rotation !== 'number') throw new Error('EXAMPLE_INVALID');
      return { project: structuredClone(value), prepared: { accepted: true } };
    },
  },
};
const project = { schema: 'example-project@1', profile, name: 'Example', layout: { rotation: 90 } };

test('canonical envelope is deterministic and reopens with explicit profile identity', () => {
  const text = canonicalProjectEnvelope(profile, project, adapters);
  const opened = prepareProjectEnvelope(text, adapters);
  assert.equal(opened.ok, true);
  assert.equal(opened.profile, profile);
  assert.deepEqual(opened.project, project);
  assert.equal(opened.canonical, text);
  assert.equal(JSON.parse(text).schema, PROJECT_ENVELOPE_SCHEMA);
});

test('known legacy project migrates without changing its authored document', () => {
  const opened = prepareProjectEnvelope(JSON.stringify(project), adapters);
  assert.equal(opened.code, 'PROJECT_ENVELOPE_MIGRATED');
  assert.equal(opened.report.legacy, true);
  assert.equal(prepareProjectEnvelope(opened.canonical, adapters).canonical, opened.canonical);
});

test('v1 envelope migrates with an explicit empty inert brief', () => {
  const old = { schema: LEGACY_PROJECT_ENVELOPE_SCHEMA, profile, project };
  const opened = prepareProjectEnvelope(JSON.stringify(old), adapters);
  assert.equal(opened.code, 'PROJECT_ENVELOPE_MIGRATED');
  assert.deepEqual(opened.brief, emptyProjectBrief());
  assert.equal(JSON.parse(opened.canonical).schema, PROJECT_ENVELOPE_SCHEMA);
  assert(opened.report.defaultsAdded.includes('empty project brief'));
});

test('rc31 v2 envelope migrates criteria to explicit empty traceability', () => {
  const previous = {
    schema: PREVIOUS_PROJECT_ENVELOPE_SCHEMA,
    profile,
    brief: { schema: LEGACY_PROJECT_BRIEF_SCHEMA, purpose: 'Legacy goal', inputs: [], outputs: [],
      boundaryCases: [], acceptanceCriteria: [{ id: 'REQ-OLD', text: 'Old criterion' }] },
    project,
  };
  const opened = prepareProjectEnvelope(JSON.stringify(previous), adapters);
  assert.equal(opened.code, 'PROJECT_ENVELOPE_MIGRATED');
  assert.deepEqual(opened.brief.acceptanceCriteria[0], {
    id: 'REQ-OLD', text: 'Old criterion', codeRefs: [], testRefs: [],
  });
  assert(opened.report.defaultsAdded.includes('empty requirement code/test references'));
  assert.equal(JSON.parse(opened.canonical).schema, PROJECT_ENVELOPE_SCHEMA);
});

test('X01 brief round-trips purpose, inputs, outputs, boundaries and unevaluated acceptance IDs', () => {
  const brief = {
    schema: PROJECT_BRIEF_SCHEMA,
    purpose: 'Turn the teaching LED on only when the button is pressed.',
    inputs: ['D2 button level'],
    outputs: ['D13 LED level'],
    boundaryCases: ['Reset while button is pressed', 'Disconnected ground'],
    acceptanceCriteria: [
      { id: 'REQ-LED-ON', text: 'Observed D13 is HIGH while D2 is LOW.',
        codeRefs: ['main.ino:12-18'], testRefs: ['TEST-BUTTON-LOW'] },
      { id: 'REQ-RESET', text: 'Reset does not manufacture a passing observation.',
        codeRefs: ['main.ino:4'], testRefs: ['TEST-RESET'] },
    ],
  };
  const text = canonicalProjectEnvelope(profile, project, adapters, brief);
  const opened = prepareProjectEnvelope(text, adapters);
  assert.deepEqual(opened.brief, brief);
  assert.deepEqual(JSON.parse(opened.canonical).brief, brief);
  assert.equal(opened.canonical, text);
});

test('X01 brief rejects unknown fields, duplicate IDs, malformed IDs and result authority', () => {
  const base = { schema: PROJECT_BRIEF_SCHEMA, purpose: '', inputs: [], outputs: [],
    boundaryCases: [], acceptanceCriteria: [] };
  const wrap = (brief) => JSON.stringify({ schema: PROJECT_ENVELOPE_SCHEMA, profile, brief, project });
  assert.equal(prepareProjectEnvelope(wrap({ ...base, extra: true }), adapters).code, 'PROJECT_BRIEF_SHAPE');
  assert.equal(prepareProjectEnvelope(wrap({ ...base, acceptanceCriteria: [
    { id: 'REQ-1', text: 'One', codeRefs: [], testRefs: [] },
    { id: 'REQ-1', text: 'Two', codeRefs: [], testRefs: [] },
  ] }), adapters).code, 'PROJECT_BRIEF_CRITERION_DUPLICATE');
  assert.equal(prepareProjectEnvelope(wrap({ ...base, acceptanceCriteria: [
    { id: 'bad id', text: 'No', codeRefs: [], testRefs: [] },
  ] }), adapters).code, 'PROJECT_BRIEF_CRITERION_ID');
  assert.equal(prepareProjectEnvelope(wrap({ ...base, verdict: 'passed' }), adapters).code, 'PROJECT_BRIEF_SHAPE');
  assert.equal(prepareProjectEnvelope(wrap({ ...base, acceptanceCriteria: [
    { id: 'REQ-1', text: 'No', codeRefs: ['/etc/passwd'], testRefs: [] },
  ] }), adapters).code, 'PROJECT_BRIEF_CODE_REFERENCE');
  assert.equal(prepareProjectEnvelope(wrap({ ...base, acceptanceCriteria: [
    { id: 'REQ-1', text: 'No', codeRefs: [], testRefs: ['bad test'] },
  ] }), adapters).code, 'PROJECT_BRIEF_TEST_REFERENCE');
  assert.equal(prepareProjectEnvelope(wrap({ ...base, acceptanceCriteria: [
    { id: 'REQ-1', text: 'No', codeRefs: ['main.c', 'main.c'], testRefs: [] },
  ] }), adapters).code, 'PROJECT_BRIEF_REFERENCE_DUPLICATE');
});

test('strict failures reject duplicate keys, unknown versions and profile mismatches', () => {
  assert.equal(prepareProjectEnvelope('{"schema":"x","schema":"y"}', adapters).code, 'DUPLICATE_KEY');
  assert.equal(prepareProjectEnvelope('{"schema":"unknown@1"}', adapters).code, 'PROJECT_ENVELOPE_VERSION');
  const mismatch = { schema: PROJECT_ENVELOPE_SCHEMA, profile, brief: emptyProjectBrief(),
    project: { ...project, profile: 'board.other-v1' } };
  assert.equal(prepareProjectEnvelope(JSON.stringify(mismatch), adapters).code, 'PROJECT_ENVELOPE_PROFILE_MISMATCH');
});

test('executable and runtime authority are rejected from normalized project data', () => {
  const authorityAdapters = { [profile]: { schemas: ['bad@1'], prepare: (value) => ({ project: value }) } };
  for (const field of ['artifact', 'firmwareHex', 'runtime', 'sessionId', 'capability', 'verdict']) {
    const value = { schema: 'bad@1', profile, [field]: 'not allowed' };
    assert.equal(prepareProjectEnvelope(JSON.stringify(value), authorityAdapters).code,
      'PROJECT_ENVELOPE_EXECUTABLE_AUTHORITY');
  }
});

test('raw authority is rejected before an adapter can silently discard it', () => {
  const strippingAdapters = { [profile]: {
    schemas: ['strip@1'],
    prepare: (value) => ({ project: { schema: value.schema, profile: value.profile, name: 'stripped' } }),
  } };
  const raw = { schema: 'strip@1', profile, name: 'unsafe', firmwareBytes: 'AA==' };
  assert.equal(prepareProjectEnvelope(JSON.stringify(raw), strippingAdapters).code,
    'PROJECT_ENVELOPE_EXECUTABLE_AUTHORITY');
});

test('documented dirty-null legacy artifact metadata remains inert and accepted', () => {
  const inertAdapters = { [profile]: { schemas: ['inert@1'], prepare: (value) => ({ project: value }) } };
  const value = { schema: 'inert@1', profile,
    artifact: { status: 'dirty', inputIdentitySha256: null, artifactIdentitySha256: null } };
  assert.equal(prepareProjectEnvelope(JSON.stringify(value), inertAdapters).ok, true);
});
