// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { exactKeys } from './strict-json.mjs';
import { X34_FIXTURE_ID, X34_FIXTURE_LIMITS } from './x34-precision-fixture.mjs';
import { validateWorkerRuntimeIdentity } from './runtime-identity.mjs';

export const X34_REPORT_SCHEMA = 'intent-mcu-x34-instrumented-precision-report@1';
export const X34_SUITE_ID = 'x34-instrumented-avr-precision-v1';
const HASH = /^[a-f0-9]{64}$/u;
const clone = (value) => structuredClone(value);
const reject = (code) => { throw Object.assign(new Error(code), { code }); };

export const X34_PRECISION_SUITE = Object.freeze({
  suiteId: X34_SUITE_ID,
  profile: 'board.atmega328p-16mhz-v1',
  fixtureId: X34_FIXTURE_ID,
  scenarioId: 'THERM-SCENARIO-EQUALITY-ENABLED',
  observation: { minimumCycle: 2_560_000, maximumCycle: 5_600_000 },
  voltage: { numerator: 81, denominator: 40, unit: 'V', tolerance: 1e-12 },
  adc: { channel: 1, expectedCount: 414, resolutionBits: 10, referenceVoltage: 5 },
  firmware: { expectedTemperatureC: 30, expectedD13Level: 0 },
  limits: X34_FIXTURE_LIMITS,
});

export function stableX34Stringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableX34Stringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stableX34Stringify(value[key])}`,
  ).join(',')}}`;
  return JSON.stringify(value);
}

export async function x34Sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export async function x34SuiteIdentity() {
  return x34Sha256(stableX34Stringify(X34_PRECISION_SUITE));
}

export function x34RepeatProjection(repeat) {
  const transaction = repeat.firmwareTransaction;
  return {
    control: repeat.control,
    voltage: repeat.voltage,
    adc: repeat.adc,
    firmwareTransaction: {
      commit: transaction.commit, temperatureC: transaction.temperatureC,
      d13Level: transaction.d13Level, beginPc: transaction.beginPc,
      beginCycle: transaction.beginCycle, commitPc: transaction.commitPc,
      commitPcAfter: transaction.commitPcAfter, commitCycle: transaction.commitCycle,
      writes: transaction.writes,
    },
    pin: repeat.pin,
    time: repeat.time,
    outcome: repeat.outcome,
  };
}

export function semanticX34Projection(report) {
  return {
    schema: report.schema, suiteId: report.suiteId, suiteSha256: report.suiteSha256,
    fixtureId: report.fixtureId, sourceSha256: report.sourceSha256,
    artifactIdentity: report.artifactIdentity, symbol: report.symbol,
    repeats: report.repeats.map(x34RepeatProjection),
    repeatSemanticSha256: report.repeatSemanticSha256,
    validationProbes: report.validationProbes, limits: report.limits,
  };
}

export function evaluateX34Repeat(input) {
  const tx = input.firmwareTransaction;
  if (!tx || !Array.isArray(tx.writes) || tx.writes.length < 2) {
    return { checks: { cycleZeroControls: false, exactVoltage: false, adcProducer: false,
      witnessedCommitSequence: false, committedFirmwareInteger: false, firmwareD13: false,
      joinedOrder: false, actualPin: false, virtualWindow: false },
    academicStatus: 'indeterminate', jobStatus: 'completed' };
  }
  const expectedVoltage = X34_PRECISION_SUITE.voltage.numerator / X34_PRECISION_SUITE.voltage.denominator;
  const firstWrite = tx.writes[0]; const lastWrite = tx.writes.at(-1);
  const changed = new Set(tx.writes.flatMap((write) => write.changedOffsets));
  const checks = {
    cycleZeroControls: input.control.temperatureC === 31 && input.control.buttonPressed === true
      && input.control.targetCycle === 0,
    exactVoltage: Math.abs(input.voltage.value - expectedVoltage) <= X34_PRECISION_SUITE.voltage.tolerance,
    adcProducer: input.adc.channel === 1 && input.adc.value === 414
      && Number.isSafeInteger(input.adc.startCycle) && Number.isSafeInteger(input.adc.completionCycle),
    witnessedCommitSequence: firstWrite.changedOffsets.includes(0) && firstWrite.after[0] % 2 === 1
      && lastWrite.changedOffsets.includes(0) && lastWrite.after[0] === tx.commit
      && tx.commit > 0 && tx.commit % 2 === 0 && [1, 2, 3].every((offset) => changed.has(offset)),
    committedFirmwareInteger: tx.commit > 0 && tx.commit % 2 === 0 && tx.temperatureC === 30,
    firmwareD13: tx.d13Level === 0,
    joinedOrder: tx.adc.channel === input.adc.channel && tx.adc.value === input.adc.value
      && tx.adc.completionCycle === input.adc.completionCycle
      && input.adc.completionCycle <= tx.beginCycle && tx.beginCycle <= tx.commitCycle,
    actualPin: input.pin.pin === 'D13' && input.pin.mode === 'OUTPUT' && input.pin.level === false
      && tx.pinObservation.pin === 'D13' && tx.pinObservation.level === false,
    virtualWindow: input.time.cpuCycles >= X34_PRECISION_SUITE.observation.minimumCycle
      && input.time.cpuCycles <= X34_PRECISION_SUITE.observation.maximumCycle,
  };
  return { checks, academicStatus: Object.values(checks).every(Boolean) ? 'passed' : 'failed', jobStatus: 'completed' };
}

export async function validateX34Report(value) {
  if (!exactKeys(value, ['schema', 'suiteId', 'suiteSha256', 'fixtureId', 'sourceSha256',
    'artifactIdentity', 'symbol', 'repeats', 'repeatSemanticSha256', 'validationProbes',
    'limits', 'semanticSha256'])
      || value.schema !== X34_REPORT_SCHEMA || value.suiteId !== X34_SUITE_ID
      || value.fixtureId !== X34_FIXTURE_ID || !HASH.test(value.sourceSha256 ?? '')
      || !HASH.test(value.artifactIdentity ?? '') || !HASH.test(value.suiteSha256 ?? '')
      || !HASH.test(value.repeatSemanticSha256 ?? '') || !HASH.test(value.semanticSha256 ?? '')
      || !Array.isArray(value.repeats) || value.repeats.length !== 2) reject('X34_REPORT_INVALID');
  if (value.suiteSha256 !== await x34SuiteIdentity()) reject('X34_REPORT_SUITE_STALE');
  const [first, second] = value.repeats;
  for (const repeat of value.repeats) {
    if (!exactKeys(repeat, ['repeat', 'runtimeBinding', 'runtimeIdentity', 'control', 'voltage',
      'adc', 'firmwareTransaction', 'pin', 'time', 'outcome'])) reject('X34_REPEAT_INVALID');
    validateWorkerRuntimeIdentity(repeat.runtimeIdentity, repeat.runtimeBinding);
    if (repeat.runtimeBinding.artifactIdentity !== value.artifactIdentity
        || repeat.firmwareTransaction.artifactIdentity !== value.artifactIdentity
        || repeat.firmwareTransaction.sourceSha256 !== value.sourceSha256
        || stableX34Stringify(evaluateX34Repeat(repeat)) !== stableX34Stringify(repeat.outcome)) {
      reject('X34_JOINED_EVIDENCE_INVALID');
    }
  }
  if (first.runtimeBinding.runtimeGeneration === second.runtimeBinding.runtimeGeneration
      || first.runtimeIdentity.workerInstanceNonce === second.runtimeIdentity.workerInstanceNonce) {
    reject('X34_RUNTIME_GENERATION_NOT_FRESH');
  }
  const firstSemantic = await x34Sha256(stableX34Stringify(x34RepeatProjection(first)));
  const secondSemantic = await x34Sha256(stableX34Stringify(x34RepeatProjection(second)));
  if (firstSemantic !== secondSemantic || value.repeatSemanticSha256 !== firstSemantic) {
    reject('X34_REPEAT_SEMANTICS_MISMATCH');
  }
  const expectedReportHash = await x34Sha256(stableX34Stringify(semanticX34Projection(value)));
  if (value.semanticSha256 !== expectedReportHash) reject('X34_REPORT_HASH_INVALID');
  return clone(value);
}

export function x34ReportPassed(report) {
  return report?.repeats?.length === 2
    && report.repeats.every((repeat) => repeat.outcome.academicStatus === 'passed'
      && repeat.outcome.jobStatus === 'completed');
}
