// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const immutableRuntime = Object.freeze({
  'src/simulator.worker.mjs': '060e64b11b30a61fc341a0b36d9c31ea2b1349d5811a9744d0aa34e5c1bc9485',
  'src/runtime-kernel.mjs': 'e8c5c7cbfa847a8ec48312d3a43f8ae20bb128963519cb66a7c0bbd238fd5e7c',
  'src/x49-public-run-contract.mjs': 'fa11957f8f4d2b528d2a4d71c42f64cc47cd0234be50b8dd129843802749c70b',
  'src/x49-public-runner.mjs': '7d869bf9621a8fa921e9a7a1bb198c426f07c1473f7ca5fde680e5bd5399c09c',
  'src/x49-sensor-offset.mjs': 'ef0e8a7ddd5e9acbc052d4b522ea56b317f8cbc1a59ef53a0b7471bfd7e8cbba',
  'src/x49-public-authoring.mjs': 'a1f47c371bcd7ada4bcfb452d41be18908937eba507ce8b5abc973993209a0d2',
});

test('approved X48 worker increment preserves X49 public owners and sanitized output', async () => {
  for (const [pathname, expected] of Object.entries(immutableRuntime)) {
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
