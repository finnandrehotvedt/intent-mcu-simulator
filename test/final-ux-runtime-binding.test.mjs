// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { assetSnapshot, verifyRuntimeCandidate } = require('./final-ux-runtime-binding.cjs');
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'final-ux-binding-'));
  const dist = path.join(root, 'dist'); await mkdir(dist);
  await writeFile(path.join(root, 'tracked.txt'), 'source\n');
  await writeFile(path.join(root, '.gitignore'), 'dist/\n');
  await writeFile(path.join(dist, 'index.html'), '<!doctype html>\n');
  git(root, 'init', '-q'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test');
  git(root, 'add', 'tracked.txt', '.gitignore'); git(root, 'commit', '-qm', 'fixture');
  return { root, dist, sha: git(root, 'rev-parse', 'HEAD'), manifest: assetSnapshot(dist).manifestSha256 };
}

test('runtime candidate binding rejects missing and mismatched exact source before acceptance', async () => {
  const value = await fixture();
  assert.throws(() => verifyRuntimeCandidate({ repository: value.root, dist: value.dist,
    exactSourceSha: '', exactAssetManifestSha256: value.manifest }), /FINAL_UX_EXACT_SOURCE_SHA_REQUIRED/u);
  assert.throws(() => verifyRuntimeCandidate({ repository: value.root, dist: value.dist,
    exactSourceSha: 'f'.repeat(40), exactAssetManifestSha256: value.manifest }), /FINAL_UX_SOURCE_SHA_MISMATCH/u);
});

test('runtime candidate binding rejects dirty checkout and changed candidate assets', async () => {
  const value = await fixture();
  await writeFile(path.join(value.root, 'tracked.txt'), 'dirty\n');
  assert.throws(() => verifyRuntimeCandidate({ repository: value.root, dist: value.dist,
    exactSourceSha: value.sha, exactAssetManifestSha256: value.manifest }), /FINAL_UX_DIRTY_TREE/u);
  git(value.root, 'checkout', '--', 'tracked.txt');
  await writeFile(path.join(value.dist, 'index.html'), 'changed\n');
  assert.throws(() => verifyRuntimeCandidate({ repository: value.root, dist: value.dist,
    exactSourceSha: value.sha, exactAssetManifestSha256: value.manifest }), /FINAL_UX_ASSET_MANIFEST_MISMATCH/u);
});

test('runtime candidate binding returns exact checkout and immutable served-byte snapshot', async () => {
  const value = await fixture();
  const bound = verifyRuntimeCandidate({ repository: value.root, dist: value.dist,
    exactSourceSha: value.sha, exactAssetManifestSha256: value.manifest });
  await writeFile(path.join(value.dist, 'index.html'), 'changed after binding\n');
  assert.equal(bound.checkoutSha, value.sha);
  assert.equal(bound.assetManifestSha256, value.manifest);
  assert.equal(bound.files.get('index.html').toString(), '<!doctype html>\n');
});
