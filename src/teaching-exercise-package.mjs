// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys, parseStrictJson } from './strict-json.mjs';

export const TEACHING_EXERCISE_SCHEMA = 'intent-mcu-teaching-exercise@1';
export const TEACHING_EXERCISE_PROFILE = 'board.atmega328p-16mhz-v1';
export const TEACHING_EXERCISE_LIMITS = Object.freeze({
  bytes: 2 * 1024 * 1024, variants: 2, requirements: 12,
  title: 80, instructions: 4000, requirementText: 500, label: 80, knownFault: 800,
});
const EXPECTED_VARIANTS = Object.freeze(['correct', 'known-bad-equality']);

const fail = (code, details = []) => { throw Object.assign(new Error(code), { code, details }); };
const text = (value, path, limit, { empty = false } = {}) => {
  if (typeof value !== 'string' || value !== value.trim() || (!empty && !value)
      || new TextEncoder().encode(value).length > limit || /[\u0000-\u001f\u007f]/u.test(value)
      || /<\/?[A-Za-z][^>]*>/u.test(value)) fail('TEACHING_EXERCISE_TEXT', [path]);
  return value;
};
const id = (value, path) => {
  const normalized = text(value, path, 64);
  if (!/^[a-z][a-z0-9-]{1,63}$/u.test(normalized)) fail('TEACHING_EXERCISE_ID', [path]);
  return normalized;
};

export function normalizeTeachingExercise(value, validateProject) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, ['schema', 'exerciseId', 'title', 'profileId', 'instructions', 'requirements', 'variants'])
      || value.schema !== TEACHING_EXERCISE_SCHEMA || value.profileId !== TEACHING_EXERCISE_PROFILE
      || typeof validateProject !== 'function') fail('TEACHING_EXERCISE_SHAPE');
  if (!Array.isArray(value.requirements) || !value.requirements.length
      || value.requirements.length > TEACHING_EXERCISE_LIMITS.requirements) fail('TEACHING_EXERCISE_REQUIREMENTS');
  const requirementIds = new Set();
  const requirements = value.requirements.map((item, index) => {
    const path = `$requirements[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item) || !exactKeys(item, ['id', 'text'])) fail('TEACHING_EXERCISE_REQUIREMENT_SHAPE', [path]);
    const requirementId = id(item.id, `${path}.id`);
    if (requirementIds.has(requirementId)) fail('TEACHING_EXERCISE_DUPLICATE_ID', [requirementId]);
    requirementIds.add(requirementId);
    return { id: requirementId, text: text(item.text, `${path}.text`, TEACHING_EXERCISE_LIMITS.requirementText) };
  });
  if (!Array.isArray(value.variants) || value.variants.length !== TEACHING_EXERCISE_LIMITS.variants) fail('TEACHING_EXERCISE_VARIANTS');
  const variantIds = new Set();
  const variants = value.variants.map((item, index) => {
    const path = `$variants[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)
        || !exactKeys(item, ['id', 'label', 'knownFault', 'project'])) fail('TEACHING_EXERCISE_VARIANT_SHAPE', [path]);
    const variantId = id(item.id, `${path}.id`);
    if (variantIds.has(variantId)) fail('TEACHING_EXERCISE_DUPLICATE_ID', [variantId]);
    variantIds.add(variantId);
    let project;
    try { project = validateProject(structuredClone(item.project), { variantId, path: `${path}.project` }); }
    catch (error) { fail(error.code ?? error.message ?? 'TEACHING_EXERCISE_PROJECT', [path, ...(error.details ?? [])]); }
    if (!project || typeof project !== 'object' || Array.isArray(project)) fail('TEACHING_EXERCISE_PROJECT', [path]);
    return { id: variantId, label: text(item.label, `${path}.label`, TEACHING_EXERCISE_LIMITS.label),
      knownFault: text(item.knownFault, `${path}.knownFault`, TEACHING_EXERCISE_LIMITS.knownFault, { empty: true }),
      project: structuredClone(project) };
  });
  if (EXPECTED_VARIANTS.some((variantId) => !variantIds.has(variantId))) fail('TEACHING_EXERCISE_VARIANT_SET');
  const normalized = { schema: TEACHING_EXERCISE_SCHEMA, exerciseId: id(value.exerciseId, '$exerciseId'),
    title: text(value.title, '$title', TEACHING_EXERCISE_LIMITS.title), profileId: value.profileId,
    instructions: text(value.instructions, '$instructions', TEACHING_EXERCISE_LIMITS.instructions), requirements, variants };
  if (new TextEncoder().encode(JSON.stringify(normalized)).length > TEACHING_EXERCISE_LIMITS.bytes) fail('INPUT_LIMIT');
  return normalized;
}

export function parseTeachingExercise(source, validateProject) {
  return normalizeTeachingExercise(parseStrictJson(source, TEACHING_EXERCISE_LIMITS.bytes), validateProject);
}

export function canonicalTeachingExercise(value, validateProject) {
  return `${JSON.stringify(normalizeTeachingExercise(value, validateProject), null, 2)}\n`;
}

export function teachingExerciseAuthority() {
  return Object.freeze({ apply: false, build: false, run: false, scenario: false, runtime: false, verdict: false,
    openProject: 'trusted-human-ui-only' });
}
