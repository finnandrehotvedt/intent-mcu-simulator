// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CURRENT_MODEL_LIBRARY_MANIFEST,
  PRE_X55_CURRENT_MODEL_LIBRARY_MANIFEST,
} from '../src/model-library-snapshots.mjs';
import {
  PRE_X55_CURRENT_MODEL_LIBRARY_LOCK,
  modelLibraryExecutionIdentity,
  modelLibraryMigrationPreview,
} from '../src/model-library.mjs';

const requiredOwners = [
  'src/component-appearance.mjs',
  'src/project-v2.mjs',
  'src/project-editor.mjs',
  'src/lifecycle.mjs',
  'src/candidate-project-session.mjs',
  'expansion-drafts/project-v3-contact-persistence.mjs',
  'staging/component-artwork.mjs',
  'staging/main.mjs',
];

test('X55 current identity explicitly owns every newly executed appearance path', async () => {
  const members = new Map(CURRENT_MODEL_LIBRARY_MANIFEST.implementationMembers.map(
    (member) => [member.path, member.sha256],
  ));
  for (const path of requiredOwners) {
    assert.equal(members.has(path), true, `${path} is absent from current identity`);
    const bytes = await readFile(new URL(`../${path}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), members.get(path), path);
  }
  for (const path of [
    'src/candidate-project-session.mjs',
    'expansion-drafts/project-v3-contact-persistence.mjs',
    'staging/main.mjs',
  ]) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(source, /component-appearance\.mjs/u, `${path} hides its X55 dependency`);
  }
});

test('pre-X55 identity stays immutable and does not absorb X55 owners', () => {
  assert.equal(PRE_X55_CURRENT_MODEL_LIBRARY_MANIFEST.version,
    '2.0.0-x47-ui-async-epoch.1-current');
  assert.equal(PRE_X55_CURRENT_MODEL_LIBRARY_MANIFEST.implementationMembers.some(
    (member) => member.path === 'src/component-appearance.mjs',
  ), false);
  assert.notEqual(PRE_X55_CURRENT_MODEL_LIBRARY_MANIFEST.manifestSha256,
    CURRENT_MODEL_LIBRARY_MANIFEST.manifestSha256);
  assert.equal(modelLibraryExecutionIdentity(PRE_X55_CURRENT_MODEL_LIBRARY_LOCK).code,
    'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const preview = modelLibraryMigrationPreview(PRE_X55_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(preview.ok, true);
  assert.equal(preview.migrationRequired, true);
  assert.deepEqual(preview.semanticChanges, []);
  assert.deepEqual(preview.rendererChanges, []);
});
