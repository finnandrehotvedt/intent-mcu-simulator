// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';
import {
  PROJECT_PATCH_SCHEMA,
  createProjectPatchPrompt,
  projectTextSha256,
  reviewProjectPatch,
} from '../src/project-patch.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const PROFILE = 'board.test-v1';
const adapters = Object.freeze({
  [PROFILE]: Object.freeze({
    schemas: Object.freeze(['test-project@1']),
    prepare(value) {
      if (!value || value.schema !== 'test-project@1' || value.profile !== PROFILE
          || typeof value.source !== 'string' || !Array.isArray(value.components)
          || !Array.isArray(value.nets) || value.unsupported === true) throw new Error('TEST_PROJECT_INVALID');
      return { project: structuredClone(value) };
    },
  }),
});

function project() {
  return {
    schema: 'test-project@1', profile: PROFILE, source: 'before',
    components: [{ id: 'board-1', type: 'board' }, { id: 'led-1', type: 'led' }],
    nets: [{ id: 'net-1', endpoints: ['board-1:D1', 'led-1:A'] }],
  };
}

function envelope(value = project()) {
  return canonicalProjectEnvelope(PROFILE, value, adapters, emptyProjectBrief());
}

async function patch(overrides = {}) {
  const current = envelope();
  const proposed = JSON.parse(current);
  proposed.project.source = 'after';
  proposed.project.components.push({ id: 'resistor-1', type: 'resistor' });
  proposed.project.nets[0].endpoints[1] = 'resistor-1:A';
  return {
    current,
    value: {
      schema: PROJECT_PATCH_SCHEMA,
      profile: PROFILE,
      baseProjectSha256: await projectTextSha256(current),
      description: 'Add a resistor and update the source.',
      proposedProject: proposed,
      ...overrides,
    },
  };
}

test('X05 prompt binds the exact project without calling or granting AI authority', async () => {
  const current = envelope();
  const prompt = await createProjectPatchPrompt('Add a resistor.', current, adapters, PROFILE);
  assert.match(prompt, new RegExp(await projectTextSha256(current)));
  assert.match(prompt, /Return ONLY strict JSON/u);
  assert.match(prompt, /Do not include artifacts/u);
  assert.match(prompt, /intent-mcu-project-envelope@5/u);
});

test('X05 review lists source component and wire changes without mutating the current project', async () => {
  const { current, value } = await patch();
  const before = current;
  const reviewed = await reviewProjectPatch(JSON.stringify(value), current, adapters, PROFILE);
  assert.equal(reviewed.ok, true);
  assert.deepEqual(reviewed.changes.map(({ kind, action, id }) => ({ kind, action, id })), [
    { kind: 'source', action: 'changed', id: 'main.ino' },
    { kind: 'component', action: 'added', id: 'resistor-1' },
    { kind: 'wire', action: 'changed', id: 'net-1' },
  ]);
  assert.equal(reviewed.evaluated, false);
  assert.equal(reviewed.buildAuthority, false);
  assert.equal(current, before);
});

test('X05 rejects stale, cross-profile, no-op and unsupported proposals atomically', async () => {
  const { current, value } = await patch();
  const changedCurrent = envelope({ ...project(), source: 'locally changed' });
  assert.equal((await reviewProjectPatch(JSON.stringify(value), changedCurrent, adapters, PROFILE)).code,
    'PROJECT_PATCH_STALE_BASE');
  assert.equal((await reviewProjectPatch(JSON.stringify({ ...value, profile: 'board.other-v1' }), current,
    adapters, PROFILE)).code, 'PROJECT_PATCH_PROFILE_MISMATCH');
  const noOp = { ...value, proposedProject: JSON.parse(current) };
  assert.equal((await reviewProjectPatch(JSON.stringify(noOp), current, adapters, PROFILE)).code,
    'PROJECT_PATCH_NO_CHANGES');
  const unsupported = structuredClone(value);
  unsupported.proposedProject.project.unsupported = true;
  assert.equal((await reviewProjectPatch(JSON.stringify(unsupported), current, adapters, PROFILE)).code,
    'PROJECT_PATCH_PROPOSED_INVALID');
  assert.equal(changedCurrent, envelope({ ...project(), source: 'locally changed' }));
});

test('X05 strict parser rejects duplicate prototype and executable-authority fields', async () => {
  const { current, value } = await patch();
  const duplicate = JSON.stringify(value).replace(`"schema":"${PROJECT_PATCH_SCHEMA}"`,
    `"schema":"${PROJECT_PATCH_SCHEMA}","schema":"${PROJECT_PATCH_SCHEMA}"`);
  assert.notEqual((await reviewProjectPatch(duplicate, current, adapters, PROFILE)).ok, true);
  const prototype = JSON.stringify(value).replace('"description":', '"__proto__":{},"description":');
  assert.notEqual((await reviewProjectPatch(prototype, current, adapters, PROFILE)).ok, true);
  const authority = structuredClone(value);
  authority.proposedProject.project.runtime = { verdict: 'pass' };
  const result = await reviewProjectPatch(JSON.stringify(authority), current, adapters, PROFILE);
  assert.equal(result.code, 'PROJECT_PATCH_PROPOSED_INVALID');
  assert(result.details.includes('PROJECT_ENVELOPE_EXECUTABLE_AUTHORITY'));
});
