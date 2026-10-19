// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

const integer = (value) => Number.isInteger(value) ? value.toLocaleString('en-US') : 'missing';

export function longDurationPresentation(result) {
  if (result.cellId === 'X28-MILLIS-UNSIGNED-WRAP') return {
    label: 'Unsigned millis() wrap',
    expected: [
      `PRE millis ${integer(result.expected.preMillisMinimum)}–${integer(result.expected.preMillisMaximum)}`,
      `POST millis ${result.expected.postMillisMinimum}–${result.expected.postMillisMaximum}`,
      'D13 HIGH before wrap, LOW after wrap',
      'At least 96 ms actual virtual time',
    ],
    actual: [
      `PRE ${integer(result.actual.preMillis)} · POST ${integer(result.actual.postMillis)}`,
      `D13 HIGH at ${integer(result.actual.d13High?.cycle)} cycles`,
      `D13 LOW at ${integer(result.actual.d13Low?.cycle)} cycles`,
      `Final D13 ${result.actual.finalD13 ? 'HIGH' : 'LOW'}`,
    ],
  };
  if (result.cellId === 'X28-FIVE-RESET-EPOCHS') return {
    label: 'Five reset epochs',
    expected: ['5 resets', 'Cycle zero after each reset', 'Empty transient authority', 'Identical producer evidence'],
    actual: [
      `${result.actual.epochs} epochs observed`,
      `Cycle zero + empty: ${result.actual.cycleZeroAndEmpty ? 'yes' : 'no'}`,
      `Identical evidence: ${result.actual.identicalProducerEvidence ? 'yes' : 'no'}`,
      `Final D13 ${result.actual.finalD13 ? 'HIGH' : 'LOW'}`,
    ],
  };
  if (result.cellId === 'X28-128-ORDERED-D2') return {
    label: '128 ordered D2 events',
    expected: ['128 controls in exact order', 'At least 2,048 ms actual virtual time', '0 input drops', 'Final D13 LOW'],
    actual: [
      `${result.actual.events} events · ordered ${result.actual.ordered ? 'yes' : 'no'}`,
      `${result.rawVirtualTime.virtualMilliseconds.toLocaleString('en-US')} ms virtual time`,
      `${result.actual.droppedInputs} input drops · ${result.actual.pending} pending`,
      `Final D13 ${result.actual.finalD13 ? 'HIGH' : 'LOW'} · UART marker ${result.actual.uartMarkerObserved ? 'seen' : 'missing'}`,
    ],
  };
  if (result.cellId === 'X28-KNOWN-BAD-DIRECT-DEADLINE') return {
    label: 'Known-bad direct deadline',
    expected: ['Academic failure', 'Job still completes', 'Early runtime behavior differs', 'D13 evidence required beside UART'],
    actual: [
      `BAD millis ${integer(result.actual.badMillis)}`,
      `D13 HIGH at ${integer(result.actual.d13High?.cycle)} cycles`,
      `Runtime difference: ${result.actual.failedAsExpected ? 'observed' : 'missing'}`,
    ],
  };
  throw Object.assign(new Error('LONG_DURATION_PRESENTATION_CELL_UNKNOWN'), { code: 'LONG_DURATION_PRESENTATION_CELL_UNKNOWN' });
}
