// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CURRENT_MODEL_LIBRARY_MANIFEST, PRE_X48_CURRENT_MODEL_LIBRARY_MANIFEST,
} from '../src/model-library-snapshots.mjs';
import {
  PRE_X48_CURRENT_MODEL_LIBRARY_LOCK, modelLibraryExecutionIdentity,
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
    '2.0.0-x48-instruction-boundary-room.1-current');
});

test('rc.95 identity remains byte-exact migration-only and cannot execute', () => {
  assert.equal(PRE_X48_CURRENT_MODEL_LIBRARY_MANIFEST.version,
    '2.0.0-x55-control-label-fix.1-current');
  assert.equal(PRE_X48_CURRENT_MODEL_LIBRARY_MANIFEST.manifestSha256,
    '92df2e0d8ab429a7baefd2b713ffbe52616f71bce63be030f416f490b80f23a1');
  assert.equal(PRE_X48_CURRENT_MODEL_LIBRARY_MANIFEST.implementationSha256,
    '1d0d331e1724efc0cf2b783e09451cc19f6b81f2485a0c59f9dfed07870ef898');
  assert.equal(modelLibraryExecutionIdentity(PRE_X48_CURRENT_MODEL_LIBRARY_LOCK).code,
    'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const preview = modelLibraryMigrationPreview(PRE_X48_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(preview.ok, true);
  assert.equal(preview.migrationRequired, true);
  assert.deepEqual(preview.semanticChanges, []);
  assert.deepEqual(preview.rendererChanges, []);
});
