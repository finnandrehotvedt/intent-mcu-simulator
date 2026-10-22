// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { exactKeys, parseStrictJson } from './strict-json.mjs';

export const CONTRIBUTION_MANIFEST_SCHEMA = 'intent-mcu-contribution-review@1';
export const CONTRIBUTION_REPORT_SCHEMA = 'intent-mcu-contribution-report@1';
export const CONTRIBUTION_ADMISSION_SCHEMA = 'intent-mcu-contribution-admission@1';
export const CONTRIBUTION_LIMITS = Object.freeze({ manifestBytes: 64 * 1024, files: 32, fileBytes: 256 * 1024 });
export const CONTRIBUTION_TESTS = Object.freeze([
  'model-library', 'component-support-matrix', 'contribution-review',
]);
const TOP_KEYS = ['schema', 'contributionId', 'description', 'provenance', 'changes', 'files',
  'requiredTests', 'fixtureIdentity', 'authority'];
const PROVENANCE_KEYS = ['license', 'origin'];
const CHANGE_KEYS = ['models', 'pins', 'parameters', 'versions'];
const AUTHORITY_KEYS = ['execute', 'registry', 'release', 'runtime', 'network'];
const REVIEW_KEYS = ['schema', 'candidateSha256', 'reviewer', 'result'];
const CONFORMANCE_KEYS = ['schema', 'candidateSha256', 'fixtureIdentity', 'suite', 'result'];
const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[a-z][a-z0-9-]{2,95}$/u;
const LICENSES = new Set(['Apache-2.0', 'MIT', 'BSD-3-Clause', 'CC0-1.0']);
const fail = (code, details = []) => { throw Object.assign(new Error(code), { code, details }); };
const sha256 = (source) => createHash('sha256').update(source).digest('hex');
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;

function text(value, name, maximum = 1000) {
  if (typeof value !== 'string' || value !== value.trim() || !value || [...value].length > maximum
      || /[\u0000-\u001f\u007f-\u009f]/u.test(value) || /(?:https?:\/\/|file:|ssh:)/iu.test(value)) {
    fail('CONTRIBUTION_TEXT_INVALID', [name]);
  }
  return value;
}

function strings(value, name, maximum = 32) {
  if (!Array.isArray(value) || value.length > maximum) fail('CONTRIBUTION_LIST_INVALID', [name]);
  const output = value.map((item, index) => text(item, `${name}[${index}]`, 160));
  if (new Set(output).size !== output.length) fail('CONTRIBUTION_LIST_DUPLICATE', [name]);
  return output;
}

function safePath(value) {
  const candidate = text(value, 'files', 240);
  if (path.isAbsolute(candidate) || candidate.includes('\\') || candidate.split('/').includes('..')
      || candidate.startsWith('/') || candidate.endsWith('/') || candidate.includes('//')) {
    fail('CONTRIBUTION_PATH_INVALID', [candidate]);
  }
  return candidate;
}

export function parseContributionManifest(source) {
  const value = parseStrictJson(source, CONTRIBUTION_LIMITS.manifestBytes);
  if (!exactKeys(value, TOP_KEYS) || value.schema !== CONTRIBUTION_MANIFEST_SCHEMA
      || !ID.test(value.contributionId)) fail('CONTRIBUTION_MANIFEST_INVALID');
  if (!exactKeys(value.provenance, PROVENANCE_KEYS) || !LICENSES.has(value.provenance.license)) {
    fail('CONTRIBUTION_PROVENANCE_UNSUPPORTED');
  }
  if (!exactKeys(value.changes, CHANGE_KEYS) || !exactKeys(value.authority, AUTHORITY_KEYS)
      || Object.values(value.authority).some((entry) => entry !== false)) {
    fail('CONTRIBUTION_AUTHORITY_FORBIDDEN');
  }
  const files = strings(value.files, 'files', CONTRIBUTION_LIMITS.files).map(safePath);
  if (!files.length || new Set(files).size !== files.length) fail('CONTRIBUTION_FILES_INVALID');
  const requiredTests = strings(value.requiredTests, 'requiredTests');
  if (!requiredTests.length || requiredTests.some((item) => !CONTRIBUTION_TESTS.includes(item))) {
    fail('CONTRIBUTION_TEST_UNSUPPORTED');
  }
  const changes = Object.fromEntries(CHANGE_KEYS.map((key) => [key, strings(value.changes[key], `changes.${key}`)]));
  if (!Object.values(changes).some((items) => items.length)) fail('CONTRIBUTION_CHANGESET_EMPTY');
  return Object.freeze({
    schema: value.schema,
    contributionId: value.contributionId,
    description: text(value.description, 'description', 2000),
    provenance: Object.freeze({ license: value.provenance.license, origin: text(value.provenance.origin, 'provenance.origin') }),
    changes: Object.freeze(changes), files: Object.freeze(files), requiredTests: Object.freeze(requiredTests),
    fixtureIdentity: text(value.fixtureIdentity, 'fixtureIdentity', 160),
    authority: Object.freeze({ execute: false, registry: false, release: false, runtime: false, network: false }),
  });
}

export async function checkContributionManifest(source, checkoutRoot) {
  const manifest = parseContributionManifest(source);
  const root = await realpath(checkoutRoot);
  const files = [];
  for (const relativePath of manifest.files) {
    const absolute = path.resolve(root, relativePath);
    if (!absolute.startsWith(`${root}${path.sep}`)) fail('CONTRIBUTION_PATH_ESCAPE', [relativePath]);
    const metadata = await lstat(absolute).catch(() => fail('CONTRIBUTION_FILE_MISSING', [relativePath]));
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > CONTRIBUTION_LIMITS.fileBytes) {
      fail(metadata.isSymbolicLink() ? 'CONTRIBUTION_SYMLINK_FORBIDDEN' : 'CONTRIBUTION_FILE_INVALID', [relativePath]);
    }
    const resolved = await realpath(absolute);
    if (!resolved.startsWith(`${root}${path.sep}`)) fail('CONTRIBUTION_PATH_ESCAPE', [relativePath]);
    const bytes = await readFile(resolved);
    files.push({ path: relativePath, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const basis = { manifest, files };
  const candidateSha256 = sha256(canonical(basis));
  return Object.freeze({ schema: CONTRIBUTION_REPORT_SCHEMA, candidateSha256, manifest, files,
    reviewRequired: true, conformanceRequired: true,
    authority: Object.freeze({ execute: false, registry: false, release: false, runtime: false, network: false }) });
}

export function canonicalContributionReport(report) { return canonical(report); }

export function assessContributionAdmission(report, reviewSource, conformanceSource) {
  if (!report || report.schema !== CONTRIBUTION_REPORT_SCHEMA || !HASH.test(report.candidateSha256)) {
    fail('CONTRIBUTION_REPORT_INVALID');
  }
  const review = parseStrictJson(reviewSource, 16 * 1024);
  const conformance = parseStrictJson(conformanceSource, 16 * 1024);
  if (!exactKeys(review, REVIEW_KEYS) || review.schema !== 'intent-mcu-source-review@1') fail('SOURCE_REVIEW_INVALID');
  if (!exactKeys(conformance, CONFORMANCE_KEYS)
      || conformance.schema !== 'intent-mcu-conformance-result@1') fail('CONFORMANCE_RESULT_INVALID');
  const blockers = [];
  if (review.candidateSha256 !== report.candidateSha256) blockers.push('SOURCE_REVIEW_STALE');
  if (review.result !== 'accepted') blockers.push('SOURCE_REVIEW_MISSING_OR_FAILED');
  if (typeof review.reviewer !== 'string' || !review.reviewer.trim()) blockers.push('SOURCE_REVIEW_IDENTITY_MISSING');
  if (conformance.candidateSha256 !== report.candidateSha256) blockers.push('CONFORMANCE_STALE');
  if (conformance.fixtureIdentity !== report.manifest.fixtureIdentity) blockers.push('CONFORMANCE_FIXTURE_MISMATCH');
  if (conformance.suite !== 'project-owned-x57-v1') blockers.push('CONFORMANCE_SUITE_UNTRUSTED');
  if (conformance.result !== 'passed') blockers.push('CONFORMANCE_MISSING_OR_FAILED');
  const undeclared = ['models', 'pins', 'parameters', 'versions'].filter((key) => !Array.isArray(report.manifest.changes[key]));
  if (undeclared.length) blockers.push('CHANGE_DECLARATION_MISSING');
  return Object.freeze({ schema: CONTRIBUTION_ADMISSION_SCHEMA, candidateSha256: report.candidateSha256,
    admitted: blockers.length === 0, blockers: Object.freeze(blockers),
    boundary: 'Maintainer evidence only; registry and release still require a normal reviewed change.',
    authority: Object.freeze({ execute: false, registry: false, release: false, runtime: false, network: false }) });
}
