// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  checkAvrWorkerPackage, discoverWorkerClosure, validateDockerfileClosure,
} from '../scripts/check-avr-worker-package.mjs';

const expected = [
  'compiler/avr-allocator-provenance.mjs',
  'compiler/build-protocol.mjs',
  'compiler/build-worker.mjs',
  'compiler/candidate-target-contract.mjs',
  'src/build-limits.mjs',
  'src/compile-targets.mjs',
];

test('AVR worker image packages the complete recursively discovered import closure', async () => {
  assert.deepEqual(await discoverWorkerClosure(), expected);
  assert.deepEqual(await checkAvrWorkerPackage(), {
    entry: 'compiler/build-worker.mjs', closure: expected, files: expected.length,
  });
});

test('package gate fails if the previously missing candidate contract is omitted', async () => {
  const dockerfile = await readFile(new URL('../Dockerfile.toolchain', import.meta.url), 'utf8');
  const incomplete = dockerfile.replace(
    'COPY compiler/candidate-target-contract.mjs /opt/teach-lab/candidate-target-contract.mjs\n', '',
  );
  assert.throws(() => validateDockerfileClosure(incomplete, expected),
    /AVR_WORKER_PACKAGE_MISSING:COPY compiler\/candidate-target-contract\.mjs/u);
});
