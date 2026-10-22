// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const trustedRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const FIXED_TESTS = Object.freeze({
  'model-library': 'test/model-library.test.mjs',
  'component-support-matrix': 'test/component-support-matrix.test.mjs',
  'contribution-review': 'test/contribution-review-conformance-owner.test.mjs',
  'known-bad-real-model-support-fixture': 'test/contribution-conformance-known-bad.test.mjs',
});
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const tapCount = (source, label) => Number(new RegExp(`^# ${label} (\\d+)$`, 'mu').exec(source)?.[1] ?? -1);

async function runTrustedTest(testId) {
  const relative = FIXED_TESTS[testId];
  if (!relative) return { testId, result: 'failed', code: 'FIXED_TEST_NOT_ALLOWLISTED' };
  const absolute = path.join(trustedRoot, relative);
  const testSourceSha256 = sha256(await readFile(absolute));
  try {
    const { stdout, stderr } = await execute(process.execPath,
      ['--test', '--test-concurrency=1', absolute], {
        cwd: trustedRoot, timeout: 120_000, maxBuffer: 2 * 1024 * 1024,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
      });
    const tests = tapCount(stdout, 'tests'); const passed = tapCount(stdout, 'pass'); const failed = tapCount(stdout, 'fail');
    const result = tests > 0 && passed === tests && failed === 0 ? 'passed' : 'failed';
    return Object.freeze({ testId, testSourceSha256, outputSha256: sha256(`${stdout}${stderr}`),
      tests, passed, failed, result });
  } catch (error) {
    const stdout = typeof error.stdout === 'string' ? error.stdout : '';
    const stderr = typeof error.stderr === 'string' ? error.stderr : '';
    return Object.freeze({ testId, testSourceSha256, outputSha256: sha256(`${stdout}${stderr}`),
      tests: Math.max(0, tapCount(stdout, 'tests')), passed: Math.max(0, tapCount(stdout, 'pass')),
      failed: Math.max(1, tapCount(stdout, 'fail')), result: 'failed' });
  }
}

export async function runFixedContributionConformance({ requiredTests }) {
  const results = [];
  for (const testId of requiredTests) results.push(await runTrustedTest(testId));
  return Object.freeze(results);
}
