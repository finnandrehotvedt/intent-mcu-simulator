// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { capabilityDiscoverySnapshot } from '../src/capability-discovery.mjs';
import {
  RELEASE_CHANGES_LIMIT,
  canonicalReleaseChangesText,
  parseReleaseChangeRegistryText,
  parseReleaseChangesText,
} from '../src/release-changes.mjs';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const clone = (value) => structuredClone(value);

async function owner() {
  const [source, registrySource, implementation, releaseSource] = await Promise.all([
    read('../release-changes.source.json'), read('../release-change-registry.json'),
    read('../src/release-changes.mjs'), read('../release.json'),
  ]);
  const registry = parseReleaseChangeRegistryText(registrySource);
  const release = JSON.parse(releaseSource);
  const options = { currentVersion: release.version, implementationSha256: sha256(implementation), registry };
  return { source, registry, release, options, value: parseReleaseChangesText(source, options) };
}

test('X88 owner binds canonical rc107 to rc108 reviewed X66 subcircuit bytes', async () => {
  const { source, registry, release, options, value } = await owner();
  assert.equal(release.version, '1.1.0-rc.108');
  assert.equal(registry.ids.length, 96);
  assert.equal(registry.ids[0], 'X01');
  assert.equal(registry.ids.at(-1), 'X96');
  assert(registry.ids.includes('X47'));
  assert(registry.ids.includes('X49'));
  assert(registry.ids.includes('X55'));
  assert(registry.ids.includes('X92'));
  assert.deepEqual(value.release, { previous: '1.1.0-rc.107', current: '1.1.0-rc.108' });
  assert.deepEqual(value.changes, [
    {
      id: 'X66', classification: 'changed',
      capabilities: ['intent-mcu-annotated-workspace@2', 'intent-mcu-canvas-annotations@2', 'intent-mcu-net-labels@1', 'intent-mcu-subcircuit-definition@1', 'intent-mcu-subcircuit-instance@1', 'intent-mcu-subcircuits@1'],
      contracts: ['x66-bounded-reusable-subcircuit-v1', 'x66-existing-canonical-net-labels-v1', 'x66-non-electrical-canvas-annotations-v1'],
      summary: 'Publishes one finite non-nested AVR resistor-and-LED subcircuit increment, but independent default-thermostat Create acceptance failed; X66 remains partial pending a corrected independently reviewed release.',
    },
    {
      id: 'X88', classification: 'changed', capabilities: ['intent-mcu-release-changes@1'],
      contracts: ['x88-machine-readable-release-delta-v1'],
      summary: 'Records the rc.107 to rc.108 bounded X66 subcircuit increment without claiming closure after the default-thermostat public acceptance failure; X66 and X92 remain partial with zero new native producer authority.',
    },
  ]);
  assert.equal(value.migrationRequired, false);
  assert.equal(value.breakingChangesPresent, false);
  assert.deepEqual(value.authority, { apply: false, build: false, run: false, replay: false, verdict: false });
  assert.equal(value.product.source.implementation.sha256, options.implementationSha256);
  assert.equal(canonicalReleaseChangesText(value, options), source);
  assert.equal(canonicalReleaseChangesText(value, options), canonicalReleaseChangesText(value, options));
  assert(new TextEncoder().encode(source).length < RELEASE_CHANGES_LIMIT);
});

test('strict parser accepts the historical rc79 to rc80 X88 fixture without presenting it as rc83', async () => {
  const { value, registry, options } = await owner();
  const historical = clone(value);
  historical.release = { previous: '1.1.0-rc.79', current: '1.1.0-rc.80' };
  historical.changes = [{ id: 'X88', classification: 'additive',
    capabilities: ['intent-mcu-release-changes@1'],
    contracts: ['x88-machine-readable-release-delta-v1'],
    summary: 'Adds a strict static machine-readable release delta for read-only discovery.' }];
  const historicalOptions = { ...options, currentVersion: '1.1.0-rc.80', registry };
  const text = canonicalReleaseChangesText(historical, historicalOptions);
  const parsed = parseReleaseChangesText(text, historicalOptions);
  assert.deepEqual(parsed.release, { previous: '1.1.0-rc.79', current: '1.1.0-rc.80' });
  assert.deepEqual(parsed.changes.map(({ id }) => id), ['X88']);
  assert.equal(text.includes('X59'), false);
});

test('strict parser atomically rejects unknown, duplicate, reordered, stale, oversized and authority-bearing input', async () => {
  const { source, value, options } = await owner();
  const rejects = [
    ['extra field', () => parseReleaseChangesText(JSON.stringify({ ...value, extra: true }), options), /RELEASE_CHANGES_SHAPE/u],
    ['duplicate key', () => parseReleaseChangesText(source.replace('  "schema":', '  "schema": "duplicate",\n  "schema":'), options), /DUPLICATE_KEY/u],
    ['stale current', () => parseReleaseChangesText(source, { ...options, currentVersion: '1.1.0-rc.80' }), /CURRENT_STALE/u],
    ['stale implementation', () => parseReleaseChangesText(source, { ...options, implementationSha256: '0'.repeat(64) }), /IMPLEMENTATION_STALE/u],
    ['unknown id', () => { const x = clone(value); x.changes[0].id = 'X97'; return canonicalReleaseChangesText(x, options); }, /ID_UNKNOWN/u],
    ['unknown classification', () => { const x = clone(value); x.changes[0].classification = 'marketing'; return canonicalReleaseChangesText(x, options); }, /CLASSIFICATION/u],
    ['fictional capability', () => { const x = clone(value); x.changes[0].capabilities = ['fictional-release-capability@1']; return canonicalReleaseChangesText(x, options); }, /IDENTIFIER_BINDING/u],
    ['other X binding', () => { const x = clone(value); x.changes[0].capabilities = ['intent-mcu-experiment-package-comparison@1']; x.changes[0].contracts = ['x41-experiment-package-comparison-v1']; return canonicalReleaseChangesText(x, options); }, /IDENTIFIER_BINDING/u],
    ['authority true', () => { const x = clone(value); x.authority.run = true; return canonicalReleaseChangesText(x, options); }, /AUTHORITY/u],
    ['unbound prose row', () => { const x = clone(value); x.changes[0].contracts = []; return canonicalReleaseChangesText(x, options); }, /TOKENS/u],
    ['oversized', () => parseReleaseChangesText(' '.repeat(RELEASE_CHANGES_LIMIT + 1), options), /INPUT_LIMIT/u],
  ];
  for (const [name, operation, expected] of rejects) assert.throws(operation, expected, name);

  const duplicated = clone(value); duplicated.changes.push(clone(duplicated.changes[0]));
  assert.throws(() => canonicalReleaseChangesText(duplicated, options), /ID_DUPLICATE/u);
  const reordered = clone(value);
  reordered.changes = [
    { ...clone(value.changes[0]), id: 'X88', capabilities: ['intent-mcu-release-changes@1'], contracts: ['x88-machine-readable-release-delta-v1'] },
    { ...clone(value.changes[0]), id: 'X41', contracts: ['x41-experiment-package-comparison-v1'] },
  ];
  assert.throws(() => canonicalReleaseChangesText(reordered, options), /ID_ORDER/u);
  const unsafeVersion = clone(value);
  unsafeVersion.release = { previous: '1.1.0-rc.9007199254740992', current: '1.1.0-rc.9007199254740993' };
  assert.throws(() => canonicalReleaseChangesText(unsafeVersion, options), /RELEASE_CHANGES_VERSION/u);
});

test('generated file is exact and capability discovery changes only its ordinary release version projection', async () => {
  const { source } = await owner();
  const generated = await read('../dist/release-changes.json');
  assert.equal(generated, source);
  const discovery = capabilityDiscoverySnapshot();
  assert.equal(discovery.identity.version, '1.1.0-rc.108');
  assert.deepEqual(Object.keys(discovery), ['schema', 'identity', 'transport', 'actions', 'quotas', 'contracts', 'profiles', 'parts']);
  assert.equal(discovery.actions.count, 7);
  assert.equal(discovery.actions.names.length, 7);
  assert.equal(discovery.actions.applyAuthority, false);
  assert.equal('releaseChanges' in discovery, false);
  const baselineProjection = clone(discovery);
  baselineProjection.identity.version = '1.1.0-rc.81';
  assert.equal(sha256(JSON.stringify(baselineProjection)), 'a5034ca1d445b66d58feccb8fa0eeda9529334b5b4c1d3e361c8b9663ae232fd');
});

test('HTML, llms and Support discover the same static file without adding a public API', async () => {
  const [index, llms, support, gateway] = await Promise.all([
    read('../staging/index.html'), read('../staging/llms.txt'), read('../staging/support.html'),
    read('../compiler/http-gateway.mjs'),
  ]);
  assert.match(index, /rel="alternate" href="\/release-changes\.json" type="application\/json"/u);
  assert.match(llms, /Machine-readable release changes: \/release-changes\.json/u);
  assert.match(llms, /no Apply, Build, Run, replay or verdict authority/iu);
  assert.match(support, /id="release-changes"/u);
  assert.match(support, /reports reviewed release metadata only/iu);
  assert.equal(gateway.includes('/release-changes.json'), false);
});
