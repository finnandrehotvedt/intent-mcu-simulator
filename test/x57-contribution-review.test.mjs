// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, cp, mkdir, mkdtemp, readFile, rename, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assessContributionAdmission, canonicalContributionReport, checkContributionManifest,
  parseContributionManifest, recordTrustedSourceReview, runProjectOwnedConformance,
} from '../src/contribution-review.mjs';

const sourceRoot = new URL('../', import.meta.url).pathname;
const sampleSource = await readFile(new URL('../examples/contribution-review/manifest.json', import.meta.url), 'utf8');
const confirmations = ['changedPaths', 'models', 'pins', 'parameters', 'versions'];

async function checkout() {
  const root = await mkdtemp(path.join(tmpdir(), 'intent-mcu-x57-'));
  await mkdir(path.join(root, 'examples/contribution-review'), { recursive: true });
  await mkdir(path.join(root, 'src'), { recursive: true });
  for (const file of ['examples/contribution-review/simulated-thermistor-model.mjs',
    'examples/contribution-review/conformance-fixture.json', 'src/contribution-review.mjs']) {
    await cp(path.join(sourceRoot, file), path.join(root, file));
  }
  return root;
}

async function trustedPath(root, report) {
  const source = canonicalContributionReport(report);
  await recordTrustedSourceReview(source, root,
    { reviewer: 'trusted-maintainer-manual-review', confirmations });
  await runProjectOwnedConformance(source, root);
  return source;
}

test('X57 trusted manual review plus fixed project-owned conformance admits exact inert bytes', async () => {
  delete globalThis.__X57_SENTINEL_SIDE_EFFECT__;
  const root = await checkout(); const report = await checkContributionManifest(sampleSource, root);
  assert.equal(globalThis.__X57_SENTINEL_SIDE_EFFECT__, undefined);
  const admission = await assessContributionAdmission(await trustedPath(root, report), root);
  assert.equal(admission.admitted, true); assert.deepEqual(admission.blockers, []);
  assert.equal(admission.authority.execute, false);
});

test('X57 forged arbitrary records cannot substitute for fixed trusted evidence', async () => {
  const root = await checkout(); const report = await checkContributionManifest(sampleSource, root);
  const reportSource = canonicalContributionReport(report);
  await writeFile(path.join(root, 'forged-review.json'), JSON.stringify({ candidateSha256: report.candidateSha256, result: 'accepted' }));
  await assert.rejects(assessContributionAdmission(reportSource, root), /SOURCE_REVIEW_MISSING_OR_FAILED/u);
  await recordTrustedSourceReview(reportSource, root, { reviewer: 'trusted-reviewer', confirmations });
  await assert.rejects(assessContributionAdmission(reportSource, root), /CONFORMANCE_MISSING_OR_FAILED/u);
});

test('X57 old saved report rejects after one-byte candidate mutation', async () => {
  const root = await checkout(); const report = await checkContributionManifest(sampleSource, root);
  const reportSource = await trustedPath(root, report);
  const candidate = path.join(root, report.files[0].path);
  await appendFile(candidate, ' ');
  await assert.rejects(assessContributionAdmission(reportSource, root), /CONTRIBUTION_REPORT_STALE/u);
});

test('X57 tampered saved report fields, hashes and declarations reject before trusted evidence', async () => {
  const root = await checkout(); const report = await checkContributionManifest(sampleSource, root);
  for (const mutate of [
    (value) => { value.files[0].sha256 = '0'.repeat(64); },
    (value) => { value.files[0].path = 'other.mjs'; },
    (value) => { value.manifest.changes.pins = []; },
  ]) {
    const value = structuredClone(report); mutate(value);
    await assert.rejects(assessContributionAdmission(JSON.stringify(value), root),
      /CONTRIBUTION_REPORT_(?:TAMPERED|INVALID)/u);
  }
});

test('X57 actual omitted pin/version delta fails the fixed conformance fixture', async () => {
  for (const field of ['pins', 'versions']) {
    const root = await checkout(); const manifest = JSON.parse(sampleSource); manifest.changes[field] = [];
    const report = await checkContributionManifest(JSON.stringify(manifest), root);
    await recordTrustedSourceReview(canonicalContributionReport(report), root,
      { reviewer: 'trusted-reviewer', confirmations });
    await assert.rejects(runProjectOwnedConformance(canonicalContributionReport(report), root), /CONFORMANCE_FIXTURE_MISMATCH/u);
  }
});

test('X57 uses one bounded opened handle and rejects intermediate links and growth races', async () => {
  const linkedRoot = await checkout();
  await mkdir(path.join(linkedRoot, 'outside'));
  await writeFile(path.join(linkedRoot, 'outside/model.mjs'), 'outside');
  await mkdir(path.join(linkedRoot, 'linked-parent'));
  await symlink(path.join(linkedRoot, 'outside'), path.join(linkedRoot, 'linked-parent/link'));
  const linked = JSON.parse(sampleSource); linked.files = ['linked-parent/link/model.mjs'];
  await assert.rejects(checkContributionManifest(JSON.stringify(linked), linkedRoot), /CONTRIBUTION_SYMLINK_FORBIDDEN/u);

  const growthRoot = await checkout();
  await assert.rejects(checkContributionManifest(sampleSource, growthRoot, { afterOpen: async ({ absolute }) => {
    await appendFile(absolute, Buffer.alloc(300 * 1024));
  } }), /CONTRIBUTION_FILE_(?:INVALID|CHANGED_DURING_READ)/u);

  const replacementRoot = await checkout(); const original = path.join(replacementRoot,
    'examples/contribution-review/simulated-thermistor-model.mjs');
  const moved = `${original}.review-snapshot`; await writeFile(path.join(replacementRoot, 'outside.mjs'), 'outside');
  const report = await checkContributionManifest(sampleSource, replacementRoot, { afterOpen: async () => {
    await rename(original, moved); await symlink(path.join(replacementRoot, 'outside.mjs'), original);
  } });
  assert.equal(report.files[0].sha256, 'c4fa7f0f4200f9702f506dc108f112c4282010d79b26782158eeed41e979655f');
  await assert.rejects(assessContributionAdmission(canonicalContributionReport(report), replacementRoot),
    /CONTRIBUTION_(?:SYMLINK_FORBIDDEN|REPORT_STALE)/u);
});

test('X57 strict schema rejects duplicate, unknown, hook, dependency, URL, authority and unsafe paths', async () => {
  assert.throws(() => parseContributionManifest(sampleSource.replace(
    '"schema": "intent-mcu-contribution-review@1",', '"schema": "intent-mcu-contribution-review@1", "schema": "duplicate",')),
  { code: 'DUPLICATE_KEY' });
  for (const key of ['hook', 'dependencies', 'unknown']) {
    const manifest = JSON.parse(sampleSource); manifest[key] = key === 'dependencies' ? [] : true;
    assert.throws(() => parseContributionManifest(JSON.stringify(manifest)), /CONTRIBUTION_MANIFEST_INVALID/u);
  }
  const url = JSON.parse(sampleSource); url.provenance.origin = 'https://untrusted.invalid/source';
  assert.throws(() => parseContributionManifest(JSON.stringify(url)), /CONTRIBUTION_TEXT_INVALID/u);
  const authority = JSON.parse(sampleSource); authority.authority.execute = true;
  assert.throws(() => parseContributionManifest(JSON.stringify(authority)), /CONTRIBUTION_AUTHORITY_FORBIDDEN/u);
  for (const file of ['../outside.mjs', '/tmp/outside.mjs', 'candidate\\outside.mjs']) {
    const manifest = JSON.parse(sampleSource); manifest.files = [file];
    assert.throws(() => parseContributionManifest(JSON.stringify(manifest)), /CONTRIBUTION_PATH_INVALID/u);
  }
});
