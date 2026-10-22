// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEACHING_EXERCISE_PROFILE, TEACHING_EXERCISE_SCHEMA,
  canonicalTeachingExercise, parseTeachingExercise, teachingExerciseAuthority,
} from '../src/teaching-exercise-package.mjs';

const project = (variant) => ({ schema: 'test-project-envelope@1', profile: TEACHING_EXERCISE_PROFILE, variant });
const validator = (value, { variantId }) => {
  assert.deepEqual(Object.keys(value).sort(), ['profile', 'schema', 'variant'].sort());
  assert.equal(value.schema, 'test-project-envelope@1');
  assert.equal(value.profile, TEACHING_EXERCISE_PROFILE);
  assert.equal(value.variant, variantId);
  return value;
};
const fixture = () => ({
  schema: TEACHING_EXERCISE_SCHEMA, exerciseId: 'thermostat-equality-lesson', title: 'Find the equality fault',
  profileId: TEACHING_EXERCISE_PROFILE,
  instructions: 'Open one start file, inspect the exact threshold rule, then Build manually when ready.',
  requirements: [{ id: 'threshold-equality', text: 'At 30 C the D13 indicator must remain LOW.' }],
  variants: [
    { id: 'correct', label: 'Correct starter', knownFault: '', project: project('correct') },
    { id: 'known-bad-equality', label: 'Known-bad equality starter',
      knownFault: 'The comparison uses less-than-or-equal instead of strict less-than.', project: project('known-bad-equality') },
  ],
});

test('X71 canonical local bundle roundtrips two validated data-only start projects', () => {
  const text = canonicalTeachingExercise(fixture(), validator);
  const parsed = parseTeachingExercise(text, validator);
  assert.deepEqual(parsed, fixture());
  assert.deepEqual(teachingExerciseAuthority(), { apply: false, build: false, run: false, scenario: false,
    runtime: false, verdict: false, openProject: 'trusted-human-ui-only' });
});

test('X71 rejects malformed second project, duplicate IDs, extra authority, markup and unsupported profile atomically', () => {
  for (const mutate of [
    (value) => { value.variants[1].project.variant = 'wrong'; },
    (value) => { value.variants[1].id = 'correct'; value.variants[1].project.variant = 'correct'; },
    (value) => { value.runtime = { verdict: 'passed' }; },
    (value) => { value.instructions = '<img src=x onerror=alert(1)>'; },
    (value) => { value.profileId = 'board.other-v1'; },
    (value) => { value.requirements[0].text = 'x'.repeat(501); },
  ]) {
    const value = fixture(); mutate(value);
    assert.throws(() => canonicalTeachingExercise(value, validator));
  }
});

test('X71 validates both variants before returning any accepted bundle', () => {
  const visited = [];
  assert.throws(() => parseTeachingExercise(JSON.stringify(fixture()), (value, context) => {
    visited.push(context.variantId);
    if (context.variantId === 'known-bad-equality') throw Object.assign(new Error('SECOND_INVALID'), { code: 'SECOND_INVALID' });
    return value;
  }), /SECOND_INVALID/u);
  assert.deepEqual(visited, ['correct', 'known-bad-equality']);
});
