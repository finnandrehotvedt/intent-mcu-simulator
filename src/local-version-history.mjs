// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const LOCAL_HISTORY_SCHEMA = 'intent-mcu-local-history@1';
export const LOCAL_HISTORY_SETTINGS_SCHEMA = 'intent-mcu-local-history-settings@1';
export const LOCAL_HISTORY_RECORD_SCHEMA = 'intent-mcu-local-history-record@1';
export const LOCAL_HISTORY_DATABASE = 'intent-mcu-local-history-v1';
export const LOCAL_HISTORY_ENABLED_KEY = 'intent-mcu.local-history.enabled.v1';
export const LOCAL_HISTORY_RECORD_LIMIT = 1024 * 1024;
export const LOCAL_HISTORY_RETENTION = Object.freeze([3, 10]);

const HASH = /^[0-9a-f]{64}$/u;
const PROFILE = /^board\.[a-z0-9-]+-v[0-9]+$/u;
const SETTINGS_KEYS = ['schema', 'enabled', 'retentionCount'];
const RECORD_KEYS = ['schema', 'id', 'createdAt', 'label', 'profile', 'projectSha256',
  'byteLength', 'modelLibrary', 'envelope'];
const MODEL_KEYS = ['schema', 'libraryId', 'version', 'manifestSha256', 'implementationSha256'];
const clone = (value) => structuredClone(value);
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const failure = (code, details = []) => ({ ok: false, code, details });

export function normalizeHistorySettings(value) {
  if (!exactKeys(value, SETTINGS_KEYS) || value.schema !== LOCAL_HISTORY_SETTINGS_SCHEMA
      || typeof value.enabled !== 'boolean' || !LOCAL_HISTORY_RETENTION.includes(value.retentionCount)) {
    return null;
  }
  return { schema: value.schema, enabled: value.enabled, retentionCount: value.retentionCount };
}

export function normalizeHistoryLabel(value = '') {
  if (typeof value !== 'string') return null;
  const label = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (label.length > 80 || /[\u0000-\u001f\u007f]/u.test(label)) return null;
  return label;
}

export function normalizeModelLibraryIdentity(value) {
  if (!exactKeys(value, MODEL_KEYS) || value.schema !== 'intent-mcu-model-library-lock@2'
      || typeof value.libraryId !== 'string' || !value.libraryId
      || typeof value.version !== 'string' || !value.version
      || !HASH.test(value.manifestSha256 ?? '') || !HASH.test(value.implementationSha256 ?? '')) return null;
  return clone(value);
}

export function normalizeHistoryRecord(value) {
  if (!exactKeys(value, RECORD_KEYS) || value.schema !== LOCAL_HISTORY_RECORD_SCHEMA
      || !HASH.test(value.projectSha256 ?? '')
      || value.id !== `${value.profile}:${value.projectSha256}`
      || typeof value.profile !== 'string' || !PROFILE.test(value.profile)
      || typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt))
      || normalizeHistoryLabel(value.label) !== value.label
      || !Number.isInteger(value.byteLength) || value.byteLength < 1
      || value.byteLength > LOCAL_HISTORY_RECORD_LIMIT
      || typeof value.envelope !== 'string'
      || new TextEncoder().encode(value.envelope).length !== value.byteLength) return null;
  const modelLibrary = normalizeModelLibraryIdentity(value.modelLibrary);
  if (!modelLibrary) return null;
  return { ...clone(value), modelLibrary };
}

export async function sha256Utf8(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createHistoryRecord({ envelope, profile, modelLibrary, label = '',
  createdAt = new Date().toISOString(), hash = sha256Utf8 }) {
  if (typeof envelope !== 'string') return failure('LOCAL_HISTORY_ENVELOPE');
  const byteLength = new TextEncoder().encode(envelope).length;
  if (byteLength < 1 || byteLength > LOCAL_HISTORY_RECORD_LIMIT) {
    return failure('LOCAL_HISTORY_INPUT_LIMIT', [byteLength]);
  }
  const normalizedLabel = normalizeHistoryLabel(label);
  const normalizedModel = normalizeModelLibraryIdentity(modelLibrary);
  if (!PROFILE.test(profile ?? '') || normalizedLabel === null || !normalizedModel
      || typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) {
    return failure('LOCAL_HISTORY_RECORD_SHAPE');
  }
  const projectSha256 = await hash(envelope);
  if (!HASH.test(projectSha256 ?? '')) return failure('LOCAL_HISTORY_HASH');
  const record = {
    schema: LOCAL_HISTORY_RECORD_SCHEMA,
    id: `${profile}:${projectSha256}`,
    createdAt,
    label: normalizedLabel,
    profile,
    projectSha256,
    byteLength,
    modelLibrary: normalizedModel,
    envelope,
  };
  return { ok: true, code: 'LOCAL_HISTORY_RECORD_READY', record };
}

export async function inspectHistoryRecord(value, { prepare, hash = sha256Utf8 } = {}) {
  const record = normalizeHistoryRecord(value);
  if (!record) return failure('LOCAL_HISTORY_RECORD_INVALID');
  const actualHash = await hash(record.envelope);
  if (actualHash !== record.projectSha256) return failure('LOCAL_HISTORY_HASH_MISMATCH');
  if (typeof prepare !== 'function') return failure('LOCAL_HISTORY_PREPARE_REQUIRED');
  const prepared = prepare(record.envelope);
  if (!prepared?.ok) return failure('LOCAL_HISTORY_PROJECT_INVALID', [prepared?.code ?? 'UNKNOWN']);
  if (prepared.profile !== record.profile || prepared.canonical !== record.envelope) {
    return failure('LOCAL_HISTORY_PROJECT_IDENTITY');
  }
  if (JSON.stringify(prepared.modelLibrary) !== JSON.stringify(record.modelLibrary)) {
    return failure('LOCAL_HISTORY_MODEL_IDENTITY');
  }
  const projectName = prepared.project?.metadata?.name ?? prepared.project?.name ?? 'Untitled project';
  return { ok: true, code: 'LOCAL_HISTORY_RECORD_VALID', record, prepared, projectName };
}

export function sortHistoryRecords(records) {
  return [...records].sort((left, right) => {
    const normalizedLeft = normalizeHistoryRecord(left);
    const normalizedRight = normalizeHistoryRecord(right);
    if (normalizedLeft && normalizedRight) return normalizedLeft.createdAt.localeCompare(normalizedRight.createdAt)
      || normalizedLeft.id.localeCompare(normalizedRight.id);
    if (normalizedLeft) return -1;
    if (normalizedRight) return 1;
    return 0;
  });
}

function ids(records) { return sortHistoryRecords(records).map((record) => record.id); }
function sameIds(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => value === right[index]);
}

function databaseKeyToken(value) {
  if (typeof value === 'string') return `string:${value}`;
  if (typeof value === 'number') return `number:${value}`;
  if (value instanceof Date) return `date:${value.toISOString()}`;
  if (Array.isArray(value)) return `array:[${value.map(databaseKeyToken).join(',')}]`;
  return `unknown:${String(value)}`;
}

export function rawHistoryRecordToken(value) {
  const seen = new Map();
  let nodes = 0;
  let characters = 0;
  const encode = (item, depth = 0) => {
    nodes += 1;
    if (nodes > 10000 || depth > 64) throw new Error('LOCAL_HISTORY_RECORD_TOKEN_LIMIT');
    let token;
    if (item === null) token = 'null';
    else if (typeof item === 'string') token = `string:${item.length}:${item}`;
    else if (typeof item === 'boolean') token = `boolean:${item}`;
    else if (typeof item === 'undefined') token = 'undefined';
    else if (typeof item === 'number') token = `number:${Number.isNaN(item) ? 'NaN'
      : Object.is(item, -0) ? '-0' : item === Infinity ? '+Infinity' : item === -Infinity ? '-Infinity' : item}`;
    else if (typeof item === 'bigint') token = `bigint:${item}`;
    else if (typeof item !== 'object') throw new Error('LOCAL_HISTORY_RECORD_TOKEN_TYPE');
    else if (seen.has(item)) token = `reference:${seen.get(item)}`;
    else {
      const reference = seen.size;
      seen.set(item, reference);
      if (item instanceof Date) token = `date:${item.toISOString()}`;
      else if (item instanceof ArrayBuffer) token = `array-buffer:${[...new Uint8Array(item)]
        .map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
      else if (ArrayBuffer.isView(item)) token = `view:${item.constructor.name}:${item.byteOffset}:${item.byteLength}:${encode(item.buffer, depth + 1)}`;
      else if (Array.isArray(item)) token = `array:${reference}:[${item.map((child) => encode(child, depth + 1)).join(',')}]`;
      else if (Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null) {
        token = `object:${reference}:{${Object.keys(item).sort().map((key) =>
          `${encode(key, depth + 1)}=${encode(item[key], depth + 1)}`).join(',')}}`;
      } else throw new Error('LOCAL_HISTORY_RECORD_TOKEN_TYPE');
    }
    characters += token.length;
    if (characters > LOCAL_HISTORY_RECORD_LIMIT * 4) throw new Error('LOCAL_HISTORY_RECORD_TOKEN_LIMIT');
    return token;
  };
  try { return encode(value); } catch { return null; }
}

function historyEntries(keys, records) {
  return records.map((record, index) => ({
    storageKey: clone(keys[index]),
    storageToken: databaseKeyToken(keys[index]),
    record: clone(record),
    valid: Boolean(normalizeHistoryRecord(record)),
    recordToken: rawHistoryRecordToken(record),
  })).sort((left, right) => {
    if (left.valid && right.valid) return left.record.createdAt.localeCompare(right.record.createdAt)
      || left.record.id.localeCompare(right.record.id);
    if (left.valid) return -1;
    if (right.valid) return 1;
    return left.storageToken.localeCompare(right.storageToken);
  });
}

async function readEntries(versions) {
  const [keys, records] = await Promise.all([
    requestResult(versions.getAllKeys()), requestResult(versions.getAll()),
  ]);
  return historyEntries(keys, records);
}

function entryTokens(entries) {
  if (entries.some(({ recordToken }) => recordToken === null)) return null;
  return entries.map(({ storageToken, recordToken }) => `${storageToken}\n${recordToken}`);
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error ?? new Error('INDEXED_DB_REQUEST')), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', resolve, { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('INDEXED_DB_ABORT')), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error ?? new Error('INDEXED_DB_TRANSACTION')), { once: true });
  });
}

async function abortTransactionAfterWriteError(transaction, done, error) {
  try { transaction.abort(); } catch { /* an already-aborted transaction still settles through done */ }
  try { await done; } catch { /* the original synchronous write error is more specific */ }
  throw error;
}

export class IndexedDbLocalVersionVault {
  constructor(indexedDb = globalThis.indexedDB, name = LOCAL_HISTORY_DATABASE) {
    this.indexedDb = indexedDb;
    this.name = name;
    this.database = null;
  }

  async open() {
    if (this.database) return this;
    if (!this.indexedDb?.open) throw Object.assign(new Error('LOCAL_HISTORY_UNAVAILABLE'), { code: 'LOCAL_HISTORY_UNAVAILABLE' });
    const request = this.indexedDb.open(this.name, 1);
    request.addEventListener('upgradeneeded', () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings');
      if (!database.objectStoreNames.contains('versions')) database.createObjectStore('versions', { keyPath: 'id' });
    }, { once: true });
    this.database = await requestResult(request);
    this.database.addEventListener('versionchange', () => { this.close(); }, { once: true });
    return this;
  }

  close() { this.database?.close(); this.database = null; }

  #transaction(mode = 'readonly') {
    if (!this.database) throw Object.assign(new Error('LOCAL_HISTORY_CLOSED'), { code: 'LOCAL_HISTORY_CLOSED' });
    return this.database.transaction(['settings', 'versions'], mode);
  }

  async settings() {
    const transaction = this.#transaction();
    const done = transactionDone(transaction);
    const raw = await requestResult(transaction.objectStore('settings').get('current'));
    await done;
    if (raw === undefined) return {
      schema: LOCAL_HISTORY_SETTINGS_SCHEMA, enabled: false, retentionCount: 3,
    };
    const settings = normalizeHistorySettings(raw);
    if (!settings) throw Object.assign(new Error('LOCAL_HISTORY_SETTINGS_CORRUPT'), { code: 'LOCAL_HISTORY_SETTINGS_CORRUPT' });
    return settings;
  }

  async setEnabled(enabled) {
    if (typeof enabled !== 'boolean') return failure('LOCAL_HISTORY_SETTINGS_INVALID');
    const transaction = this.#transaction('readwrite');
    const done = transactionDone(transaction);
    const settingsStore = transaction.objectStore('settings');
    const versions = transaction.objectStore('versions');
    const [rawSettings, entries] = await Promise.all([
      requestResult(settingsStore.get('current')), readEntries(versions),
    ]);
    const current = rawSettings === undefined ? {
      schema: LOCAL_HISTORY_SETTINGS_SCHEMA, enabled: false, retentionCount: 3,
    } : normalizeHistorySettings(rawSettings);
    if (!current) { await done; return failure('LOCAL_HISTORY_SETTINGS_CORRUPT'); }
    try { settingsStore.put({ ...current, enabled }, 'current'); }
    catch (error) { return abortTransactionAfterWriteError(transaction, done, error); }
    await done;
    return { ok: true, code: enabled ? 'LOCAL_HISTORY_ENABLED' : 'LOCAL_HISTORY_DISABLED',
      settings: { ...current, enabled } };
  }

  async list() {
    const entries = await this.listEntries();
    return entries.map((entry) => entry.record);
  }

  async listEntries() {
    const transaction = this.#transaction();
    const done = transactionDone(transaction);
    const entries = await readEntries(transaction.objectStore('versions'));
    await done;
    return entries;
  }

  async get(id) {
    const transaction = this.#transaction();
    const done = transactionDone(transaction);
    const record = await requestResult(transaction.objectStore('versions').get(id));
    await done;
    return record ? clone(record) : null;
  }

  async save(record, confirmation = null) {
    if (!normalizeHistoryRecord(record)) return failure('LOCAL_HISTORY_RECORD_INVALID');
    const transaction = this.#transaction('readwrite');
    const done = transactionDone(transaction);
    const settingsStore = transaction.objectStore('settings');
    const versions = transaction.objectStore('versions');
    const [rawSettings, entries] = await Promise.all([
      requestResult(settingsStore.get('current')), readEntries(versions),
    ]);
    const settings = normalizeHistorySettings(rawSettings);
    if (!settings?.enabled) { await done; return failure('LOCAL_HISTORY_DISABLED'); }
    if (entries.some((entry) => !entry.valid)) { await done; return failure('LOCAL_HISTORY_CORRUPT_STORE'); }
    const ordered = entries.map((entry) => entry.record);
    if (ordered.length > settings.retentionCount) { await done; return failure('LOCAL_HISTORY_RETENTION_STATE'); }
    const duplicate = ordered.find((item) => item.id === record.id);
    if (duplicate) {
      await done;
      return { ok: true, code: 'LOCAL_HISTORY_ALREADY_SAVED', record: clone(duplicate) };
    }
    if (confirmation) {
      const expectedIds = ids(ordered);
      const oldest = ordered[0];
      if (ordered.length < settings.retentionCount || !oldest
          || !sameIds(confirmation.expectedIds, expectedIds)
          || confirmation.replaceId !== oldest.id
          || confirmation.retentionCount !== settings.retentionCount) {
        await done;
        return failure('LOCAL_HISTORY_STALE_CONFIRMATION');
      }
      try { versions.delete(oldest.id); }
      catch (error) { return abortTransactionAfterWriteError(transaction, done, error); }
    } else if (ordered.length >= settings.retentionCount) {
      const expectedIds = ids(ordered);
      const oldest = ordered[0];
      await done;
      return { ok: false, code: 'LOCAL_HISTORY_REPLACE_CONFIRMATION_REQUIRED',
        oldest: clone(oldest), confirmation: { expectedIds, replaceId: oldest.id,
          retentionCount: settings.retentionCount } };
    }
    try { versions.add(clone(record)); }
    catch (error) { return abortTransactionAfterWriteError(transaction, done, error); }
    await done;
    return { ok: true, code: 'LOCAL_HISTORY_SAVED', record: clone(record) };
  }

  async setRetention(retentionCount, confirmation = null) {
    if (!LOCAL_HISTORY_RETENTION.includes(retentionCount)) return failure('LOCAL_HISTORY_RETENTION_INVALID');
    const transaction = this.#transaction('readwrite');
    const done = transactionDone(transaction);
    const settingsStore = transaction.objectStore('settings');
    const versions = transaction.objectStore('versions');
    const [rawSettings, entries] = await Promise.all([
      requestResult(settingsStore.get('current')), readEntries(versions),
    ]);
    const settings = normalizeHistorySettings(rawSettings);
    if (!settings?.enabled) { await done; return failure('LOCAL_HISTORY_DISABLED'); }
    if (entries.some((entry) => !entry.valid)) { await done; return failure('LOCAL_HISTORY_CORRUPT_STORE'); }
    const ordered = entries.map((entry) => entry.record);
    const remove = ordered.slice(0, Math.max(0, ordered.length - retentionCount));
    const expectedIds = ids(ordered);
    const removeIds = remove.map((record) => record.id);
    if (confirmation && (!sameIds(confirmation.expectedIds, expectedIds)
        || !sameIds(confirmation.removeIds, removeIds)
        || confirmation.retentionCount !== retentionCount)) {
      await done;
      return failure('LOCAL_HISTORY_STALE_CONFIRMATION');
    }
    if (remove.length && !confirmation) {
      await done;
      return { ok: false, code: 'LOCAL_HISTORY_RETENTION_CONFIRMATION_REQUIRED',
        remove: clone(remove), confirmation: { expectedIds, removeIds, retentionCount } };
    }
    try {
      for (const id of removeIds) versions.delete(id);
      settingsStore.put({ ...settings, retentionCount }, 'current');
    } catch (error) { return abortTransactionAfterWriteError(transaction, done, error); }
    await done;
    return { ok: true, code: 'LOCAL_HISTORY_RETENTION_UPDATED', removed: removeIds };
  }

  async delete(id, confirmation = null) {
    const transaction = this.#transaction('readwrite');
    const done = transactionDone(transaction);
    const versions = transaction.objectStore('versions');
    const record = await requestResult(versions.get(id));
    if (!record) { await done; return failure('LOCAL_HISTORY_STALE_SELECTION'); }
    const storageToken = databaseKeyToken(id);
    const recordToken = rawHistoryRecordToken(record);
    if (recordToken === null) { await done; return failure('LOCAL_HISTORY_RECORD_TOKEN_LIMIT'); }
    if (confirmation?.storageToken !== storageToken || confirmation?.recordToken !== recordToken) {
      await done;
      return { ok: false, code: 'LOCAL_HISTORY_DELETE_CONFIRMATION_REQUIRED',
        record: clone(record), confirmation: { storageToken, recordToken } };
    }
    try { versions.delete(id); }
    catch (error) { return abortTransactionAfterWriteError(transaction, done, error); }
    await done;
    return { ok: true, code: 'LOCAL_HISTORY_DELETED', id };
  }

  async clear(confirmation = null) {
    const transaction = this.#transaction('readwrite');
    const done = transactionDone(transaction);
    const versions = transaction.objectStore('versions');
    const entries = await readEntries(versions);
    const expectedEntries = entryTokens(entries);
    if (expectedEntries === null) { await done; return failure('LOCAL_HISTORY_RECORD_TOKEN_LIMIT'); }
    if (!confirmation || !sameIds(confirmation.expectedEntries, expectedEntries)) {
      await done;
      return { ok: false, code: confirmation ? 'LOCAL_HISTORY_STALE_CONFIRMATION'
        : 'LOCAL_HISTORY_CLEAR_CONFIRMATION_REQUIRED', records: entries.map((entry) => clone(entry.record)),
      confirmation: { expectedEntries } };
    }
    try { versions.clear(); }
    catch (error) { return abortTransactionAfterWriteError(transaction, done, error); }
    await done;
    return { ok: true, code: 'LOCAL_HISTORY_CLEARED', removed: expectedEntries.length };
  }
}
