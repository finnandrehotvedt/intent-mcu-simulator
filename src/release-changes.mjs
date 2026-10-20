// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys, parseStrictJson } from './strict-json.mjs';

export const RELEASE_CHANGES_SCHEMA = 'intent-mcu-release-changes@1';
export const RELEASE_CHANGE_REGISTRY_SCHEMA = 'intent-mcu-release-change-registry@1';
export const RELEASE_CHANGES_LIMIT = 64 * 1024;
export const RELEASE_CHANGES_ROW_LIMIT = 32;
export const RELEASE_CHANGE_TOKEN_LIMIT = 96;
export const RELEASE_CHANGE_SUMMARY_LIMIT = 240;

const PRODUCT_ID = 'intent-mcu-simulator';
const SOURCE_REPOSITORY = 'https://github.com/finnandrehotvedt/intent-mcu-simulator';
const IMPLEMENTATION_PATH = 'src/release-changes.mjs';
const REGISTRY_AUTHORITY = 'teach-company-lab-functional-longlist-x01-x96';
const HASH = /^[a-f0-9]{64}$/u;
const TOKEN = /^[A-Za-z][A-Za-z0-9._@:/-]{0,95}$/u;
const VERSION = /^(\d+\.\d+\.\d+-rc\.)([1-9][0-9]*)$/u;
const CLASSIFICATIONS = new Set(['additive', 'changed', 'breaking']);
const TOP_KEYS = ['schema', 'product', 'release', 'changes', 'migrationRequired',
  'breakingChangesPresent', 'authority'];
const AUTHORITY_KEYS = ['apply', 'build', 'run', 'replay', 'verdict'];

const fail = (code, details = []) => {
  throw Object.assign(new Error(code), { code, details });
};

function boundedToken(value, path) {
  if (typeof value !== 'string' || !TOKEN.test(value)
      || new TextEncoder().encode(value).length > RELEASE_CHANGE_TOKEN_LIMIT) fail('RELEASE_CHANGES_TOKEN', [path]);
  return value;
}

function boundedSummary(value, path) {
  if (typeof value !== 'string' || value !== value.trim() || !value
      || /[\u0000-\u001f\u007f]/u.test(value)
      || new TextEncoder().encode(value).length > RELEASE_CHANGE_SUMMARY_LIMIT) {
    fail('RELEASE_CHANGES_SUMMARY', [path]);
  }
  return value;
}

function orderedTokens(value, path) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) fail('RELEASE_CHANGES_TOKENS', [path]);
  const output = value.map((item, index) => boundedToken(item, `${path}[${index}]`));
  if (new Set(output).size !== output.length) fail('RELEASE_CHANGES_TOKEN_DUPLICATE', [path]);
  if (JSON.stringify(output) !== JSON.stringify([...output].sort())) fail('RELEASE_CHANGES_TOKEN_ORDER', [path]);
  return output;
}

function releaseNumber(value, path) {
  if (typeof value !== 'string') fail('RELEASE_CHANGES_VERSION', [path]);
  const match = VERSION.exec(value);
  if (!match) fail('RELEASE_CHANGES_VERSION', [path]);
  const number = Number(match[2]);
  if (!Number.isSafeInteger(number)) fail('RELEASE_CHANGES_VERSION', [path]);
  return { value, prefix: match[1], number };
}

export function parseReleaseChangeRegistryText(source) {
  const value = parseStrictJson(source, RELEASE_CHANGES_LIMIT);
  if (!exactKeys(value, ['schema', 'authority', 'ids', 'bindings'])
      || value.schema !== RELEASE_CHANGE_REGISTRY_SCHEMA
      || value.authority !== REGISTRY_AUTHORITY
      || !Array.isArray(value.ids) || value.ids.length !== 96
      || !Array.isArray(value.bindings) || value.bindings.length < 1) fail('RELEASE_CHANGE_REGISTRY_SHAPE');
  const expected = Array.from({ length: 96 }, (_, index) => `X${String(index + 1).padStart(2, '0')}`);
  if (JSON.stringify(value.ids) !== JSON.stringify(expected)) fail('RELEASE_CHANGE_REGISTRY_IDS');
  const idOrder = new Map(value.ids.map((id, index) => [id, index]));
  let prior = -1;
  const bindings = value.bindings.map((binding, index) => {
    const path = `$.bindings[${index}]`;
    if (!exactKeys(binding, ['id', 'capabilities', 'contracts']) || !idOrder.has(binding.id)
        || idOrder.get(binding.id) <= prior) fail('RELEASE_CHANGE_REGISTRY_BINDING', [path]);
    prior = idOrder.get(binding.id);
    return Object.freeze({ id: binding.id,
      capabilities: Object.freeze(orderedTokens(binding.capabilities, `${path}.capabilities`)),
      contracts: Object.freeze(orderedTokens(binding.contracts, `${path}.contracts`)) });
  });
  return Object.freeze({ schema: value.schema, authority: value.authority,
    ids: Object.freeze([...value.ids]), bindings: Object.freeze(bindings) });
}

export function normalizeReleaseChanges(value, {
  currentVersion,
  implementationSha256,
  registry,
} = {}) {
  if (!exactKeys(value, TOP_KEYS) || value.schema !== RELEASE_CHANGES_SCHEMA) fail('RELEASE_CHANGES_SHAPE');
  if (!exactKeys(value.product, ['id', 'source']) || value.product.id !== PRODUCT_ID
      || !exactKeys(value.product.source, ['repository', 'implementation'])
      || value.product.source.repository !== SOURCE_REPOSITORY
      || !exactKeys(value.product.source.implementation, ['path', 'sha256'])
      || value.product.source.implementation.path !== IMPLEMENTATION_PATH
      || !HASH.test(value.product.source.implementation.sha256)) fail('RELEASE_CHANGES_SOURCE');
  if (implementationSha256 && value.product.source.implementation.sha256 !== implementationSha256) {
    fail('RELEASE_CHANGES_IMPLEMENTATION_STALE');
  }
  if (!exactKeys(value.release, ['previous', 'current'])) fail('RELEASE_CHANGES_RELEASE');
  const previous = releaseNumber(value.release.previous, '$.release.previous');
  const current = releaseNumber(value.release.current, '$.release.current');
  if (previous.prefix !== current.prefix || current.number !== previous.number + 1) fail('RELEASE_CHANGES_RELEASE_ORDER');
  if (currentVersion && current.value !== currentVersion) fail('RELEASE_CHANGES_CURRENT_STALE');
  if (!registry || !Array.isArray(registry.ids) || !Array.isArray(registry.bindings)
      || !registry.ids.length) fail('RELEASE_CHANGE_REGISTRY_REQUIRED');
  if (!Array.isArray(value.changes) || value.changes.length < 1
      || value.changes.length > RELEASE_CHANGES_ROW_LIMIT) fail('RELEASE_CHANGES_ROWS');
  const registryOrder = new Map(registry.ids.map((id, index) => [id, index]));
  const registryBindings = new Map(registry.bindings.map((binding) => [binding.id, binding]));
  const ids = new Set();
  let priorIndex = -1;
  const changes = value.changes.map((item, index) => {
    const path = `$.changes[${index}]`;
    if (!exactKeys(item, ['id', 'classification', 'capabilities', 'contracts', 'summary'])) {
      fail('RELEASE_CHANGES_ROW_SHAPE', [path]);
    }
    const id = boundedToken(item.id, `${path}.id`);
    const registryIndex = registryOrder.get(id);
    if (registryIndex === undefined) fail('RELEASE_CHANGES_ID_UNKNOWN', [id]);
    if (ids.has(id)) fail('RELEASE_CHANGES_ID_DUPLICATE', [id]);
    if (registryIndex <= priorIndex) fail('RELEASE_CHANGES_ID_ORDER', [id]);
    ids.add(id); priorIndex = registryIndex;
    if (!CLASSIFICATIONS.has(item.classification)) fail('RELEASE_CHANGES_CLASSIFICATION', [id]);
    const capabilities = orderedTokens(item.capabilities, `${path}.capabilities`);
    const contracts = orderedTokens(item.contracts, `${path}.contracts`);
    const binding = registryBindings.get(id);
    if (!binding) fail('RELEASE_CHANGES_ID_UNBOUND', [id]);
    if (JSON.stringify(capabilities) !== JSON.stringify(binding.capabilities)
        || JSON.stringify(contracts) !== JSON.stringify(binding.contracts)) {
      fail('RELEASE_CHANGES_IDENTIFIER_BINDING', [id]);
    }
    return {
      id,
      classification: item.classification,
      capabilities,
      contracts,
      summary: boundedSummary(item.summary, `${path}.summary`),
    };
  });
  if (typeof value.migrationRequired !== 'boolean'
      || typeof value.breakingChangesPresent !== 'boolean') fail('RELEASE_CHANGES_FLAGS');
  const hasBreaking = changes.some((item) => item.classification === 'breaking');
  if (value.breakingChangesPresent !== hasBreaking || (hasBreaking && !value.migrationRequired)) {
    fail('RELEASE_CHANGES_FLAG_MISMATCH');
  }
  if (!exactKeys(value.authority, AUTHORITY_KEYS)
      || AUTHORITY_KEYS.some((key) => value.authority[key] !== false)) fail('RELEASE_CHANGES_AUTHORITY');
  return {
    schema: RELEASE_CHANGES_SCHEMA,
    product: {
      id: PRODUCT_ID,
      source: {
        repository: SOURCE_REPOSITORY,
        implementation: { path: IMPLEMENTATION_PATH, sha256: value.product.source.implementation.sha256 },
      },
    },
    release: { previous: previous.value, current: current.value },
    changes,
    migrationRequired: value.migrationRequired,
    breakingChangesPresent: value.breakingChangesPresent,
    authority: Object.fromEntries(AUTHORITY_KEYS.map((key) => [key, false])),
  };
}

export function parseReleaseChangesText(source, options) {
  return normalizeReleaseChanges(parseStrictJson(source, RELEASE_CHANGES_LIMIT), options);
}

export function canonicalReleaseChangesText(value, options) {
  const text = `${JSON.stringify(normalizeReleaseChanges(value, options), null, 2)}\n`;
  if (new TextEncoder().encode(text).length > RELEASE_CHANGES_LIMIT) fail('RELEASE_CHANGES_CANONICAL_LIMIT');
  return text;
}
