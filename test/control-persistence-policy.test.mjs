// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTROL_PERSISTENCE_POLICY,
  controlPersistenceInventory,
  controlPersistenceSummary,
} from '../src/control-persistence-policy.mjs';
import { createExampleProject } from '../src/example-projects.mjs';
import { createAvrReferenceStarter } from '../src/avr-reference-starters.mjs';
import { candidateContactControl, openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import { openPortableEditorSession } from '../src/candidate-project-session.mjs';
import { canonicalProjectJson, validateProjectV2 } from '../src/project-v2.mjs';
import { createTemperatureLcdThresholdExample } from '../expansion-drafts/temperature-lcd-threshold-example-v1.mjs';
import { validateDigitalLightThresholdComponent } from '../expansion-drafts/digital-light-threshold-module-v1.mjs';

const expected = {
  'button.momentary-v1': ['pressed'],
  'potentiometer.linear-v1': ['position'],
  'switch.toggle-spst-v1': ['closed'],
  'switch.changeover-spdt-v1': ['selectedThrow'],
  'switch.slide-spdt-v1': ['selectedThrow'],
  'button.momentary-nc-v1': ['pressed'],
  'switch.limit-spdt-v1': ['actuated'],
  'switch.dip-4-v1': ['switch1', 'switch2', 'switch3', 'switch4'],
  'input.rotary-encoder-button-v1': ['detent', 'pressed'],
  'switch.reed-no-v1': ['magnetPresent'],
  'switch.emergency-stop-nc-v1': ['latched'],
  'switch.foot-pedal-no-v1': ['pressed'],
  'switch.float-no-v1': ['liquidHigh'],
  'sensor.tilt-switch-no-v1': ['tilted'],
  'sensor.ball-vibration-switch-no-v1': ['vibrationDetected'],
  'input.analog-joystick-2axis-v1': ['x', 'y', 'pressed'],
  'input.matrix-keypad-3x4-v1': ['pressedKey'],
  'input.matrix-keypad-4x4-v1': ['pressedKey'],
  'switch.rotary-selector-4-v1': ['position'],
  'sensor.light-analogue-v1': ['lightLevel'],
  'sensor.temperature-analogue-v1': ['temperatureC'],
  'sensor.light-threshold-digital-v1': [
    'lightLevelPercent', 'thresholdPercent', 'hysteresisPercentagePoints', 'outputActive',
  ],
  'input.capacitive-touch-button-v1': ['touched'],
  'sensor.pir-motion-v1': ['motionDetected'],
  'sensor.hall-switch-digital-v1': ['magnetPresent'],
  'sensor.flow-pulse-digital-v1': ['pulseHigh'],
  'sensor.wind-speed-pulse-digital-v1': ['pulseHigh'],
  'sensor.ir-obstacle-reflective-v1': ['obstacleDetected'],
  'sensor.line-tracking-reflective-v1': ['lineDetected'],
  'sensor.soil-moisture-resistive-analogue-v1': ['moistureRatio'],
  'sensor.soil-moisture-capacitive-analogue-v1': ['moistureRatio'],
  'sensor.water-level-analogue-v1': ['waterLevelRatio'],
  'sensor.rain-analogue-v1': ['wetnessRatio'],
  'sensor.sound-level-analogue-v1': ['soundLevelRatio'],
  'sensor.flame-analogue-v1': ['flameIntensityRatio'],
  'sensor.mq-gas-analogue-v1': ['gasResponseRatio'],
  'sensor.co2-analogue-v1': ['co2ResponseRatio'],
  'sensor.uv-analogue-v1': ['uvResponseRatio'],
  'sensor.wind-direction-analogue-v1': ['directionDegrees'],
  'sensor.hall-magnetic-analogue-v1': ['magneticFieldRatio'],
  'sensor.tmp36-temperature-analogue-v1': ['temperatureC'],
  'sensor.lm35-temperature-analogue-v1': ['temperatureC'],
  'sensor.ldr-divider-v1': ['lightLevel'],
  'sensor.ntc-10k-divider-v1': ['temperatureC'],
  'sensor.flex-divider-v1': ['bendRatio'],
  'input.rotary-encoder-quadrature-v1': ['detent'],
};

function apply(session, command) {
  const result = session.apply({ ...command, revision: session.revision });
  assert.equal(result.ok, true, `${command.type}:${result.code}`);
  return result;
}

function candidate(id, componentId, changes) {
  const text = id === 'temperature-lcd-threshold'
    ? createTemperatureLcdThresholdExample().text
    : createAvrReferenceStarter(id).text;
  const opened = openCandidateUiSession(text);
  assert.equal(opened.ok, true);
  for (const [key, value] of changes) {
    const prepared = candidateContactControl(opened.session, componentId, key, value);
    assert.equal(prepared.ok, true, `${id}:${key}`);
    apply(opened.session, prepared.command);
  }
  return opened.session;
}

test('all 67 executable cells have one exact controls-persist or controls-empty policy', () => {
  assert.deepEqual(controlPersistenceSummary(), {
    profiles: 4, cells: 260, available: 67, unavailable: 193,
    controlBearing: 46, controlsEmpty: 21, controls: 55,
  });
  const inventory = controlPersistenceInventory();
  const bearing = inventory.filter((cell) => cell.available && cell.controls.length);
  assert.deepEqual(Object.fromEntries(bearing.map((cell) => [
    cell.type, cell.controls.map((control) => control.key),
  ])), expected);
  assert(bearing.every((cell) => cell.profile === 'board.atmega328p-16mhz-v1'));
  assert(inventory.filter((cell) => cell.available && cell.profile !== 'board.atmega328p-16mhz-v1')
    .every((cell) => cell.policy === 'controls-empty'));
  assert.deepEqual(CONTROL_PERSISTENCE_POLICY.excludedAuthority, [
    'compiled-artifact', 'runtime-session', 'undo-redo-history', 'serial-output',
    'gpio-observation', 'momentary-edge', 'encoder-phase-event',
  ]);
});

test('project-v2 button and potentiometer controls round-trip as authored data', () => {
  for (const [id, type, controls] of [
    ['button', 'button.momentary-v1', { pressed: true }],
    ['adc', 'potentiometer.linear-v1', { position: 0.83 }],
  ]) {
    const project = createExampleProject(id).project;
    project.circuit.components.find((component) => component.type === type).controls = controls;
    const canonical = canonicalProjectJson(project);
    const opened = openPortableEditorSession(canonical);
    assert.equal(opened.ok, true);
    assert.deepEqual(opened.session.project.circuit.components.find(
      (component) => component.type === type,
    ).controls, controls);
    assert.equal(opened.session.saveText(), canonical);
  }
});

test('all six candidate control models round-trip exact non-default retained values with empty history', () => {
  const sessions = [
    ['avr-toggle-input', 'toggle-switch-1', [['closed', true]]],
    ['avr-spdt-selector', 'selector-1', [['selectedThrow', 'B']]],
    ['avr-light-analogue', 'light-sensor-1', [['lightLevel', 0.83]]],
    ['temperature-lcd-threshold', 'temperature-sensor-1', [['temperatureC', 100]]],
    ['avr-light-threshold', 'light-threshold-1', [['lightLevelPercent', 50], ['lightLevelPercent', 48]]],
    ['avr-rotary-encoder', 'encoder-1', [['detent', 1], ['detent', 2]]],
  ].map(([id, componentId, changes]) => [componentId, candidate(id, componentId, changes)]);

  for (const [componentId, session] of sessions) {
    const canonical = session.saveText();
    const expectedControls = session.visualProject.circuit.components.find(
      (component) => component.id === componentId,
    ).controls;
    const reopened = openCandidateUiSession(canonical);
    assert.equal(reopened.ok, true);
    assert.equal(reopened.session.saveText(), canonical);
    assert.deepEqual(reopened.session.visualProject.circuit.components.find(
      (component) => component.id === componentId,
    ).controls, expectedControls);
    const undo = reopened.session.apply({ type: 'undo', revision: reopened.session.revision });
    assert.equal(undo.ok, false);
    assert.equal(undo.code, 'EDITOR_UNDO_EMPTY');
  }
});

test('digital threshold preserves the actual accepted hysteresis state without invented recomputation', () => {
  const base = {
    id: 'threshold-1', type: 'sensor.light-threshold-digital-v1', label: 'Threshold',
    properties: {}, controls: {
      lightLevelPercent: 48, thresholdPercent: 50,
      hysteresisPercentagePoints: 5, outputActive: true,
    },
  };
  assert.equal(validateDigitalLightThresholdComponent(base), true);
  assert.equal(validateDigitalLightThresholdComponent({
    ...base, controls: { ...base.controls, outputActive: false },
  }), true, 'inside the hysteresis band either retained state is valid');
  assert.equal(validateDigitalLightThresholdComponent({
    ...base, controls: { ...base.controls, lightLevelPercent: 50, outputActive: true },
  }), true);
  assert.equal(validateDigitalLightThresholdComponent({
    ...base, controls: { ...base.controls, lightLevelPercent: 50, outputActive: false },
  }), false);
  assert.equal(validateDigitalLightThresholdComponent({
    ...base, controls: { ...base.controls, lightLevelPercent: 45, outputActive: false },
  }), true);
  assert.equal(validateDigitalLightThresholdComponent({
    ...base, controls: { ...base.controls, lightLevelPercent: 45, outputActive: true },
  }), false);
});

test('unknown, wrong-type and out-of-range controls reject without changing the valid session', () => {
  const valid = candidate('avr-rotary-encoder', 'encoder-1', [['detent', 1]]);
  const before = valid.saveText();
  const invalidCandidate = JSON.parse(before);
  invalidCandidate.candidateCircuit.components.find((component) => component.id === 'encoder-1')
    .controls.detent = 1000;
  assert.equal(openCandidateUiSession(JSON.stringify(invalidCandidate)).ok, false);
  assert.equal(valid.saveText(), before);

  const invalidThreshold = JSON.parse(createAvrReferenceStarter('avr-light-threshold').text);
  invalidThreshold.candidateCircuit.components.find((component) => component.id === 'light-threshold-1')
    .controls.outputActive = 'yes';
  assert.equal(openCandidateUiSession(JSON.stringify(invalidThreshold)).ok, false);

  const invalidBase = createExampleProject('button').project;
  invalidBase.circuit.components.find((component) => component.type === 'button.momentary-v1')
    .controls = { pressed: false, unknown: true };
  assert.equal(validateProjectV2(invalidBase).ok, false);
});
