// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys, parseStrictJson } from './strict-json.mjs';
import { normalizeScenarioTimeline } from './scenario-timeline.mjs';
import {
  CURRENT_MODEL_LIBRARY_LOCK, RETAINED_MODEL_LIBRARY_LOCK,
  modelLibraryExecutionIdentity, modelLibraryMigrationPreview, modelLibrarySupportsProfile,
  normalizeModelLibraryLock, validateProjectModelLibrary,
} from './model-library.mjs';

export const PROJECT_ENVELOPE_SCHEMA = 'intent-mcu-project-envelope@8';
export const REJECTED_MODEL_LIBRARY_ENVELOPE_SCHEMA = 'intent-mcu-project-envelope@7';
export const PREVIOUS_PROJECT_ENVELOPE_SCHEMA = 'intent-mcu-project-envelope@6';
export const SCENARIOLESS_PROJECT_ENVELOPE_SCHEMA = 'intent-mcu-project-envelope@5';
export const CAPABILITY_PROJECT_ENVELOPE_SCHEMA = 'intent-mcu-project-envelope@4';
export const ASSUMPTION_PROJECT_ENVELOPE_SCHEMA = 'intent-mcu-project-envelope@3';
export const TRACE_PROJECT_ENVELOPE_SCHEMA = 'intent-mcu-project-envelope@2';
export const LEGACY_PROJECT_ENVELOPE_SCHEMA = 'intent-mcu-project-envelope@1';
export const PROJECT_BRIEF_SCHEMA = 'intent-mcu-project-brief@4';
export const PREVIOUS_PROJECT_BRIEF_SCHEMA = 'intent-mcu-project-brief@3';
export const TRACE_PROJECT_BRIEF_SCHEMA = 'intent-mcu-project-brief@2';
export const LEGACY_PROJECT_BRIEF_SCHEMA = 'intent-mcu-project-brief@1';
export const PROJECT_ENVELOPE_LIMIT = 1024 * 1024;

const BRIEF_LIST_LIMIT = 16;
const BRIEF_CRITERIA_LIMIT = 24;
const BRIEF_REFERENCE_LIMIT = 8;
const BRIEF_ASSUMPTION_LIMIT = 24;
const BRIEF_CAPABILITY_LIMIT = 24;
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
    openAssumptions: [],
    requiredCapabilities: [],
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
  return normalizeProjectBrief({ ...value, schema: PROJECT_BRIEF_SCHEMA, openAssumptions: [], requiredCapabilities: [],
    acceptanceCriteria: value.acceptanceCriteria.map((criterion, index) => {
      if (!criterion || typeof criterion !== 'object' || Array.isArray(criterion)
          || !exactKeys(criterion, ['id', 'text'])) {
        throw Object.assign(new Error('PROJECT_BRIEF_CRITERION_SHAPE'),
          { details: [`$brief.acceptanceCriteria[${index}]`] });
      }
      return { ...criterion, codeRefs: [], testRefs: [] };
    }) });
}

function normalizePreviousProjectBrief(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, ['schema', 'purpose', 'inputs', 'outputs', 'boundaryCases', 'acceptanceCriteria', 'openAssumptions'])
      || value.schema !== PREVIOUS_PROJECT_BRIEF_SCHEMA) {
    throw Object.assign(new Error('PROJECT_BRIEF_SHAPE'), { details: ['$brief'] });
  }
  return normalizeProjectBrief({ ...value, schema: PROJECT_BRIEF_SCHEMA, requiredCapabilities: [] });
}

function normalizeTraceProjectBrief(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, ['schema', 'purpose', 'inputs', 'outputs', 'boundaryCases', 'acceptanceCriteria'])
      || value.schema !== TRACE_PROJECT_BRIEF_SCHEMA) {
    throw Object.assign(new Error('PROJECT_BRIEF_SHAPE'), { details: ['$brief'] });
  }
  return normalizeProjectBrief({ ...value, schema: PROJECT_BRIEF_SCHEMA,
    openAssumptions: [], requiredCapabilities: [] });
}

export function normalizeProjectBrief(value = emptyProjectBrief()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, ['schema', 'purpose', 'inputs', 'outputs', 'boundaryCases', 'acceptanceCriteria', 'openAssumptions', 'requiredCapabilities'])
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
  if (!Array.isArray(value.openAssumptions) || value.openAssumptions.length > BRIEF_ASSUMPTION_LIMIT) {
    throw Object.assign(new Error('PROJECT_BRIEF_ASSUMPTIONS'), { details: ['$brief.openAssumptions'] });
  }
  const assumptionIds = new Set();
  const openAssumptions = value.openAssumptions.map((item, index) => {
    const path = `$brief.openAssumptions[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)
        || !exactKeys(item, ['id', 'kind', 'question', 'requirementIds'])) {
      throw Object.assign(new Error('PROJECT_BRIEF_ASSUMPTION_SHAPE'), { details: [path] });
    }
    const id = boundedText(item.id, `${path}.id`, 32);
    if (!/^[A-Z][A-Z0-9_-]{1,31}$/u.test(id)) {
      throw Object.assign(new Error('PROJECT_BRIEF_ASSUMPTION_ID'), { details: [`${path}.id`] });
    }
    if (assumptionIds.has(id)) {
      throw Object.assign(new Error('PROJECT_BRIEF_ASSUMPTION_DUPLICATE'), { details: [id] });
    }
    assumptionIds.add(id);
    if (!['voltage', 'pin', 'timing', 'other'].includes(item.kind)) {
      throw Object.assign(new Error('PROJECT_BRIEF_ASSUMPTION_KIND'), { details: [`${path}.kind`] });
    }
    const requirementIds = testReferences(item.requirementIds, `${path}.requirementIds`);
    const unknown = requirementIds.find((requirementId) => !ids.has(requirementId));
    if (unknown) throw Object.assign(new Error('PROJECT_BRIEF_ASSUMPTION_REQUIREMENT_UNKNOWN'),
      { details: [`${path}.requirementIds`, unknown] });
    return { id, kind: item.kind,
      question: boundedText(item.question, `${path}.question`, BRIEF_TEXT_LIMIT), requirementIds };
  });
  if (!Array.isArray(value.requiredCapabilities) || value.requiredCapabilities.length > BRIEF_CAPABILITY_LIMIT) {
    throw Object.assign(new Error('PROJECT_BRIEF_CAPABILITIES'), { details: ['$brief.requiredCapabilities'] });
  }
  const capabilityIds = new Set();
  const requiredCapabilities = value.requiredCapabilities.map((item, index) => {
    const path = `$brief.requiredCapabilities[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)
        || !exactKeys(item, ['id', 'kind', 'target', 'requirementIds'])) {
      throw Object.assign(new Error('PROJECT_BRIEF_CAPABILITY_SHAPE'), { details: [path] });
    }
    const id = boundedText(item.id, `${path}.id`, 32);
    if (!/^[A-Z][A-Z0-9_-]{1,31}$/u.test(id)) {
      throw Object.assign(new Error('PROJECT_BRIEF_CAPABILITY_ID'), { details: [`${path}.id`] });
    }
    if (capabilityIds.has(id)) {
      throw Object.assign(new Error('PROJECT_BRIEF_CAPABILITY_DUPLICATE'), { details: [id] });
    }
    capabilityIds.add(id);
    if (!['peripheral', 'component'].includes(item.kind)) {
      throw Object.assign(new Error('PROJECT_BRIEF_CAPABILITY_KIND'), { details: [`${path}.kind`] });
    }
    const target = boundedText(item.target, `${path}.target`, 96);
    if (target !== '?' && !/^[a-z][a-z0-9.-]{1,95}$/u.test(target)) {
      throw Object.assign(new Error('PROJECT_BRIEF_CAPABILITY_TARGET'), { details: [`${path}.target`] });
    }
    const requirementIds = testReferences(item.requirementIds, `${path}.requirementIds`);
    const unknown = requirementIds.find((requirementId) => !ids.has(requirementId));
    if (unknown) throw Object.assign(new Error('PROJECT_BRIEF_CAPABILITY_REQUIREMENT_UNKNOWN'),
      { details: [`${path}.requirementIds`, unknown] });
    return { id, kind: item.kind, target, requirementIds };
  });
  const brief = {
    schema: PROJECT_BRIEF_SCHEMA,
    purpose: boundedText(value.purpose, '$brief.purpose', PURPOSE_TEXT_LIMIT, { empty: true }),
    inputs: briefList(value.inputs, '$brief.inputs'),
    outputs: briefList(value.outputs, '$brief.outputs'),
    boundaryCases: briefList(value.boundaryCases, '$brief.boundaryCases'),
    acceptanceCriteria,
    openAssumptions,
    requiredCapabilities,
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

function prepare(adapter, value, context) {
  if (!adapter || typeof adapter.prepare !== 'function') throw new Error('PROJECT_ENVELOPE_ADAPTER');
  const result = adapter.prepare(clone(value), {
    profile: context.profile,
    modelLibrary: clone(context.modelLibrary),
    modelLibraryIdentity: clone(context.modelLibraryIdentity),
    bundle: context.bundle,
  });
  if (!result?.project || typeof result.project !== 'object' || Array.isArray(result.project)) {
    throw new Error('PROJECT_ENVELOPE_PROJECT_INVALID');
  }
  rejectAuthority(result.project);
  return { ...result, project: clone(result.project) };
}

export function canonicalProjectEnvelope(profile, project, adapters, brief = emptyProjectBrief(), scenarioTimeline = null,
  modelLibrary = CURRENT_MODEL_LIBRARY_LOCK) {
  const adapter = adapterForProfile(adapters, profile);
  if (!adapter) throw new Error('PROJECT_ENVELOPE_PROFILE');
  const library = normalizeModelLibraryLock(modelLibrary);
  if (!library.ok) throw Object.assign(new Error(library.code), { code: library.code, details: library.details });
  const execution = modelLibraryExecutionIdentity(library.lock);
  if (!execution.ok) throw Object.assign(new Error(execution.code), execution);
  const prepared = prepare(adapter, project, { profile, modelLibrary: library.lock,
    bundle: execution.implementation, modelLibraryIdentity: execution.identity });
  if (prepared.project.profile && prepared.project.profile !== profile) {
    throw new Error('PROJECT_ENVELOPE_PROFILE_MISMATCH');
  }
  const hasModelGraph = Array.isArray(prepared.project?.circuit?.components)
    || Array.isArray(prepared.project?.candidateCircuit?.components);
  const admitted = modelLibrarySupportsProfile(profile) && hasModelGraph
    ? validateProjectModelLibrary(library.lock, profile, prepared.project)
    : { ok: true };
  if (!admitted.ok) throw Object.assign(new Error(admitted.code), { code: admitted.code, details: admitted.details });
  return `${JSON.stringify({ schema: PROJECT_ENVELOPE_SCHEMA, profile, modelLibrary: library.lock,
    brief: normalizeProjectBrief(brief), scenarioTimeline: normalizeScenarioTimeline(scenarioTimeline, profile),
    project: prepared.project }, null, 2)}\n`;
}

export function prepareProjectEnvelope(source, adapters) {
  try {
    const value = parseStrictJson(source, PROJECT_ENVELOPE_LIMIT);
    let profile; let adapter; let nested; let brief; let scenarioTimeline = null; let legacy = false; let inputSchema;
    let modelLibrary = null;
    let migrationDefaults = [];
    if (value?.schema === PROJECT_ENVELOPE_SCHEMA) {
      if (!exactKeys(value, ['schema', 'profile', 'modelLibrary', 'brief', 'scenarioTimeline', 'project']) || typeof value.profile !== 'string') {
        return failure('PROJECT_ENVELOPE_SHAPE');
      }
      profile = value.profile;
      adapter = adapterForProfile(adapters, profile);
      if (!adapter) return failure('PROJECT_ENVELOPE_PROFILE', [profile]);
      nested = value.project;
      const library = normalizeModelLibraryLock(value.modelLibrary);
      if (!library.ok) return library;
      modelLibrary = library.lock;
      brief = normalizeProjectBrief(value.brief);
      scenarioTimeline = normalizeScenarioTimeline(value.scenarioTimeline, profile);
      inputSchema = PROJECT_ENVELOPE_SCHEMA;
      if (!adapter.schemas?.includes(nested?.schema)) {
        return failure('PROJECT_ENVELOPE_PROFILE_MISMATCH', [profile, nested?.schema ?? null]);
      }
      if (nested?.profile && nested.profile !== profile) {
        return failure('PROJECT_ENVELOPE_PROFILE_MISMATCH', [profile, nested.profile]);
      }
    } else if (value?.schema === REJECTED_MODEL_LIBRARY_ENVELOPE_SCHEMA) {
      return failure('MODEL_LIBRARY_REJECTED_PRIVATE_REVISION', [REJECTED_MODEL_LIBRARY_ENVELOPE_SCHEMA]);
    } else if (value?.schema === PREVIOUS_PROJECT_ENVELOPE_SCHEMA) {
      if (!exactKeys(value, ['schema', 'profile', 'brief', 'scenarioTimeline', 'project']) || typeof value.profile !== 'string') {
        return failure('PROJECT_ENVELOPE_SHAPE');
      }
      profile = value.profile;
      adapter = adapterForProfile(adapters, profile);
      if (!adapter) return failure('PROJECT_ENVELOPE_PROFILE', [profile]);
      nested = value.project;
      brief = normalizeProjectBrief(value.brief);
      scenarioTimeline = normalizeScenarioTimeline(value.scenarioTimeline, profile);
      inputSchema = PREVIOUS_PROJECT_ENVELOPE_SCHEMA;
      modelLibrary = RETAINED_MODEL_LIBRARY_LOCK;
      legacy = true;
      migrationDefaults = ['retained pre-X56 model-library lock'];
      if (!adapter.schemas?.includes(nested?.schema) || (nested?.profile && nested.profile !== profile)) {
        return failure('PROJECT_ENVELOPE_PROFILE_MISMATCH', [profile, nested?.schema ?? nested?.profile ?? null]);
      }
    } else if (value?.schema === SCENARIOLESS_PROJECT_ENVELOPE_SCHEMA) {
      if (!exactKeys(value, ['schema', 'profile', 'brief', 'project']) || typeof value.profile !== 'string') {
        return failure('PROJECT_ENVELOPE_SHAPE');
      }
      profile = value.profile;
      adapter = adapterForProfile(adapters, profile);
      if (!adapter) return failure('PROJECT_ENVELOPE_PROFILE', [profile]);
      nested = value.project;
      brief = normalizeProjectBrief(value.brief);
      inputSchema = SCENARIOLESS_PROJECT_ENVELOPE_SCHEMA;
      modelLibrary = RETAINED_MODEL_LIBRARY_LOCK;
      legacy = true;
      migrationDefaults = ['empty scenario timeline'];
      if (!adapter.schemas?.includes(nested?.schema) || (nested?.profile && nested.profile !== profile)) {
        return failure('PROJECT_ENVELOPE_PROFILE_MISMATCH', [profile, nested?.schema ?? nested?.profile ?? null]);
      }
    } else if (value?.schema === CAPABILITY_PROJECT_ENVELOPE_SCHEMA) {
      if (!exactKeys(value, ['schema', 'profile', 'brief', 'project']) || typeof value.profile !== 'string') {
        return failure('PROJECT_ENVELOPE_SHAPE');
      }
      profile = value.profile;
      adapter = adapterForProfile(adapters, profile);
      if (!adapter) return failure('PROJECT_ENVELOPE_PROFILE', [profile]);
      nested = value.project;
      brief = normalizePreviousProjectBrief(value.brief);
      inputSchema = CAPABILITY_PROJECT_ENVELOPE_SCHEMA;
      modelLibrary = RETAINED_MODEL_LIBRARY_LOCK;
      legacy = true;
      migrationDefaults = ['empty required capability list'];
      if (!adapter.schemas?.includes(nested?.schema) || (nested?.profile && nested.profile !== profile)) {
        return failure('PROJECT_ENVELOPE_PROFILE_MISMATCH', [profile, nested?.schema ?? nested?.profile ?? null]);
      }
    } else if (value?.schema === ASSUMPTION_PROJECT_ENVELOPE_SCHEMA) {
      if (!exactKeys(value, ['schema', 'profile', 'brief', 'project']) || typeof value.profile !== 'string') {
        return failure('PROJECT_ENVELOPE_SHAPE');
      }
      profile = value.profile;
      adapter = adapterForProfile(adapters, profile);
      if (!adapter) return failure('PROJECT_ENVELOPE_PROFILE', [profile]);
      nested = value.project;
      brief = normalizeTraceProjectBrief(value.brief);
      inputSchema = ASSUMPTION_PROJECT_ENVELOPE_SCHEMA;
      modelLibrary = RETAINED_MODEL_LIBRARY_LOCK;
      legacy = true;
      migrationDefaults = ['empty unresolved assumption list', 'empty required capability list'];
      if (!adapter.schemas?.includes(nested?.schema) || (nested?.profile && nested.profile !== profile)) {
        return failure('PROJECT_ENVELOPE_PROFILE_MISMATCH', [profile, nested?.schema ?? nested?.profile ?? null]);
      }
    } else if (value?.schema === TRACE_PROJECT_ENVELOPE_SCHEMA) {
      if (!exactKeys(value, ['schema', 'profile', 'brief', 'project']) || typeof value.profile !== 'string') {
        return failure('PROJECT_ENVELOPE_SHAPE');
      }
      profile = value.profile;
      adapter = adapterForProfile(adapters, profile);
      if (!adapter) return failure('PROJECT_ENVELOPE_PROFILE', [profile]);
      nested = value.project;
      brief = normalizeLegacyProjectBrief(value.brief);
      inputSchema = TRACE_PROJECT_ENVELOPE_SCHEMA;
      modelLibrary = RETAINED_MODEL_LIBRARY_LOCK;
      legacy = true;
      migrationDefaults = ['empty requirement code/test references', 'empty unresolved assumption list', 'empty required capability list'];
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
      modelLibrary = RETAINED_MODEL_LIBRARY_LOCK;
      legacy = true;
      migrationDefaults = ['empty project brief', 'empty requirement code/test references', 'empty unresolved assumption list', 'empty required capability list'];
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
      modelLibrary = RETAINED_MODEL_LIBRARY_LOCK;
      legacy = true;
      migrationDefaults = ['empty project brief', 'empty requirement code/test references', 'empty unresolved assumption list', 'empty required capability list'];
    }
    rejectAuthority(nested);
    const resolvedLibrary = normalizeModelLibraryLock(modelLibrary);
    if (!resolvedLibrary.ok) return resolvedLibrary;
    modelLibrary = resolvedLibrary.lock;
    const execution = modelLibraryExecutionIdentity(modelLibrary);
    if (!execution.ok) return execution;
    const prepared = prepare(adapter, nested, { profile, modelLibrary,
      bundle: execution.implementation, modelLibraryIdentity: execution.identity });
    if (prepared.project.profile && prepared.project.profile !== profile) {
      return failure('PROJECT_ENVELOPE_PROFILE_MISMATCH', [profile, prepared.project.profile]);
    }
    const hasModelGraph = Array.isArray(prepared.project?.circuit?.components)
      || Array.isArray(prepared.project?.candidateCircuit?.components);
    const libraryAdmission = modelLibrarySupportsProfile(profile) && hasModelGraph
      ? validateProjectModelLibrary(modelLibrary, profile, prepared.project)
      : { ok: true, retained: modelLibrary.manifestSha256 === RETAINED_MODEL_LIBRARY_LOCK.manifestSha256 };
    if (!libraryAdmission.ok) return libraryAdmission;
    const canonical = `${JSON.stringify({ schema: PROJECT_ENVELOPE_SCHEMA, profile, modelLibrary,
      brief: normalizeProjectBrief(brief), scenarioTimeline: normalizeScenarioTimeline(scenarioTimeline, profile),
      project: prepared.project }, null, 2)}\n`;
    const reparsed = parseStrictJson(canonical, PROJECT_ENVELOPE_LIMIT);
    if (reparsed.schema !== PROJECT_ENVELOPE_SCHEMA || reparsed.profile !== profile) {
      throw new Error('PROJECT_ENVELOPE_CANONICAL');
    }
    return {
      ok: true, code: legacy ? 'PROJECT_ENVELOPE_MIGRATED' : 'OK', profile,
      project: clone(prepared.project), brief: clone(brief), scenarioTimeline: clone(scenarioTimeline),
      modelLibrary: clone(modelLibrary), modelLibraryRetained: libraryAdmission.retained,
      prepared: prepared.prepared ?? null, canonical,
      report: {
        inputSchema, outputSchema: PROJECT_ENVELOPE_SCHEMA, profile, legacy,
        preserved: [...(prepared.preserved ?? ['source', 'circuit', 'layout', 'properties', 'controls']),
          'brief purpose/inputs/outputs/boundary cases/acceptance criteria/open assumptions/required capabilities',
          ...(scenarioTimeline ? ['scenario timeline'] : [])],
        defaultsAdded: [...(prepared.defaultsAdded ?? []), ...migrationDefaults],
        executableAuthorityCleared: true,
        modelLibrary: { version: modelLibrary.version, manifestSha256: modelLibrary.manifestSha256,
          retained: libraryAdmission.retained,
          migrationAvailable: modelLibrary.manifestSha256 !== CURRENT_MODEL_LIBRARY_LOCK.manifestSha256 },
      },
    };
  } catch (error) {
    return failure(error.code ?? error.message ?? 'PROJECT_ENVELOPE_INVALID', error.details ?? []);
  }
}

export function migrateProjectModelLibrary(source, adapters) {
  const opened = prepareProjectEnvelope(source, adapters);
  if (!opened.ok) return opened;
  const preview = modelLibraryMigrationPreview(opened.modelLibrary, CURRENT_MODEL_LIBRARY_LOCK);
  if (!preview.ok) return preview;
  if (!preview.migrationRequired) return failure('MODEL_LIBRARY_ALREADY_CURRENT');
  const canonical = canonicalProjectEnvelope(opened.profile, opened.project, adapters, opened.brief,
    opened.scenarioTimeline, CURRENT_MODEL_LIBRARY_LOCK);
  return { ok: true, code: 'OK', profile: opened.profile, preview, canonical,
    originalUnchanged: source, executableAuthorityCleared: true };
}
