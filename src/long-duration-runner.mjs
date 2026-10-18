// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { DEFAULT_CIRCUIT } from './default-circuit.mjs';
import { completedExperimentOutcome, interruptedExperimentOutcome, jobStatusFromCode } from './experiment-outcomes.mjs';
import {
  LONG_DURATION_REPORT_SCHEMA, X28_GOOD_SOURCE, X28_KNOWN_BAD_SOURCE, X28_LONG_DURATION_SUITE,
  longDurationSuiteIdentity, semanticLongDurationProjection, validateLongDurationReport,
  validateLongDurationSuite,
} from './long-duration-contract.mjs';
import { RuntimeKernel } from './runtime-kernel.mjs';
import { sha256Text, stableStringify } from './regression-matrix-contract.mjs';

const CLOCKS_PER_MILLISECOND = 16000;
const clone = (value) => structuredClone(value);
const completed = (checks) => completedExperimentOutcome({
  evidence: checks.evidence.map(([code, complete]) => ({ code, complete })),
  assertions: checks.assertions.map(([code, passed]) => ({ code, passed })),
});

function d13Transitions(snapshot) {
  return snapshot.instruments.logic.transitions.filter((entry) => entry.pin === 'D13');
}

function parseNumber(text, marker) {
  const match = new RegExp(`${marker} (\\d+)`).exec(text);
  return match ? Number(match[1]) : null;
}

function runWrapCell(hex, cell) {
  const started = performance.now();
  const kernel = new RuntimeKernel(hex, DEFAULT_CIRCUIT, { logicChannels: ['D13'], serialHistoryLimit: 512 });
  kernel.runUntilCycle(100 * CLOCKS_PER_MILLISECOND, 3_000_000);
  const snapshot = kernel.snapshot();
  const transitions = d13Transitions(snapshot);
  const high = transitions.find((entry) => entry.level === true) ?? null;
  const low = transitions.find((entry) => entry.level === false && entry.cycle > (high?.cycle ?? -1)) ?? null;
  const preMillis = parseNumber(snapshot.instruments.serial.text, 'X28 PRE');
  const postMillis = parseNumber(snapshot.instruments.serial.text, 'X28 POST');
  const expected = clone(cell.expected);
  const actual = { preMillis, postMillis, d13High: high, d13Low: low,
    uartText: snapshot.instruments.serial.text.trim(), finalD13: snapshot.pins.find((pin) => pin.pin === 'D13')?.level ?? null };
  const outcome = completed({ evidence: [
    ['WRAP_PRE_UART_OBSERVED', Number.isInteger(preMillis)], ['WRAP_POST_UART_OBSERVED', Number.isInteger(postMillis)],
    ['WRAP_D13_HIGH_OBSERVED', Boolean(high)], ['WRAP_D13_LOW_OBSERVED', Boolean(low)],
  ], assertions: [
    ['WRAP_MINIMUM_VIRTUAL_TIME', snapshot.cycle / CLOCKS_PER_MILLISECOND >= cell.minimumVirtualMilliseconds],
    ['WRAP_PRE_VALUE_WINDOW', preMillis >= expected.preMillisMinimum && preMillis <= expected.preMillisMaximum],
    ['WRAP_POST_VALUE_WINDOW', postMillis >= expected.postMillisMinimum && postMillis <= expected.postMillisMaximum],
    ['WRAP_D13_HIGH_WINDOW', high?.cycle >= expected.d13HighCycleMinimum && high?.cycle <= expected.d13HighCycleMaximum],
    ['WRAP_D13_LOW_WINDOW', low?.cycle >= expected.d13LowCycleMinimum && low?.cycle <= expected.d13LowCycleMaximum],
  ] });
  return { cellId: cell.cellId, expected, actual, outcome,
    rawVirtualTime: { timebase: 'avr8js-cycles-and-Arduino-unsigned-millis', cycle: snapshot.cycle,
      virtualMilliseconds: snapshot.cycle / CLOCKS_PER_MILLISECOND, preMillis, postMillis,
      transitionCycles: transitions.map(({ cycle, level }) => ({ cycle, level })) },
    durationMilliseconds: performance.now() - started };
}

function epochSemantic(snapshot) {
  return {
    cycle: snapshot.cycle,
    uartText: snapshot.instruments.serial.text,
    transitions: d13Transitions(snapshot).map(({ cycle, level }) => ({ cycle, level })),
    finalD13: snapshot.pins.find((pin) => pin.pin === 'D13')?.level ?? null,
    dropped: { serial: snapshot.instruments.serial.dropped, logic: snapshot.instruments.logic.dropped,
      input: snapshot.eventLog.dropped },
  };
}

function runResetCell(hex, cell) {
  const started = performance.now();
  const kernel = new RuntimeKernel(hex, DEFAULT_CIRCUIT, { logicChannels: ['D13'], serialHistoryLimit: 512 });
  const epochs = [];
  const resetReadbacks = [];
  for (let epoch = 1; epoch <= cell.resetEpochs; epoch += 1) {
    const reset = kernel.reset();
    resetReadbacks.push({ epoch, cycle: reset.cycle, pending: reset.eventLog.pending.length,
      eventLog: reset.eventLog.log.length, serial: reset.instruments.serial.records.length,
      logic: reset.instruments.logic.transitions.length });
    kernel.runUntilCycle(cell.epochVirtualMilliseconds * CLOCKS_PER_MILLISECOND, 3_000_000);
    epochs.push({ epoch, ...epochSemantic(kernel.snapshot()) });
  }
  const semanticEpochs = epochs.map(({ epoch, ...value }) => value);
  const identical = semanticEpochs.every((value) => stableStringify(value) === stableStringify(semanticEpochs[0]));
  const cleared = resetReadbacks.every((value) => value.cycle === 0 && value.pending === 0 && value.eventLog === 0
    && value.serial === 0 && value.logic === 0);
  const outcome = completed({ evidence: [
    ['RESET_FIVE_EPOCHS_OBSERVED', epochs.length === 5], ['RESET_READBACKS_OBSERVED', resetReadbacks.length === 5],
  ], assertions: [
    ['RESET_CYCLE_ZERO_AND_EMPTY_AUTHORITY', cleared], ['RESET_PRODUCER_EVIDENCE_IDENTICAL', identical],
  ] });
  return { cellId: cell.cellId, expected: clone(cell.expected),
    actual: { epochs: epochs.length, cycleZeroAndEmpty: cleared, identicalProducerEvidence: identical,
      uartText: epochs[0]?.uartText?.trim() ?? '', finalD13: epochs[0]?.finalD13 ?? null },
    outcome,
    rawVirtualTime: { timebase: 'five-independent-avr8js-reset-epochs', resetReadbacks, epochs },
    durationMilliseconds: performance.now() - started };
}

function runLongSequenceCell(hex, cell) {
  const started = performance.now();
  const kernel = new RuntimeKernel(hex, DEFAULT_CIRCUIT, { logicChannels: ['D13', 'D2'], serialHistoryLimit: 512 });
  const targets = [];
  for (let index = 1; index <= cell.eventCount; index += 1) {
    const targetCycle = index * cell.eventSpacingCycles;
    targets.push(targetCycle);
    kernel.queueControlAtCycle('button-1', 'pressed', index % 2 === 1, targetCycle);
  }
  for (const targetCycle of targets) {
    kernel.runUntilCycle(targetCycle, 500_000);
    kernel.runInstructions(1);
  }
  const finalCycle = Math.max(targets.at(-1), cell.minimumVirtualMilliseconds * CLOCKS_PER_MILLISECOND)
    + (50 * CLOCKS_PER_MILLISECOND);
  kernel.runUntilCycle(finalCycle, 2_000_000);
  const snapshot = kernel.snapshot();
  const finalD13 = snapshot.pins.find((pin) => pin.pin === 'D13')?.level ?? null;
  const ordered = snapshot.eventLog.log.every((event, index) => event.sequence === index + 1
    && event.targetCycle === targets[index] && event.componentId === 'button-1' && event.key === 'pressed');
  const marker = snapshot.instruments.serial.text.includes(cell.expected.uartMarker);
  const outcome = completed({ evidence: [
    ['LONG_SEQUENCE_128_EVENTS_RETAINED', snapshot.eventLog.log.length === cell.eventCount],
    ['LONG_SEQUENCE_UART_OBSERVED', marker], ['LONG_SEQUENCE_D13_OBSERVED', typeof finalD13 === 'boolean'],
  ], assertions: [
    ['LONG_SEQUENCE_EXACT_ORDER', ordered], ['LONG_SEQUENCE_ZERO_PENDING', snapshot.eventLog.pending.length === 0],
    ['LONG_SEQUENCE_ZERO_INPUT_DROPS', snapshot.eventLog.dropped === cell.expected.droppedInputs],
    ['LONG_SEQUENCE_MINIMUM_VIRTUAL_TIME', snapshot.cycle / CLOCKS_PER_MILLISECOND >= cell.minimumVirtualMilliseconds],
    ['LONG_SEQUENCE_FINAL_D13', finalD13 === cell.expected.finalD13],
    ['LONG_SEQUENCE_RETENTION_BOUNDED', snapshot.instruments.serial.dropped === 0 && snapshot.instruments.logic.dropped === 0],
  ] });
  return { cellId: cell.cellId, expected: clone(cell.expected),
    actual: { events: snapshot.eventLog.log.length, ordered, pending: snapshot.eventLog.pending.length,
      droppedInputs: snapshot.eventLog.dropped, finalD13, uartMarkerObserved: marker,
      retainedSerial: snapshot.instruments.serial.retained,
      retainedLogic: snapshot.instruments.logic.transitions.length,
      droppedSerial: snapshot.instruments.serial.dropped, droppedLogic: snapshot.instruments.logic.dropped },
    outcome,
    rawVirtualTime: { timebase: 'avr8js-cycles', finalCycle: snapshot.cycle,
      virtualMilliseconds: snapshot.cycle / CLOCKS_PER_MILLISECOND, targetCycles: targets },
    durationMilliseconds: performance.now() - started };
}

function runKnownBad(hex, sourceSha256, artifactSha256) {
  const started = performance.now();
  const kernel = new RuntimeKernel(hex, DEFAULT_CIRCUIT, { logicChannels: ['D13'], serialHistoryLimit: 128 });
  kernel.runUntilCycle(100 * CLOCKS_PER_MILLISECOND, 3_000_000);
  const snapshot = kernel.snapshot();
  const text = snapshot.instruments.serial.text;
  const badMillis = parseNumber(text, 'X28 BAD');
  const transition = d13Transitions(snapshot).find((entry) => entry.level === true) ?? null;
  const failedAsExpected = Number.isInteger(badMillis) && badMillis > 4294967200
    && transition?.cycle < 160000;
  return { sourceSha256, artifactSha256,
    actual: { uartText: text.trim(), badMillis, d13High: transition, failedAsExpected },
    outcome: completedExperimentOutcome({ assertions: [
      { code: 'KNOWN_BAD_DIRECT_DEADLINE_REJECTED', passed: false },
      { code: 'KNOWN_BAD_RUNTIME_DIFFERENCE_OBSERVED', passed: failedAsExpected },
    ] }),
    rawVirtualTime: { timebase: 'avr8js-cycles-and-Arduino-unsigned-millis', cycle: snapshot.cycle,
      virtualMilliseconds: snapshot.cycle / CLOCKS_PER_MILLISECOND, badMillis,
      d13HighCycle: transition?.cycle ?? null },
    durationMilliseconds: performance.now() - started };
}

function failureResult(cell, error) {
  const code = error?.code ?? error?.message ?? 'LONG_DURATION_EXECUTION_FAILED';
  return { cellId: cell.cellId, expected: clone(cell.expected), actual: null,
    outcome: interruptedExperimentOutcome(jobStatusFromCode(code), code),
    rawVirtualTime: { timebase: 'unavailable' }, durationMilliseconds: 0 };
}

export async function executeLongDurationSuite({ suite = X28_LONG_DURATION_SUITE, compile }) {
  const validated = await validateLongDurationSuite(suite);
  if (typeof compile !== 'function') throw new TypeError('LONG_DURATION_COMPILER_REQUIRED');
  const good = await compile(X28_GOOD_SOURCE, 'x28-good');
  const bad = await compile(X28_KNOWN_BAD_SOURCE, 'x28-known-bad');
  for (const artifact of [good, bad]) {
    if (!artifact || typeof artifact.hex !== 'string' || !/^[0-9a-f]{64}$/u.test(artifact.artifactSha256)) {
      throw Object.assign(new Error('LONG_DURATION_ARTIFACT_INVALID'), { code: 'LONG_DURATION_ARTIFACT_INVALID' });
    }
  }
  const runners = [runWrapCell, runResetCell, runLongSequenceCell];
  const results = validated.cells.map((cell, index) => {
    try { return runners[index](good.hex, cell); } catch (error) { return failureResult(cell, error); }
  });
  const report = {
    schema: LONG_DURATION_REPORT_SCHEMA,
    suiteId: validated.suiteId,
    suiteSha256: await longDurationSuiteIdentity(validated),
    profile: validated.profile,
    fixtureSha256: validated.fixture.sourceSha256,
    sourceSha256: validated.fixture.sourceSha256,
    artifactSha256: good.artifactSha256,
    producer: 'RuntimeKernel/avr8js 0.21.1 from compiler-generated HEX',
    results,
    knownBad: runKnownBad(bad.hex, validated.fixture.knownBadSourceSha256, bad.artifactSha256),
    limits: clone(validated.limits),
  };
  report.semanticSha256 = await sha256Text(stableStringify(semanticLongDurationProjection(report)));
  return validateLongDurationReport(report, validated);
}

export function longDurationReportPassed(report) {
  return report.results.every((result) => result.outcome.academicStatus === 'passed'
    && result.outcome.jobStatus === 'completed')
    && report.knownBad.outcome.academicStatus === 'failed'
    && report.knownBad.outcome.jobStatus === 'completed'
    && report.knownBad.actual.failedAsExpected === true;
}
