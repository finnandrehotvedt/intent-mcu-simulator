// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const immutable = Object.freeze({
  'staging/main.mjs': 'efa2a74b992bfdf56fcfacca34392ab2d267e8172135c1a6f34a84c7c16e2365',
  'src/simulator.worker.mjs': '6ea2c7328fce143f192c3a27d1dfac66502075e3f7924d53fd0318c57dbbcdaa',
  'src/runtime-kernel.mjs': 'bebaeddfd8aa26564b6caf6972e4371aabb9b64f24f484c76b78c957e27c29dd',
  'src/model-library.mjs': 'b0f38db2ece5d7a3ff7bdbb4d6dc9463e89bcff2a771b72d84ea1f1173389d1d',
  'src/project-envelope.mjs': 'ff4ab3f6680d2b5f0c6aabc16537062465fc85381d4b6d1fc642a39a14094adf',
});

test('X49 public candidate preserves excluded public closure and emits only its dedicated worker', async () => {
  for (const [pathname, expected] of Object.entries(immutable)) {
    assert.equal(hash(await readFile(pathname)), expected, pathname);
  }
  const files = (await readdir('dist')).sort();
  assert(files.includes('main.js'));
  assert(files.includes('simulator.worker.js'));
  assert(files.includes('x49-offset.worker.js'));
  assert.equal(files.some((name) => /(?:private|report|evidence|artifact|\.hex|\.elf)/iu.test(name)), false,
    JSON.stringify(files));
  const publicText = `${await readFile('dist/main.js', 'utf8')}\n${await readFile('dist/x49-offset.worker.js', 'utf8')}`;
  assert.doesNotMatch(publicText, /desktop-etvt6l5|native-saved-artifact|native-strict-report|native-worker-raw|receiptNonce"\s*:/u);
});
