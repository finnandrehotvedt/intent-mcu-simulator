// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const REQUIREMENT_RESULT_LINK_SCHEMA = 'intent-mcu-requirement-result-link@1';

const clone = (value) => structuredClone(value);

function sameStrings(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => value === right[index]);
}

export function requirementTraceIdentity(criterion) {
  return JSON.stringify({ id: criterion.id, codeRefs: criterion.codeRefs, testRefs: criterion.testRefs });
}

export function createRequirementResultLink(profile, criterion, summary) {
  if (typeof profile !== 'string' || !criterion || !criterion.id
      || !Array.isArray(criterion.testRefs) || !criterion.testRefs.length) {
    throw new Error('REQUIREMENT_TEST_REFERENCE_REQUIRED');
  }
  if (!summary || summary.profile !== profile || summary.state !== 'current-runtime'
      || !/^[0-9a-f]{64}$/u.test(summary.artifactIdentity ?? '')) {
    throw new Error('REQUIREMENT_CURRENT_RESULT_REQUIRED');
  }
  const channels = Object.fromEntries(Object.entries(summary.channels ?? {}).map(([name, channel]) => [name, {
    classification: channel.classification,
    provenance: channel.provenance,
  }]));
  return {
    schema: REQUIREMENT_RESULT_LINK_SCHEMA,
    requirementId: criterion.id,
    traceIdentity: requirementTraceIdentity(criterion),
    profile,
    testRefs: clone(criterion.testRefs),
    artifactIdentity: summary.artifactIdentity,
    generation: Number.isSafeInteger(summary.revision) ? summary.revision : null,
    channels,
    evaluated: false,
  };
}

export function currentRequirementResultLink(link, profile, criterion, summary) {
  if (!link || link.schema !== REQUIREMENT_RESULT_LINK_SCHEMA || link.profile !== profile
      || link.requirementId !== criterion?.id || link.traceIdentity !== requirementTraceIdentity(criterion)
      || !sameStrings(link.testRefs, criterion.testRefs) || link.evaluated !== false
      || !summary || summary.profile !== profile || summary.state !== 'current-runtime'
      || link.artifactIdentity !== summary.artifactIdentity) return null;
  return clone(link);
}
