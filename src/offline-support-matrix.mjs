// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { RELEASE_VERSION } from './release-metadata.mjs';
import { exactKeys, parseStrictJson } from './strict-json.mjs';

export const OFFLINE_SUPPORT_SCHEMA = 'intent-mcu-offline-support-matrix@1';
export const OFFLINE_SUPPORT_CONTRACT = 'x86-honest-offline-support-matrix-v1';
export const OFFLINE_SUPPORT_LIMIT = 32 * 1024;

const PROFILE_KEYS = [
  'id', 'label', 'freshOfflineNavigation', 'loadedDocument', 'offlineNavigationReload',
  'localDownloadOpen', 'compiler', 'runtime', 'offlineRun',
];
const TOP_KEYS = ['schema', 'contract', 'release', 'source', 'profiles', 'boundaries', 'authority'];
const AUTHORITY_KEYS = ['serviceWorker', 'appShellCache', 'offlineCompiler',
  'executablePersistence', 'run'];
const PROJECTION_LABELS = Object.freeze({
  unavailable: 'Unavailable',
  'current-in-memory-document-only': 'Current loaded document only',
  'available-in-loaded-document': 'Available in the loaded tab',
  'unavailable-offline-same-origin-server-required': 'Unavailable · same-origin server required',
  'browser-worker-avr8js': 'avr8js browser worker',
  'browser-worker-rp2040js': 'rp2040js browser worker',
  'server-espressif-qemu': 'Espressif QEMU · server runtime',
  'server-renode': 'Renode · server runtime',
  'not-supported-or-verified': 'Not supported or verified',
  'unavailable-server-runtime': 'Unavailable · server runtime',
});

const fail = (code, details = []) => {
  throw Object.assign(new Error(code), { code, details });
};

function expectedMatrix(release = RELEASE_VERSION) {
  const common = {
    freshOfflineNavigation: 'unavailable',
    loadedDocument: 'current-in-memory-document-only',
    offlineNavigationReload: 'unavailable',
    localDownloadOpen: 'available-in-loaded-document',
    compiler: 'unavailable-offline-same-origin-server-required',
  };
  return {
    schema: OFFLINE_SUPPORT_SCHEMA,
    contract: OFFLINE_SUPPORT_CONTRACT,
    release,
    source: { path: 'src/offline-support-matrix.mjs' },
    profiles: [
      { id: 'board.atmega328p-16mhz-v1', label: 'ATmega328P', ...common,
        runtime: 'browser-worker-avr8js', offlineRun: 'not-supported-or-verified' },
      { id: 'board.rp2040-pico-v1', label: 'RP2040 Pico', ...common,
        runtime: 'browser-worker-rp2040js', offlineRun: 'not-supported-or-verified' },
      { id: 'board.esp32-c3-devmodule-v1', label: 'ESP32-C3', ...common,
        runtime: 'server-espressif-qemu', offlineRun: 'unavailable-server-runtime' },
      { id: 'board.stm32f429zi-nucleo144-v1', label: 'STM32F429ZI', ...common,
        runtime: 'server-renode', offlineRun: 'unavailable-server-runtime' },
    ],
    boundaries: [
      'A loaded document is not a fresh offline application.',
      'Local project files are data only and restore no executable or runtime authority.',
      'Open requires a fresh same-origin server Build before Run.',
      'Browser-worker runtime ownership does not imply an offline compiler.',
      'No service worker, app-shell cache or offline engine is provided.',
    ],
    authority: Object.fromEntries(AUTHORITY_KEYS.map((key) => [key, false])),
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function normalizeOfflineSupportMatrix(value, { release = RELEASE_VERSION } = {}) {
  if (!exactKeys(value, TOP_KEYS) || value.schema !== OFFLINE_SUPPORT_SCHEMA
      || value.contract !== OFFLINE_SUPPORT_CONTRACT || value.release !== release
      || !exactKeys(value.source, ['path'])
      || value.source.path !== 'src/offline-support-matrix.mjs'
      || !Array.isArray(value.profiles) || value.profiles.length !== 4
      || value.profiles.some((profile) => !exactKeys(profile, PROFILE_KEYS))
      || !Array.isArray(value.boundaries) || value.boundaries.length !== 5
      || !exactKeys(value.authority, AUTHORITY_KEYS)
      || AUTHORITY_KEYS.some((key) => value.authority[key] !== false)) {
    fail('OFFLINE_SUPPORT_MATRIX_SHAPE');
  }
  const expected = expectedMatrix(release);
  if (JSON.stringify(value) !== JSON.stringify(expected)) fail('OFFLINE_SUPPORT_MATRIX_CONTENT');
  return deepFreeze(structuredClone(expected));
}

export function parseOfflineSupportMatrixText(source, options) {
  return normalizeOfflineSupportMatrix(parseStrictJson(source, OFFLINE_SUPPORT_LIMIT), options);
}

export function canonicalOfflineSupportMatrixText(value, options) {
  const text = `${JSON.stringify(normalizeOfflineSupportMatrix(value, options), null, 2)}\n`;
  if (new TextEncoder().encode(text).length > OFFLINE_SUPPORT_LIMIT) fail('OFFLINE_SUPPORT_MATRIX_LIMIT');
  return text;
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function offlineSupportMatrixHtml(value, options) {
  const matrix = normalizeOfflineSupportMatrix(value, options);
  const columns = [
    ['freshOfflineNavigation', 'Fresh offline page'],
    ['loadedDocument', 'Loaded tab'],
    ['offlineNavigationReload', 'Offline navigation / reload'],
    ['localDownloadOpen', 'Local Download/Open'],
    ['compiler', 'Compile offline'],
    ['runtime', 'Runtime owner'],
    ['offlineRun', 'Offline Run'],
  ];
  const headings = ['Controller', ...columns.map(([, label]) => label)]
    .map((label) => `<th scope="col">${escapeHtml(label)}</th>`).join('');
  const rows = matrix.profiles.map((profile) => `<tr data-offline-profile="${escapeHtml(profile.id)}"><th scope="row">${escapeHtml(profile.label)}</th>${columns.map(([key]) => {
    const state = profile[key];
    return `<td data-offline-field="${escapeHtml(key)}" data-offline-state="${escapeHtml(state)}">${escapeHtml(PROJECTION_LABELS[state])}</td>`;
  }).join('')}</tr>`).join('');
  const boundaries = matrix.boundaries.map((boundary) => `<li>${escapeHtml(boundary)}</li>`).join('');
  return `<p class="docs-intro">This exact per-profile matrix fulfills X86 by reporting current offline behavior; it does not add a cold offline application, compiler or Run.</p>
      <p><a href="/offline-support-matrix.json">Strict offline support matrix JSON</a></p>
      <div id="offline-support-table" class="offline-support-table-wrap" tabindex="0" aria-label="Scrollable current offline support matrix"><table class="offline-support-table"><caption>Current network-disconnect behavior for the four exact controller profiles</caption><thead><tr>${headings}</tr></thead><tbody>${rows}</tbody></table></div>
      <ul class="offline-support-boundaries">${boundaries}</ul>
      <p id="offline-support-status" class="truth">Exact ${escapeHtml(matrix.release)} matrix · loaded-tab file use does not provide an offline compiler or executable authority.</p>`;
}

export const OFFLINE_SUPPORT_MATRIX = normalizeOfflineSupportMatrix(expectedMatrix());
