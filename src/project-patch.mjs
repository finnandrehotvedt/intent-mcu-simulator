// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys, parseStrictJson } from './strict-json.mjs';
import {
  PROJECT_ENVELOPE_LIMIT,
  PROJECT_ENVELOPE_SCHEMA,
  prepareProjectEnvelope,
} from './project-envelope.mjs';
import {
  expectationReferenceMatchesPrepared,
} from './expectation-reference.mjs';

export const PROJECT_PATCH_SCHEMA = 'intent-mcu-project-patch@1';
export const REFERENCED_PROJECT_PATCH_SCHEMA = 'intent-mcu-project-patch@2';
export const PROJECT_PATCH_LIMIT = PROJECT_ENVELOPE_LIMIT * 2;

const PROFILE_SOURCE_FILE = Object.freeze({
  'board.rp2040-pico-v1': 'main.c',
  'board.esp32-c3-devmodule-v1': 'main.c',
  'board.stm32f429zi-v1': 'main.c',
});
const clone = (value) => structuredClone(value);
const failure = (code, details = []) => ({ ok: false, code, details });

function boundedDescription(value) {
  if (typeof value !== 'string' || value !== value.trim() || !value
      || new TextEncoder().encode(value).length > 2000 || value.includes('://')) {
    throw Object.assign(new Error('PROJECT_PATCH_DESCRIPTION'), { details: ['$patch.description'] });
  }
  return value;
}

export async function projectTextSha256(value) {
  if (typeof value !== 'string') throw new Error('PROJECT_PATCH_BASE_TEXT');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function authoredProject(project) {
  return project?.project && typeof project.project === 'object' && !Array.isArray(project.project)
    ? project.project : project;
}

function collection(project, key) {
  const authored = authoredProject(project);
  const value = authored?.circuit?.[key] ?? authored?.[key] ?? [];
  return Array.isArray(value) ? value : [];
}

function indexed(values) {
  return new Map(values.map((value, index) => [value?.id ?? `index-${index}`, value]));
}

function sourceFiles(project, profile) {
  const authored = authoredProject(project);
  if (Array.isArray(authored?.source?.files)) {
    return new Map(authored.source.files.map((file, index) => [file?.name ?? `file-${index}`, file?.content ?? '']));
  }
  if (typeof authored?.source === 'string') {
    return new Map([[PROFILE_SOURCE_FILE[profile] ?? 'main.ino', authored.source]]);
  }
  return new Map();
}

function compareMaps(kind, before, after) {
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort();
  return ids.flatMap((id) => {
    if (!before.has(id)) return [{ kind, action: 'added', id, summary: `${kind} ${id} added` }];
    if (!after.has(id)) return [{ kind, action: 'removed', id, summary: `${kind} ${id} removed` }];
    if (JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id))) {
      return [{ kind, action: 'changed', id, summary: `${kind} ${id} changed` }];
    }
    return [];
  });
}

export function describeProjectChanges(profile, before, after) {
  const componentMap = (project) => {
    const authored = authoredProject(project);
    return indexed(collection(project, 'components').map((component) => ({
    ...component,
    layout: authored?.circuit?.layout?.positions?.[component.id]
      ?? authored?.layout?.positions?.[component.id] ?? null,
    })));
  };
  const wireMap = (project) => {
    const authored = authoredProject(project);
    return indexed(collection(project, 'nets').map((net) => ({
    ...net,
    style: authored?.circuit?.layout?.wireStyles?.[net.id]
      ?? authored?.layout?.wireStyles?.[net.id] ?? null,
    route: authored?.circuit?.layout?.wireRoutes?.[net.id]
      ?? authored?.layout?.wireRoutes?.[net.id] ?? null,
    })));
  };
  return [
    ...compareMaps('source', sourceFiles(before, profile), sourceFiles(after, profile)),
    ...compareMaps('component', componentMap(before), componentMap(after)),
    ...compareMaps('wire', wireMap(before), wireMap(after)),
  ];
}

function compareValues(kind, before, after, label) {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  return [{ kind, action: 'changed', id: label, summary: `${label} changed` }];
}

function describeTimelineChanges(before, after) {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (!before || !after) {
    return [{ kind: 'test', action: before ? 'removed' : 'added', id: 'scenarioTimeline',
      summary: `Scenario timeline ${before ? 'removed' : 'added'}` }];
  }
  const changes = [];
  const beforeScenarios = indexed(before.scenarios);
  const afterScenarios = indexed(after.scenarios);
  for (const id of [...new Set([...beforeScenarios.keys(), ...afterScenarios.keys()])].sort()) {
    const left = beforeScenarios.get(id); const right = afterScenarios.get(id);
    if (!left || !right) {
      changes.push({ kind: 'test', action: left ? 'removed' : 'added', id,
        summary: `Scenario ${id} ${left ? 'removed' : 'added'}` });
      continue;
    }
    if (left.name !== right.name) changes.push({
      kind: 'test', action: 'changed', id, summary: `Scenario ${id} name changed`,
    });
    const leftEvents = indexed(left.events); const rightEvents = indexed(right.events);
    for (const eventId of [...new Set([...leftEvents.keys(), ...rightEvents.keys()])].sort()) {
      const leftEvent = leftEvents.get(eventId); const rightEvent = rightEvents.get(eventId);
      if (!leftEvent || !rightEvent) {
        changes.push({ kind: rightEvent?.kind === 'expect.pin-level' || leftEvent?.kind === 'expect.pin-level'
          ? 'expectation' : 'test', action: leftEvent ? 'removed' : 'added', id: eventId,
        summary: `${rightEvent?.kind === 'expect.pin-level' || leftEvent?.kind === 'expect.pin-level'
          ? 'Expectation' : 'Test event'} ${eventId} ${leftEvent ? 'removed' : 'added'}` });
      } else if (JSON.stringify(leftEvent) !== JSON.stringify(rightEvent)) {
        const expectation = leftEvent.kind === 'expect.pin-level' || rightEvent.kind === 'expect.pin-level';
        const levelChange = expectation && leftEvent.level !== rightEvent.level
          ? `Expected ${rightEvent.pin ?? leftEvent.pin} level changed from ${leftEvent.level ? 'HIGH' : 'LOW'} to ${rightEvent.level ? 'HIGH' : 'LOW'}`
          : `${expectation ? 'Expectation' : 'Test event'} ${eventId} changed`;
        changes.push({ kind: expectation ? 'expectation' : 'test',
          action: 'changed', id: eventId, summary: levelChange });
      }
    }
  }
  if (before.schema !== after.schema
      || JSON.stringify(before.propertySuite ?? before.faultSuite ?? before.reductionProvenance ?? null)
        !== JSON.stringify(after.propertySuite ?? after.faultSuite ?? after.reductionProvenance ?? null)) {
    changes.push({ kind: 'test', action: 'changed', id: 'timeline-metadata',
      summary: 'Scenario timeline generation/provenance metadata changed' });
  }
  return changes;
}

export function describeTestExpectationChanges(beforePrepared, afterPrepared) {
  return [
    ...compareMaps('expectation', indexed(beforePrepared.brief.acceptanceCriteria),
      indexed(afterPrepared.brief.acceptanceCriteria)),
    ...compareValues('test', beforePrepared.brief.boundaryCases,
      afterPrepared.brief.boundaryCases, 'Boundary cases'),
    ...describeTimelineChanges(beforePrepared.scenarioTimeline, afterPrepared.scenarioTimeline),
  ];
}

function parsePatch(source) {
  const value = parseStrictJson(source, PROJECT_PATCH_LIMIT);
  const referenced = value?.schema === REFERENCED_PROJECT_PATCH_SCHEMA;
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, referenced
        ? ['schema', 'profile', 'baseProjectSha256', 'expectationReferenceSha256', 'description', 'proposedProject']
        : ['schema', 'profile', 'baseProjectSha256', 'description', 'proposedProject'])
      || ![PROJECT_PATCH_SCHEMA, REFERENCED_PROJECT_PATCH_SCHEMA].includes(value.schema)) {
    throw Object.assign(new Error('PROJECT_PATCH_SHAPE'), { details: ['$patch'] });
  }
  if (typeof value.profile !== 'string' || !value.profile) {
    throw Object.assign(new Error('PROJECT_PATCH_PROFILE'), { details: ['$patch.profile'] });
  }
  if (typeof value.baseProjectSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.baseProjectSha256)) {
    throw Object.assign(new Error('PROJECT_PATCH_BASE_IDENTITY'), { details: ['$patch.baseProjectSha256'] });
  }
  if (referenced && (typeof value.expectationReferenceSha256 !== 'string'
      || !/^[a-f0-9]{64}$/u.test(value.expectationReferenceSha256))) {
    throw Object.assign(new Error('PROJECT_PATCH_EXPECTATION_REFERENCE_IDENTITY'),
      { details: ['$patch.expectationReferenceSha256'] });
  }
  boundedDescription(value.description);
  if (!value.proposedProject || typeof value.proposedProject !== 'object'
      || Array.isArray(value.proposedProject) || value.proposedProject.schema !== PROJECT_ENVELOPE_SCHEMA) {
    throw Object.assign(new Error('PROJECT_PATCH_PROJECT_VERSION'), { details: ['$patch.proposedProject.schema'] });
  }
  return value;
}

export async function reviewProjectPatch(source, currentProjectText, adapters, activeProfile,
  expectationReference = null) {
  try {
    const patch = parsePatch(source);
    if (patch.profile !== activeProfile || patch.proposedProject.profile !== activeProfile) {
      return failure('PROJECT_PATCH_PROFILE_MISMATCH', [activeProfile, patch.profile, patch.proposedProject.profile]);
    }
    const current = prepareProjectEnvelope(currentProjectText, adapters);
    if (!current.ok || current.profile !== activeProfile) {
      return failure('PROJECT_PATCH_CURRENT_INVALID', [current.code ?? null]);
    }
    const actualBase = await projectTextSha256(current.canonical);
    if (patch.baseProjectSha256 !== actualBase) {
      return failure('PROJECT_PATCH_STALE_BASE', [patch.baseProjectSha256, actualBase]);
    }
    const proposed = prepareProjectEnvelope(JSON.stringify(patch.proposedProject), adapters);
    if (!proposed.ok) return failure('PROJECT_PATCH_PROPOSED_INVALID', [proposed.code, ...(proposed.details ?? [])]);
    if (proposed.profile !== activeProfile) {
      return failure('PROJECT_PATCH_PROFILE_MISMATCH', [activeProfile, proposed.profile]);
    }
    const referenced = patch.schema === REFERENCED_PROJECT_PATCH_SCHEMA;
    if (referenced && !expectationReference?.ok) {
      return failure('PROJECT_PATCH_EXPECTATION_REFERENCE_REQUIRED');
    }
    if (referenced && patch.expectationReferenceSha256 !== expectationReference.sha256) {
      return failure('PROJECT_PATCH_EXPECTATION_REFERENCE_STALE',
        [patch.expectationReferenceSha256, expectationReference.sha256]);
    }
    if (referenced && !expectationReferenceMatchesPrepared(expectationReference.reference, current)) {
      return failure('PROJECT_PATCH_EXPECTATION_REFERENCE_STALE',
        [expectationReference.sha256, 'current-expectations-changed']);
    }
    const implementationChanges = describeProjectChanges(activeProfile, current.project, proposed.project);
    const testExpectationChanges = describeTestExpectationChanges(current, proposed);
    const changes = [...implementationChanges, ...testExpectationChanges];
    if (!changes.length) return failure('PROJECT_PATCH_NO_CHANGES');
    const applyBlocked = referenced && testExpectationChanges.length > 0;
    return {
      ok: true,
      code: 'PROJECT_PATCH_REVIEWED',
      schema: PROJECT_PATCH_SCHEMA,
      profile: activeProfile,
      description: patch.description,
      baseProjectSha256: actualBase,
      candidateProjectSha256: await projectTextSha256(proposed.canonical),
      changes: clone(changes),
      implementationChanges: clone(implementationChanges),
      testExpectationChanges: clone(testExpectationChanges),
      expectationReferenceSha256: referenced ? expectationReference.sha256 : null,
      expectationReferenceState: referenced ? 'locked' : 'unlocked-v1',
      applyBlocked,
      applyBlockCode: applyBlocked ? 'PROJECT_PATCH_EXPECTATIONS_CHANGED' : null,
      proposed,
      evaluated: false,
      buildAuthority: false,
    };
  } catch (error) {
    return failure(error.code ?? error.message ?? 'PROJECT_PATCH_INVALID', error.details ?? []);
  }
}

export async function createProjectPatchPrompt(description, currentProjectText, adapters, activeProfile,
  expectationReference = null) {
  const request = boundedDescription(description);
  const current = prepareProjectEnvelope(currentProjectText, adapters);
  if (!current.ok || current.profile !== activeProfile) throw Object.assign(new Error('PROJECT_PATCH_CURRENT_INVALID'),
    { details: [current.code ?? null] });
  const baseProjectSha256 = await projectTextSha256(current.canonical);
  const referenced = expectationReference?.ok === true;
  if (referenced && !expectationReferenceMatchesPrepared(expectationReference.reference, current)) {
    throw Object.assign(new Error('PROJECT_PATCH_EXPECTATION_REFERENCE_STALE'),
      { details: [expectationReference.sha256] });
  }
  return [
    'Create one reviewable data-only project patch for Intent MCU Simulator.',
    'Return ONLY strict JSON. No Markdown fence, commentary, code outside the project, HTML, SVG, URL or extra field.',
    `Schema must be ${referenced ? REFERENCED_PROJECT_PATCH_SCHEMA : PROJECT_PATCH_SCHEMA}.`,
    `profile must be ${activeProfile}.`,
    `baseProjectSha256 must be ${baseProjectSha256}.`,
    ...(referenced ? [
      `expectationReferenceSha256 must be ${expectationReference.sha256}.`,
      'The locked expectation reference below is independent review data. Do not change tests or expectations to make implementation pass.',
    ] : ['No expectation reference is loaded. This is an unlocked v1 review and makes no X25 claim.']),
    'description must repeat the exact request below.',
    `proposedProject must be one complete ${PROJECT_ENVELOPE_SCHEMA} object derived from the current project below.`,
    'Change only requested source files, components and wires. Preserve every unrelated field and stable ID.',
    'Do not include artifacts, firmware bytes, executable data, runtime state, secrets, status, support claims or verdicts.',
    'Do not infer unresolved voltage, pin, timing, component or peripheral support.',
    '',
    'REQUEST:',
    request,
    '',
    'CURRENT PROJECT:',
    current.canonical.trimEnd(),
    ...(referenced ? ['', 'LOCKED EXPECTATION REFERENCE:',
      expectationReference.canonical.trimEnd()] : []),
  ].join('\n');
}
