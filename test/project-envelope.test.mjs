// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECT_ENVELOPE_SCHEMA, canonicalProjectEnvelope, prepareProjectEnvelope,
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

test('strict failures reject duplicate keys, unknown versions and profile mismatches', () => {
  assert.equal(prepareProjectEnvelope('{"schema":"x","schema":"y"}', adapters).code, 'DUPLICATE_KEY');
  assert.equal(prepareProjectEnvelope('{"schema":"unknown@1"}', adapters).code, 'PROJECT_ENVELOPE_VERSION');
  const mismatch = { schema: PROJECT_ENVELOPE_SCHEMA, profile, project: { ...project, profile: 'board.other-v1' } };
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
