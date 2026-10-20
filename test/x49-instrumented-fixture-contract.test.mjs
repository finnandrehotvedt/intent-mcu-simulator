// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  THERMOSTAT_EXPERIMENT_KNOWN_BAD_SOURCE, THERMOSTAT_EXPERIMENT_SOURCE,
} from '../src/thermostat-source.mjs';
import {
  instrumentX49ThermostatSource, validateX49RuntimeProbe, X49_BASE_SOURCE_SHA256,
  X49_INSTRUMENTED_FIXTURE_ID, X49_INSTRUMENTED_FIXTURE_LIMITS,
  X49_INSTRUMENTED_SOURCE, X49_INSTRUMENTED_SOURCE_SHA256, X49_PROBE_BYTES,
  X49_PROBE_SYMBOL, X49_PROBE_TYPE, X49_RUNTIME_PROBE_SCHEMA,
} from '../src/x49-instrumented-fixture-contract.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const probe = () => ({
  schema: X49_RUNTIME_PROBE_SCHEMA, fixtureId: X49_INSTRUMENTED_FIXTURE_ID,
  sourceSha256: X49_INSTRUMENTED_SOURCE_SHA256, artifactIdentity: 'b'.repeat(64),
  symbol: { symbol: X49_PROBE_SYMBOL, dataAddress: 0x100, size: X49_PROBE_BYTES,
    elfSha256: 'c'.repeat(64), binding: 'global', type: 'object' },
});

test('byte-pinned transform adds one exact packed global mailbox without changing public source', () => {
  assert.equal(sha256(THERMOSTAT_EXPERIMENT_SOURCE), X49_BASE_SOURCE_SHA256);
  assert.equal(sha256(X49_INSTRUMENTED_SOURCE), X49_INSTRUMENTED_SOURCE_SHA256);
  assert.equal(instrumentX49ThermostatSource(), X49_INSTRUMENTED_SOURCE);
  assert.equal(THERMOSTAT_EXPERIMENT_SOURCE.includes(X49_PROBE_SYMBOL), false);
  assert.match(X49_INSTRUMENTED_SOURCE,
    new RegExp(`struct __attribute__\\(\\(packed\\)\\) ${X49_PROBE_TYPE}`));
  assert.match(X49_INSTRUMENTED_SOURCE,
    new RegExp(`static_assert\\(sizeof\\(${X49_PROBE_TYPE}\\) == ${X49_PROBE_BYTES}`));
  assert.equal(X49_INSTRUMENTED_FIXTURE_LIMITS.nativeEvidenceClaimed, false);
  assert.equal(X49_INSTRUMENTED_FIXTURE_LIMITS.compiledArtifactCreated, false);
});

test('source anchor drift and duplicate anchors reject before transformation', () => {
  assert.throws(() => instrumentX49ThermostatSource(`${THERMOSTAT_EXPERIMENT_SOURCE}\n`),
    { code: 'X49_BASE_SOURCE_MISMATCH' });
  assert.throws(() => instrumentX49ThermostatSource(THERMOSTAT_EXPERIMENT_KNOWN_BAD_SOURCE),
    { code: 'X49_BASE_SOURCE_MISMATCH' });
  assert.throws(() => instrumentX49ThermostatSource(
    THERMOSTAT_EXPERIMENT_SOURCE.replace('const byte TEMP_PIN = A1;', 'const byte TEMP_PIN = A2;'),
  ), { code: 'X49_BASE_SOURCE_MISMATCH' });
  assert.throws(() => instrumentX49ThermostatSource(
    `${THERMOSTAT_EXPERIMENT_SOURCE}const byte TEMP_PIN = A1;`,
  ), { code: 'X49_BASE_SOURCE_MISMATCH' });
});

test('runtime probe accepts only the exact symbol, type, size, binding and SRAM range', () => {
  assert.deepEqual(validateX49RuntimeProbe(probe()), probe());
  const mutations = [
    (value) => { value.sourceSha256 = 'a'.repeat(64); },
    (value) => { value.symbol.symbol = 'other'; },
    (value) => { value.symbol.size = 3; },
    (value) => { value.symbol.binding = 'weak'; },
    (value) => { value.symbol.type = 'function'; },
    (value) => { value.symbol.dataAddress = 0x0ff; },
    (value) => { value.symbol.extra = true; },
  ];
  for (const mutate of mutations) {
    const value = probe(); mutate(value);
    assert.throws(() => validateX49RuntimeProbe(value), { code: 'X49_RUNTIME_PROBE_INVALID' });
  }
});

test('Stage A modules remain outside every executable model and browser closure', async () => {
  const executableOwners = await Promise.all([
    '../src/atmega328p-adapter.mjs', '../src/runtime-kernel.mjs',
    '../src/simulator.worker.mjs', '../staging/main.mjs',
    '../scripts/generate-model-library-snapshots.mjs',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  assert.doesNotMatch(executableOwners.join('\n'),
    /x49-instrumented-fixture-contract|x49-instrumented-observer-core/u);
  const [fixtureSource, observerSource] = await Promise.all([
    readFile(new URL('../src/x49-instrumented-fixture-contract.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/x49-instrumented-observer-core.mjs', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(`${fixtureSource}\n${observerSource}`,
    /postMessage\(|new Worker|\/api\/build|\/api\/run|fetch\(/u);
});
