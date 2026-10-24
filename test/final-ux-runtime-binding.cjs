// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function assetSnapshot(dist) {
  const files = [];
  const visit = (directory, prefix = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) files.push({ path: relative, bytes: fs.readFileSync(absolute) });
      else throw new Error(`FINAL_UX_ASSET_TYPE:${relative}`);
    }
  };
  assert(fs.statSync(dist).isDirectory(), 'FINAL_UX_DIST_REQUIRED');
  visit(dist);
  assert(files.length > 0, 'FINAL_UX_DIST_EMPTY');
  const entries = files.map(({ path: relative, bytes }) => ({ path: relative, sha256: sha256(bytes), size: bytes.length }));
  const canonical = `${entries.map((entry) => `${entry.sha256}  ${entry.size}  ${entry.path}`).join('\n')}\n`;
  return { entries, manifestSha256: sha256(canonical), files: new Map(files.map((entry) => [entry.path, entry.bytes])) };
}

function git(repository, args) {
  return execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function verifyRuntimeCandidate({ repository, dist, exactSourceSha, exactAssetManifestSha256 }) {
  assert.match(exactSourceSha || '', /^[a-f0-9]{40}$/u, 'FINAL_UX_EXACT_SOURCE_SHA_REQUIRED');
  assert.match(exactAssetManifestSha256 || '', /^[a-f0-9]{64}$/u, 'FINAL_UX_ASSET_MANIFEST_SHA256_REQUIRED');
  const checkoutSha = git(repository, ['rev-parse', 'HEAD']);
  assert.equal(checkoutSha, exactSourceSha, 'FINAL_UX_SOURCE_SHA_MISMATCH');
  assert.equal(git(repository, ['status', '--porcelain=v1', '--untracked-files=all']), '', 'FINAL_UX_DIRTY_TREE');
  const snapshot = assetSnapshot(dist);
  assert.equal(snapshot.manifestSha256, exactAssetManifestSha256, 'FINAL_UX_ASSET_MANIFEST_MISMATCH');
  return { checkoutSha, assetManifestSha256: snapshot.manifestSha256, assets: snapshot.entries, files: snapshot.files };
}

module.exports = { assetSnapshot, verifyRuntimeCandidate };
