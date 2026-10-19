// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import {
  X32_UNSUPPORTED_ACCESS_SUITE, evaluateUnsupportedAccessExecution,
} from './unsupported-access-contract.mjs';

export function unsupportedAccessExecutionFromWorker({ message, artifactSha256, repeat,
  blockedReplayNoAdvance, postFaultAcceptedRecords = 0 }) {
  const access = message?.unsupported?.at(-1) ?? null;
  const observation = message?.trace?.filter((entry) => entry.pin === 13 && entry.level === true
    && (!access || entry.cycle <= access.cycle)).at(-1) ?? null;
  const execution = {
    executionId: `X32-SPI-${repeat}`, repeat,
    sourceSha256: X32_UNSUPPORTED_ACCESS_SUITE.fixture.sourceSha256,
    artifactSha256, projectSha256: X32_UNSUPPORTED_ACCESS_SUITE.fixture.projectSha256,
    detectorId: X32_UNSUPPORTED_ACCESS_SUITE.detector.id,
    access: access ? { operation: 'write', peripheral: access.peripheral, address: access.address,
      value: access.value, cycle: access.cycle, instructionOrdinal: message.instructions } : null,
    lastSupportedObservation: observation ? { kind: 'gpio', pin: 'D13', level: observation.level,
      cycle: observation.cycle } : null,
    stop: message ? { status: 'stopped-unsupported', code: 'RUNTIME_CAPABILITY_UNSUPPORTED',
      cycle: message.cycle, instructionOrdinal: message.instructions, postFaultAcceptedRecords } : null,
    outcome: null,
    diagnostics: { workerMessageKind: message?.kind ?? 'missing',
      blockedReplayNoAdvance: blockedReplayNoAdvance === true },
  };
  execution.outcome = evaluateUnsupportedAccessExecution(execution);
  return structuredClone(execution);
}

export function goodCompanionFromWorker({ message, artifactSha256 }) {
  const supportedObservation = message?.trace?.some((entry) => entry.pin === 13 && entry.level === true) === true;
  return {
    sourceSha256: X32_UNSUPPORTED_ACCESS_SUITE.fixture.goodSourceSha256,
    artifactSha256,
    status: message?.kind === 'status' && message.cycle > 0 && message.unsupported?.length === 0
      && supportedObservation ? 'completed-supported' : 'incomplete',
    unsupportedRecords: message?.unsupported?.length ?? -1,
    supportedObservation,
  };
}
