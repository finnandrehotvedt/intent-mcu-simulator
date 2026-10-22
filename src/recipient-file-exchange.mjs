// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys, parseStrictJson } from './strict-json.mjs';
import {
  EXPERIMENT_PACKAGE_SCHEMA,
  experimentPackageSha256,
  parseExperimentPackage,
} from './experiment-package.mjs';

export const RECIPIENT_RESPONSE_SCHEMA = 'intent-mcu-recipient-response@1';
export const RECIPIENT_RESPONSE_LIMIT = 64 * 1024;
export const RECIPIENT_RESPONSE_NOTE_LIMIT = 2000;
export const RECIPIENT_RESPONSE_LIMITATIONS = Object.freeze([
  'Local data-only review artifact. It cannot apply changes, execute code, restore a runtime or establish a verdict.',
  'The parent digest binds exact package bytes but does not establish sender identity or the truth of either file.',
]);

const HASH = /^[a-f0-9]{64}$/u;
const MARKUP = /[<>]/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const failure = (code, details = []) => ({ ok: false, code, details });

function parentIdentity(parsed) {
  const { value } = parsed;
  return {
    packageSha256: parsed.sha256,
    profile: value.profile,
    experimentId: value.experimentId,
    projectSha256: value.bindings.projectSha256,
    reportSha256: value.bindings.reportSha256,
    manifestSha256: value.bindings.manifestSha256,
  };
}

function validNote(note) {
  return typeof note === 'string' && note === note.trim() && note.length > 0
    && [...note].length <= RECIPIENT_RESPONSE_NOTE_LIMIT
    && new TextEncoder().encode(note).length <= RECIPIENT_RESPONSE_NOTE_LIMIT * 4
    && !MARKUP.test(note) && !CONTROL.test(note);
}

function normalizeResponse(value) {
  if (!exactKeys(value, ['schema', 'parent', 'review', 'authority', 'limitations'])
      || value.schema !== RECIPIENT_RESPONSE_SCHEMA
      || !exactKeys(value.parent, ['packageSha256', 'profile', 'experimentId',
        'projectSha256', 'reportSha256', 'manifestSha256'])
      || Object.values(value.parent).some((item) => typeof item !== 'string')
      || !HASH.test(value.parent.packageSha256)
      || !HASH.test(value.parent.projectSha256)
      || !HASH.test(value.parent.reportSha256)
      || !HASH.test(value.parent.manifestSha256)
      || !exactKeys(value.review, ['disposition', 'note'])
      || !['reviewed', 'changes-requested'].includes(value.review.disposition)
      || !validNote(value.review.note)
      || !exactKeys(value.authority, ['apply', 'build', 'run', 'runtime', 'verdict'])
      || Object.values(value.authority).some((item) => item !== false)
      || !Array.isArray(value.limitations)
      || JSON.stringify(value.limitations) !== JSON.stringify(RECIPIENT_RESPONSE_LIMITATIONS)) {
    throw Object.assign(new Error('RECIPIENT_RESPONSE_SHAPE'), { code: 'RECIPIENT_RESPONSE_SHAPE' });
  }
  return structuredClone(value);
}

async function strictParent(parentSource, adapters) {
  const parsed = await parseExperimentPackage(parentSource, adapters);
  if (!parsed.ok) return parsed;
  if (parsed.value.schema !== EXPERIMENT_PACKAGE_SCHEMA || parsed.legacyReviewOnly) {
    return failure('RECIPIENT_HANDOVER_STRICT_V3_REQUIRED');
  }
  return parsed;
}

export async function createRecipientResponse({ parentSource, disposition, note, adapters }) {
  try {
    const parent = await strictParent(parentSource, adapters);
    if (!parent.ok) return failure(parent.code, parent.details);
    if (!validNote(note)) return failure('RECIPIENT_RESPONSE_NOTE');
    if (!['reviewed', 'changes-requested'].includes(disposition)) {
      return failure('RECIPIENT_RESPONSE_DISPOSITION');
    }
    const value = {
      schema: RECIPIENT_RESPONSE_SCHEMA,
      parent: parentIdentity(parent),
      review: { disposition, note },
      authority: { apply: false, build: false, run: false, runtime: false, verdict: false },
      limitations: [...RECIPIENT_RESPONSE_LIMITATIONS],
    };
    const canonical = `${JSON.stringify(value, null, 2)}\n`;
    if (new TextEncoder().encode(canonical).length > RECIPIENT_RESPONSE_LIMIT) {
      return failure('RECIPIENT_RESPONSE_LIMIT');
    }
    return { ok: true, code: 'RECIPIENT_RESPONSE_CREATED', value, canonical,
      sha256: await experimentPackageSha256(canonical), parentPackageSha256: parent.sha256,
      serverStored: false, executableAuthority: false, runtimeAuthority: false,
      applyAuthority: false, verdictAuthority: false };
  } catch (error) {
    return failure(error.code ?? error.message ?? 'RECIPIENT_RESPONSE_INVALID', error.details ?? []);
  }
}

export async function parseRecipientResponse(source, {
  parentSource, adapters, expectedParentSha256 = null, seenResponseSha256 = new Set(),
} = {}) {
  try {
    const parent = await strictParent(parentSource, adapters);
    if (!parent.ok) return failure(parent.code, parent.details);
    if (expectedParentSha256 !== null && parent.sha256 !== expectedParentSha256) {
      return failure('RECIPIENT_RESPONSE_STALE_PARENT');
    }
    const value = normalizeResponse(parseStrictJson(source, RECIPIENT_RESPONSE_LIMIT));
    const canonical = `${JSON.stringify(value, null, 2)}\n`;
    if (canonical !== source) return failure('RECIPIENT_RESPONSE_NOT_CANONICAL');
    const sha256 = await experimentPackageSha256(canonical);
    const expected = parentIdentity(parent);
    if (JSON.stringify(value.parent) !== JSON.stringify(expected)) {
      return failure('RECIPIENT_RESPONSE_WRONG_PARENT');
    }
    if (seenResponseSha256.has(sha256)) return failure('RECIPIENT_RESPONSE_DUPLICATE');
    return { ok: true, code: 'RECIPIENT_RESPONSE_ACCEPTED', value, canonical, sha256,
      parentPackageSha256: parent.sha256, relationship: 'exact-parent', serverStored: false,
      executableAuthority: false, runtimeAuthority: false, applyAuthority: false,
      verdictAuthority: false };
  } catch (error) {
    return failure(error.code ?? error.message ?? 'RECIPIENT_RESPONSE_INVALID', error.details ?? []);
  }
}
