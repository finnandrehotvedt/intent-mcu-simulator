// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys, parseStrictJson } from './strict-json.mjs';

export const PROJECT_ENVELOPE_SCHEMA = 'intent-mcu-project-envelope@3';
export const PREVIOUS_PROJECT_ENVELOPE_SCHEMA = 'intent-mcu-project-envelope@2';
export const LEGACY_PROJECT_ENVELOPE_SCHEMA = 'intent-mcu-project-envelope@1';
export const PROJECT_BRIEF_SCHEMA = 'intent-mcu-project-brief@2';
export const LEGACY_PROJECT_BRIEF_SCHEMA = 'intent-mcu-project-brief@1';
export const PROJECT_ENVELOPE_LIMIT = 1024 * 1024;

const BRIEF_LIST_LIMIT = 16;
const BRIEF_CRITERIA_LIMIT = 24;
const BRIEF_REFERENCE_LIMIT = 8;
const BRIEF_TEXT_LIMIT = 240;
const PURPOSE_TEXT_LIMIT = 2000;

const FORBIDDEN_AUTHORITY_KEYS = new Set([
  'artifact', 'artifactBytes', 'capability', 'elf', 'executable', 'firmwareBytes',
  'firmwareHex', 'flash', 'runtime', 'runtimeState', 'sessionId', 'token', 'password',
  'secret', 'verdict', 'experimentResults',
]);
const clone = (value) => structuredClone(value);
const failure = (code, details = []) => ({ ok: false, code, details });

export function emptyProjectBrief() {
  return {
    schema: PROJECT_BRIEF_SCHEMA,
    purpose: '',
    inputs: [],
    outputs: [],
    boundaryCases: [],
    acceptanceCriteria: [],
  };
}

function boundedText(value, path, limit, { empty = false } = {}) {
  if (typeof value !== 'string' || value !== value.trim() || (!empty && !value)
      || new TextEncoder().encode(value).length > limit) {
    throw Object.assign(new Error('PROJECT_BRIEF_TEXT'), { details: [path] });
  }
  return value;
}

function briefList(value, path) {
  if (!Array.isArray(value) || value.length > BRIEF_LIST_LIMIT) {
    throw Object.assign(new Error('PROJECT_BRIEF_LIST'), { details: [path] });
  }
  return value.map((item, index) => boundedText(item, `${path}[${index}]`, BRIEF_TEXT_LIMIT));
}

function codeReferences(value, path) {
  const references = briefList(value, path);
  const seen = new Set();
  for (const reference of references) {
    if (reference.startsWith('/') || reference.includes('..') || reference.includes('\\')
        || reference.includes('://') || !/^[A-Za-z0-9_.\/-]+(?::[1-9][0-9]{0,5}(?:-[1-9][0-9]{0,5})?)?$/u.test(reference)) {
      throw Object.assign(new Error('PROJECT_BRIEF_CODE_REFERENCE'), { details: [path] });
    }
    if (seen.has(reference)) throw Object.assign(new Error('PROJECT_BRIEF_REFERENCE_DUPLICATE'), { details: [path, reference] });
    seen.add(reference);
  }
  if (references.length > BRIEF_REFERENCE_LIMIT) {
    throw Object.assign(new Error('PROJECT_BRIEF_REFERENCE_LIMIT'), { details: [path] });
  }
  return references;
}

function testReferences(value, path) {
  const references = briefList(value, path);
  const seen = new Set();
  for (const reference of references) {
    if (!/^[A-Z][A-Z0-9_-]{1,63}$/u.test(reference)) {
      throw Object.assign(new Error('PROJECT_BRIEF_TEST_REFERENCE'), { details: [path] });
    }
    if (seen.has(reference)) throw Object.assign(new Error('PROJECT_BRIEF_REFERENCE_DUPLICATE'), { details: [path, reference] });
    seen.add(reference);
  }
  if (references.length > BRIEF_REFERENCE_LIMIT) {
    throw Object.assign(new Error('PROJECT_BRIEF_REFERENCE_LIMIT'), { details: [path] });
  }
  return references;
}

function normalizeLegacyProjectBrief(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, ['schema', 'purpose', 'inputs', 'outputs', 'boundaryCases', 'acceptanceCriteria'])
      || value.schema !== LEGACY_PROJECT_BRIEF_SCHEMA || !Array.isArray(value.acceptanceCriteria)) {
    throw Object.assign(new Error('PROJECT_BRIEF_SHAPE'), { details: ['$brief'] });
  }
  return normalizeProjectBrief({ ...value, schema: PROJECT_BRIEF_SCHEMA,
    acceptanceCriteria: value.acceptanceCriteria.map((criterion, index) => {
      if (!criterion || typeof criterion !== 'object' || Array.isArray(criterion)
          || !exactKeys(criterion, ['id', 'text'])) {
        throw Object.assign(new Error('PROJECT_BRIEF_CRITERION_SHAPE'),
          { details: [`$brief.acceptanceCriteria[${index}]`] });
      }
      return { ...criterion, codeRefs: [], testRefs: [] };
    }) });
}

export function normalizeProjectBrief(value = emptyProjectBrief()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, ['schema', 'purpose', 'inputs', 'outputs', 'boundaryCases', 'acceptanceCriteria'])
      || value.schema !== PROJECT_BRIEF_SCHEMA) {
    throw Object.assign(new Error('PROJECT_BRIEF_SHAPE'), { details: ['$brief'] });
  }
  if (!Array.isArray(value.acceptanceCriteria) || value.acceptanceCriteria.length > BRIEF_CRITERIA_LIMIT) {
    throw Object.assign(new Error('PROJECT_BRIEF_CRITERIA'), { details: ['$brief.acceptanceCriteria'] });
  }
  const ids = new Set();
  const acceptanceCriteria = value.acceptanceCriteria.map((criterion, index) => {
    const path = `$brief.acceptanceCriteria[${index}]`;
    if (!criterion || typeof criterion !== 'object' || Array.isArray(criterion)
        || !exactKeys(criterion, ['id', 'text', 'codeRefs', 'testRefs'])) {
      throw Object.assign(new Error('PROJECT_BRIEF_CRITERION_SHAPE'), { details: [path] });
    }
    const id = boundedText(criterion.id, `${path}.id`, 32);
    if (!/^[A-Z][A-Z0-9_-]{1,31}$/u.test(id)) {
      throw Object.assign(new Error('PROJECT_BRIEF_CRITERION_ID'), { details: [`${path}.id`] });
    }
    if (ids.has(id)) {
      throw Object.assign(new Error('PROJECT_BRIEF_CRITERION_DUPLICATE'), { details: [id] });
    }
    ids.add(id);
    return {
      id,
      text: boundedText(criterion.text, `${path}.text`, BRIEF_TEXT_LIMIT),
      codeRefs: codeReferences(criterion.codeRefs, `${path}.codeRefs`),
      testRefs: testReferences(criterion.testRefs, `${path}.testRefs`),
    };
  });
  const brief = {
    schema: PROJECT_BRIEF_SCHEMA,
    purpose: boundedText(value.purpose, '$brief.purpose', PURPOSE_TEXT_LIMIT, { empty: true }),
    inputs: briefList(value.inputs, '$brief.inputs'),
    outputs: briefList(value.outputs, '$brief.outputs'),
    boundaryCases: briefList(value.boundaryCases, '$brief.boundaryCases'),
    acceptanceCriteria,
  };
  rejectAuthority(brief, '$brief');
  return brief;
}

function rejectAuthority(value, path = '$') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectAuthority(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'compiledFixture' && child?.schema === 'intent-mcu-compiled-fixture-ref@1') continue;
    const inertArtifactReference = key === 'artifact'
      && (exactKeys(child, ['status', 'inputIdentitySha256', 'artifactIdentitySha256'])
        || exactKeys(child, ['schema', 'status', 'profile', 'inputIdentitySha256', 'artifactIdentitySha256']))
      && child.status === 'dirty' && child.inputIdentitySha256 === null
      && child.artifactIdentitySha256 === null && (child.profile === undefined || child.profile === null);
    if ((FORBIDDEN_AUTHORITY_KEYS.has(key) || /base64$/iu.test(key))
      && !inertArtifactReference && child !== null && child !== false && child !== ''
      && (!Array.isArray(child) || child.length)) {
      throw Object.assign(new Error('PROJECT_ENVELOPE_EXECUTABLE_AUTHORITY'), { details: [`${path}.${key}`] });
    }
    rejectAuthority(child, `${path}.${key}`);
  }
}

function adapterEntries(adapters) {
  const entries = adapters instanceof Map ? [...adapters.entries()] : Object.entries(adapters ?? {});
  if (!entries.length) throw new Error('PROJECT_ENVELOPE_ADAPTERS');
  return entries;
}

function adapterForProfile(adapters, profile) {
  return adapterEntries(adapters).find(([id]) => id === profile)?.[1] ?? null;
}

function adapterForSchema(adapters, schema) {
  const matches = adapterEntries(adapters).filter(([, adapter]) => adapter.schemas?.includes(schema));
  if (matches.length !== 1) return null;
  return { profile: matches[0][0], adapter: matches[0][1] };
}

function prepare(adapter, value) {
  if (!adapter || typeof adapter.prepare !== 'function') throw new Error('PROJECT_ENVELOPE_ADAPTER');
  const result = adapter.prepare(clone(value));
  if (!result?.project || typeof result.project !== 'object' || Array.isArray(result.project)) {
    throw new Error('PROJECT_ENVELOPE_PROJECT_INVALID');
  }
  rejectAuthority(result.project);
  return { ...result, project: clone(result.project) };
}

export function canonicalProjectEnvelope(profile, project, adapters, brief = emptyProjectBrief()) {
  const adapter = adapterForProfile(adapters, profile);
  if (!adapter) throw new Error('PROJECT_ENVELOPE_PROFILE');
  const prepared = prepare(adapter, project);
  if (prepared.project.profile && prepared.project.profile !== profile) {
    throw new Error('PROJECT_ENVELOPE_PROFILE_MISMATCH');
  }
  return `${JSON.stringify({ schema: PROJECT_ENVELOPE_SCHEMA, profile,
    brief: normalizeProjectBrief(brief), project: prepared.project }, null, 2)}\n`;
}

export function prepareProjectEnvelope(source, adapters) {
  try {
    const value = parseStrictJson(source, PROJECT_ENVELOPE_LIMIT);
    let profile; let adapter; let nested; let brief; let legacy = false; let inputSchema;
    let migrationDefaults = [];
    if (value?.schema === PROJECT_ENVELOPE_SCHEMA) {
      if (!exactKeys(value, ['schema', 'profile', 'brief', 'project']) || typeof value.profile !== 'string') {
        return failure('PROJECT_ENVELOPE_SHAPE');
      }
      profile = value.profile;
      adapter = adapterForProfile(adapters, profile);
      if (!adapter) return failure('PROJECT_ENVELOPE_PROFILE', [profile]);
      nested = value.project;
      brief = normalizeProjectBrief(value.brief);
      inputSchema = PROJECT_ENVELOPE_SCHEMA;
      if (!adapter.schemas?.includes(nested?.schema)) {
        return failure('PROJECT_ENVELOPE_PROFILE_MISMATCH', [profile, nested?.schema ?? null]);
      }
      if (nested?.profile && nested.profile !== profile) {
        return failure('PROJECT_ENVELOPE_PROFILE_MISMATCH', [profile, nested.profile]);
      }
    } else if (value?.schema === PREVIOUS_PROJECT_ENVELOPE_SCHEMA) {
      if (!exactKeys(value, ['schema', 'profile', 'brief', 'project']) || typeof value.profile !== 'string') {
        return failure('PROJECT_ENVELOPE_SHAPE');
      }
      profile = value.profile;
      adapter = adapterForProfile(adapters, profile);
      if (!adapter) return failure('PROJECT_ENVELOPE_PROFILE', [profile]);
      nested = value.project;
      brief = normalizeLegacyProjectBrief(value.brief);
      inputSchema = PREVIOUS_PROJECT_ENVELOPE_SCHEMA;
      legacy = true;
      migrationDefaults = ['empty requirement code/test references'];
      if (!adapter.schemas?.includes(nested?.schema) || (nested?.profile && nested.profile !== profile)) {
        return failure('PROJECT_ENVELOPE_PROFILE_MISMATCH', [profile, nested?.schema ?? nested?.profile ?? null]);
      }
    } else if (value?.schema === LEGACY_PROJECT_ENVELOPE_SCHEMA) {
      if (!exactKeys(value, ['schema', 'profile', 'project']) || typeof value.profile !== 'string') {
        return failure('PROJECT_ENVELOPE_SHAPE');
      }
      profile = value.profile;
      adapter = adapterForProfile(adapters, profile);
      if (!adapter) return failure('PROJECT_ENVELOPE_PROFILE', [profile]);
      nested = value.project;
      brief = emptyProjectBrief();
      inputSchema = LEGACY_PROJECT_ENVELOPE_SCHEMA;
      legacy = true;
      migrationDefaults = ['empty project brief', 'empty requirement code/test references'];
      if (!adapter.schemas?.includes(nested?.schema) || (nested?.profile && nested.profile !== profile)) {
        return failure('PROJECT_ENVELOPE_PROFILE_MISMATCH', [profile, nested?.schema ?? nested?.profile ?? null]);
      }
    } else {
      inputSchema = value?.schema;
      const matched = adapterForSchema(adapters, inputSchema);
      if (!matched) return failure('PROJECT_ENVELOPE_VERSION', [inputSchema ?? null]);
      ({ profile, adapter } = matched);
      nested = value;
      brief = emptyProjectBrief();
      legacy = true;
      migrationDefaults = ['empty project brief', 'empty requirement code/test references'];
    }
    rejectAuthority(nested);
    const prepared = prepare(adapter, nested);
    if (prepared.project.profile && prepared.project.profile !== profile) {
      return failure('PROJECT_ENVELOPE_PROFILE_MISMATCH', [profile, prepared.project.profile]);
    }
    const canonical = `${JSON.stringify({ schema: PROJECT_ENVELOPE_SCHEMA, profile,
      brief: normalizeProjectBrief(brief), project: prepared.project }, null, 2)}\n`;
    const reparsed = parseStrictJson(canonical, PROJECT_ENVELOPE_LIMIT);
    if (reparsed.schema !== PROJECT_ENVELOPE_SCHEMA || reparsed.profile !== profile) {
      throw new Error('PROJECT_ENVELOPE_CANONICAL');
    }
    return {
      ok: true, code: legacy ? 'PROJECT_ENVELOPE_MIGRATED' : 'OK', profile,
      project: clone(prepared.project), brief: clone(brief), prepared: prepared.prepared ?? null, canonical,
      report: {
        inputSchema, outputSchema: PROJECT_ENVELOPE_SCHEMA, profile, legacy,
        preserved: [...(prepared.preserved ?? ['source', 'circuit', 'layout', 'properties', 'controls']),
          'brief purpose/inputs/outputs/boundary cases/acceptance criteria'],
        defaultsAdded: [...(prepared.defaultsAdded ?? []), ...migrationDefaults],
        executableAuthorityCleared: true,
      },
    };
  } catch (error) {
    return failure(error.code ?? error.message ?? 'PROJECT_ENVELOPE_INVALID', error.details ?? []);
  }
}
