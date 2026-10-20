// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createAuthoredChangeReview } from './authored-change-review.mjs';
import {
  createCheckableEvidenceReport,
  validateCheckableEvidenceReport,
} from './checkable-evidence-report.mjs';
import {
  EXPERIMENT_PACKAGE_LIMIT,
  EXPERIMENT_PACKAGE_SCHEMA,
  parseExperimentPackage,
} from './experiment-package.mjs';
import { describeProjectChanges } from './project-patch.mjs';

export const EXPERIMENT_PACKAGE_COMPARISON_SCHEMA = 'intent-mcu-experiment-package-comparison@1';
export const EXPERIMENT_PACKAGE_COMPARISON_LIMITS = Object.freeze({
  packageBytes: EXPERIMENT_PACKAGE_LIMIT,
  sourceFiles: 8,
  sourceBytes: 128 * 1024,
  renderedRows: 2000,
});

const HASH = /^[a-f0-9]{64}$/u;
const encoder = new TextEncoder();
const clone = (value) => structuredClone(value);
const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const failure = (code, details = []) => ({ ok: false, code, details });
const reject = (code, details = []) => {
  throw Object.assign(new Error(code), { code, details });
};
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function authoredProject(envelope) {
  const contact = envelope?.project;
  return contact?.project && typeof contact.project === 'object' ? contact.project : contact;
}

function sourceFiles(envelope) {
  const authored = authoredProject(envelope);
  if (!Array.isArray(authored?.source?.files)) reject('X41_SOURCE_SHAPE');
  return authored.source.files;
}

export function validateExperimentComparisonLimits({
  packageBytes = 0,
  files = null,
  renderedRows = 0,
} = {}) {
  if (!Number.isSafeInteger(packageBytes) || packageBytes < 0
      || packageBytes > EXPERIMENT_PACKAGE_COMPARISON_LIMITS.packageBytes) {
    return failure('X41_PACKAGE_LIMIT', [packageBytes]);
  }
  if (!Number.isSafeInteger(renderedRows) || renderedRows < 0
      || renderedRows > EXPERIMENT_PACKAGE_COMPARISON_LIMITS.renderedRows) {
    return failure('X41_RENDER_LIMIT', [renderedRows]);
  }
  if (files !== null) {
    if (!Array.isArray(files)) return failure('X41_SOURCE_SHAPE');
    const bytes = files.reduce((total, file) => total
      + encoder.encode(typeof file?.content === 'string' ? file.content : '').byteLength, 0);
    if (files.length < 1 || files.length > EXPERIMENT_PACKAGE_COMPARISON_LIMITS.sourceFiles
        || files.some((file) => typeof file?.name !== 'string' || !file.name
          || typeof file?.content !== 'string')
        || bytes > EXPERIMENT_PACKAGE_COMPARISON_LIMITS.sourceBytes) {
      return failure('X41_SOURCE_LIMIT', [files.length, bytes]);
    }
  }
  return { ok: true, code: 'X41_LIMITS_ACCEPTED' };
}

function enforceSourceLimits(envelope, side) {
  const result = validateExperimentComparisonLimits({ files: sourceFiles(envelope) });
  if (!result.ok) reject(result.code, [side, ...result.details]);
}

function normalizedExpectation(value) {
  const normalized = clone(value);
  delete normalized.originProjectSha256;
  return normalized;
}

function authorityAbsent(value, side) {
  if (!same(value.report.authority, { executable: false, runtime: false, verdict: false })) {
    reject('X41_AUTHORITY_REJECTED', [side]);
  }
}

function evidenceComplete(value, side) {
  if (!value.report.completeness.allEvidenceComplete || value.report.completeness.anyDataLoss
      || value.report.results.length !== value.project.scenarioTimeline.scenarios.length
      || value.report.results.some((result) => result.evidenceStatus !== 'complete'
        || result.retention?.inputEventsDropped !== 0
        || result.retention?.serialEventsDropped !== 0)) {
    reject('X41_EVIDENCE_INCOMPLETE', [side]);
  }
}

function identities(value, packageSha256) {
  return {
    packageSha256,
    projectSha256: value.bindings.projectSha256,
    expectationSha256: value.bindings.expectationSha256,
    sourceSha256: value.manifest.sourceSha256,
    circuitSha256: value.manifest.circuitSha256,
    artifactSha256: value.manifest.artifactSha256,
    reportSha256: value.bindings.reportSha256,
    manifestSha256: value.bindings.manifestSha256,
  };
}

function evidenceRowShape(row) {
  return {
    id: row.id,
    label: row.label,
    kind: row.kind,
    channelId: row.channelId,
    sourcePath: row.sourcePath,
    unit: clone(row.unit),
    timeBasis: row.timeBasis,
    provenance: row.provenance,
  };
}

export function validateExperimentComparisonContext(before, after, beforeEvidence, afterEvidence) {
  if (before.profile !== after.profile) return failure('X41_PROFILE_MISMATCH');
  if (before.experimentId !== after.experimentId) return failure('X41_EXPERIMENT_MISMATCH');
  if (!same(before.project.brief, after.project.brief)
      || !same(normalizedExpectation(before.expectation), normalizedExpectation(after.expectation))) {
    return failure('X41_EXPECTATION_MISMATCH');
  }
  if (!same(before.project.scenarioTimeline, after.project.scenarioTimeline)) {
    return failure('X41_SCENARIO_MISMATCH');
  }
  if (!same(before.manifest.modelLibrary, after.manifest.modelLibrary)
      || !same(before.manifest.models, after.manifest.models)
      || before.manifest.modelsSha256 !== after.manifest.modelsSha256) {
    return failure('X41_MODEL_MISMATCH');
  }
  if (!same(before.manifest.tools, after.manifest.tools)
      || before.manifest.toolsSha256 !== after.manifest.toolsSha256) {
    return failure('X41_TOOL_MISMATCH');
  }
  if (!same(beforeEvidence.producer, afterEvidence.producer)
      || !same(beforeEvidence.measurements.map(evidenceRowShape),
        afterEvidence.measurements.map(evidenceRowShape))) {
    return failure('X41_EVIDENCE_CONTEXT_MISMATCH');
  }
  return { ok: true, code: 'X41_CONTEXT_COMPATIBLE' };
}

async function checkableEvidence(value, side) {
  const report = await createCheckableEvidenceReport(value.report, { sourceProject: value.project });
  await validateCheckableEvidenceReport(report);
  if (report.measurements.some((row) => row.value.state !== 'known'
      || row.unit.state !== 'known' || row.observation.state !== 'known')) {
    reject('X41_EVIDENCE_ROW_UNAVAILABLE', [side]);
  }
  return report;
}

function resultRows(before, after) {
  return before.report.results.map((left, index) => {
    const right = after.report.results[index];
    if (!right || left.scenarioId !== right.scenarioId) reject('X41_RESULT_ORDER');
    return {
      id: left.scenarioId,
      expected: clone(left.expected),
      before: {
        reportedAcademicStatus: left.academicStatus,
        evidenceStatus: left.evidenceStatus,
        observed: clone(left.observed),
        virtualMilliseconds: left.virtualMilliseconds,
      },
      after: {
        reportedAcademicStatus: right.academicStatus,
        evidenceStatus: right.evidenceStatus,
        observed: clone(right.observed),
        virtualMilliseconds: right.virtualMilliseconds,
      },
      changed: !same({ status: left.academicStatus, observed: left.observed },
        { status: right.academicStatus, observed: right.observed }),
    };
  });
}

function changedIdentityKeys(before, after) {
  return Object.keys(before).filter((key) => before[key] !== after[key]);
}

function countRenderedRows(review, results, identitiesChanged) {
  const sourceLines = review.sourceDiffs.reduce((total, diff) => total + diff.text.split('\n').length, 0);
  return sourceLines + review.summaryRows.length + results.length + identitiesChanged.length;
}

export async function parseExperimentComparisonSlot(source, adapters, side = 'slot') {
  try {
    if (typeof source !== 'string') reject('X41_SLOT_SOURCE', [side]);
    const bytes = encoder.encode(source).byteLength;
    const packageLimit = validateExperimentComparisonLimits({ packageBytes: bytes });
    if (!packageLimit.ok) reject(packageLimit.code, [side, ...packageLimit.details]);
    const parsed = await parseExperimentPackage(source, adapters);
    if (!parsed.ok) reject(parsed.code ?? 'X41_PACKAGE_INVALID', [side, ...(parsed.details ?? [])]);
    if (!parsed.x80Complete || parsed.value.schema !== EXPERIMENT_PACKAGE_SCHEMA) {
      reject('X41_STRICT_V3_REQUIRED', [side, parsed.value.schema]);
    }
    enforceSourceLimits(parsed.value.project, side);
    authorityAbsent(parsed.value, side);
    evidenceComplete(parsed.value, side);
    return { ok: true, code: 'X41_SLOT_ACCEPTED', side, source, bytes,
      sha256: parsed.sha256, value: parsed.value };
  } catch (error) {
    return failure(error.code ?? error.message ?? 'X41_SLOT_INVALID', error.details ?? []);
  }
}

export async function compareExperimentPackages({
  beforeSource,
  afterSource,
  adapters,
  expectedBeforeSha256 = null,
  expectedAfterSha256 = null,
}) {
  try {
    const [beforeSlot, afterSlot] = await Promise.all([
      parseExperimentComparisonSlot(beforeSource, adapters, 'before'),
      parseExperimentComparisonSlot(afterSource, adapters, 'after'),
    ]);
    if (!beforeSlot.ok) reject(beforeSlot.code, beforeSlot.details);
    if (!afterSlot.ok) reject(afterSlot.code, afterSlot.details);
    if (expectedBeforeSha256 !== null
        && (!HASH.test(expectedBeforeSha256) || beforeSlot.sha256 !== expectedBeforeSha256)) {
      reject('X41_STALE_SLOT', ['before']);
    }
    if (expectedAfterSha256 !== null
        && (!HASH.test(expectedAfterSha256) || afterSlot.sha256 !== expectedAfterSha256)) {
      reject('X41_STALE_SLOT', ['after']);
    }
    if (beforeSlot.sha256 === afterSlot.sha256) reject('X41_SAME_PACKAGE');

    const before = beforeSlot.value; const after = afterSlot.value;
    const [beforeEvidence, afterEvidence] = await Promise.all([
      checkableEvidence(before, 'before'), checkableEvidence(after, 'after'),
    ]);
    const context = validateExperimentComparisonContext(before, after, beforeEvidence, afterEvidence);
    if (!context.ok) reject(context.code, context.details);

    const beforeIdentities = identities(before, beforeSlot.sha256);
    const afterIdentities = identities(after, afterSlot.sha256);
    const identityChanges = changedIdentityKeys(beforeIdentities, afterIdentities);
    const requiredIdentityChanges = ['packageSha256', 'projectSha256', 'expectationSha256',
      'sourceSha256', 'circuitSha256', 'artifactSha256', 'reportSha256', 'manifestSha256'];
    if (!requiredIdentityChanges.every((key) => identityChanges.includes(key))) {
      reject('X41_IDENTITY_DIFFERENCE_REQUIRED', requiredIdentityChanges
        .filter((key) => !identityChanges.includes(key)));
    }

    const authoredChanges = describeProjectChanges(before.profile,
      before.project.project, after.project.project);
    const authoredReview = createAuthoredChangeReview({
      profile: before.profile,
      baseProjectSha256: before.bindings.projectSha256,
      candidateProjectSha256: after.bindings.projectSha256,
      before: before.project.project,
      after: after.project.project,
      testExpectationChanges: [],
    });
    const results = resultRows(before, after);
    const sourceChanged = authoredReview.sourceDiffs.length > 0;
    const circuitChanges = authoredReview.summaryRows
      .filter((row) => row.kind === 'component' || row.kind === 'wire');
    const resultChanged = results.some((row) => row.changed);
    if (!sourceChanged && circuitChanges.length === 0 && !resultChanged) {
      reject('X41_NO_VISIBLE_DIFFERENCE');
    }
    const renderedRows = countRenderedRows(authoredReview, results, identityChanges);
    const renderLimit = validateExperimentComparisonLimits({ renderedRows });
    if (!renderLimit.ok) reject(renderLimit.code, renderLimit.details);

    return { ok: true, code: 'X41_PACKAGES_COMPATIBLE', comparison: freeze({
      schema: EXPERIMENT_PACKAGE_COMPARISON_SCHEMA,
      profile: before.profile,
      experimentId: before.experimentId,
      before: { identities: beforeIdentities,
        reportedAcademicStatus: before.report.aggregate.academicStatus },
      after: { identities: afterIdentities,
        reportedAcademicStatus: after.report.aggregate.academicStatus },
      compatibility: {
        normalizedExpectationsEqual: true,
        scenariosEqual: true,
        modelsEqual: true,
        toolsEqual: true,
        evidenceContextEqual: true,
        evidenceAdapterId: beforeEvidence.producer.adapterId,
        evidenceClass: beforeEvidence.producer.evidenceClass,
        nativeTimeBasis: beforeEvidence.producer.timeBasis,
        evidenceRows: beforeEvidence.measurements.length,
      },
      identityChanges,
      source: { diffs: clone(authoredReview.sourceDiffs) },
      circuit: { rows: clone(circuitChanges), authoredChanges: clone(authoredChanges) },
      results,
      limits: { ...EXPERIMENT_PACKAGE_COMPARISON_LIMITS, renderedRows },
      authority: { apply: false, build: false, run: false, replay: false, verdict: false },
      limitation: 'Literal retained facts only. This comparison does not infer causality, correctness, a winner or a new verdict.',
    }) };
  } catch (error) {
    return failure(error.code ?? error.message ?? 'X41_COMPARISON_REJECTED', error.details ?? []);
  }
}
