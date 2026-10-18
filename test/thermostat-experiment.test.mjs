// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';
import {
  THERMOSTAT_EXPERIMENT_CARD,
  THERMOSTAT_EXPERIMENT_KNOWN_BAD_SOURCE,
  THERMOSTAT_EXPERIMENT_COMPARISON_ONLY_BAD_SOURCE,
  THERMOSTAT_EXPERIMENT_SOURCE,
  createThermostatExperiment,
  isThermostatExperimentProject,
  openThermostatExperiment,
  thermostatFirmwareSource,
  thermostatFirmwareVariant,
} from '../src/thermostat-experiment.mjs';

function openExample() {
  const example = createThermostatExperiment();
  const opened = openCandidateUiSession(example.text);
  assert.equal(opened.ok, true, `${opened.code} ${JSON.stringify(opened.details ?? [])}`);
  return { example, session: opened.session };
}

test('M1 starter is one runnable five-part AVR thermostat with exact named pins', () => {
  const { example, session } = openExample();
  assert.equal(THERMOSTAT_EXPERIMENT_CARD.name, 'Thermostat boundary test');
  assert.deepEqual(example.limits, { components: 5, nets: 6, endpoints: 14 });
  assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
  const components = Object.fromEntries(session.visualProject.circuit.components.map(
    (component) => [component.id, component],
  ));
  assert.equal(components['temperature-sensor-1'].controls.temperatureC, 30);
  assert.equal(components['enable-button-1'].controls.pressed, false);
  assert.equal(components['heater-resistor-1'].properties.ohms, 220);
  assert.equal(components['heater-led-1'].properties.color, 'red');
  assert.deepEqual(session.runtimeProject.instruments.logicChannels, ['D2', 'D13']);
  assert.equal(session.runtimeProject.instruments.selectedPin, 'D13');
  assert.equal(isThermostatExperimentProject(session.project), true);
});

test('sensor, button and heater indicator project through existing tested runtime adapters', () => {
  const { session } = openExample();
  const runtime = session.runtimeProject.circuit;
  const ids = new Set(runtime.components.map((component) => component.id));
  assert(ids.has('temperature-sensor-1'));
  assert(ids.has('enable-button-1'));
  assert(ids.has('heater-resistor-1'));
  assert(ids.has('heater-led-1'));
  const support = Object.fromEntries(session.runtimeSupport.map((item) => [item.componentId, item]));
  assert.equal(support['temperature-sensor-1'].runtimeAdapter, 'potentiometer.linear-v1');
  assert.equal(support['temperature-sensor-1'].runtimeProjection.boardPin, 'A1');
  assert.match(THERMOSTAT_EXPERIMENT_SOURCE, /pinMode\(ENABLE_BUTTON_PIN, INPUT_PULLUP\)/u);
  assert.match(THERMOSTAT_EXPERIMENT_SOURCE, /temperatureC < SETPOINT_C/u);
});

test('correct and known-bad firmware variants are exact, visible and bounded', () => {
  assert.equal(thermostatFirmwareVariant(THERMOSTAT_EXPERIMENT_SOURCE), 'correct');
  assert.equal(thermostatFirmwareVariant(THERMOSTAT_EXPERIMENT_KNOWN_BAD_SOURCE), 'known-bad-equality');
  assert.equal(thermostatFirmwareVariant(THERMOSTAT_EXPERIMENT_COMPARISON_ONLY_BAD_SOURCE),
    'known-bad-equality');
  assert.equal(thermostatFirmwareSource('correct'), THERMOSTAT_EXPERIMENT_SOURCE);
  assert.equal(thermostatFirmwareSource('known-bad-equality'), THERMOSTAT_EXPERIMENT_KNOWN_BAD_SOURCE);
  assert.match(THERMOSTAT_EXPERIMENT_KNOWN_BAD_SOURCE, /temperatureC <= SETPOINT_C/u);
  assert.doesNotMatch(THERMOSTAT_EXPERIMENT_SOURCE, /temperatureC <= SETPOINT_C/u);
  assert.throws(() => thermostatFirmwareSource('arbitrary'), /THERMOSTAT_FIRMWARE_VARIANT/u);
});

test('canonical data-only save/open stays exact and recognizes either teaching variant', () => {
  const { example, session } = openExample();
  const saved = session.saveText();
  assert.equal(saved, example.text);
  assert.doesNotMatch(saved, /elfBytes|firmwareBase64|authorization|bearer|"hex"\s*:/iu);
  const reopened = openThermostatExperiment(saved);
  assert.equal(reopened.ok, true);
  assert.equal(reopened.session.saveText(), saved);
  assert.equal(isThermostatExperimentProject(reopened.session.project), true);
  const changed = reopened.session.apply({
    type: 'source.set',
    revision: reopened.session.revision,
    name: 'main.ino',
    content: THERMOSTAT_EXPERIMENT_KNOWN_BAD_SOURCE,
  });
  assert.equal(changed.ok, true);
  assert.equal(thermostatFirmwareVariant(reopened.session.project), 'known-bad-equality');
  assert.equal(isThermostatExperimentProject(reopened.session.project), true);
  const modified = reopened.session.apply({
    type: 'source.set',
    revision: reopened.session.revision,
    name: 'main.ino',
    content: `${THERMOSTAT_EXPERIMENT_SOURCE}\n// learner edit\n`,
  });
  assert.equal(modified.ok, true);
  assert.equal(thermostatFirmwareVariant(reopened.session.project), 'modified');
  assert.equal(isThermostatExperimentProject(reopened.session.project), true);
});

test('X21 every declared thermostat connection break rejects before execution', () => {
  const { example } = openExample();
  const expected = new Map([
    ['net-thermostat-5v', 'PROJECT_CONTACT_TEMPERATURE_SENSOR_VCC_DISCONNECTED'],
    ['net-thermostat-ground', 'PROJECT_CONTACT_JUNCTION'],
    ['net-thermostat-temperature', 'PROJECT_CONTACT_TEMPERATURE_SENSOR_AOUT_DISCONNECTED'],
    ['net-thermostat-enable', 'PROJECT_CONTACT_BUTTON_UNSUPPORTED_PATH'],
    ['net-thermostat-heater-drive', 'PROJECT_CONTACT_LED_UNSUPPORTED_PATH'],
    ['net-thermostat-heater-led', 'PROJECT_CONTACT_LED_UNSUPPORTED_PATH'],
  ]);
  assert.deepEqual(new Set(example.project.candidateCircuit.nets.map((item) => item.id)), new Set(expected.keys()));
  for (const [netId, code] of expected) {
    const invalid = structuredClone(example.project);
    invalid.candidateCircuit.nets = invalid.candidateCircuit.nets.filter((item) => item.id !== netId);
    const rejected = openThermostatExperiment(JSON.stringify(invalid));
    assert.equal(rejected.ok, false, netId);
    assert.equal(rejected.code, code, netId);
  }
});

test('experiment identity requires the exact A1 D2 D13 and 220 ohm topology', () => {
  const { session } = openExample();
  const rewired = session.project;
  rewired.circuit.nets.find((item) => item.id === 'net-thermostat-temperature')
    .endpoints.find((item) => item.component === 'board-1').pin = 'A0';
  assert.equal(isThermostatExperimentProject(rewired), false);
  const changedResistance = session.project;
  changedResistance.circuit.components.find((item) => item.id === 'heater-resistor-1').properties.ohms = 330;
  assert.equal(isThermostatExperimentProject(changedResistance), false);
});
