// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys, parseStrictJson } from './strict-json.mjs';

export const PROJECT_ENVELOPE_SCHEMA = 'intent-mcu-project-envelope@1';
export const PROJECT_ENVELOPE_LIMIT = 1024 * 1024;

const FORBIDDEN_AUTHORITY_KEYS = new Set([
  'artifact', 'artifactBytes', 'capability', 'elf', 'executable', 'firmwareBytes',
  'firmwareHex', 'flash', 'runtime', 'runtimeState', 'sessionId', 'token', 'password',
  'secret', 'verdict', 'experimentResults',
]);
const clone = (value) => structuredClone(value);
const failure = (code, details = []) => ({ ok: false, code, details });

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

export function canonicalProjectEnvelope(profile, project, adapters) {
  const adapter = adapterForProfile(adapters, profile);
  if (!adapter) throw new Error('PROJECT_ENVELOPE_PROFILE');
  const prepared = prepare(adapter, project);
  if (prepared.project.profile && prepared.project.profile !== profile) {
    throw new Error('PROJECT_ENVELOPE_PROFILE_MISMATCH');
  }
  return `${JSON.stringify({ schema: PROJECT_ENVELOPE_SCHEMA, profile, project: prepared.project }, null, 2)}\n`;
}

export function prepareProjectEnvelope(source, adapters) {
  try {
    const value = parseStrictJson(source, PROJECT_ENVELOPE_LIMIT);
    let profile; let adapter; let nested; let legacy = false; let inputSchema;
    if (value?.schema === PROJECT_ENVELOPE_SCHEMA) {
      if (!exactKeys(value, ['schema', 'profile', 'project']) || typeof value.profile !== 'string') {
        return failure('PROJECT_ENVELOPE_SHAPE');
      }
      profile = value.profile;
      adapter = adapterForProfile(adapters, profile);
      if (!adapter) return failure('PROJECT_ENVELOPE_PROFILE', [profile]);
      nested = value.project;
      inputSchema = PROJECT_ENVELOPE_SCHEMA;
      if (!adapter.schemas?.includes(nested?.schema)) {
        return failure('PROJECT_ENVELOPE_PROFILE_MISMATCH', [profile, nested?.schema ?? null]);
      }
      if (nested?.profile && nested.profile !== profile) {
        return failure('PROJECT_ENVELOPE_PROFILE_MISMATCH', [profile, nested.profile]);
      }
    } else {
      inputSchema = value?.schema;
      const matched = adapterForSchema(adapters, inputSchema);
      if (!matched) return failure('PROJECT_ENVELOPE_VERSION', [inputSchema ?? null]);
      ({ profile, adapter } = matched);
      nested = value;
      legacy = true;
    }
    rejectAuthority(nested);
    const prepared = prepare(adapter, nested);
    if (prepared.project.profile && prepared.project.profile !== profile) {
      return failure('PROJECT_ENVELOPE_PROFILE_MISMATCH', [profile, prepared.project.profile]);
    }
    const canonical = `${JSON.stringify({ schema: PROJECT_ENVELOPE_SCHEMA, profile, project: prepared.project }, null, 2)}\n`;
    const reparsed = parseStrictJson(canonical, PROJECT_ENVELOPE_LIMIT);
    if (reparsed.schema !== PROJECT_ENVELOPE_SCHEMA || reparsed.profile !== profile) {
      throw new Error('PROJECT_ENVELOPE_CANONICAL');
    }
    return {
      ok: true, code: legacy ? 'PROJECT_ENVELOPE_MIGRATED' : 'OK', profile,
      project: clone(prepared.project), prepared: prepared.prepared ?? null, canonical,
      report: {
        inputSchema, outputSchema: PROJECT_ENVELOPE_SCHEMA, profile, legacy,
        preserved: prepared.preserved ?? ['source', 'circuit', 'layout', 'properties', 'controls'],
        defaultsAdded: prepared.defaultsAdded ?? [], fieldsDropped: prepared.fieldsDropped ?? [],
        executableAuthorityCleared: true,
      },
    };
  } catch (error) {
    return failure(error.code ?? error.message ?? 'PROJECT_ENVELOPE_INVALID', error.details ?? []);
  }
}
