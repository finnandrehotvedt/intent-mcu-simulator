// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  X26_REGRESSION_MATRIX, regressionMatrixIdentity, semanticRegressionProjection,
  sha256Text, stableStringify,
} from './regression-matrix-contract.mjs';

export const COVERAGE_REPORT_SCHEMA = 'intent-mcu-coverage-report@1';
export const PARTITION_EVIDENCE_SCHEMA = 'intent-mcu-partition-evidence@1';
export const COVERAGE_REQUIREMENT_FAMILY = 'REQ-EDITED-SOURCE-OUTPUT-OBSERVATION';

const HASH = /^[0-9a-f]{64}$/u;
const clone = (value) => structuredClone(value);
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

export const X27_PARTITIONS = Object.freeze([
  Object.freeze({ caseId: 'X26-AVR-THERMOSTAT-D13', partitionId: 'THERM-SCENARIO-BELOW-ENABLED', label: 'AVR below threshold · enabled' }),
  Object.freeze({ caseId: 'X26-AVR-THERMOSTAT-D13', partitionId: 'THERM-SCENARIO-EQUALITY-ENABLED', label: 'AVR equality boundary · enabled' }),
  Object.freeze({ caseId: 'X26-AVR-THERMOSTAT-D13', partitionId: 'THERM-SCENARIO-ABOVE-ENABLED', label: 'AVR above threshold · enabled' }),
  Object.freeze({ caseId: 'X26-AVR-THERMOSTAT-D13', partitionId: 'THERM-SCENARIO-BELOW-DISABLED', label: 'AVR below threshold · disabled' }),
  Object.freeze({ caseId: 'X26-RP2040-GPIO0-UART0', partitionId: 'rp2040-default-gpio0-high-uart0-v1', label: 'RP2040 GPIO0 + UART0' }),
  Object.freeze({ caseId: 'X26-ESP32C3-QEMU-UART-GPIO2-MODEL', partitionId: 'esp32c3-default-qemu-marker-gpio2-model-v1', label: 'ESP32-C3 QEMU CPU/UART + separate GPIO2 model' }),
  Object.freeze({ caseId: 'X26-STM32-RENODE-PB0-USART3', partitionId: 'stm32-default-pb0-high-usart3-v1', label: 'STM32 PB0 + USART3' }),
]);

export async function createPartitionEvidence(result, partitions) {
  if (!result || !Array.isArray(partitions)) throw new TypeError('COVERAGE_EVIDENCE_INPUT_INVALID');
  return {
    schema: PARTITION_EVIDENCE_SCHEMA,
    caseId: result.caseId,
    fixtureSha256: result.fixtureSha256,
    sourceSha256: result.sourceSha256,
    artifactSha256: result.artifactSha256,
    producer: result.producer,
    timebase: result.rawVirtualTime.timebase,
    partitions: await Promise.all(partitions.map(async ({ partitionId, complete, passed, observed }) => ({
      partitionId, complete, passed,
      evidenceSha256: await sha256Text(stableStringify(observed)),
    }))),
  };
}

function validateEvidence(result, evidence, declared) {
  if (!evidence) return null;
  const keys = ['schema', 'caseId', 'fixtureSha256', 'sourceSha256', 'artifactSha256', 'producer', 'timebase', 'partitions'];
  if (!exactKeys(evidence, keys) || evidence.schema !== PARTITION_EVIDENCE_SCHEMA
      || evidence.caseId !== result.caseId || evidence.fixtureSha256 !== result.fixtureSha256
      || evidence.sourceSha256 !== result.sourceSha256 || evidence.artifactSha256 !== result.artifactSha256
      || evidence.producer !== result.producer || evidence.timebase !== result.rawVirtualTime.timebase
      || !Array.isArray(evidence.partitions)) throw new Error('COVERAGE_EVIDENCE_STALE_OR_UNKNOWN');
  const expected = new Set(declared.map((item) => item.partitionId));
  const seen = new Set();
  for (const item of evidence.partitions) {
    if (!exactKeys(item, ['partitionId', 'complete', 'passed', 'evidenceSha256'])
        || !expected.has(item.partitionId) || seen.has(item.partitionId)
        || typeof item.complete !== 'boolean' || typeof item.passed !== 'boolean'
        || !HASH.test(item.evidenceSha256)) throw new Error('COVERAGE_EVIDENCE_STALE_OR_UNKNOWN');
    seen.add(item.partitionId);
  }
  return evidence;
}

function statusFor(result, item) {
  if (!result) return 'not-run';
  if (result.outcome.academicStatus === 'unsupported') return 'unsupported';
  if (result.outcome.jobStatus === 'infrastructure-error') return 'infrastructure-error';
  if (result.outcome.jobStatus !== 'completed' || !item?.complete) return 'indeterminate';
  if (!item.passed || result.outcome.academicStatus === 'failed') return 'exercised-failed';
  if (result.outcome.academicStatus === 'passed') return 'exercised-complete';
  return 'indeterminate';
}

export function semanticCoverageProjection(report) {
  const projected = clone(report);
  delete projected.semanticSha256;
  for (const row of projected.rows) delete row.rawTimebase;
  return projected;
}

export async function projectCoverageReport({
  regressionReport, partitionEvidence = [], matrix = X26_REGRESSION_MATRIX,
} = {}) {
  const expectedMatrixSha256 = await regressionMatrixIdentity(matrix);
  const expectedRegressionSha256 = regressionReport
    ? await sha256Text(stableStringify(semanticRegressionProjection(regressionReport))) : null;
  if (!regressionReport || regressionReport.schema !== 'intent-mcu-regression-report@1'
      || regressionReport.matrixId !== matrix.matrixId
      || regressionReport.matrixSha256 !== expectedMatrixSha256
      || regressionReport.semanticSha256 !== expectedRegressionSha256
      || !Array.isArray(regressionReport.results) || !Array.isArray(partitionEvidence)) {
    throw new Error('COVERAGE_REGRESSION_REPORT_STALE_OR_UNKNOWN');
  }
  const resultIds = new Set(regressionReport.results.map((item) => item.caseId));
  if (resultIds.size !== regressionReport.results.length
      || regressionReport.results.some((item) => {
        const cell = matrix.cells.find((candidate) => candidate.caseId === item.caseId);
        return !cell || item.profile !== cell.profile || item.profileVersion !== cell.profileVersion
          || item.fixtureSha256 !== cell.fixtureSha256 || item.sourceSha256 !== cell.sourceSha256
          || item.producer !== cell.observationOwner;
      })) {
    throw new Error('COVERAGE_REGRESSION_REPORT_STALE_OR_UNKNOWN');
  }
  const evidenceByCase = new Map();
  for (const evidence of partitionEvidence) {
    if (evidenceByCase.has(evidence?.caseId)) throw new Error('COVERAGE_EVIDENCE_STALE_OR_UNKNOWN');
    evidenceByCase.set(evidence?.caseId, evidence);
  }
  if ([...evidenceByCase.keys()].some((caseId) => !resultIds.has(caseId))) throw new Error('COVERAGE_EVIDENCE_STALE_OR_UNKNOWN');

  const rows = [];
  for (const cell of matrix.cells) {
    const result = regressionReport.results.find((item) => item.caseId === cell.caseId) ?? null;
    const declared = X27_PARTITIONS.filter((item) => item.caseId === cell.caseId);
    const evidence = result ? validateEvidence(result, evidenceByCase.get(cell.caseId), declared) : null;
    const evidenceRows = new Map((evidence?.partitions ?? []).map((item) => [item.partitionId, item]));
    const partitions = declared.map((definition) => {
      const item = evidenceRows.get(definition.partitionId);
      return {
        partitionId: definition.partitionId, label: definition.label,
        status: statusFor(result, item), evidenceSha256: item?.evidenceSha256 ?? null,
      };
    });
    rows.push({
      caseId: cell.caseId, profile: cell.profile, fixtureSha256: cell.fixtureSha256,
      sourceSha256: cell.sourceSha256, artifactSha256: result?.artifactSha256 ?? null,
      producer: cell.observationOwner, evidenceCompleteness: partitions.every((item) => item.evidenceSha256) ? 'complete' : 'incomplete',
      academicOutcome: result?.outcome?.academicStatus ?? 'not-run',
      jobOutcome: result?.outcome?.jobStatus ?? 'not-started',
      exercisedPartitions: partitions.filter((item) => item.status === 'exercised-complete'
        || item.status === 'exercised-failed').map((item) => item.partitionId),
      rawTimebase: result?.rawVirtualTime?.timebase ?? 'not-run', limitation: cell.limitation, partitions,
    });
  }
  const flat = rows.flatMap((row) => row.partitions);
  const count = (status) => flat.filter((item) => item.status === status).length;
  const report = {
    schema: COVERAGE_REPORT_SCHEMA, version: '1.0.0', matrixId: matrix.matrixId,
    matrixSha256: regressionReport.matrixSha256, regressionSemanticSha256: regressionReport.semanticSha256,
    requirementFamily: { id: COVERAGE_REQUIREMENT_FAMILY, declaredPartitions: 7, profiles: 4 },
    counts: {
      declared: 7,
      supported: 7 - count('unsupported'),
      executed: count('exercised-complete') + count('exercised-failed'),
      passed: count('exercised-complete'), failed: count('exercised-failed'),
      notRun: count('not-run'), unsupported: count('unsupported'),
      indeterminate: count('indeterminate'), infrastructureError: count('infrastructure-error'),
    },
    instructionCoverage: 'unavailable', physicalBehaviourCoverage: 'not-claimed', rows,
  };
  report.semanticSha256 = await sha256Text(stableStringify(semanticCoverageProjection(report)));
  return report;
}

export async function validateCoverageReport(value, regressionReport, matrix = X26_REGRESSION_MATRIX) {
  const rebuilt = await projectCoverageReport({
    regressionReport,
    partitionEvidence: value?.rows?.filter((row) => row.artifactSha256).map((row) => ({
      schema: PARTITION_EVIDENCE_SCHEMA, caseId: row.caseId, fixtureSha256: row.fixtureSha256,
      sourceSha256: row.sourceSha256, artifactSha256: row.artifactSha256, producer: row.producer,
      timebase: row.rawTimebase,
      partitions: row.partitions.filter((item) => item.evidenceSha256).map((item) => ({
        partitionId: item.partitionId, complete: true,
        passed: item.status === 'exercised-complete', evidenceSha256: item.evidenceSha256,
      })),
    })) ?? [], matrix,
  });
  if (stableStringify(value) !== stableStringify(rebuilt)) throw new Error('COVERAGE_REPORT_STALE_OR_UNKNOWN');
  return clone(rebuilt);
}
