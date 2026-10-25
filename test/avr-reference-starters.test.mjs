// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { avrReferenceStarterCatalog, createAvrReferenceStarter } from '../src/avr-reference-starters.mjs';
import { componentReferenceInventory } from '../src/component-support-matrix.mjs';
import { openCandidateUiSession } from '../src/candidate-existing-ui-adapter.mjs';

const expected = Object.freeze({
  'avr-ground-reference-input': 'reference.ground-v1',
  'avr-toggle-input': 'switch.toggle-spst-v1',
  'avr-spdt-selector': 'switch.changeover-spdt-v1',
  'avr-light-analogue': 'sensor.light-analogue-v1',
  'avr-light-threshold': 'sensor.light-threshold-digital-v1',
  'avr-active-buzzer': 'output.active-buzzer-module-v1',
  'avr-seven-segment': 'output.seven-segment-common-cathode-v1',
  'avr-rotary-encoder': 'input.rotary-encoder-quadrature-v1',
});

test('L06 publishes exactly eight clear existing-capability AVR references', () => {
  const cards = avrReferenceStarterCatalog();
  assert.equal(cards.length, 8);
  assert.deepEqual(Object.fromEntries(cards.map((card) => [card.id, card.model])), expected);
  for (const card of cards) {
    for (const field of ['learn', 'try', 'observe', 'limits']) {
      assert(card[field].length >= 20, `${card.id}.${field}`);
    }
  }
});

test('all eight reference projects are canonical runnable candidate-v3 projects', () => {
  for (const card of avrReferenceStarterCatalog()) {
    const created = createAvrReferenceStarter(card.id);
    const opened = openCandidateUiSession(created.text);
    assert.equal(opened.ok, true, `${card.id}:${opened.code}`);
    assert.deepEqual(opened.session.runnable, { ok: true, code: 'OK', details: [] });
    assert.equal(opened.session.visualProject.circuit.components.some((item) => item.type === card.model), true, card.id);
    assert.equal(opened.session.saveText(), created.text, `${card.id}:canonical`);
    assert.match(created.project.project.source.files[0].content, /void setup\(\)/u, card.id);
    assert.match(created.project.project.source.files[0].content, /void loop\(\)/u, card.id);
  }
});

test('every available matrix cell now resolves to a real starter id', () => {
  const ids = new Set([
    'blink', 'button', 'adc', 'pwm', 'pwm-pulse', 'temperature-lcd-threshold',
    'avr-thermostat-boundary-v1', 'pico-led-on', 'pico-led-off', 'c3-led-on',
    'c3-led-off', 'stm32-led-on', 'stm32-led-off', 'avr-pcf8574-lcd-hello', ...Object.keys(expected),
  ]);
  const inventory = componentReferenceInventory();
  assert.equal(inventory.length, 26);
  for (const item of inventory) {
    assert.equal(item.hasPositiveReference, true, `${item.profile}:${item.model}`);
    assert(item.starters.every((id) => ids.has(id)), `${item.model}:${item.starters.join(',')}`);
  }
});

test('Partial reference cards preserve exact public limitations', () => {
  const cards = Object.fromEntries(avrReferenceStarterCatalog().map((card) => [card.id, card]));
  assert.match(cards['avr-spdt-selector'].limits, /^Partial:/u);
  assert.match(cards['avr-spdt-selector'].limits, /direct GND\/5 V digital input only/u);
  assert.match(cards['avr-active-buzzer'].limits, /^Partial: silent logical indicator/u);
  assert.match(cards['avr-active-buzzer'].limits, /no sound, current or acoustic accuracy/u);
});
