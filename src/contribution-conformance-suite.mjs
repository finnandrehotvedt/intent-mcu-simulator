// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const checks = Object.freeze({
  'model-library': ({ fixture, report }) => fixture.contributionId === report.manifest.contributionId
    && fixture.changes.models.length > 0 && fixture.files.length === report.files.length,
  'component-support-matrix': ({ fixture, report }) => fixture.changes.pins.length > 0
    && fixture.files.every((file, index) => file.path === report.files[index]?.path),
  'contribution-review': ({ fixture, report }) => fixture.baseCommit === report.manifest.baseCommit
    && fixture.changes.parameters.length > 0 && fixture.changes.versions.length > 0
    && Object.values(report.authority).every((value) => value === false),
});

export function runFixedContributionConformance({ fixture, report }) {
  return Object.freeze(report.manifest.requiredTests.map((testId) => Object.freeze({
    testId, result: checks[testId]?.({ fixture, report }) === true ? 'passed' : 'failed',
  })));
}
