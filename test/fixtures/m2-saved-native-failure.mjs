// Sanitized projection of the genuine one-shot M2 native result. It contains
// no capability, token, correct source, project source or pre-authored fix.
const sourceIdentity = 'c4d8ca8c6040529f4bacdbc2e451e66d9640db7f0c97e5f1acca806c1023d431';
const artifactIdentity = 'aa44cf25223eb021ba858f8ff17e10509dfadc3972a0779a806b359382cdee46';
export const SAVED_M2_NATIVE_RAW_SHA256 = '2873c378c89022631d8f04f15c2cd51165bb97db3c0bffedc6e1d93ed6da6ea5';

const outcome = (status, reasons = []) => ({
  schema: 'intent-mcu-experiment-outcome@1', academicStatus: status,
  academicCode: `ACADEMIC_${status.toUpperCase()}`, jobStatus: 'completed',
  jobCode: 'JOB_COMPLETED', evidenceStatus: 'complete', reasons,
});

const controls = (position, pressed) => [
  { componentId: 'temperature-sensor-1', key: 'position', value: position, targetCycle: 0 },
  { componentId: 'enable-button-1', key: 'pressed', value: pressed, targetCycle: 0 },
];

const row = ({ scenarioId, status = 'passed', milliseconds, expectedD13, expectedLine,
  observedD13, observedLine, position, pressed }) => ({
  schema: 'intent-mcu-thermostat-observation-result@1',
  experimentId: 'avr-thermostat-boundary-v1', scenarioId,
  requirementIds: ['THERM-REQ-04'], status,
  outcome: outcome(status, status === 'failed'
    ? ['EXPECTED_PIN_LEVEL_MISMATCH', 'EXPECTED_SERIAL_MISMATCH'] : []),
  virtualMilliseconds: milliseconds,
  expected: { d13: expectedD13, serialLine: expectedLine },
  observed: { d13Mode: 'OUTPUT', d13: observedD13,
    serialText: `${observedLine}\r\n`, inputControls: controls(position, pressed) },
  checks: { timeInWindow: true, inputsComplete: true, pinObserved: true,
    serialObserved: true, primaryExecutedPin: status !== 'failed',
    corroboratingSerial: status !== 'failed' },
});

export function savedM2NativeFailure() {
  const observations = [
    row({ scenarioId: 'THERM-SCENARIO-BELOW-ENABLED', milliseconds: 226.4790625,
      expectedD13: true, expectedLine: 'TEMP_C=29 BUTTON=PRESSED HEATER=ON STATE=HEAT',
      observedD13: true, observedLine: 'TEMP_C=29 BUTTON=PRESSED HEATER=ON STATE=HEAT',
      position: 0.4, pressed: true }),
    row({ scenarioId: 'THERM-SCENARIO-EQUALITY-ENABLED', status: 'failed', milliseconds: 250.7393125,
      expectedD13: false, expectedLine: 'TEMP_C=30 BUTTON=PRESSED HEATER=OFF STATE=HOLD',
      observedD13: true, observedLine: 'TEMP_C=30 BUTTON=PRESSED HEATER=ON STATE=HEAT',
      position: 0.405, pressed: true }),
    row({ scenarioId: 'THERM-SCENARIO-ABOVE-ENABLED', milliseconds: 258.819125,
      expectedD13: false, expectedLine: 'TEMP_C=31 BUTTON=PRESSED HEATER=OFF STATE=HOLD',
      observedD13: false, observedLine: 'TEMP_C=31 BUTTON=PRESSED HEATER=OFF STATE=HOLD',
      position: 0.41, pressed: true }),
    row({ scenarioId: 'THERM-SCENARIO-BELOW-DISABLED', milliseconds: 242.662625,
      expectedD13: false, expectedLine: 'TEMP_C=29 BUTTON=RELEASED HEATER=OFF STATE=OFF',
      observedD13: false, observedLine: 'TEMP_C=29 BUTTON=RELEASED HEATER=OFF STATE=OFF',
      position: 0.4, pressed: false }),
  ];
  return {
    ok: true, schema: 'intent-mcu-bounded-action-result@1', router: 'intent-mcu-bounded-action-router@1',
    code: 'ACTION_TEST_EVALUATED', action: 'runtime.run', requestId: 'm2-native-run-sanitized',
    profile: 'board.atmega328p-16mhz-v1', generationBefore: 2_000_000,
    generationAfter: 2_000_000, executed: true,
    result: { ok: true, code: 'ACTION_TEST_EVALUATED', artifactIdentity, sourceIdentity,
      testEvidence: { schema: 'intent-mcu-bounded-test-evidence@1',
        experimentId: 'avr-thermostat-boundary-v1', firmwareVariant: 'known-bad-equality',
        status: 'failed', outcome: outcome('failed', [
          'THERM-SCENARIO-EQUALITY-ENABLED:EXPECTED_PIN_LEVEL_MISMATCH',
          'THERM-SCENARIO-EQUALITY-ENABLED:EXPECTED_SERIAL_MISMATCH',
        ]), jobStatus: 'completed', artifactIdentity, sourceIdentity,
        projectGeneration: 2, runtimeGeneration: 4,
        primaryObservation: structuredClone(observations[1]), observations } },
  };
}

// This is a synthetic contract-complete future producer shape. The immutable
// saved native receipt above intentionally lacks these parent-generation and
// retention fields and therefore remains indeterminate.
export function contractCompleteM2Failure() {
  const value = savedM2NativeFailure();
  value.result.projectGeneration = value.result.testEvidence.projectGeneration;
  value.result.runtimeGeneration = value.result.testEvidence.runtimeGeneration;
  for (const observation of value.result.testEvidence.observations) {
    observation.retention = { inputEventsDropped: 0, serialEventsDropped: 0 };
  }
  value.result.testEvidence.primaryObservation = structuredClone(
    value.result.testEvidence.observations[1],
  );
  return value;
}

export function savedM2NativePass() {
  const value = contractCompleteM2Failure();
  const equality = value.result.testEvidence.observations[1];
  equality.status = 'passed'; equality.outcome = outcome('passed');
  equality.observed.d13 = false;
  equality.observed.serialText = 'TEMP_C=30 BUTTON=PRESSED HEATER=OFF STATE=HOLD\r\n';
  equality.checks.primaryExecutedPin = true; equality.checks.corroboratingSerial = true;
  value.result.testEvidence.status = 'passed'; value.result.testEvidence.outcome = outcome('passed');
  value.result.testEvidence.primaryObservation = structuredClone(value.result.testEvidence.observations[3]);
  return value;
}
