// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  X26_REGRESSION_MATRIX, sha256Text, stableStringify,
} from './regression-matrix-contract.mjs';

export const X26_VERSION_REPORT_SCHEMA = 'intent-mcu-x26-version-regression@1';
export const X26_VERSION_COMPARISON_ID = 'x26-rc49-rc60-same-matrix-v1';
export const X26_VERSION_COMPARISON_NONCE = '144637ddc467ea465ef52a4da3ed6f20';

const HASH = /^[0-9a-f]{64}$/u;
const clone = (value) => structuredClone(value);
const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
};
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && stableStringify(Object.keys(value).sort()) === stableStringify([...keys].sort());

const ARTIFACTS = deepFreeze({
  'X26-AVR-THERMOSTAT-D13': '1501248cde92e96d417ae24a6f9e9a5a82faa057dabfdd97fbe5bc922b42100c',
  'X26-RP2040-GPIO0-UART0': '40d1f2587bbf973a2b724fc4379dbe538a5ff32baeb4c20f21785e5852be9833',
  'X26-ESP32C3-QEMU-UART-GPIO2-MODEL': '18ccc529ca488522055589654814c233d490ad9a19951d238eb7ec2fdc44e3e8',
  'X26-STM32-RENODE-PB0-USART3': 'fee199b2ee74c72185769cbf1af4ed0c18353fa83d5d92e21385575f16037820',
});

export const X26_VERSION_RELEASES = deepFreeze([
  {
    version: '1.1.0-rc.49', commit: '0eab48274d5244327291ffa9eeb65785d5cc117c',
    imageId: 'sha256:fec771c6ed380f1ce04b86e937cf8138aa0e30d2b37372a399b9b905b13f536d',
    executionNonce: 'ee63a1953160a17bf33c89cfb3b73d5a',
    reportSha256: '251a210447faf4afc2b7f2a7888c23b7cc2d356242e4e5f7ec0181b13de5f475',
    reportSemanticSha256: '4e0c585582b437a545a14c24984c2b8997f446366a826aacd8f5b43ba0c146e3',
  },
  {
    version: '1.1.0-rc.60', commit: '21193768b7f52e1c0682432e7243fbdf25c28e69',
    imageId: 'sha256:3b34501621d06b1bb005717f8cecd485111a514e20149a8aad040db3c06ca5cd',
    executionNonce: 'b790e1006d0c0fa61ad0c441de58290d',
    reportSha256: '2ac4457a69cf0e448f809ba9161bc84763b9b68c68a7f572b1d1a40aed23b2d9',
    reportSemanticSha256: '4e0c585582b437a545a14c24984c2b8997f446366a826aacd8f5b43ba0c146e3',
  },
]);

const passedOutcome = () => ({
  academicStatus: 'passed', academicCode: 'ACADEMIC_PASSED',
  jobStatus: 'completed', jobCode: 'JOB_COMPLETED', evidenceStatus: 'complete',
});

const releaseRecord = (release) => ({
  ...clone(release),
  producerIdentities: X26_REGRESSION_MATRIX.cells.map((cell) => ({
    caseId: cell.caseId, artifactSha256: ARTIFACTS[cell.caseId], producer: cell.observationOwner,
  })),
});

const resultRecord = (cell) => ({
  caseId: cell.caseId, profile: cell.profile, profileVersion: cell.profileVersion,
  scenarioId: cell.scenarioId, fixtureSha256: cell.fixtureSha256, sourceSha256: cell.sourceSha256,
  releases: X26_VERSION_RELEASES.map((release) => ({
    version: release.version, expected: clone(cell.expected), actual: clone(cell.expected),
    outcome: passedOutcome(), artifactSha256: ARTIFACTS[cell.caseId],
    producer: cell.observationOwner, limitation: cell.limitation,
  })),
  sameRequirementIdentity: true, outcomeStableAcrossReleases: true,
});

const projection = (report) => ({
  schema: report.schema, comparisonId: report.comparisonId, comparisonNonce: report.comparisonNonce,
  matrixId: report.matrixId, matrixVersion: report.matrixVersion, matrixSha256: report.matrixSha256,
  requirementFamilyId: report.requirementFamilyId, releases: report.releases,
  results: report.results, conclusion: report.conclusion, comparisonPolicy: report.comparisonPolicy,
});

export async function acceptedX26VersionReport() {
  const report = {
    schema: X26_VERSION_REPORT_SCHEMA, comparisonId: X26_VERSION_COMPARISON_ID,
    comparisonNonce: X26_VERSION_COMPARISON_NONCE,
    matrixId: X26_REGRESSION_MATRIX.matrixId, matrixVersion: X26_REGRESSION_MATRIX.matrixVersion,
    matrixSha256: '9f957c04d472fd421dd5662edeb99a12537bfc855bb38872133952a3b5b483b1',
    requirementFamilyId: X26_REGRESSION_MATRIX.requirementFamilyId,
    releases: X26_VERSION_RELEASES.map(releaseRecord),
    results: X26_REGRESSION_MATRIX.cells.map(resultRecord),
    conclusion: { status: 'passed', jobsCompleted: 8, academicPassed: 8,
      sameRequirementIdentity: true, outcomesStableAcrossReleases: true },
    comparisonPolicy: {
      evidenceKind: 'reviewed-private-producer-reports', freshExecutionOnLoad: false,
      samePinnedModelToolchainRuntimeSet: true, compareRawTimeValues: false,
      compilerVersionComparison: false, hardwareRevisionComparison: false,
      physicalDeviceClaim: false,
    },
    semanticSha256: '',
  };
  report.semanticSha256 = await sha256Text(stableStringify(projection(report)));
  return deepFreeze(report);
}

export async function validateX26VersionReport(value) {
  const topKeys = ['schema', 'comparisonId', 'comparisonNonce', 'matrixId', 'matrixVersion',
    'matrixSha256', 'requirementFamilyId', 'releases', 'results', 'conclusion',
    'comparisonPolicy', 'semanticSha256'];
  if (!exactKeys(value, topKeys) || !HASH.test(value.semanticSha256 ?? '')) {
    throw Object.assign(new Error('X26_VERSION_REPORT_SHAPE'), { code: 'X26_VERSION_REPORT_SHAPE' });
  }
  const expected = await acceptedX26VersionReport();
  if (stableStringify(value) !== stableStringify(expected)) {
    throw Object.assign(new Error('X26_VERSION_REPORT_DRIFT'), { code: 'X26_VERSION_REPORT_DRIFT' });
  }
  return deepFreeze(clone(value));
}

export async function x26SyntheticExpectationMutation() {
  const value = clone(await acceptedX26VersionReport());
  value.results.find((item) => item.caseId === 'X26-RP2040-GPIO0-UART0')
    .releases.find((item) => item.version === '1.1.0-rc.60').expected.gpio0 = false;
  return value;
}

export function x26VersionReportPassed(report) {
  return report?.conclusion?.status === 'passed' && report.conclusion.jobsCompleted === 8
    && report.conclusion.academicPassed === 8 && report.results.length === 4
    && report.results.every((item) => item.sameRequirementIdentity
      && item.outcomeStableAcrossReleases && item.releases.every((release) =>
        release.outcome.academicStatus === 'passed' && release.outcome.jobStatus === 'completed'));
}
