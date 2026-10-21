// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CURRENT_MODEL_LIBRARY_MANIFEST,
  PRE_X55_SPLIT_EDITOR_CURRENT_MODEL_LIBRARY_MANIFEST,
  PRE_X55_NOOP_APPLY_FIX_CURRENT_MODEL_LIBRARY_MANIFEST,
  PRE_X55_BODY_LEAD_FIX_CURRENT_MODEL_LIBRARY_MANIFEST,
  PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_MANIFEST,
  PRE_X55_CURRENT_MODEL_LIBRARY_MANIFEST,
} from '../src/model-library-snapshots.mjs';
import {
  PRE_X55_NOOP_APPLY_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X55_SPLIT_EDITOR_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X55_BODY_LEAD_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_LOCK,
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

test('private no-op Apply identity is immutable migration-only after the split editor', () => {
  assert.equal(PRE_X55_SPLIT_EDITOR_CURRENT_MODEL_LIBRARY_MANIFEST.version,
    '2.0.0-x55-noop-apply-fix.1-current');
  assert.equal(PRE_X55_SPLIT_EDITOR_CURRENT_MODEL_LIBRARY_MANIFEST.manifestSha256,
    '35bfadaa1420ce777ef29671bcedc85eed0178db306c6668999bc4e983ce2460');
  assert.equal(modelLibraryExecutionIdentity(
    PRE_X55_SPLIT_EDITOR_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const preview = modelLibraryMigrationPreview(PRE_X55_SPLIT_EDITOR_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.semanticChanges, []);
  assert.deepEqual(preview.rendererChanges, []);
  assert.equal(preview.unchanged.length, 25);
});

test('public rc103 bounded-body identity is immutable migration-only after no-op Apply correction', () => {
  assert.equal(PRE_X55_NOOP_APPLY_FIX_CURRENT_MODEL_LIBRARY_MANIFEST.version,
    '2.0.0-x55-bounded-body-editor.2-current');
  assert.equal(PRE_X55_NOOP_APPLY_FIX_CURRENT_MODEL_LIBRARY_MANIFEST.manifestSha256,
    '7ee7c39ce2f340a50844a2a03649337dafb5ca38f1ca1b689bbb81f87cf1558f');
  assert.equal(modelLibraryExecutionIdentity(
    PRE_X55_NOOP_APPLY_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const preview = modelLibraryMigrationPreview(PRE_X55_NOOP_APPLY_FIX_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(preview.ok, true);
  assert.equal(preview.migrationRequired, true);
  assert.deepEqual(preview.semanticChanges, []);
  assert.deepEqual(preview.rendererChanges, []);
  assert.equal(preview.unchanged.length, 25);
});

test('first bounded-body identity is immutable migration-only after lead continuity correction', () => {
  assert.equal(PRE_X55_BODY_LEAD_FIX_CURRENT_MODEL_LIBRARY_MANIFEST.version,
    '2.0.0-x55-bounded-body-editor.1-current');
  assert.equal(PRE_X55_BODY_LEAD_FIX_CURRENT_MODEL_LIBRARY_MANIFEST.manifestSha256,
    'e2986e0870e6f3ee3e5897775c38eca5c740101beb46ba9336e3bb9785f04d25');
  assert.equal(modelLibraryExecutionIdentity(
    PRE_X55_BODY_LEAD_FIX_CURRENT_MODEL_LIBRARY_LOCK,
  ).code, 'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const preview = modelLibraryMigrationPreview(PRE_X55_BODY_LEAD_FIX_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(preview.ok, true);
  assert.equal(preview.migrationRequired, true);
  assert.deepEqual(preview.semanticChanges, []);
  assert.deepEqual(preview.rendererChanges, []);
  assert.equal(preview.unchanged.length, 25);
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

test('prior X55 appearance identity is immutable migration-only data after the control fix', () => {
  assert.equal(PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_MANIFEST.version,
    '2.0.0-x55-resistor-appearance.1-current');
  assert.equal(PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_MANIFEST.manifestSha256,
    '5e778f334ccae4ef914927d22675176315ac589a22695f7e500ee32c2f419806');
  assert.equal(modelLibraryExecutionIdentity(PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_LOCK).code,
    'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const preview = modelLibraryMigrationPreview(PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(preview.ok, true);
  assert.equal(preview.migrationRequired, true);
  assert.deepEqual(preview.semanticChanges, []);
  assert.deepEqual(preview.rendererChanges, []);
  assert.equal(preview.unchanged.length, 25);
});
