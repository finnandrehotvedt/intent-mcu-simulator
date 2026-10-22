// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assessContributionAdmission, checkContributionManifest, parseContributionManifest,
} from '../src/contribution-review.mjs';

const root = new URL('../', import.meta.url).pathname;
const sampleSource = await readFile(new URL('../examples/contribution-review/manifest.json', import.meta.url), 'utf8');
const sourceReview = (digest, result = 'accepted') => JSON.stringify({
  schema: 'intent-mcu-source-review@1', candidateSha256: digest,
  reviewer: 'trusted-maintainer-review', result,
});
const conformance = (digest, fixture = 'simulated-thermistor-reference-v1', result = 'passed') => JSON.stringify({
  schema: 'intent-mcu-conformance-result@1', candidateSha256: digest, fixtureIdentity: fixture,
  suite: 'project-owned-x57-v1', result,
});

test('X57 actual manifest load hashes an inert unknown module and admits exact review plus conformance', async () => {
  delete globalThis.__X57_SENTINEL_SIDE_EFFECT__;
  const report = await checkContributionManifest(sampleSource, root);
  assert.equal(report.files.length, 1);
  assert.match(report.files[0].sha256, /^[a-f0-9]{64}$/u);
  assert.equal(globalThis.__X57_SENTINEL_SIDE_EFFECT__, undefined);
  assert.equal(report.authority.execute, false);
  const admission = assessContributionAdmission(report,
    sourceReview(report.candidateSha256), conformance(report.candidateSha256));
  assert.equal(admission.admitted, true);
  assert.deepEqual(admission.blockers, []);
  assert.equal(admission.authority.registry, false);
});

test('X57 one-byte change invalidates prior source review and conformance', async () => {
  const checkout = await mkdtemp(path.join(tmpdir(), 'intent-mcu-x57-'));
  await mkdir(path.join(checkout, 'candidate'));
  await writeFile(path.join(checkout, 'candidate/model.mjs'), 'export const value = 1;\n');
  const manifest = JSON.parse(sampleSource);
  manifest.files = ['candidate/model.mjs'];
  const first = await checkContributionManifest(JSON.stringify(manifest), checkout);
  await writeFile(path.join(checkout, 'candidate/model.mjs'), 'export const value = 2;\n');
  const second = await checkContributionManifest(JSON.stringify(manifest), checkout);
  assert.notEqual(first.candidateSha256, second.candidateSha256);
  const admission = assessContributionAdmission(second,
    sourceReview(first.candidateSha256), conformance(first.candidateSha256));
  assert.equal(admission.admitted, false);
  assert.deepEqual(admission.blockers, ['SOURCE_REVIEW_STALE', 'CONFORMANCE_STALE']);
});

test('X57 gives specific blockers for missing review, failed conformance and wrong fixture', async () => {
  const report = await checkContributionManifest(sampleSource, root);
  const blocked = assessContributionAdmission(report,
    sourceReview(report.candidateSha256, 'rejected'),
    conformance(report.candidateSha256, 'wrong-fixture', 'failed'));
  assert.equal(blocked.admitted, false);
  assert.deepEqual(blocked.blockers, [
    'SOURCE_REVIEW_MISSING_OR_FAILED', 'CONFORMANCE_FIXTURE_MISMATCH', 'CONFORMANCE_MISSING_OR_FAILED',
  ]);
});

test('X57 strict schema rejects duplicate, unknown, hook, dependency, URL and executable authority fields', () => {
  assert.throws(() => parseContributionManifest(sampleSource.replace(
    '"schema": "intent-mcu-contribution-review@1",',
    '"schema": "intent-mcu-contribution-review@1", "schema": "duplicate",')),
  { code: 'DUPLICATE_KEY' });
  for (const [key, value] of [['hook', '"echo no"'], ['dependencies', '[]'], ['unknown', 'true']]) {
    const manifest = JSON.parse(sampleSource); manifest[key] = JSON.parse(value);
    assert.throws(() => parseContributionManifest(JSON.stringify(manifest)), /CONTRIBUTION_MANIFEST_INVALID/u);
  }
  const url = JSON.parse(sampleSource); url.provenance.origin = 'https://untrusted.invalid/source';
  assert.throws(() => parseContributionManifest(JSON.stringify(url)), /CONTRIBUTION_TEXT_INVALID/u);
  const authority = JSON.parse(sampleSource); authority.authority.execute = true;
  assert.throws(() => parseContributionManifest(JSON.stringify(authority)), /CONTRIBUTION_AUTHORITY_FORBIDDEN/u);
  const licence = JSON.parse(sampleSource); licence.provenance.license = 'unknown-custom';
  assert.throws(() => parseContributionManifest(JSON.stringify(licence)), /CONTRIBUTION_PROVENANCE_UNSUPPORTED/u);
});

test('X57 rejects traversal, absolute paths, symlinks, oversized manifests and undeclared pin/version fields', async () => {
  for (const file of ['../outside.mjs', '/tmp/outside.mjs', 'candidate\\outside.mjs']) {
    const manifest = JSON.parse(sampleSource); manifest.files = [file];
    assert.throws(() => parseContributionManifest(JSON.stringify(manifest)), /CONTRIBUTION_PATH_INVALID/u);
  }
  const checkout = await mkdtemp(path.join(tmpdir(), 'intent-mcu-x57-link-'));
  await symlink('/etc/hosts', path.join(checkout, 'linked.mjs'));
  const linked = JSON.parse(sampleSource); linked.files = ['linked.mjs'];
  await assert.rejects(checkContributionManifest(JSON.stringify(linked), checkout), /CONTRIBUTION_SYMLINK_FORBIDDEN/u);
  assert.throws(() => parseContributionManifest(' '.repeat(70 * 1024)), { code: 'INPUT_LIMIT' });
  for (const field of ['pins', 'versions']) {
    const manifest = JSON.parse(sampleSource); delete manifest.changes[field];
    assert.throws(() => parseContributionManifest(JSON.stringify(manifest)), /CONTRIBUTION_AUTHORITY_FORBIDDEN/u);
  }
});
