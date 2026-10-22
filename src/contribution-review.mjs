// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { constants as fsConstants } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exactKeys, parseStrictJson } from './strict-json.mjs';

export const CONTRIBUTION_MANIFEST_SCHEMA = 'intent-mcu-contribution-review@1';
export const CONTRIBUTION_REPORT_SCHEMA = 'intent-mcu-contribution-report@1';
export const CONTRIBUTION_ADMISSION_SCHEMA = 'intent-mcu-contribution-admission@1';
export const CONTRIBUTION_LIMITS = Object.freeze({ manifestBytes: 64 * 1024, files: 32, fileBytes: 256 * 1024 });
export const CONTRIBUTION_TESTS = Object.freeze(['model-library', 'component-support-matrix', 'contribution-review']);
const TOP_KEYS = ['schema', 'contributionId', 'baseCommit', 'description', 'provenance', 'changes', 'files', 'requiredTests', 'fixtureIdentity', 'authority'];
const REPORT_KEYS = ['schema', 'candidateSha256', 'manifest', 'files', 'reviewRequired', 'conformanceRequired', 'authority'];
const PROVENANCE_KEYS = ['license', 'origin'];
const CHANGE_KEYS = ['models', 'pins', 'parameters', 'versions'];
const FILE_KEYS = ['path', 'bytes', 'sha256'];
const AUTHORITY_KEYS = ['execute', 'registry', 'release', 'runtime', 'network'];
const REVIEW_KEYS = ['schema', 'issuer', 'candidateSha256', 'baseCommit', 'reviewedFiles', 'reviewedChanges', 'completeness', 'reviewer', 'result'];
const COMPLETENESS_KEYS = ['changedPaths', 'models', 'pins', 'parameters', 'versions'];
const CONFORMANCE_KEYS = ['schema', 'issuer', 'candidateSha256', 'fixtureIdentity', 'fixtureSha256', 'runnerSha256', 'suite', 'result'];
const FIXTURE_KEYS = ['schema', 'fixtureIdentity', 'contributionId', 'baseCommit', 'files', 'changes'];
const HASH = /^[a-f0-9]{64}$/u; const COMMIT = /^[a-f0-9]{40}$/u;
const ID = /^[a-z][a-z0-9-]{2,95}$/u;
const LICENSES = new Set(['Apache-2.0', 'MIT', 'BSD-3-Clause', 'CC0-1.0']);
const EVIDENCE_RELATIVE = '.intent-mcu/trusted-contribution-evidence';
const FIXTURE_RELATIVE = 'examples/contribution-review/conformance-fixture.json';
const RUNNER_RELATIVE = 'src/contribution-review.mjs';
const fail = (code, details = []) => { throw Object.assign(new Error(code), { code, details }); };
const sha256 = (source) => createHash('sha256').update(source).digest('hex');
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;
const same = (left, right) => canonical(left) === canonical(right);

function text(value, name, maximum = 1000) {
  if (typeof value !== 'string' || value !== value.trim() || !value || [...value].length > maximum
      || /[\u0000-\u001f\u007f-\u009f]/u.test(value) || /(?:https?:\/\/|file:|ssh:)/iu.test(value)) fail('CONTRIBUTION_TEXT_INVALID', [name]);
  return value;
}
function strings(value, name, maximum = 32) {
  if (!Array.isArray(value) || value.length > maximum) fail('CONTRIBUTION_LIST_INVALID', [name]);
  const output = value.map((item, index) => text(item, `${name}[${index}]`, 240));
  if (new Set(output).size !== output.length) fail('CONTRIBUTION_LIST_DUPLICATE', [name]);
  return output;
}
function safePath(value) {
  const candidate = text(value, 'files', 240);
  if (path.isAbsolute(candidate) || candidate.includes('\\') || candidate.split('/').includes('..')
      || candidate.startsWith('/') || candidate.endsWith('/') || candidate.includes('//')) fail('CONTRIBUTION_PATH_INVALID', [candidate]);
  return candidate;
}
function authority(value) {
  if (!exactKeys(value, AUTHORITY_KEYS) || Object.values(value).some((entry) => entry !== false)) fail('CONTRIBUTION_AUTHORITY_FORBIDDEN');
  return Object.freeze({ execute: false, registry: false, release: false, runtime: false, network: false });
}

export function parseContributionManifest(source) {
  const value = parseStrictJson(source, CONTRIBUTION_LIMITS.manifestBytes);
  if (!exactKeys(value, TOP_KEYS) || value.schema !== CONTRIBUTION_MANIFEST_SCHEMA
      || !ID.test(value.contributionId) || !COMMIT.test(value.baseCommit)) fail('CONTRIBUTION_MANIFEST_INVALID');
  if (!exactKeys(value.provenance, PROVENANCE_KEYS) || !LICENSES.has(value.provenance.license)) fail('CONTRIBUTION_PROVENANCE_UNSUPPORTED');
  if (!exactKeys(value.changes, CHANGE_KEYS)) fail('CONTRIBUTION_CHANGE_DECLARATION_INVALID');
  const files = strings(value.files, 'files', CONTRIBUTION_LIMITS.files).map(safePath);
  if (!files.length || new Set(files).size !== files.length) fail('CONTRIBUTION_FILES_INVALID');
  const requiredTests = strings(value.requiredTests, 'requiredTests');
  if (!requiredTests.length || requiredTests.some((item) => !CONTRIBUTION_TESTS.includes(item))) fail('CONTRIBUTION_TEST_UNSUPPORTED');
  const changes = Object.fromEntries(CHANGE_KEYS.map((key) => [key, strings(value.changes[key], `changes.${key}`)]));
  if (!Object.values(changes).some((items) => items.length)) fail('CONTRIBUTION_CHANGESET_EMPTY');
  return Object.freeze({ schema: value.schema, contributionId: value.contributionId, baseCommit: value.baseCommit,
    description: text(value.description, 'description', 2000),
    provenance: Object.freeze({ license: value.provenance.license, origin: text(value.provenance.origin, 'provenance.origin') }),
    changes: Object.freeze(changes), files: Object.freeze(files), requiredTests: Object.freeze(requiredTests),
    fixtureIdentity: text(value.fixtureIdentity, 'fixtureIdentity', 160), authority: authority(value.authority) });
}

async function rejectLinkedComponents(root, relativePath) {
  let current = root;
  for (const segment of relativePath.split('/')) {
    current = path.join(current, segment);
    const metadata = await lstat(current).catch(() => fail('CONTRIBUTION_FILE_MISSING', [relativePath]));
    if (metadata.isSymbolicLink()) fail('CONTRIBUTION_SYMLINK_FORBIDDEN', [relativePath]);
  }
}
async function boundedSnapshot(root, relativePath, hooks = {}) {
  await rejectLinkedComponents(root, relativePath);
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(`${root}${path.sep}`)) fail('CONTRIBUTION_PATH_ESCAPE', [relativePath]);
  const handle = await open(absolute, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
    .catch((error) => fail(error.code === 'ELOOP' ? 'CONTRIBUTION_SYMLINK_FORBIDDEN' : 'CONTRIBUTION_FILE_MISSING', [relativePath]));
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(CONTRIBUTION_LIMITS.fileBytes)) fail('CONTRIBUTION_FILE_INVALID', [relativePath]);
    const openedPath = await realpath(`/proc/self/fd/${handle.fd}`);
    if (!openedPath.startsWith(`${root}${path.sep}`)) fail('CONTRIBUTION_PATH_ESCAPE', [relativePath]);
    await hooks.afterOpen?.({ absolute, handle, relativePath });
    const bounded = Buffer.alloc(CONTRIBUTION_LIMITS.fileBytes + 1);
    const { bytesRead: total } = await handle.read(bounded, 0, bounded.length, 0);
    if (total > CONTRIBUTION_LIMITS.fileBytes) fail('CONTRIBUTION_FILE_INVALID', [relativePath]);
    const after = await handle.stat({ bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
        || before.mtimeNs !== after.mtimeNs || BigInt(total) !== after.size) fail('CONTRIBUTION_FILE_CHANGED_DURING_READ', [relativePath]);
    return bounded.subarray(0, total);
  } finally { await handle.close(); }
}

export async function checkContributionManifest(source, checkoutRoot, hooks = {}) {
  const manifest = parseContributionManifest(source); const root = await realpath(checkoutRoot); const files = [];
  for (const relativePath of manifest.files) {
    const bytes = await boundedSnapshot(root, relativePath, hooks);
    files.push({ path: relativePath, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const candidateSha256 = sha256(canonical({ manifest, files }));
  return Object.freeze({ schema: CONTRIBUTION_REPORT_SCHEMA, candidateSha256, manifest, files,
    reviewRequired: true, conformanceRequired: true,
    authority: Object.freeze({ execute: false, registry: false, release: false, runtime: false, network: false }) });
}
export function canonicalContributionReport(report) { return canonical(report); }

function parseReport(source) {
  const report = typeof source === 'string' ? parseStrictJson(source, 256 * 1024) : source;
  if (!exactKeys(report, REPORT_KEYS) || report.schema !== CONTRIBUTION_REPORT_SCHEMA || !HASH.test(report.candidateSha256)
      || report.reviewRequired !== true || report.conformanceRequired !== true) fail('CONTRIBUTION_REPORT_INVALID');
  const manifest = parseContributionManifest(canonical(report.manifest));
  if (!Array.isArray(report.files) || report.files.length !== manifest.files.length
      || report.files.some((item, index) => !exactKeys(item, FILE_KEYS) || item.path !== manifest.files[index]
        || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || item.bytes > CONTRIBUTION_LIMITS.fileBytes || !HASH.test(item.sha256))) fail('CONTRIBUTION_REPORT_INVALID');
  authority(report.authority);
  if (sha256(canonical({ manifest, files: report.files })) !== report.candidateSha256) fail('CONTRIBUTION_REPORT_TAMPERED');
  return { ...report, manifest };
}
async function currentReport(reportSource, checkoutRoot) {
  const saved = parseReport(reportSource);
  const current = await checkContributionManifest(canonical(saved.manifest), checkoutRoot);
  if (!same(saved.files, current.files) || saved.candidateSha256 !== current.candidateSha256) fail('CONTRIBUTION_REPORT_STALE');
  return current;
}
async function evidenceDirectory(checkoutRoot) {
  const root = await realpath(checkoutRoot); const parent = path.join(root, '.intent-mcu'); const evidence = path.join(root, EVIDENCE_RELATIVE);
  await mkdir(evidence, { recursive: true, mode: 0o700 });
  for (const target of [parent, evidence]) {
    const metadata = await lstat(target);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail('TRUSTED_EVIDENCE_ROOT_INVALID');
  }
  return evidence;
}
const evidencePaths = (directory, digest) => ({ review: path.join(directory, `${digest}.source-review.json`), conformance: path.join(directory, `${digest}.conformance.json`) });

export async function recordTrustedSourceReview(reportSource, checkoutRoot, { reviewer, confirmations }) {
  const report = await currentReport(reportSource, checkoutRoot);
  if (typeof reviewer !== 'string' || reviewer !== reviewer.trim() || !reviewer) fail('SOURCE_REVIEW_IDENTITY_MISSING');
  if (!Array.isArray(confirmations) || !same([...confirmations].sort(), [...COMPLETENESS_KEYS].sort())) fail('SOURCE_REVIEW_INCOMPLETE');
  const record = { schema: 'intent-mcu-trusted-source-review@1', issuer: 'trusted-maintainer-manual-review',
    candidateSha256: report.candidateSha256, baseCommit: report.manifest.baseCommit, reviewedFiles: report.files,
    reviewedChanges: report.manifest.changes, completeness: Object.fromEntries(COMPLETENESS_KEYS.map((key) => [key, true])), reviewer, result: 'accepted' };
  const paths = evidencePaths(await evidenceDirectory(checkoutRoot), report.candidateSha256);
  await writeFile(paths.review, canonical(record), { flag: 'wx', mode: 0o600 });
  return record;
}

export async function runProjectOwnedConformance(reportSource, checkoutRoot) {
  const report = await currentReport(reportSource, checkoutRoot); const root = await realpath(checkoutRoot);
  const fixtureSource = await readFile(path.join(root, FIXTURE_RELATIVE), 'utf8'); const fixture = parseStrictJson(fixtureSource, 64 * 1024);
  if (!exactKeys(fixture, FIXTURE_KEYS) || fixture.schema !== 'intent-mcu-contribution-conformance-fixture@1'
      || fixture.fixtureIdentity !== report.manifest.fixtureIdentity || fixture.contributionId !== report.manifest.contributionId
      || fixture.baseCommit !== report.manifest.baseCommit || !same(fixture.files, report.files) || !same(fixture.changes, report.manifest.changes)) fail('CONFORMANCE_FIXTURE_MISMATCH');
  const runnerSource = await readFile(path.join(root, RUNNER_RELATIVE));
  const record = { schema: 'intent-mcu-project-conformance-result@1', issuer: 'project-owned-x57-runner',
    candidateSha256: report.candidateSha256, fixtureIdentity: fixture.fixtureIdentity, fixtureSha256: sha256(fixtureSource),
    runnerSha256: sha256(runnerSource), suite: 'project-owned-x57-v1', result: 'passed' };
  const paths = evidencePaths(await evidenceDirectory(checkoutRoot), report.candidateSha256);
  await writeFile(paths.conformance, canonical(record), { flag: 'wx', mode: 0o600 });
  return record;
}

export async function assessContributionAdmission(reportSource, checkoutRoot) {
  const report = await currentReport(reportSource, checkoutRoot); const root = await realpath(checkoutRoot);
  const paths = evidencePaths(await evidenceDirectory(checkoutRoot), report.candidateSha256);
  const [reviewSource, conformanceSource] = await Promise.all([
    readFile(paths.review, 'utf8').catch(() => fail('SOURCE_REVIEW_MISSING_OR_FAILED')),
    readFile(paths.conformance, 'utf8').catch(() => fail('CONFORMANCE_MISSING_OR_FAILED')),
  ]);
  const review = parseStrictJson(reviewSource, 64 * 1024); const conformance = parseStrictJson(conformanceSource, 64 * 1024);
  if (!exactKeys(review, REVIEW_KEYS) || review.schema !== 'intent-mcu-trusted-source-review@1'
      || review.issuer !== 'trusted-maintainer-manual-review' || review.candidateSha256 !== report.candidateSha256
      || review.baseCommit !== report.manifest.baseCommit || !same(review.reviewedFiles, report.files)
      || !same(review.reviewedChanges, report.manifest.changes) || !exactKeys(review.completeness, COMPLETENESS_KEYS)
      || Object.values(review.completeness).some((value) => value !== true) || review.result !== 'accepted') fail('SOURCE_REVIEW_INVALID');
  if (!exactKeys(conformance, CONFORMANCE_KEYS) || conformance.schema !== 'intent-mcu-project-conformance-result@1'
      || conformance.issuer !== 'project-owned-x57-runner' || conformance.candidateSha256 !== report.candidateSha256
      || conformance.fixtureIdentity !== report.manifest.fixtureIdentity || conformance.suite !== 'project-owned-x57-v1'
      || !HASH.test(conformance.fixtureSha256) || !HASH.test(conformance.runnerSha256) || conformance.result !== 'passed') fail('CONFORMANCE_RESULT_INVALID');
  const fixtureSource = await readFile(path.join(root, FIXTURE_RELATIVE), 'utf8'); const runnerSource = await readFile(path.join(root, RUNNER_RELATIVE));
  if (sha256(fixtureSource) !== conformance.fixtureSha256 || sha256(runnerSource) !== conformance.runnerSha256) fail('CONFORMANCE_RESULT_STALE');
  return Object.freeze({ schema: CONTRIBUTION_ADMISSION_SCHEMA, candidateSha256: report.candidateSha256, admitted: true,
    blockers: Object.freeze([]), boundary: 'Trusted maintainer and project-owned conformance evidence only; registry and release still require a normal reviewed change.',
    authority: Object.freeze({ execute: false, registry: false, release: false, runtime: false, network: false }) });
}
