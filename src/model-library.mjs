// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';
import {
  CURRENT_MODEL_LIBRARY_MANIFEST, PRE_X47_REPEATABLE_REJECTION_CURRENT_MODEL_LIBRARY_MANIFEST,
  PRE_X47_REPEATABLE_CURRENT_MODEL_LIBRARY_MANIFEST,
  PRE_X43_STACK_HOTPATH_CURRENT_MODEL_LIBRARY_MANIFEST,
  PRE_X43_STACK_CURRENT_MODEL_LIBRARY_MANIFEST,
  PRIOR_CURRENT_MODEL_LIBRARY_MANIFEST,
  PRE_X47_CURRENT_MODEL_LIBRARY_MANIFEST, PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_MANIFEST,
  PRE_X47_UI_CURRENT_MODEL_LIBRARY_MANIFEST,
  PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_MANIFEST,
  PRE_X55_CURRENT_MODEL_LIBRARY_MANIFEST,
  PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_MANIFEST,
  PRE_UX_CURRENT_MODEL_LIBRARY_MANIFEST,
  RETAINED_MODEL_LIBRARY_MANIFEST,
} from './model-library-snapshots.mjs';
import { productionModelBundle } from './model-bundle-registry.mjs';

export const MODEL_LIBRARY_LOCK_SCHEMA = 'intent-mcu-model-library-lock@2';
export const MODEL_LIBRARY_MANIFEST_SCHEMA = 'intent-mcu-model-library-manifest@2';
const LOCK_KEYS = ['schema', 'libraryId', 'version', 'manifestSha256', 'implementationSha256'];
const clone = (value) => structuredClone(value);
const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};
deepFreeze(CURRENT_MODEL_LIBRARY_MANIFEST);
deepFreeze(PRE_X47_REPEATABLE_REJECTION_CURRENT_MODEL_LIBRARY_MANIFEST);
deepFreeze(PRE_X47_REPEATABLE_CURRENT_MODEL_LIBRARY_MANIFEST);
deepFreeze(PRE_X43_STACK_HOTPATH_CURRENT_MODEL_LIBRARY_MANIFEST);
deepFreeze(PRE_X43_STACK_CURRENT_MODEL_LIBRARY_MANIFEST);
deepFreeze(PRIOR_CURRENT_MODEL_LIBRARY_MANIFEST);
deepFreeze(PRE_X47_CURRENT_MODEL_LIBRARY_MANIFEST);
deepFreeze(PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_MANIFEST);
deepFreeze(PRE_X47_UI_CURRENT_MODEL_LIBRARY_MANIFEST);
deepFreeze(PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_MANIFEST);
deepFreeze(PRE_X55_CURRENT_MODEL_LIBRARY_MANIFEST);
deepFreeze(PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_MANIFEST);
deepFreeze(PRE_UX_CURRENT_MODEL_LIBRARY_MANIFEST);
deepFreeze(RETAINED_MODEL_LIBRARY_MANIFEST);

const lockFor = (manifest) => deepFreeze({
  schema: MODEL_LIBRARY_LOCK_SCHEMA,
  libraryId: manifest.libraryId,
  version: manifest.version,
  manifestSha256: manifest.manifestSha256,
  implementationSha256: manifest.implementationSha256,
});

export const CURRENT_MODEL_LIBRARY_LOCK = lockFor(CURRENT_MODEL_LIBRARY_MANIFEST);
export const PRE_X47_REPEATABLE_REJECTION_CURRENT_MODEL_LIBRARY_LOCK =
  lockFor(PRE_X47_REPEATABLE_REJECTION_CURRENT_MODEL_LIBRARY_MANIFEST);
export const PRE_X47_REPEATABLE_CURRENT_MODEL_LIBRARY_LOCK =
  lockFor(PRE_X47_REPEATABLE_CURRENT_MODEL_LIBRARY_MANIFEST);
export const PRE_X43_STACK_HOTPATH_CURRENT_MODEL_LIBRARY_LOCK =
  lockFor(PRE_X43_STACK_HOTPATH_CURRENT_MODEL_LIBRARY_MANIFEST);
export const PRE_X43_STACK_CURRENT_MODEL_LIBRARY_LOCK =
  lockFor(PRE_X43_STACK_CURRENT_MODEL_LIBRARY_MANIFEST);
export const PRIOR_CURRENT_MODEL_LIBRARY_LOCK = lockFor(PRIOR_CURRENT_MODEL_LIBRARY_MANIFEST);
export const PRE_X47_CURRENT_MODEL_LIBRARY_LOCK = lockFor(PRE_X47_CURRENT_MODEL_LIBRARY_MANIFEST);
export const PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_LOCK =
  lockFor(PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_MANIFEST);
export const PRE_X47_UI_CURRENT_MODEL_LIBRARY_LOCK =
  lockFor(PRE_X47_UI_CURRENT_MODEL_LIBRARY_MANIFEST);
export const PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_LOCK =
  lockFor(PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_MANIFEST);
export const PRE_X55_CURRENT_MODEL_LIBRARY_LOCK = lockFor(PRE_X55_CURRENT_MODEL_LIBRARY_MANIFEST);
export const PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_LOCK =
  lockFor(PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_MANIFEST);
export const PRE_UX_CURRENT_MODEL_LIBRARY_LOCK = lockFor(PRE_UX_CURRENT_MODEL_LIBRARY_MANIFEST);
export const RETAINED_MODEL_LIBRARY_LOCK = lockFor(RETAINED_MODEL_LIBRARY_MANIFEST);

const trustedByHash = new Map([
  [CURRENT_MODEL_LIBRARY_LOCK.manifestSha256, CURRENT_MODEL_LIBRARY_MANIFEST],
  [PRE_X47_REPEATABLE_REJECTION_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256,
    PRE_X47_REPEATABLE_REJECTION_CURRENT_MODEL_LIBRARY_MANIFEST],
  [PRE_X47_REPEATABLE_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256,
    PRE_X47_REPEATABLE_CURRENT_MODEL_LIBRARY_MANIFEST],
  [PRE_X43_STACK_HOTPATH_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256,
    PRE_X43_STACK_HOTPATH_CURRENT_MODEL_LIBRARY_MANIFEST],
  [PRE_X43_STACK_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256,
    PRE_X43_STACK_CURRENT_MODEL_LIBRARY_MANIFEST],
  [PRIOR_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256, PRIOR_CURRENT_MODEL_LIBRARY_MANIFEST],
  [PRE_X47_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256, PRE_X47_CURRENT_MODEL_LIBRARY_MANIFEST],
  [PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256,
    PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_MANIFEST],
  [PRE_X47_UI_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256,
    PRE_X47_UI_CURRENT_MODEL_LIBRARY_MANIFEST],
  [PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256,
    PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_MANIFEST],
  [PRE_X55_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256, PRE_X55_CURRENT_MODEL_LIBRARY_MANIFEST],
  [PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256,
    PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_MANIFEST],
  [PRE_UX_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256, PRE_UX_CURRENT_MODEL_LIBRARY_MANIFEST],
  [RETAINED_MODEL_LIBRARY_LOCK.manifestSha256, RETAINED_MODEL_LIBRARY_MANIFEST],
]);

function failure(code, details = []) {
  return { ok: false, code, details: clone(details) };
}

export function normalizeModelLibraryLock(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !exactKeys(value, LOCK_KEYS) || value.schema !== MODEL_LIBRARY_LOCK_SCHEMA
      || typeof value.libraryId !== 'string' || typeof value.version !== 'string'
      || !/^[a-f0-9]{64}$/u.test(value.manifestSha256)
      || !/^[a-f0-9]{64}$/u.test(value.implementationSha256)) {
    if (value?.schema === 'intent-mcu-model-library-lock@1') {
      return failure('MODEL_LIBRARY_REJECTED_PRIVATE_REVISION');
    }
    return failure('MODEL_LIBRARY_LOCK_SHAPE');
  }
  const manifest = trustedByHash.get(value.manifestSha256);
  if (!manifest || manifest.schema !== MODEL_LIBRARY_MANIFEST_SCHEMA
      || manifest.libraryId !== value.libraryId || manifest.version !== value.version
      || manifest.implementationSha256 !== value.implementationSha256) {
    return failure('MODEL_LIBRARY_LOCK_UNTRUSTED', [value.libraryId, value.version, value.manifestSha256]);
  }
  return { ok: true, code: 'OK', lock: clone(value), manifest };
}

function entryKey(profile, componentType) {
  return `${profile}\u0000${componentType}`;
}

function entryMap(manifest) {
  return new Map(manifest.entries.map((entry) => [entryKey(entry.profile, entry.componentType), entry]));
}

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const indexed = (rows, key = 'id') => new Map((rows ?? []).map((row) => [row[key], row]));
function semanticFieldChanges(prior, next) {
  const changes = [];
  const add = (category, path, from, to) => changes.push({ category, path, from: clone(from), to: clone(to) });
  for (const field of ['componentVersion', 'modelId', 'modelVersion']) {
    if (!same(prior.semantic[field], next.semantic[field])) add('model-identity', field, prior.semantic[field], next.semantic[field]);
  }
  if (prior.supportStatus !== next.supportStatus) {
    add('profile-support', 'supportStatus', prior.supportStatus, next.supportStatus);
  }
  if (!same(prior.semantic.support?.status, next.semantic.support?.status)) {
    add('profile-support', 'support.status', prior.semantic.support?.status, next.semantic.support?.status);
  }
  if (!same(prior.semantic.support?.limitations, next.semantic.support?.limitations)) {
    add('documented-limitations', 'support.limitations', prior.semantic.support?.limitations, next.semantic.support?.limitations);
  }
  const priorPins = indexed(prior.semantic.pins); const nextPins = indexed(next.semantic.pins);
  const removedPins = [...priorPins.keys()].filter((id) => !nextPins.has(id));
  const addedPins = [...nextPins.keys()].filter((id) => !priorPins.has(id));
  const consumedAdded = new Set();
  for (const removed of removedPins) {
    const oldPin = priorPins.get(removed);
    const renamed = addedPins.find((added) => !consumedAdded.has(added)
      && same({ ...nextPins.get(added), id: removed }, oldPin));
    if (renamed) {
      consumedAdded.add(renamed); add('pin-renamed', `pins.${removed}`, removed, renamed);
    } else add('pin-removed', `pins.${removed}`, oldPin, null);
  }
  for (const added of addedPins) {
    if (!consumedAdded.has(added)) add('pin-added', `pins.${added}`, null, nextPins.get(added));
  }
  for (const [id, oldPin] of priorPins) {
    const newPin = nextPins.get(id); if (!newPin) continue;
    for (const field of ['role', 'signals', 'constraints']) {
      if (!same(oldPin[field], newPin[field])) add(`pin-${field}`, `pins.${id}.${field}`, oldPin[field], newPin[field]);
    }
  }
  const oldProperties = prior.semantic.properties ?? {}; const newProperties = next.semantic.properties ?? {};
  for (const name of [...new Set([...Object.keys(oldProperties), ...Object.keys(newProperties)])].sort()) {
    if (!(name in oldProperties)) { add('property-added', `properties.${name}`, null, newProperties[name]); continue; }
    if (!(name in newProperties)) { add('property-removed', `properties.${name}`, oldProperties[name], null); continue; }
    const oldContract = oldProperties[name]; const newContract = newProperties[name];
    for (const field of ['default', 'minimum', 'maximum', 'unit', 'values']) {
      if (!same(oldContract[field], newContract[field])) {
        const category = field === 'minimum' || field === 'maximum' ? 'property-range'
          : field === 'values' ? 'property-allowed-values' : `property-${field}`;
        add(category, `properties.${name}.${field}`, oldContract[field], newContract[field]);
      }
    }
    const known = new Set(['default', 'minimum', 'maximum', 'unit', 'values']);
    const otherOld = Object.fromEntries(Object.entries(oldContract).filter(([key]) => !known.has(key)));
    const otherNew = Object.fromEntries(Object.entries(newContract).filter(([key]) => !known.has(key)));
    if (!same(otherOld, otherNew)) add('property-contract', `properties.${name}`, otherOld, otherNew);
  }
  const oldControls = prior.semantic.controls ?? {}; const newControls = next.semantic.controls ?? {};
  for (const control of Object.keys(oldControls)) {
    if (!(control in newControls)) add('control-removed', `controls.${control}`, oldControls[control], null);
  }
  for (const control of Object.keys(newControls)) {
    if (!(control in oldControls)) add('control-added', `controls.${control}`, null, newControls[control]);
    else if (!same(oldControls[control], newControls[control])) {
      add('control-contract', `controls.${control}`, oldControls[control], newControls[control]);
    }
  }
  if (!same(prior.semantic.internalTerminalGroups, next.semantic.internalTerminalGroups)) {
    add('internal-connectivity', 'internalTerminalGroups', prior.semantic.internalTerminalGroups, next.semantic.internalTerminalGroups);
  }
  return changes;
}

const currentEntries = entryMap(CURRENT_MODEL_LIBRARY_MANIFEST);
const retainedEntries = entryMap(RETAINED_MODEL_LIBRARY_MANIFEST);
const supportedProfiles = new Set(CURRENT_MODEL_LIBRARY_MANIFEST.entries.map((entry) => entry.profile));

export function modelLibrarySupportsProfile(profile) {
  return supportedProfiles.has(profile);
}

function valueMatchesContract(value, contract) {
  if (contract.kind === 'boolean') return typeof value === 'boolean';
  if (contract.kind === 'string') return typeof value === 'string';
  if (contract.kind === 'enum') return contract.values.includes(value);
  if (contract.kind === 'integer') return Number.isInteger(value)
    && value >= contract.minimum && value <= contract.maximum;
  if (contract.kind === 'number') return Number.isFinite(value)
    && value >= contract.minimum && value <= contract.maximum;
  return false;
}

function validateProjectWithEntries(entries, manifest, profile, project) {
  // The AVR candidate envelope keeps its authored visual graph in
  // candidateCircuit; the other installed profiles use circuit directly.
  // Resolve only these two approved shapes instead of scanning arbitrary
  // nested objects for something that happens to resemble a graph.
  const graph = project?.circuit?.components ? project.circuit
    : project?.candidateCircuit?.components ? project.candidateCircuit : null;
  const components = graph?.components;
  if (!Array.isArray(components)) return failure('MODEL_LIBRARY_PROJECT_COMPONENTS');
  for (const component of components) {
    const entry = entries.get(entryKey(profile, component?.type));
    if (!entry) return failure('MODEL_LIBRARY_COMPONENT_UNAVAILABLE', [profile, component?.type ?? null]);
    if (entry.componentVersion < 1 || entry.modelVersion < 1
        || !entry.behaviorContractSha256 || !entry.modelId) {
      return failure('MODEL_LIBRARY_IMPLEMENTATION_INVALID', [profile, component.type]);
    }
    const properties = component.properties ?? {};
    const controls = component.controls ?? {};
    const propertyKeys = Object.keys(entry.semantic.properties);
    if (!exactKeys(properties, propertyKeys)) {
      return failure('MODEL_LIBRARY_PROPERTY_KEYS', [component.id, component.type]);
    }
    for (const key of propertyKeys) {
      if (!valueMatchesContract(properties[key], entry.semantic.properties[key])) {
        return failure('MODEL_LIBRARY_PROPERTY_VALUE', [component.id, component.type, key]);
      }
    }
    const controlKeys = Object.keys(entry.semantic.controls);
    if (!exactKeys(controls, controlKeys)) {
      return failure('MODEL_LIBRARY_CONTROL_KEYS', [component.id, component.type]);
    }
    for (const key of controlKeys) {
      if (!valueMatchesContract(controls[key], entry.semantic.controls[key])) {
        return failure('MODEL_LIBRARY_CONTROL_VALUE', [component.id, component.type, key]);
      }
    }
    const pins = new Set(entry.semantic.pins.map((pin) => pin.id));
    for (const net of graph.nets ?? []) {
      for (const endpoint of net.endpoints ?? []) {
        if (endpoint.component === component.id && !pins.has(endpoint.pin)) {
          return failure('MODEL_LIBRARY_PIN_UNKNOWN', [component.id, component.type, endpoint.pin]);
        }
      }
    }
  }
  return { ok: true, code: 'OK', manifestVersion: manifest.version,
    implementationId: manifest.implementationId, components: components.length };
}

export function resolveModelLibrary(value) {
  const normalized = normalizeModelLibraryLock(value);
  if (!normalized.ok) return normalized;
  const role = normalized.lock.manifestSha256 === RETAINED_MODEL_LIBRARY_LOCK.manifestSha256
    ? 'retained'
    : normalized.lock.manifestSha256 === PRE_X47_REPEATABLE_REJECTION_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256
    ? 'pre-x47-repeatable-rejection-current-migration'
    : normalized.lock.manifestSha256 === PRE_X47_REPEATABLE_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256
    ? 'pre-x47-repeatable-current-migration'
    : normalized.lock.manifestSha256 === PRE_X43_STACK_HOTPATH_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256
    ? 'pre-x43-stack-hotpath-current-migration'
    : normalized.lock.manifestSha256 === PRE_X43_STACK_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256
    ? 'pre-x43-stack-current-migration'
    : normalized.lock.manifestSha256 === PRE_UX_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256
    ? 'pre-ux-current-migration'
    : normalized.lock.manifestSha256 === PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256
    ? 'pre-x55-control-label-current-migration'
    : normalized.lock.manifestSha256 === PRE_X55_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256
    ? 'pre-x55-current-migration'
    : normalized.lock.manifestSha256 === PRIOR_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256
    ? 'prior-current-migration'
    : normalized.lock.manifestSha256 === PRE_X47_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256
    ? 'pre-x47-current-migration'
    : normalized.lock.manifestSha256 === PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256
    ? 'pre-x47-validation-current-migration'
    : normalized.lock.manifestSha256 === PRE_X47_UI_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256
    ? 'pre-x47-ui-current-migration'
    : normalized.lock.manifestSha256 === PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_LOCK.manifestSha256
    ? 'pre-x47-async-current-migration' : 'current';
  return { ...normalized, retained: role === 'retained', historical: role !== 'current', role,
    implementation: productionModelBundle(role) };
}

export function validateProjectModelLibrary(lock, profile, project) {
  const resolved = resolveModelLibrary(lock);
  if (!resolved.ok) return resolved;
  const entries = resolved.role === 'retained' ? retainedEntries
    : resolved.role.endsWith('-migration') ? entryMap(resolved.manifest) : currentEntries;
  const result = validateProjectWithEntries(entries, resolved.manifest, profile, project);
  return result.ok ? { ...result, lock: clone(resolved.lock), retained: resolved.retained } : result;
}

export function modelLibraryExecutionIdentity(lock, { allowMigrationOnly = false } = {}) {
  const resolved = resolveModelLibrary(lock);
  if (!resolved.ok) return resolved;
  if (resolved.role.endsWith('-migration') && !allowMigrationOnly) {
    return failure('MODEL_LIBRARY_MIGRATION_REQUIRED', [resolved.lock.version]);
  }
  return { ok: true, code: 'OK', identity: {
    libraryId: resolved.lock.libraryId,
    version: resolved.lock.version,
    manifestSha256: resolved.lock.manifestSha256,
    implementationSha256: resolved.lock.implementationSha256,
    implementationId: resolved.implementation.id,
    retained: resolved.retained,
    ...(resolved.role.endsWith('-migration')
      ? { migrationOnly: true, executableAuthority: false } : {}),
  }, implementation: resolved.implementation, manifest: resolved.manifest };
}

export function compareModelLibraryEntries(fromEntries, toEntries) {
  const before = new Map(fromEntries.map((entry) => [entryKey(entry.profile, entry.componentType), entry]));
  const after = new Map(toEntries.map((entry) => [entryKey(entry.profile, entry.componentType), entry]));
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  const semanticChanges = []; const rendererChanges = []; const unchanged = [];
  for (const key of keys) {
    const prior = before.get(key); const next = after.get(key);
    const [profile, componentType] = key.split('\u0000');
    if (!prior || !next) {
      semanticChanges.push({ profile, componentType, kind: prior ? 'removed' : 'added',
        from: prior?.behaviorContractSha256 ?? null, to: next?.behaviorContractSha256 ?? null });
    } else if (prior.behaviorContractSha256 !== next.behaviorContractSha256) {
      const changes = semanticFieldChanges(prior, next);
      if (changes.length) {
        semanticChanges.push({ profile, componentType, kind: 'behavior-contract',
          from: prior.behaviorContractSha256, to: next.behaviorContractSha256, changes });
      } else if (prior.rendererContractSha256 !== next.rendererContractSha256) {
        rendererChanges.push({ profile, componentType, kind: 'renderer-only',
          from: prior.rendererContractSha256, to: next.rendererContractSha256 });
      } else unchanged.push({ profile, componentType });
    } else if (prior.rendererContractSha256 !== next.rendererContractSha256) {
      rendererChanges.push({ profile, componentType, kind: 'renderer-only',
        from: prior.rendererContractSha256, to: next.rendererContractSha256 });
    } else unchanged.push({ profile, componentType });
  }
  return { semanticChanges, rendererChanges, unchanged };
}

export function modelLibraryMigrationPreview(fromLock, toLock = CURRENT_MODEL_LIBRARY_LOCK) {
  const from = resolveModelLibrary(fromLock); const to = resolveModelLibrary(toLock);
  if (!from.ok) return from;
  if (!to.ok) return to;
  const diff = compareModelLibraryEntries(from.manifest.entries, to.manifest.entries);
  return { ok: true, code: 'OK', from: clone(from.lock), to: clone(to.lock),
    ...diff, migrationRequired: from.lock.manifestSha256 !== to.lock.manifestSha256,
    executableAuthority: false };
}

export function runModelLibraryConformance(lock) {
  const resolved = resolveModelLibrary(lock);
  if (!resolved.ok) return resolved;
  const cases = [
    ['resistor.fixed-v1', { volts: 5, ohms: 220 }, { amps: 5 / 220 }],
    ['led.basic-v1', { volts: 2, color: 'red' }, { forwardVolts: 2, lit: true }],
    ['button.momentary-v1', { pressed: false }, { connected: false }],
    ['potentiometer.linear-v1', { supplyVolts: 5, position: 0.5 }, { outputVolts: 2.5 }],
  ];
  const rows = cases.map(([componentType, input, expected]) => {
    const evaluated = resolved.implementation.evaluateReference(componentType, input);
    return { componentType, input: clone(input), expected: clone(expected), actual: evaluated.result,
      passed: evaluated.ok && JSON.stringify(evaluated.result) === JSON.stringify(expected) };
  });
  return { ok: rows.every((row) => row.passed), code: rows.every((row) => row.passed) ? 'OK' : 'MODEL_LIBRARY_CONFORMANCE',
    implementationId: resolved.implementation.id, manifestSha256: resolved.lock.manifestSha256,
    implementationSha256: resolved.lock.implementationSha256, rows };
}

export function trustedModelLibraryManifests() {
  return [clone(RETAINED_MODEL_LIBRARY_MANIFEST), clone(CURRENT_MODEL_LIBRARY_MANIFEST)];
}

export function historicalModelLibraryManifests() {
  return [clone(RETAINED_MODEL_LIBRARY_MANIFEST),
    clone(PRE_X43_STACK_HOTPATH_CURRENT_MODEL_LIBRARY_MANIFEST),
    clone(PRE_X43_STACK_CURRENT_MODEL_LIBRARY_MANIFEST),
    clone(PRE_X55_CONTROL_LABEL_CURRENT_MODEL_LIBRARY_MANIFEST),
    clone(PRE_X55_CURRENT_MODEL_LIBRARY_MANIFEST),
    clone(PRIOR_CURRENT_MODEL_LIBRARY_MANIFEST),
    clone(PRE_X47_CURRENT_MODEL_LIBRARY_MANIFEST),
    clone(PRE_X47_VALIDATION_CURRENT_MODEL_LIBRARY_MANIFEST),
    clone(PRE_X47_UI_CURRENT_MODEL_LIBRARY_MANIFEST),
    clone(PRE_X47_ASYNC_CURRENT_MODEL_LIBRARY_MANIFEST),
    clone(PRE_UX_CURRENT_MODEL_LIBRARY_MANIFEST),
    clone(PRE_X47_REPEATABLE_CURRENT_MODEL_LIBRARY_MANIFEST),
    clone(PRE_X47_REPEATABLE_REJECTION_CURRENT_MODEL_LIBRARY_MANIFEST)];
}
