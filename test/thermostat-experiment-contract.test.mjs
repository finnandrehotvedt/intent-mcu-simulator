// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  THERMOSTAT_EXPERIMENT_ID,
  THERMOSTAT_OBSERVATION,
  THERMOSTAT_REQUIREMENTS,
  THERMOSTAT_SCENARIOS,
  THERMOSTAT_TIME,
  evaluateThermostatObservation,
  thermostatExpectedSerialLine,
  thermostatScenarioControls,
} from '../src/thermostat-experiment-contract.mjs';

function snapshotFor(scenario, { d13 = scenario.expectedD13, serial = true, cycle = 2_560_000 } = {}) {
  const controls = thermostatScenarioControls(scenario.id).map((control, index) => ({
    sequence: index + 1,
    targetCycle: 0,
    type: 'control',
    componentId: control.componentId,
    key: control.key,
    value: control.value,
  }));
  return {
    cycle,
    pins: [{ pin: 'D13', mode: 'OUTPUT', level: d13 }],
    eventLog: { pending: [], log: controls, dropped: 0 },
    instruments: {
      serial: {
        text: serial ? `${thermostatExpectedSerialLine(scenario.id)}\n` : 'firmware says everything passed\n',
        dropped: 0,
      },
    },
  };
}

test('M1 locks one exact bounded controller, sensor, button, output and equality rule', () => {
  assert.equal(THERMOSTAT_EXPERIMENT_ID, 'avr-thermostat-boundary-v1');
  assert.equal(THERMOSTAT_REQUIREMENTS.controller.profile, 'board.atmega328p-16mhz-v1');
  assert.equal(THERMOSTAT_REQUIREMENTS.parts.sensor.type, 'sensor.temperature-analogue-v1');
  assert.equal(THERMOSTAT_REQUIREMENTS.parts.sensor.boardPin, 'A1');
  assert.equal(THERMOSTAT_REQUIREMENTS.parts.enableButton.type, 'button.momentary-v1');
  assert.equal(THERMOSTAT_REQUIREMENTS.parts.enableButton.boardPin, 'D2');
  assert.equal(THERMOSTAT_REQUIREMENTS.parts.heaterIndicator.boardPin, 'D13');
  assert.equal(THERMOSTAT_REQUIREMENTS.parts.heaterIndicator.resistorOhms, 220);
  assert.equal(THERMOSTAT_REQUIREMENTS.setpointC, 30);
  assert.match(THERMOSTAT_REQUIREMENTS.equalityRule, /== 30.*LOW/iu);
  assert.equal(THERMOSTAT_REQUIREMENTS.requirements.length, 5);
  assert(Object.isFrozen(THERMOSTAT_REQUIREMENTS));
});

test('M1 locks three quantization-aware scenarios and one virtual-time window', () => {
  assert.deepEqual(THERMOSTAT_SCENARIOS.scenarios.map((scenario) => ({
    id: scenario.id,
    controlC: scenario.sensorControlC,
    measuredC: scenario.expectedMeasuredTemperatureC,
    pressed: scenario.buttonPressed,
    d13: scenario.expectedD13,
  })), [
    { id: 'THERM-SCENARIO-BELOW-ENABLED', controlC: 30, measuredC: 29, pressed: true, d13: true },
    { id: 'THERM-SCENARIO-EQUALITY-ENABLED', controlC: 31, measuredC: 30, pressed: true, d13: false },
    { id: 'THERM-SCENARIO-BELOW-DISABLED', controlC: 30, measuredC: 29, pressed: false, d13: false },
  ]);
  assert.deepEqual(THERMOSTAT_TIME, {
    schema: 'intent-mcu-virtual-time-contract@1',
    experimentId: THERMOSTAT_EXPERIMENT_ID,
    clockHertz: 16_000_000,
    inputApplyAtMilliseconds: 0,
    observeAtOrAfterMilliseconds: 160,
    deadlineMilliseconds: 350,
    resetBetweenScenarios: true,
    wallClockAffectsVerdict: false,
  });
});

test('verdict requires complete timed input, executed D13 and agreeing Serial evidence', () => {
  for (const scenario of THERMOSTAT_SCENARIOS.scenarios) {
    const result = evaluateThermostatObservation(scenario.id, snapshotFor(scenario));
    assert.equal(result.status, 'passed');
    assert.deepEqual(result.checks, {
      timeInWindow: true,
      inputsComplete: true,
      pinObserved: true,
      serialObserved: true,
      primaryExecutedPin: true,
      corroboratingSerial: true,
    });
    assert.equal(result.outcome.jobStatus, 'completed');
  }
  const equality = THERMOSTAT_SCENARIOS.scenarios[1];
  assert.equal(evaluateThermostatObservation(equality.id, snapshotFor(equality, { d13: true })).status, 'failed');
  assert.equal(evaluateThermostatObservation(equality.id, snapshotFor(equality, { serial: false })).status, 'failed');
  const late = evaluateThermostatObservation(equality.id, snapshotFor(equality, { cycle: 5_600_001 }));
  assert.equal(late.status, 'indeterminate');
  assert.deepEqual(late.outcome.reasons, ['OBSERVATION_TIME_OUT_OF_WINDOW']);
  assert.equal(THERMOSTAT_OBSERVATION.corroborating.mayPassAlone, false);
});

test('X18 missing producer evidence is indeterminate rather than passed or failed', () => {
  const scenario = THERMOSTAT_SCENARIOS.scenarios[0];
  const missingPin = snapshotFor(scenario); missingPin.pins = [];
  const pinResult = evaluateThermostatObservation(scenario.id, missingPin);
  assert.equal(pinResult.status, 'indeterminate');
  assert.equal(pinResult.outcome.evidenceStatus, 'incomplete');
  assert(pinResult.outcome.reasons.includes('OBSERVATION_PIN_MISSING'));
  const missingInputs = snapshotFor(scenario); missingInputs.eventLog.log = [];
  assert.equal(evaluateThermostatObservation(scenario.id, missingInputs).status, 'indeterminate');
  const missingSerial = snapshotFor(scenario); delete missingSerial.instruments.serial;
  assert.equal(evaluateThermostatObservation(scenario.id, missingSerial).status, 'indeterminate');
});

test('known-bad equality behavior is contractually visible as an executed-output failure', () => {
  const equality = THERMOSTAT_SCENARIOS.scenarios[1];
  const bad = snapshotFor(equality, { d13: true });
  bad.instruments.serial.text = 'TEMP_C=30 BUTTON=PRESSED HEATER=ON STATE=HEAT\n';
  const result = evaluateThermostatObservation(equality.id, bad);
  assert.equal(result.status, 'failed');
  assert.equal(result.checks.primaryExecutedPin, false);
  assert.equal(result.checks.corroboratingSerial, false);
  assert(equality.requirementIds.includes('THERM-REQ-05'));
});

test('X19 matching Serial text cannot pass when the executed D13 observation is wrong', () => {
  const scenario = THERMOSTAT_SCENARIOS.scenarios[0];
  const claim = snapshotFor(scenario, { d13: false, serial: true });
  claim.instruments.serial.text += 'LED ON\n';
  const result = evaluateThermostatObservation(scenario.id, claim);
  assert.equal(result.status, 'failed');
  assert.equal(result.observed.d13, false);
  assert.equal(result.checks.primaryExecutedPin, false);
  assert.equal(result.checks.corroboratingSerial, true);
  assert.match(result.observed.serialText, /LED ON/u);
  assert.equal(THERMOSTAT_OBSERVATION.corroborating.mayPassAlone, false);
});
