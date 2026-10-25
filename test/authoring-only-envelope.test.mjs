// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalProjectEnvelope, prepareProjectEnvelope } from '../src/project-envelope.mjs';

const profile = 'board.rp2040-pico-v1';
const project = { schema: 'authoring-envelope-fixture@1', profile,
  circuit: { components: [{ id: 'fixture-1', type: 'switch.toggle-3v3-v1' }], nets: [] } };
const adapter = (accepted) => ({
  [profile]: {
    schemas: ['authoring-envelope-fixture@1'],
    prepare: (value) => ({ project: structuredClone(value), preserved: ['circuit'] }),
    authoringAdmission: () => accepted
      ? ({ ok: true, code: 'AUTHORING_GRAPH_ACCEPTED_DATA_ONLY', executable: false })
      : ({ ok: false, code: 'AUTHORING_COMPONENT_UNSUPPORTED' }),
  },
});

test('canonical envelope preserves structurally admitted authoring-only data without runtime authority', () => {
  const text = canonicalProjectEnvelope(profile, project, adapter(true));
  const opened = prepareProjectEnvelope(text, adapter(true));
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.project, project);
  assert.equal(opened.report.modelLibrary.authoringOnly, true);
  assert.equal(opened.report.modelLibrary.executableAuthority, false);
  assert.equal(opened.report.modelLibrary.runtimeUnavailableCode, 'MODEL_LIBRARY_COMPONENT_UNAVAILABLE');
  assert.equal(opened.canonical, text);
});

test('authoring admission cannot suppress an unknown or unsafe graph rejection', () => {
  assert.throws(() => canonicalProjectEnvelope(profile, project, adapter(false)),
    (error) => error.code === 'MODEL_LIBRARY_COMPONENT_UNAVAILABLE');
});
