// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIREMENT_RESULT_LINK_SCHEMA, createRequirementResultLink, currentRequirementResultLink,
} from '../src/requirement-traceability.mjs';

const profile = 'board.example-v1';
const criterion = { id: 'REQ-LED', text: 'Observe the LED', codeRefs: ['main.c:4-8'], testRefs: ['TEST-LED'] };
const summary = {
  profile, state: 'current-runtime', artifactIdentity: 'a'.repeat(64), revision: 7,
  channels: { gpio: { classification: 'recorded-runtime', provenance: 'worker GPIO record' } },
};

test('current runtime creates a provenance-only result link without a verdict', () => {
  const link = createRequirementResultLink(profile, criterion, summary);
  assert.equal(link.schema, REQUIREMENT_RESULT_LINK_SCHEMA);
  assert.equal(link.evaluated, false);
  assert.equal(Object.hasOwn(link, 'verdict'), false);
  assert.deepEqual(link.channels, { gpio: { classification: 'recorded-runtime', provenance: 'worker GPIO record' } });
  assert.deepEqual(currentRequirementResultLink(link, profile, criterion, summary), link);
});

test('missing tests, stale runtimes and changed trace identities cannot become current results', () => {
  assert.throws(() => createRequirementResultLink(profile, { ...criterion, testRefs: [] }, summary),
    /REQUIREMENT_TEST_REFERENCE_REQUIRED/u);
  assert.throws(() => createRequirementResultLink(profile, criterion, { ...summary, state: 'no-current-runtime' }),
    /REQUIREMENT_CURRENT_RESULT_REQUIRED/u);
  const link = createRequirementResultLink(profile, criterion, summary);
  assert.equal(currentRequirementResultLink(link, profile, { ...criterion, codeRefs: ['main.c:9'] }, summary), null);
  assert.equal(currentRequirementResultLink(link, profile, criterion, { ...summary, artifactIdentity: 'b'.repeat(64) }), null);
  assert.deepEqual(currentRequirementResultLink(link, profile, criterion, { ...summary, revision: 8 }), link,
    'later records from the same current artifact do not revive or replace the linked snapshot');
});
