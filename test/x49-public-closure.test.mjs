// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const immutableRuntime = Object.freeze({
  'src/simulator.worker.mjs': 'c7a1f5d3923e4a8ab8fe5d68bc2193d0b08c82a6489ffa7f382ddf2df8b57af5',
  'src/runtime-kernel.mjs': '8ae935906e1981916b7bc1ab7c2243c6624404b232d1844e1d690c632172bc6e',
  'src/x49-public-run-contract.mjs': 'fa11957f8f4d2b528d2a4d71c42f64cc47cd0234be50b8dd129843802749c70b',
  'src/x49-public-runner.mjs': '7d869bf9621a8fa921e9a7a1bb198c426f07c1473f7ca5fde680e5bd5399c09c',
  'src/x49-sensor-offset.mjs': 'ef0e8a7ddd5e9acbc052d4b522ea56b317f8cbc1a59ef53a0b7471bfd7e8cbba',
  'src/x49-public-authoring.mjs': 'a1f47c371bcd7ada4bcfb452d41be18908937eba507ce8b5abc973993209a0d2',
});

test('later approved UI/model increments preserve X49 public runtime owners and sanitized output', async () => {
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
