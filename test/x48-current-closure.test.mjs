// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CURRENT_MODEL_LIBRARY_MANIFEST, RC111_CURRENT_MODEL_LIBRARY_MANIFEST,
  RC112_CURRENT_MODEL_LIBRARY_MANIFEST,
  PRE_X48_CURRENT_MODEL_LIBRARY_MANIFEST,
  PRE_X48_AUTHORITY_CURRENT_MODEL_LIBRARY_MANIFEST,
} from '../src/model-library-snapshots.mjs';
import {
  CURRENT_MODEL_LIBRARY_LOCK, RC111_CURRENT_MODEL_LIBRARY_LOCK,
  RC112_CURRENT_MODEL_LIBRARY_LOCK,
  PRE_X48_CURRENT_MODEL_LIBRARY_LOCK, PRE_X48_AUTHORITY_CURRENT_MODEL_LIBRARY_LOCK,
  modelLibraryExecutionIdentity,
  modelLibraryMigrationPreview,
} from '../src/model-library.mjs';
import { CURRENT_MODEL_LIBRARY_IMPLEMENTATION } from '../src/model-library-current-resolver.mjs';

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
    '2.0.0-x92-pico-owner-proof.1-current');
});

test('current resolver manifest and admitted execution identity use one exact implementation ID', () => {
  const execution = modelLibraryExecutionIdentity(CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(execution.ok, true);
  assert.equal(CURRENT_MODEL_LIBRARY_IMPLEMENTATION.id, CURRENT_MODEL_LIBRARY_MANIFEST.implementationId);
  assert.equal(execution.identity.implementationId, CURRENT_MODEL_LIBRARY_MANIFEST.implementationId);
  assert.equal(execution.implementation.id, CURRENT_MODEL_LIBRARY_MANIFEST.implementationId);
});

test('accepted public rc.111 manifest is preserved byte-for-byte as migration-only data', async () => {
  const fixture = JSON.parse(await readFile(new URL(
    '../src/model-bundles/rc111-current-manifest.json', import.meta.url,
  )));
  assert.deepEqual(RC111_CURRENT_MODEL_LIBRARY_MANIFEST, fixture);
  assert.equal(createHash('sha256').update(JSON.stringify(fixture)).digest('hex'),
    'da0ac4b30326f5f4b9f4b9c437becf6af6ac30256d0d1cfb6a322ed1140aba7e');
  assert.equal(fixture.manifestSha256,
    '5117ad2fd7a975a050f37daa7d052bf7b137e023a2d8417ed7169e70d9183fbc');
  assert.equal(fixture.implementationSha256,
    'bf72d156c56609b9b628c005cffc6a87eeed796e7028fab8a2c6e8c0d0bb5d87');
  assert.equal(modelLibraryExecutionIdentity(RC111_CURRENT_MODEL_LIBRARY_LOCK).code,
    'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const preview = modelLibraryMigrationPreview(RC111_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(preview.ok, true);
  assert.equal(preview.migrationRequired, true);
  assert.deepEqual(preview.semanticChanges, []);
  assert.deepEqual(preview.rendererChanges, []);
  assert.equal(preview.unchanged.length, 25);
});

test('accepted public rc.112 current object is complete, immutable and migration-only', async () => {
  const source = await readFile(new URL('../src/model-bundles/rc112-current-manifest.json', import.meta.url));
  const fixture = JSON.parse(source);
  assert.equal(createHash('sha256').update(source).digest('hex'),
    'b491c79714b28c3c45111dfa77d3b1e0e36a713d208f272ca8f689dafe0246c5');
  assert.deepEqual(RC112_CURRENT_MODEL_LIBRARY_MANIFEST, fixture);
  assert.equal(fixture.manifestSha256,
    '06132eb96862ae5b58279c9d7ed3add641dfa11c7ade6716a84ceb8a25540b5f');
  assert.equal(fixture.implementationSha256,
    '468fa16f86a379badca3b25ffb5f9385e54fbfeb5d29d04d3e3466c347a5f89e');
  assert.equal(modelLibraryExecutionIdentity(RC112_CURRENT_MODEL_LIBRARY_LOCK).code,
    'MODEL_LIBRARY_MIGRATION_REQUIRED');
  const preview = modelLibraryMigrationPreview(RC112_CURRENT_MODEL_LIBRARY_LOCK);
  assert.equal(preview.ok, true);
  assert.equal(preview.migrationRequired, true);
  assert.deepEqual(preview.semanticChanges, []);
  assert.deepEqual(preview.rendererChanges, []);
  assert.equal(preview.unchanged.length, 25);
});

test('the older pre-X48 authority identity remains separately immutable and migration-only', () => {
  assert.equal(PRE_X48_AUTHORITY_CURRENT_MODEL_LIBRARY_MANIFEST.version,
    '2.0.0-x66-public-thermostat-create-fix.1-current');
  assert.equal(PRE_X48_AUTHORITY_CURRENT_MODEL_LIBRARY_MANIFEST.manifestSha256,
    'b44dc743404b378d5ce21266430c5c97aaafc931d33b00e4ca0bc441ef06f9d5');
  assert.equal(PRE_X48_AUTHORITY_CURRENT_MODEL_LIBRARY_MANIFEST.implementationSha256,
    '09e8288159971dc31d26e96e9f26c1fe7928f221cfcefef60a116d44e65302f4');
  assert.equal(modelLibraryExecutionIdentity(PRE_X48_AUTHORITY_CURRENT_MODEL_LIBRARY_LOCK).code,
    'MODEL_LIBRARY_MIGRATION_REQUIRED');
});

test('the older pre-X48 current alias remains byte-exact and cannot execute as X48 current', () => {
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
