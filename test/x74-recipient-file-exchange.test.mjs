// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  RECIPIENT_RESPONSE_LIMIT,
  RECIPIENT_RESPONSE_LIMITATIONS,
  createRecipientResponse,
  parseRecipientResponse,
} from '../src/recipient-file-exchange.mjs';
import { THERMOSTAT_PROJECT_ADAPTER } from '../src/thermostat-experiment.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

const PROFILE = 'board.atmega328p-16mhz-v1';
const adapters = Object.freeze({ [PROFILE]: THERMOSTAT_PROJECT_ADAPTER });
const correctUrl = new URL('./fixtures/x69-correct.intent-mcu-experiment.json', import.meta.url);
const knownBadUrl = new URL('./fixtures/x69-known-bad.intent-mcu-experiment.json', import.meta.url);

test('X74 creates and reopens one strict local data-only response bound to exact parent bytes', async () => {
  const parentSource = await readFile(correctUrl, 'utf8');
  const created = await createRecipientResponse({ parentSource, adapters,
    disposition: 'reviewed', note: 'Equality boundary and recorded D13 output reviewed.' });
  assert.equal(created.ok, true, created.code);
  assert.equal(created.parentPackageSha256,
    '4b7d85dd0d0fce4d5b521c16c798730af6547d554f32c5f8895668f887530fc5');
  assert.deepEqual(created.value.authority,
    { apply: false, build: false, run: false, runtime: false, verdict: false });
  assert.deepEqual(created.value.limitations, [...RECIPIENT_RESPONSE_LIMITATIONS]);
  const opened = await parseRecipientResponse(created.canonical, { parentSource, adapters });
  assert.equal(opened.ok, true, opened.code);
  assert.equal(opened.relationship, 'exact-parent');
  assert.equal(opened.sha256, created.sha256);
  assert.equal(opened.value.review.note, created.value.review.note);
  assert.equal(opened.serverStored, false);
});

test('X74 rejects wrong-parent, stale and duplicate responses without accepting relationship authority', async () => {
  const [correct, knownBad] = await Promise.all([
    readFile(correctUrl, 'utf8'), readFile(knownBadUrl, 'utf8'),
  ]);
  const created = await createRecipientResponse({ parentSource: correct, adapters,
    disposition: 'changes-requested', note: 'Please explain the equality observation.' });
  assert.equal((await parseRecipientResponse(created.canonical,
    { parentSource: knownBad, adapters })).code, 'RECIPIENT_RESPONSE_WRONG_PARENT');
  assert.equal((await parseRecipientResponse(created.canonical, { parentSource: knownBad, adapters,
    expectedParentSha256: created.parentPackageSha256 })).code, 'RECIPIENT_RESPONSE_STALE_PARENT');
  assert.equal((await parseRecipientResponse(created.canonical, { parentSource: correct, adapters,
    seenResponseSha256: new Set([created.sha256]) })).code, 'RECIPIENT_RESPONSE_DUPLICATE');
});

test('X74 fails closed for markup, executable fields, malformed bytes and bounded-note violations', async (suite) => {
  const parentSource = await readFile(correctUrl, 'utf8');
  for (const [name, note] of [
    ['html', '<img src=x onerror=alert(1)>'],
    ['svg', '<svg><script>run()</script></svg>'],
    ['empty', '   '],
    ['oversized', 'a'.repeat(2001)],
  ]) await suite.test(name, async () => {
    assert.equal((await createRecipientResponse({ parentSource, adapters,
      disposition: 'reviewed', note })).code, 'RECIPIENT_RESPONSE_NOTE');
  });
  const created = await createRecipientResponse({ parentSource, adapters,
    disposition: 'reviewed', note: 'Data only.' });
  for (const mutate of [
    (value) => { value.runtime = { command: 'run' }; },
    (value) => { value.authority.runtime = true; },
    (value) => { value.review.unknown = 'field'; },
  ]) {
    const value = structuredClone(created.value); mutate(value);
    assert.equal((await parseRecipientResponse(`${JSON.stringify(value, null, 2)}\n`,
      { parentSource, adapters })).ok, false);
  }
  assert.equal((await parseRecipientResponse('{}\n', { parentSource, adapters })).ok, false);
  assert.equal((await parseRecipientResponse('x'.repeat(RECIPIENT_RESPONSE_LIMIT + 1),
    { parentSource, adapters })).ok, false);
  assert.equal((await parseRecipientResponse(created.canonical.trim(),
    { parentSource, adapters })).code, 'RECIPIENT_RESPONSE_NOT_CANONICAL');
});

