// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys, parseStrictJson } from './strict-json.mjs';
import {
  PROJECT_ENVELOPE_LIMIT,
  PROJECT_ENVELOPE_SCHEMA,
  prepareProjectEnvelope,
} from './project-envelope.mjs';

export const PROJECT_PATCH_SCHEMA = 'intent-mcu-project-patch@1';
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

function collection(project, key) {
  const value = project?.circuit?.[key] ?? project?.[key] ?? [];
  return Array.isArray(value) ? value : [];
}

function indexed(values) {
  return new Map(values.map((value, index) => [value?.id ?? `index-${index}`, value]));
}

function sourceFiles(project, profile) {
  if (Array.isArray(project?.source?.files)) {
    return new Map(project.source.files.map((file, index) => [file?.name ?? `file-${index}`, file?.content ?? '']));
  }
  if (typeof project?.source === 'string') {
    return new Map([[PROFILE_SOURCE_FILE[profile] ?? 'main.ino', project.source]]);
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
  const componentMap = (project) => indexed(collection(project, 'components').map((component) => ({
    ...component,
    layout: project?.circuit?.layout?.positions?.[component.id] ?? project?.layout?.positions?.[component.id] ?? null,
  })));
  const wireMap = (project) => indexed(collection(project, 'nets').map((net) => ({
    ...net,
    style: project?.circuit?.layout?.wireStyles?.[net.id] ?? project?.layout?.wireStyles?.[net.id] ?? null,
    route: project?.circuit?.layout?.wireRoutes?.[net.id] ?? project?.layout?.wireRoutes?.[net.id] ?? null,
  })));
  return [
    ...compareMaps('source', sourceFiles(before, profile), sourceFiles(after, profile)),
    ...compareMaps('component', componentMap(before), componentMap(after)),
    ...compareMaps('wire', wireMap(before), wireMap(after)),
  ];
}

function parsePatch(source) {
  const value = parseStrictJson(source, PROJECT_PATCH_LIMIT);
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, ['schema', 'profile', 'baseProjectSha256', 'description', 'proposedProject'])
      || value.schema !== PROJECT_PATCH_SCHEMA) {
    throw Object.assign(new Error('PROJECT_PATCH_SHAPE'), { details: ['$patch'] });
  }
  if (typeof value.profile !== 'string' || !value.profile) {
    throw Object.assign(new Error('PROJECT_PATCH_PROFILE'), { details: ['$patch.profile'] });
  }
  if (typeof value.baseProjectSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.baseProjectSha256)) {
    throw Object.assign(new Error('PROJECT_PATCH_BASE_IDENTITY'), { details: ['$patch.baseProjectSha256'] });
  }
  boundedDescription(value.description);
  if (!value.proposedProject || typeof value.proposedProject !== 'object'
      || Array.isArray(value.proposedProject) || value.proposedProject.schema !== PROJECT_ENVELOPE_SCHEMA) {
    throw Object.assign(new Error('PROJECT_PATCH_PROJECT_VERSION'), { details: ['$patch.proposedProject.schema'] });
  }
  return value;
}

export async function reviewProjectPatch(source, currentProjectText, adapters, activeProfile) {
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
    const changes = describeProjectChanges(activeProfile, current.project, proposed.project);
    if (!changes.length) return failure('PROJECT_PATCH_NO_CHANGES');
    return {
      ok: true,
      code: 'PROJECT_PATCH_REVIEWED',
      schema: PROJECT_PATCH_SCHEMA,
      profile: activeProfile,
      description: patch.description,
      baseProjectSha256: actualBase,
      candidateProjectSha256: await projectTextSha256(proposed.canonical),
      changes: clone(changes),
      proposed,
      evaluated: false,
      buildAuthority: false,
    };
  } catch (error) {
    return failure(error.code ?? error.message ?? 'PROJECT_PATCH_INVALID', error.details ?? []);
  }
}

export async function createProjectPatchPrompt(description, currentProjectText, adapters, activeProfile) {
  const request = boundedDescription(description);
  const current = prepareProjectEnvelope(currentProjectText, adapters);
  if (!current.ok || current.profile !== activeProfile) throw Object.assign(new Error('PROJECT_PATCH_CURRENT_INVALID'),
    { details: [current.code ?? null] });
  const baseProjectSha256 = await projectTextSha256(current.canonical);
  return [
    'Create one reviewable data-only project patch for Intent MCU Simulator.',
    'Return ONLY strict JSON. No Markdown fence, commentary, code outside the project, HTML, SVG, URL or extra field.',
    `Schema must be ${PROJECT_PATCH_SCHEMA}.`,
    `profile must be ${activeProfile}.`,
    `baseProjectSha256 must be ${baseProjectSha256}.`,
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
  ].join('\n');
}
