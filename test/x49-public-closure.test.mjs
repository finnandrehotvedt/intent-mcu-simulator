// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const immutableRuntime = Object.freeze({
  'src/simulator.worker.mjs': 'b332d15677972452e923d77b4eb5a159369f860d819ca4e8ce9fd71d686c5fd6',
  'expansion-drafts/bme280-environment-v1.mjs': '3e901aae7073c6e58497a27042b377801e22cd19964569cb14fe8cf8bfa149eb',
  'src/runtime-kernel.mjs': 'd907fd221f906acdcf5a60c6c1fad05886a8f99cc4fb8c7195ffed7a420d0fae',
  'src/x49-public-run-contract.mjs': 'fa11957f8f4d2b528d2a4d71c42f64cc47cd0234be50b8dd129843802749c70b',
  'src/x49-public-runner.mjs': '7d869bf9621a8fa921e9a7a1bb198c426f07c1473f7ca5fde680e5bd5399c09c',
  'src/x49-sensor-offset.mjs': 'ef0e8a7ddd5e9acbc052d4b522ea56b317f8cbc1a59ef53a0b7471bfd7e8cbba',
  'src/x49-public-authoring.mjs': 'a1f47c371bcd7ada4bcfb452d41be18908937eba507ce8b5abc973993209a0d2',
});

test('reviewed control-runtime basis preserves X49 public owners and sanitized output', async () => {
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
