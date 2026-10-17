// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';

import { CIRCUIT_LIMITS } from '../src/component-catalog.mjs';
import { exampleCatalog } from '../src/example-projects.mjs';
import {
  candidateContactControl,
  openCandidateUiSession,
} from '../src/candidate-existing-ui-adapter.mjs';
import {
  TEMPERATURE_LCD_PIN_MAP,
  TEMPERATURE_LCD_QUANTIZATION_C,
  TEMPERATURE_LCD_THRESHOLD_CARD,
  TEMPERATURE_LCD_THRESHOLD_C,
  TEMPERATURE_LCD_THRESHOLD_EXAMPLE_ID,
  TEMPERATURE_LCD_THRESHOLD_SOURCE,
  createTemperatureLcdThresholdExample,
  openTemperatureLcdThresholdExample,
} from '../expansion-drafts/temperature-lcd-threshold-example-v1.mjs';

function openExample() {
  const example = createTemperatureLcdThresholdExample();
  const opened = openCandidateUiSession(example.text);
  assert.equal(opened.ok, true, `${opened.code} ${JSON.stringify(opened.details ?? [])}`);
  return { example, session: opened.session };
}

test('starter example uses one explicit conflict-free pin map inside project limits', () => {
  const { example } = openExample();
  const digitalPins = [...Object.values(TEMPERATURE_LCD_PIN_MAP.lcd), ...Object.values(TEMPERATURE_LCD_PIN_MAP.rgb)];
  assert.equal(TEMPERATURE_LCD_THRESHOLD_EXAMPLE_ID, 'temperature-lcd-threshold');
  assert.equal(TEMPERATURE_LCD_THRESHOLD_C, 30);
  assert.equal(TEMPERATURE_LCD_QUANTIZATION_C, 0.1953125);
  assert.equal(new Set(digitalPins).size, digitalPins.length);
  assert.deepEqual(Object.values(TEMPERATURE_LCD_PIN_MAP.rgb), ['D5', 'D6', 'D9']);
  assert.deepEqual(example.limits, { components: 7, nets: 15, endpoints: 34 });
  assert(example.limits.components <= CIRCUIT_LIMITS.components);
  assert(example.limits.nets <= CIRCUIT_LIMITS.nets);
  assert(example.limits.endpoints <= CIRCUIT_LIMITS.endpoints);
  assert.match(TEMPERATURE_LCD_THRESHOLD_CARD.description, /idealized/iu);
  assert.match(TEMPERATURE_LCD_THRESHOLD_SOURCE, /ADC quantization is 200\/1024 C per count/u);
  assert.match(TEMPERATURE_LCD_THRESHOLD_SOURCE, /\(raw \* 200L\) \/ 1024L/u);
  assert.doesNotMatch(TEMPERATURE_LCD_THRESHOLD_SOURCE, /LiquidCrystal|#include/u);
});

test('candidate opens runnable with sensor, LCD and independently resisted RGB projections', () => {
  const { session } = openExample();
  assert.deepEqual(session.runnable, { ok: true, code: 'OK', details: [] });
  const support = Object.fromEntries(session.runtimeSupport.map((item) => [item.componentId, item]));
  assert.equal(support['temperature-sensor-1'].runtimeAdapter, 'potentiometer.linear-v1');
  assert.equal(support['temperature-sensor-1'].runtimeProjection.boardPin, 'A1');
  assert.equal(support['character-lcd-1'].runtimeAdapter, 'avr-gpio-hd44780-write-only-decoder-v1');
  assert.deepEqual(Object.fromEntries(Object.entries(support['character-lcd-1'].runtimeProjection.signals)
    .map(([signal, item]) => [signal, item.sourcePin])), TEMPERATURE_LCD_PIN_MAP.lcd);
  assert.equal(support['rgb-led-1'].runtimeAdapter, 'three-independent-led.basic-v1');
  const channels = support['rgb-led-1'].runtimeProjection.channels;
  assert.deepEqual(Object.fromEntries(Object.entries(channels).map(([channel, item]) => [channel, item.sourcePin])), TEMPERATURE_LCD_PIN_MAP.rgb);
  assert.deepEqual(Object.values(channels).map((item) => item.resistorOhms), [220, 220, 220]);
  assert.equal(new Set(Object.values(channels).map((item) => item.resistorId)).size, 3);
});

test('temperature control projects 25 and 100 C while canonical save and reopen stay exact', () => {
  const { session } = openExample();
  const prepared = candidateContactControl(session, 'temperature-sensor-1', 'temperatureC', 100);
  assert.deepEqual(prepared.worker, {
    command: 'control', componentId: 'temperature-sensor-1', key: 'position', value: 0.75,
  });
  const changed = session.apply({ ...prepared.command, revision: session.revision });
  assert.equal(changed.ok, true);
  assert.equal(session.project.circuit.components.find((item) => item.id === 'temperature-sensor-1').controls.temperatureC, 100);
  assert.equal(session.runtimeProject.circuit.components.find((item) => item.id === 'temperature-sensor-1').controls.position, 0.75);
  const saved = session.saveText();
  const reopened = openCandidateUiSession(saved);
  assert.equal(reopened.ok, true);
  assert.equal(reopened.session.saveText(), saved);
});

test('an invalid starter derivative is rejected without changing an accepted session', () => {
  const { example, session } = openExample();
  const before = session.saveText();
  const invalid = structuredClone(example.project);
  invalid.candidateCircuit.nets = invalid.candidateCircuit.nets.filter((item) => item.id !== 'net-example-lcd-d7');
  const rejected = openTemperatureLcdThresholdExample(JSON.stringify(invalid));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'PROJECT_CONTACT_CHARACTER_LCD_D7_DISCONNECTED');
  assert.equal(session.saveText(), before);
});

test('the ordinary public example factories retain prior examples and add the reviewed PWM pair', () => {
  assert.deepEqual(exampleCatalog().map((item) => item.id), ['blink', 'button', 'adc', 'pwm', 'pwm-pulse']);
});
