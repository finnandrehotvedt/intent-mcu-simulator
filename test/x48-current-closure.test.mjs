// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CURRENT_MODEL_LIBRARY_MANIFEST, PRE_X48_CURRENT_MODEL_LIBRARY_MANIFEST,
  PRE_X48_AUTHORITY_CURRENT_MODEL_LIBRARY_MANIFEST,
} from '../src/model-library-snapshots.mjs';
import {
  PRE_X48_CURRENT_MODEL_LIBRARY_LOCK, PRE_X48_AUTHORITY_CURRENT_MODEL_LIBRARY_LOCK,
  modelLibraryExecutionIdentity,
  modelLibraryMigrationPreview,
} from '../src/model-library.mjs';

test('X48 current identity owns every newly executed path', async () => {
  const members = new Map(CURRENT_MODEL_LIBRARY_MANIFEST.implementationMembers.map(
    (member) => [member.path, member.sha256],
  ));
  for (const path of ['src/x48-ideal-room-plant.mjs', 'src/runtime-kernel.mjs',
    'src/simulator.worker.mjs', 'src/shared-workbench-shell.mjs', 'staging/main.mjs']) {
    assert.equal(members.has(path), true, path);
    const bytes = await readFile(new URL(`../${path}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), members.get(path), path);
  }
  assert.equal(CURRENT_MODEL_LIBRARY_MANIFEST.version,
    '2.0.0-x48-current-source-integration.1-current');
});

test('the accepted rc.111 model identity remains migration-only through both X48 aliases', () => {
  assert.equal(PRE_X48_AUTHORITY_CURRENT_MODEL_LIBRARY_MANIFEST.version,
    '2.0.0-x66-public-thermostat-create-fix.1-current');
  assert.equal(PRE_X48_AUTHORITY_CURRENT_MODEL_LIBRARY_MANIFEST.manifestSha256,
    'b44dc743404b378d5ce21266430c5c97aaafc931d33b00e4ca0bc441ef06f9d5');
  assert.equal(PRE_X48_AUTHORITY_CURRENT_MODEL_LIBRARY_MANIFEST.implementationSha256,
    '09e8288159971dc31d26e96e9f26c1fe7928f221cfcefef60a116d44e65302f4');
  assert.equal(modelLibraryExecutionIdentity(PRE_X48_AUTHORITY_CURRENT_MODEL_LIBRARY_LOCK).code,
    'MODEL_LIBRARY_MIGRATION_REQUIRED');
});

test('rc.111 identity remains byte-exact migration-only and cannot execute as X48 current', () => {
  assert.equal(PRE_X48_CURRENT_MODEL_LIBRARY_MANIFEST.version,
    '2.0.0-x66-public-thermostat-create-fix.1-current');
  assert.equal(PRE_X48_CURRENT_MODEL_LIBRARY_MANIFEST.manifestSha256,
    'b44dc743404b378d5ce21266430c5c97aaafc931d33b00e4ca0bc441ef06f9d5');
  assert.equal(PRE_X48_CURRENT_MODEL_LIBRARY_MANIFEST.implementationSha256,
    '09e8288159971dc31d26e96e9f26c1fe7928f221cfcefef60a116d44e65302f4');
  assert.equal(modelLibraryExecutionIdentity(PRE_X48_CURRENT_MODEL_LIBRARY_LOCK).code,
    'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const preview = modelLibraryMigrationPreview(PRE_X48_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(preview.ok, true);
  assert.equal(preview.migrationRequired, true);
  assert.deepEqual(preview.semanticChanges, []);
  assert.deepEqual(preview.rendererChanges, []);
});
