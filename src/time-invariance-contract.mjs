// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const TIME_CONTRACT_SCHEMA = 'intent-mcu-time-contract@1';
export const TIME_REPORT_SCHEMA = 'intent-mcu-time-invariance-report@1';
export const X29_SUITE_ID = 'x29-avr-time-invariance-v1';

export const X29_FIXTURE_SOURCE = `/* Intent MCU X29 producer-time fixture v1 */
#include <Arduino.h>

bool x29Observed = false;

void setup() {
  Serial.begin(9600);
  pinMode(13, OUTPUT);
  pinMode(2, INPUT_PULLUP);
  digitalWrite(13, LOW);
  Serial.println("X29 READY");
}

void loop() {
  if (!x29Observed && digitalRead(2) == LOW) {
    x29Observed = true;
    digitalWrite(13, HIGH);
    Serial.println("X29 EVENT");
  }
}
`;

const SUITE = {
  schema: TIME_CONTRACT_SCHEMA,
  suiteId: X29_SUITE_ID,
  suiteVersion: '1.0.0',
  profile: 'board.atmega328p-16mhz-v1',
  clock: {
    cpuCyclesPerSecond: 16_000_000,
    virtualUnit: 'nanoseconds',
    virtualNanosecondsNumerator: 1_000_000_000,
    virtualNanosecondsDenominator: 16_000_000,
  },
  fixture: {
    id: 'x29-producer-time-fixture-v1',
    sourceSha256: '9d1730ec4ed1a0dbf23ac6638ba8ba99264dfb8041e222bca4d240345978c76d',
  },
  requirement: {
    id: 'X29-D2-D13-UART-VIRTUAL-WINDOW',
    targetCycle: 1_600_000,
    observationStartCycle: 1_600_000,
    observationEndCycle: 2_400_000,
    expectedD13: true,
    uartMarker: 'X29 EVENT',
  },
  executions: [
    { executionId: 'X29-REFERENCE-1X', pacing: 1, pause: null },
    { executionId: 'X29-MAXIMUM', pacing: 'maximum', pause: null },
    { executionId: 'X29-PAUSE-RESUME', pacing: 1,
      pause: { minimumCycle: 200_000, maximumCycle: 800_000, minimumWallMilliseconds: 150 } },
  ],
  limits: {
    controller: 'ATmega328P only',
    physicalTimeClaimed: false,
    realtimeThroughputClaimed: false,
    crossProfileTimeClaimed: false,
    c3OrStm32TimeClaimed: false,
  },
};

const clone = (value) => structuredClone(value);
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const hashPattern = /^[0-9a-f]{64}$/u;

export function stableTimeStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableTimeStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${stableTimeStringify(value[key])}`,
  ).join(',')}}`;
  return JSON.stringify(value);
}

export async function timeSha256(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export const X29_TIME_SUITE = Object.freeze(SUITE);

export function virtualNanoseconds(cycles, suite = X29_TIME_SUITE) {
  if (!Number.isSafeInteger(cycles) || cycles < 0) throw new TypeError('TIME_CYCLES_INVALID');
  return Math.round(cycles * suite.clock.virtualNanosecondsNumerator
    / suite.clock.virtualNanosecondsDenominator);
}

export function validateTimeRequirement(value) {
  if (!exactKeys(value, ['id', 'targetCycle', 'observationStartCycle', 'observationEndCycle',
    'expectedD13', 'uartMarker'])) {
    const wallKey = value && typeof value === 'object' && Object.keys(value).some((key) => /wall|throughput/iu.test(key));
    throw Object.assign(new Error(wallKey ? 'TIME_CONTRACT_WALL_REQUIREMENT_FORBIDDEN' : 'TIME_REQUIREMENT_INVALID'),
      { code: wallKey ? 'TIME_CONTRACT_WALL_REQUIREMENT_FORBIDDEN' : 'TIME_REQUIREMENT_INVALID' });
  }
  if (value.id !== 'X29-D2-D13-UART-VIRTUAL-WINDOW'
      || !Number.isSafeInteger(value.targetCycle) || value.targetCycle < 1
      || value.observationStartCycle !== value.targetCycle
      || !Number.isSafeInteger(value.observationEndCycle)
      || value.observationEndCycle <= value.observationStartCycle
      || value.expectedD13 !== true || value.uartMarker !== 'X29 EVENT') {
    throw Object.assign(new Error('TIME_REQUIREMENT_INVALID'), { code: 'TIME_REQUIREMENT_INVALID' });
  }
  return clone(value);
}

export async function timeSuiteIdentity(suite = X29_TIME_SUITE) {
  return timeSha256(stableTimeStringify(suite));
}

export async function validateTimeSuite(value = X29_TIME_SUITE) {
  if (!exactKeys(value, ['schema', 'suiteId', 'suiteVersion', 'profile', 'clock', 'fixture',
    'requirement', 'executions', 'limits']) || stableTimeStringify(value) !== stableTimeStringify(X29_TIME_SUITE)
      || value.schema !== TIME_CONTRACT_SCHEMA || value.suiteId !== X29_SUITE_ID
      || !hashPattern.test(value.fixture.sourceSha256)
      || value.clock.cpuCyclesPerSecond !== 16_000_000
      || value.executions.length !== 3
      || JSON.stringify(value.executions.map((entry) => entry.executionId))
        !== JSON.stringify(['X29-REFERENCE-1X', 'X29-MAXIMUM', 'X29-PAUSE-RESUME'])) {
    throw Object.assign(new Error('TIME_CONTRACT_DRIFT'), { code: 'TIME_CONTRACT_DRIFT' });
  }
  if (await timeSha256(X29_FIXTURE_SOURCE) !== value.fixture.sourceSha256) {
    throw Object.assign(new Error('TIME_FIXTURE_HASH_STALE'), { code: 'TIME_FIXTURE_HASH_STALE' });
  }
  validateTimeRequirement(value.requirement);
  return clone(value);
}

export function timeRequirementSatisfied(actual, requirement = X29_TIME_SUITE.requirement) {
  return actual.eventLoggedTarget === requirement.targetCycle
    && actual.d13HighCycle >= requirement.observationStartCycle
    && actual.d13HighCycle <= requirement.observationEndCycle
    && actual.uartMarkerCycle >= requirement.observationStartCycle
    && actual.uartMarkerCycle <= requirement.observationEndCycle
    && actual.finalD13 === requirement.expectedD13;
}

export function semanticTimeProjection(report) {
  return {
    schema: report.schema,
    suiteId: report.suiteId,
    suiteSha256: report.suiteSha256,
    profile: report.profile,
    sourceSha256: report.sourceSha256,
    artifactSha256: report.artifactSha256,
    producer: report.producer,
    executions: report.executions.map(({ diagnostics, ...execution }) => execution),
    validationProbe: report.validationProbe,
    limits: report.limits,
  };
}

function validOutcome(value, expectedAcademic = 'passed') {
  return value?.schema === 'intent-mcu-experiment-outcome@1'
    && value.academicStatus === expectedAcademic && value.jobStatus === 'completed';
}

export async function validateTimeReport(value, suite = X29_TIME_SUITE) {
  const accepted = await validateTimeSuite(suite);
  if (!exactKeys(value, ['schema', 'suiteId', 'suiteSha256', 'profile', 'sourceSha256',
    'artifactSha256', 'producer', 'executions', 'validationProbe', 'limits', 'semanticSha256'])
      || value.schema !== TIME_REPORT_SCHEMA || value.suiteId !== accepted.suiteId
      || value.suiteSha256 !== await timeSuiteIdentity(accepted)
      || value.profile !== accepted.profile || value.sourceSha256 !== accepted.fixture.sourceSha256
      || !hashPattern.test(value.artifactSha256) || value.executions.length !== 3
      || stableTimeStringify(value.limits) !== stableTimeStringify(accepted.limits)) {
    throw Object.assign(new Error('TIME_REPORT_STALE_OR_UNKNOWN'), { code: 'TIME_REPORT_STALE_OR_UNKNOWN' });
  }
  for (const [index, execution] of value.executions.entries()) {
    const spec = accepted.executions[index];
    if (!exactKeys(execution, ['executionId', 'pacing', 'ready', 'requirement', 'actual', 'outcome', 'diagnostics'])
        || execution.executionId !== spec.executionId || execution.pacing !== spec.pacing
        || !exactKeys(execution.ready, ['cpuCycles', 'instructions', 'virtualNanoseconds'])
        || execution.ready.cpuCycles !== 0 || execution.ready.instructions !== 0
        || execution.ready.virtualNanoseconds !== 0
        || stableTimeStringify(execution.requirement) !== stableTimeStringify(accepted.requirement)
        || !exactKeys(execution.actual, ['eventLoggedTarget', 'd13HighCycle', 'uartMarkerCycle',
          'finalD13', 'finalCpuCycles', 'finalInstructions', 'finalVirtualNanoseconds', 'pauseProbe'])
        || !timeRequirementSatisfied(execution.actual, accepted.requirement)
        || execution.actual.finalVirtualNanoseconds !== virtualNanoseconds(execution.actual.finalCpuCycles, accepted)
        || !validOutcome(execution.outcome)
        || !exactKeys(execution.diagnostics, ['wallDurationMilliseconds', 'measuredCyclesPerSecond'])) {
      throw Object.assign(new Error('TIME_REPORT_EXECUTION_INVALID'), { code: 'TIME_REPORT_EXECUTION_INVALID' });
    }
    if (spec.pause === null && execution.actual.pauseProbe !== null) {
      throw Object.assign(new Error('TIME_REPORT_PAUSE_UNEXPECTED'), { code: 'TIME_REPORT_PAUSE_UNEXPECTED' });
    }
    if (spec.pause !== null) {
      const probe = execution.actual.pauseProbe;
      if (!exactKeys(probe, ['before', 'after', 'wallWaitMilliseconds', 'requirementSatisfiedBeforeWait',
        'requirementSatisfiedAfterWait'])
          || stableTimeStringify(probe.before) !== stableTimeStringify(probe.after)
          || probe.wallWaitMilliseconds < spec.pause.minimumWallMilliseconds
          || probe.requirementSatisfiedBeforeWait !== false
          || probe.requirementSatisfiedAfterWait !== false) {
        throw Object.assign(new Error('TIME_REPORT_PAUSE_INVALID'), { code: 'TIME_REPORT_PAUSE_INVALID' });
      }
    }
  }
  if (!exactKeys(value.validationProbe, ['status', 'code', 'academicOutcomeCreated'])
      || value.validationProbe.status !== 'rejected-before-execution'
      || value.validationProbe.code !== 'TIME_CONTRACT_WALL_REQUIREMENT_FORBIDDEN'
      || value.validationProbe.academicOutcomeCreated !== false) {
    throw Object.assign(new Error('TIME_REPORT_VALIDATION_PROBE_INVALID'), { code: 'TIME_REPORT_VALIDATION_PROBE_INVALID' });
  }
  const semantic = await timeSha256(stableTimeStringify(semanticTimeProjection(value)));
  if (value.semanticSha256 !== semantic) {
    throw Object.assign(new Error('TIME_REPORT_SEMANTIC_HASH_INVALID'), { code: 'TIME_REPORT_SEMANTIC_HASH_INVALID' });
  }
  return clone(value);
}

export function timeReportPassed(report) {
  return report.executions.length === 3
    && report.executions.every((entry) => validOutcome(entry.outcome) && timeRequirementSatisfied(entry.actual))
    && report.validationProbe.status === 'rejected-before-execution'
    && report.validationProbe.academicOutcomeCreated === false;
}
