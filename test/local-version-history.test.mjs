// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  LOCAL_HISTORY_RECORD_LIMIT,
  LOCAL_HISTORY_RECORD_SCHEMA,
  createHistoryRecord,
  inspectHistoryRecord,
  normalizeHistoryRecord,
  normalizeHistorySettings,
  rawHistoryRecordToken,
  sortHistoryRecords,
} from '../src/local-version-history.mjs';

const PROFILE = 'board.atmega328p-16mhz-v1';
const MODEL = Object.freeze({
  schema: 'intent-mcu-model-library-lock@2',
  libraryId: 'intent-mcu-public-models',
  version: '2.0.0-x56-current',
  manifestSha256: 'a'.repeat(64),
  implementationSha256: 'b'.repeat(64),
});

test('X63 corrupt-record confirmation tokens are typed, cyclic-safe and bounded', () => {
  assert.notEqual(rawHistoryRecordToken({ value: Number.NaN }), rawHistoryRecordToken({ value: null }));
  assert.notEqual(rawHistoryRecordToken({ value: -0 }), rawHistoryRecordToken({ value: 0 }));
  const first = { id: 'corrupt' };
  first.self = first;
  const same = { id: 'corrupt' };
  same.self = same;
  const changed = { id: 'changed' };
  changed.self = changed;
  assert.equal(rawHistoryRecordToken(first), rawHistoryRecordToken(same));
  assert.notEqual(rawHistoryRecordToken(first), rawHistoryRecordToken(changed));
  assert.equal(rawHistoryRecordToken({ oversized: 'x'.repeat(LOCAL_HISTORY_RECORD_LIMIT * 5) }), null);
});
const hash = async (value) => createHash('sha256').update(value).digest('hex');
const envelope = `${JSON.stringify({ schema: 'intent-mcu-project-envelope@8', profile: PROFILE,
  modelLibrary: MODEL, project: { metadata: { name: 'Version A' } } })}\n`;
const prepare = (value) => {
  if (value !== envelope) return { ok: false, code: 'PROJECT_INVALID' };
  return { ok: true, canonical: value, profile: PROFILE, modelLibrary: MODEL,
    project: { metadata: { name: 'Version A' } } };
};

test('X63 creates one strict identity-bound canonical local-history record', async () => {
  const created = await createHistoryRecord({ envelope, profile: PROFILE, modelLibrary: MODEL,
    label: '  Before   LED change  ', createdAt: '2026-10-20T02:00:00.000Z', hash });
  assert.equal(created.ok, true);
  assert.equal(created.record.schema, LOCAL_HISTORY_RECORD_SCHEMA);
  assert.equal(created.record.label, 'Before LED change');
  assert.equal(created.record.id, `${PROFILE}:${await hash(envelope)}`);
  assert.equal(created.record.byteLength, Buffer.byteLength(envelope));
  assert.deepEqual(normalizeHistoryRecord(created.record), created.record);
  const inspected = await inspectHistoryRecord(created.record, { prepare, hash });
  assert.equal(inspected.ok, true);
  assert.equal(inspected.projectName, 'Version A');
});

test('X63 rejects extra fields, hash drift, profile drift, model drift and oversize bytes', async () => {
  const created = (await createHistoryRecord({ envelope, profile: PROFILE, modelLibrary: MODEL,
    createdAt: '2026-10-20T02:00:00.000Z', hash })).record;
  assert.equal(normalizeHistoryRecord({ ...created, runtime: {} }), null);
  assert.equal((await inspectHistoryRecord({ ...created, projectSha256: 'c'.repeat(64),
    id: `${PROFILE}:${'c'.repeat(64)}` }, { prepare, hash })).code, 'LOCAL_HISTORY_HASH_MISMATCH');
  assert.equal((await inspectHistoryRecord(created, { prepare: (value) => ({ ...prepare(value),
    profile: 'board.rp2040-pico-v1' }), hash })).code, 'LOCAL_HISTORY_PROJECT_IDENTITY');
  assert.equal((await inspectHistoryRecord(created, { prepare: (value) => ({ ...prepare(value),
    modelLibrary: { ...MODEL, version: 'forged' } }), hash })).code, 'LOCAL_HISTORY_MODEL_IDENTITY');
  const tooLarge = await createHistoryRecord({ envelope: 'x'.repeat(LOCAL_HISTORY_RECORD_LIMIT + 1),
    profile: PROFILE, modelLibrary: MODEL, hash });
  assert.equal(tooLarge.code, 'LOCAL_HISTORY_INPUT_LIMIT');
});

test('X63 settings are exact and record ordering has a stable ID tie-breaker', async () => {
  assert.deepEqual(normalizeHistorySettings({
    schema: 'intent-mcu-local-history-settings@1', enabled: true, retentionCount: 3,
  }), { schema: 'intent-mcu-local-history-settings@1', enabled: true, retentionCount: 3 });
  assert.equal(normalizeHistorySettings({
    schema: 'intent-mcu-local-history-settings@1', enabled: true, retentionCount: 4,
  }), null);
  assert.equal(normalizeHistorySettings({
    schema: 'intent-mcu-local-history-settings@1', enabled: true, retentionCount: 3, extra: true,
  }), null);
  const base = (await createHistoryRecord({ envelope, profile: PROFILE, modelLibrary: MODEL,
    createdAt: '2026-10-20T02:00:00.000Z', hash })).record;
  const secondEnvelope = envelope.replace('Version A', 'Version B');
  const second = (await createHistoryRecord({ envelope: secondEnvelope, profile: PROFILE,
    modelLibrary: MODEL, createdAt: base.createdAt, hash })).record;
  assert.deepEqual(sortHistoryRecords([second, base]).map((record) => record.id),
    [base.id, second.id].sort());
  const corrupt = { id: 7, createdAt: null, envelope: '{"recover":true}' };
  assert.deepEqual(sortHistoryRecords([corrupt, second, base]).slice(-1), [corrupt]);
  assert.equal(normalizeHistoryRecord({ ...base,
    modelLibrary: { ...MODEL, schema: 'intent-mcu-model-library-lock@1' } }), null);
});
