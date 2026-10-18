// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { compareDesignAlternatives, DESIGN_COMPARISON_SCHEMA } from '../src/design-comparison.mjs';
import { canonicalProjectEnvelope, emptyProjectBrief } from '../src/project-envelope.mjs';
import { projectTextSha256 } from '../src/project-patch.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const PROFILE = 'board.rp2040-pico-v1';
const adapters = Object.freeze({
  [PROFILE]: Object.freeze({
    schemas: Object.freeze(['comparison-test-project@1']),
    prepare(value) {
      if (!value || value.schema !== 'comparison-test-project@1' || value.profile !== PROFILE
          || typeof value.source !== 'string' || !Array.isArray(value.components)
          || !Array.isArray(value.nets) || value.unsupported === true) throw new Error('COMPARISON_TEST_INVALID');
      return { project: structuredClone(value) };
    },
  }),
});

function project(source = 'before') {
  return { schema: 'comparison-test-project@1', profile: PROFILE, source,
    components: [{ id: 'board-1', type: 'board' }, { id: 'led-1', type: 'led' }],
    nets: [{ id: 'net-1', endpoints: ['board-1:GP0', 'led-1:A'] }] };
}

function brief() {
  return { ...emptyProjectBrief(), purpose: 'Compare two LED designs.',
    acceptanceCriteria: [{ id: 'REQ-LED', text: 'Drive the LED.', codeRefs: ['main.c:1'], testRefs: ['TEST-LED'] }],
    requiredCapabilities: [{ id: 'NEED-GPIO', kind: 'peripheral', target: 'gpio', requirementIds: ['REQ-LED'] }] };
}

function envelope(value, requirements = brief()) {
  return canonicalProjectEnvelope(PROFILE, value, adapters, requirements);
}

test('X06 compares exactly two designs against identical requirements and documented model limits', async () => {
  const current = envelope(project()); const candidate = envelope(project('after'));
  const result = await compareDesignAlternatives({ currentProjectText: current, candidateProjectText: candidate,
    adapters, activeProfile: PROFILE, expectedBaseSha256: await projectTextSha256(current),
    expectedCandidateSha256: await projectTextSha256(candidate) });
  assert.equal(result.ok, true); assert.equal(result.schema, DESIGN_COMPARISON_SCHEMA);
  assert.equal(result.alternatives.length, 2); assert.equal(result.requirements.sameForBoth, true);
  assert.deepEqual(result.requirements.ids, ['REQ-LED']);
  assert.deepEqual(result.alternatives.map((item) => item.metrics), [
    { sourceFiles: 1, components: 2, wires: 1 }, { sourceFiles: 1, components: 2, wires: 1 }]);
  assert.match(result.alternatives[0].model.limitation, /tested educational GPIO0\/UART0 subset/u);
  assert.equal(result.alternatives[0].requiredCapabilities[0].state, 'available');
  assert.deepEqual(result.changes.map(({ kind }) => kind), ['source']);
  assert.equal(result.evaluated, false); assert.equal(result.recommendation, null);
  assert.equal(result.buildAuthority, false);
});

test('X06 rejects requirement drift instead of comparing unlike goals', async () => {
  const changed = brief(); changed.acceptanceCriteria[0].text = 'Use a different goal.';
  const result = await compareDesignAlternatives({ currentProjectText: envelope(project()),
    candidateProjectText: envelope(project('after'), changed), adapters, activeProfile: PROFILE });
  assert.equal(result.code, 'DESIGN_COMPARISON_REQUIREMENTS_DIFFER');
});

test('X06 rejects stale identity and profile mismatch without producing a comparison', async () => {
  const current = envelope(project()); const candidate = envelope(project('after'));
  assert.equal((await compareDesignAlternatives({ currentProjectText: current, candidateProjectText: candidate,
    adapters, activeProfile: PROFILE, expectedBaseSha256: '0'.repeat(64) })).code, 'DESIGN_COMPARISON_STALE');
  assert.equal((await compareDesignAlternatives({ currentProjectText: current, candidateProjectText: candidate,
    adapters, activeProfile: 'board.esp32-c3-devmodule-v1' })).code, 'DESIGN_COMPARISON_PROFILE_MISMATCH');
});

test('X06 rejects invalid candidate data and no-difference comparisons', async () => {
  const current = envelope(project()); const unsupported = JSON.parse(envelope(project('after')));
  unsupported.project.unsupported = true;
  assert.equal((await compareDesignAlternatives({ currentProjectText: current,
    candidateProjectText: JSON.stringify(unsupported), adapters, activeProfile: PROFILE })).code,
  'DESIGN_COMPARISON_CANDIDATE_INVALID');
  assert.equal((await compareDesignAlternatives({ currentProjectText: current, candidateProjectText: current,
    adapters, activeProfile: PROFILE })).code, 'DESIGN_COMPARISON_NO_DIFFERENCE');
});
