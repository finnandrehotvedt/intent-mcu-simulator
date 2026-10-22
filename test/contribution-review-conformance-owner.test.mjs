// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseContributionManifest } from '../src/contribution-review.mjs';

const manifestSource = await readFile(new URL('../examples/contribution-review/manifest.json', import.meta.url), 'utf8');

test('fixed contribution owner accepts the exact inert manifest contract', () => {
  const manifest = parseContributionManifest(manifestSource);
  assert.deepEqual(manifest.requiredTests,
    ['model-library', 'component-support-matrix', 'contribution-review']);
  assert(Object.values(manifest.authority).every((value) => value === false));
});

test('fixed contribution owner rejects execution authority and submitted test paths', () => {
  const authority = JSON.parse(manifestSource); authority.authority.execute = true;
  assert.throws(() => parseContributionManifest(JSON.stringify(authority)), /CONTRIBUTION_AUTHORITY_FORBIDDEN/u);
  const testPath = JSON.parse(manifestSource); testPath.requiredTests = ['test/untrusted.test.mjs'];
  assert.throws(() => parseContributionManifest(JSON.stringify(testPath)), /CONTRIBUTION_TEST_UNSUPPORTED/u);
});
