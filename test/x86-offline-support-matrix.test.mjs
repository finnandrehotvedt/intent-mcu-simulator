// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  OFFLINE_SUPPORT_LIMIT,
  OFFLINE_SUPPORT_MATRIX,
  canonicalOfflineSupportMatrixText,
  offlineSupportMatrixHtml,
  parseOfflineSupportMatrixText,
} from '../src/offline-support-matrix.mjs';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const clone = (value) => structuredClone(value);

test('X86 canonical owner has four exact profiles and honest finite states', () => {
  assert.equal(OFFLINE_SUPPORT_MATRIX.schema, 'intent-mcu-offline-support-matrix@1');
  assert.equal(OFFLINE_SUPPORT_MATRIX.contract, 'x86-honest-offline-support-matrix-v1');
  assert.equal(OFFLINE_SUPPORT_MATRIX.release, '1.1.0-rc.105');
  assert.deepEqual(OFFLINE_SUPPORT_MATRIX.profiles.map(({ id }) => id), [
    'board.atmega328p-16mhz-v1', 'board.rp2040-pico-v1',
    'board.esp32-c3-devmodule-v1', 'board.stm32f429zi-nucleo144-v1',
  ]);
  for (const profile of OFFLINE_SUPPORT_MATRIX.profiles) {
    assert.equal(profile.freshOfflineNavigation, 'unavailable');
    assert.equal(profile.loadedDocument, 'current-in-memory-document-only');
    assert.equal(profile.offlineNavigationReload, 'unavailable');
    assert.equal(profile.localDownloadOpen, 'available-in-loaded-document');
    assert.equal(profile.compiler, 'unavailable-offline-same-origin-server-required');
  }
  assert.deepEqual(OFFLINE_SUPPORT_MATRIX.profiles.map(({ runtime }) => runtime), [
    'browser-worker-avr8js', 'browser-worker-rp2040js', 'server-espressif-qemu', 'server-renode',
  ]);
  assert.deepEqual(OFFLINE_SUPPORT_MATRIX.profiles.map(({ offlineRun }) => offlineRun), [
    'not-supported-or-verified', 'not-supported-or-verified',
    'unavailable-server-runtime', 'unavailable-server-runtime',
  ]);
  assert(Object.values(OFFLINE_SUPPORT_MATRIX.authority).every((value) => value === false));
});

test('X86 canonical JSON roundtrips deterministically within its finite limit', () => {
  const text = canonicalOfflineSupportMatrixText(OFFLINE_SUPPORT_MATRIX);
  assert(new TextEncoder().encode(text).length < OFFLINE_SUPPORT_LIMIT);
  assert.deepEqual(parseOfflineSupportMatrixText(text), OFFLINE_SUPPORT_MATRIX);
  assert.equal(canonicalOfflineSupportMatrixText(parseOfflineSupportMatrixText(text)), text);
});

test('X86 strict parser rejects drift, invented availability and authority', () => {
  const base = clone(OFFLINE_SUPPORT_MATRIX);
  const cases = [
    [{ ...base, extra: true }, /OFFLINE_SUPPORT_MATRIX_SHAPE/u],
    [(() => { const value = clone(base); value.profiles.reverse(); return value; })(), /OFFLINE_SUPPORT_MATRIX_CONTENT/u],
    [(() => { const value = clone(base); value.profiles[0].freshOfflineNavigation = 'available'; return value; })(), /OFFLINE_SUPPORT_MATRIX_CONTENT/u],
    [(() => { const value = clone(base); value.profiles[1].compiler = 'browser-compiler'; return value; })(), /OFFLINE_SUPPORT_MATRIX_CONTENT/u],
    [(() => { const value = clone(base); value.authority.serviceWorker = true; return value; })(), /OFFLINE_SUPPORT_MATRIX_SHAPE/u],
  ];
  for (const [value, expected] of cases) {
    assert.throws(() => parseOfflineSupportMatrixText(JSON.stringify(value)), expected);
  }
  const canonical = canonicalOfflineSupportMatrixText(base);
  assert.throws(() => parseOfflineSupportMatrixText(canonical.replace(
    '  "schema":', '  "schema": "duplicate",\n  "schema":',
  )), /DUPLICATE_KEY/u);
  assert.throws(() => parseOfflineSupportMatrixText(' '.repeat(OFFLINE_SUPPORT_LIMIT + 1)), /INPUT_LIMIT/u);
});

test('build output and no-JS accessible Support projection derive from the canonical owner', async () => {
  const [generated, supportSource, support, llms] = await Promise.all([
    read('../dist/offline-support-matrix.json'), read('../staging/support.html'),
    read('../dist/support.html'), read('../staging/llms.txt'),
  ]);
  assert.equal(generated, canonicalOfflineSupportMatrixText(OFFLINE_SUPPORT_MATRIX));
  assert.equal(support, supportSource.replace('<!-- X86_OFFLINE_SUPPORT_MATRIX -->',
    offlineSupportMatrixHtml(OFFLINE_SUPPORT_MATRIX)));
  assert.match(support, /id="offline-support"/u);
  assert.match(support, /aria-labelledby="offline-support-title"/u);
  assert.match(support, /offline-support-matrix\.json/u);
  assert.match(support, /<table class="offline-support-table">/u);
  assert.match(support, /<th scope="row">ATmega328P<\/th>/u);
  assert.match(support, /data-offline-field="offlineNavigationReload"/u);
  assert.match(support, /Browser-worker runtime ownership does not imply an offline compiler/u);
  assert.match(support, /exact per-profile matrix fulfills X86/iu);
  assert.doesNotMatch(support, /offline-support\.js|Loading the exact four-profile support matrix/u);
  assert.match(llms, /intent-mcu-offline-support-matrix@1/u);
  assert.match(llms, /no service worker|service worker/iu);
});

test('X86 adds no service worker, app-shell cache or runtime substitution', async () => {
  const sources = (await Promise.all([
    read('../staging/index.html'), read('../staging/support.html'),
    read('../staging/main.mjs'),
    read('../scripts/build-staging.mjs'), read('../staging/server.mjs'),
  ])).join('\n');
  assert.doesNotMatch(sources, /navigator\.serviceWorker|serviceWorker\.register|caches\.open|CacheStorage/iu);
  assert.doesNotMatch(sources, /\/api\/offline|offlineRuntimeAdapter|localCompilerService/iu);
});
