// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createExampleProject, exampleCatalog,
} from '../src/example-projects.mjs';
import {
  TEMPERATURE_LCD_THRESHOLD_CARD, createTemperatureLcdThresholdExample,
} from '../expansion-drafts/temperature-lcd-threshold-example-v1.mjs';
import {
  THERMOSTAT_EXPERIMENT_CARD, createThermostatExperiment,
} from '../src/thermostat-experiment.mjs';
import {
  avrReferenceStarterCatalog, createAvrReferenceStarter,
} from '../src/avr-reference-starters.mjs';
import {
  createSupportedProfileExample, supportedProfileExamples,
} from '../src/supported-example-pack.mjs';
import {
  ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE,
} from '../src/compile-targets.mjs';

const PROFILE_ORDER = [RP2040_PROFILE, ESP32C3_PROFILE, STM32F429ZI_PROFILE];
const cards = () => [
  ...exampleCatalog(), TEMPERATURE_LCD_THRESHOLD_CARD, THERMOSTAT_EXPERIMENT_CARD,
  ...avrReferenceStarterCatalog(), ...PROFILE_ORDER.flatMap(supportedProfileExamples),
];
const expectedNext = Object.freeze({
  blink: 'Load Button input to add a user-controlled digital input.',
  button: 'Load ADC dial to compare a digital input with a measured analogue value.',
  adc: 'Load PWM fade to turn a measured range into a variable output.',
  pwm: 'Load PWM pulse to compare exact duty-cycle boundaries.',
  'pwm-pulse': 'Load Temperature display to combine analogue input with several outputs.',
  'temperature-lcd-threshold': 'Load Thermostat boundary test to turn the threshold into saved scenarios and requirements.',
  'avr-thermostat-boundary-v1': 'Open Scenario timeline to change one timed input and rerun its requirement after a fresh Build.',
  'avr-ground-reference-input': 'Load SPST toggle input to keep an input state without holding a button.',
  'avr-toggle-input': 'Load SPDT input selector to choose between two explicit sources.',
  'avr-spdt-selector': 'Load Quadrature encoder to observe ordered changes across two inputs.',
  'avr-light-analogue': 'Load Digital light threshold to compare continuous and thresholded sensing.',
  'avr-light-threshold': 'Load Thermostat boundary test to express a threshold as an executable requirement.',
  'avr-active-buzzer': 'Load Seven-segment digits to coordinate several digital outputs.',
  'avr-seven-segment': 'Load PWM pulse to compare switched outputs with duty-cycle output.',
  'avr-rotary-encoder': 'Load Thermostat boundary test, then open Scenario timeline to author inputs within the supported thermostat subset.',
  'pico-led-on': 'Load GPIO0 off + UART to test the opposite output boundary.',
  'pico-led-off': 'Use Download copy and Open local project to verify data-only recovery before changing source.',
  'c3-led-on': 'Load GPIO2 off + Serial to test the opposite model-output boundary.',
  'c3-led-off': 'Use Download copy and Open local project to verify data-only recovery before changing source.',
  'stm32-led-on': 'Load PB0 off + USART3 to test the opposite observed-output boundary.',
  'stm32-led-off': 'Use Download copy and Open local project to verify data-only recovery before changing source.',
});
const baselineProjectHashes = Object.freeze({
  blink: '2b94712762974e149bb3f29fea48f46025ac09105c903218fc64ce3546b48fd8',
  button: '2a77a2a367e0810e67c040eb02a17bc0d819c0cb250d9681175012c8adfa0d20',
  adc: '816740837eb3b463d718dd3d6ba2a992ecc93374c8c711cbfb349fa00da0685a',
  pwm: 'aa1ab663a65b804adf1e471b5c15e20e61c7bbaf1c09c9d528ec8b5cb9a28a42',
  'pwm-pulse': '6c046293b5e08ddf505b0775d73ef3d6984e02f33c4958825855b8548e8982db',
  'temperature-lcd-threshold': 'de518c3c0754502f8c3d499249e329339214862578284e0a4ef3fbe585eaffd1',
  'avr-thermostat-boundary-v1': '1b7bcd61cb63bc7c9ae0e6166ef924b1b97ecb299ea93b5fabda1caf26783b89',
  'avr-ground-reference-input': '668eb900d712781b7b3c26cd7da619a6d743f654f3a40ef926139bf453ae15c6',
  'avr-toggle-input': '06e0ceb7dcacc2ba9fa59a5cd3a39cdd455a7b17e4e79caa0e6a6611e4835ae8',
  'avr-spdt-selector': 'cb16776f2abc4f4533e022333582cbee1fffcdc38d35de636847771e0b1efad9',
  'avr-light-analogue': 'd4b20faf2c75fc16fe902010cc11b231c649e50d8c8e3b7272fac148a7263f64',
  'avr-light-threshold': 'e087aabdf60ed40497635c1f069eb9f88dfb948f01d270a43a557ceea303aeb1',
  'avr-active-buzzer': '999a45c11f65edf45e02d29815ab9df38d29534cb41c9609482cd1b3f9ae03d6',
  'avr-seven-segment': 'b8bbdca870e92d26026eef5ceb1219a1771f62422eb789fb8652180360b88733',
  'avr-rotary-encoder': 'b86effd37b2593b7740c903cb0916a821f826f32ce5e0723d7539f382478a817',
  'pico-led-on': '264c514565c6106264ec1f1d25e21ba8278827b4541b31464588490726e4d44d',
  'pico-led-off': 'd8369e2d6b162c56b347256d11aec5d9b2c6c1d68884c24822fe2a2881e7a183',
  'c3-led-on': 'b1057cef5aa1834a80cef10f218ed386d59b3d946974d67d0d125ea6fc03177f',
  'c3-led-off': '258dfd6212b9fa05cd44cf2f475c44b2cc1594806851aa1e1fadedcb64c9a4d2',
  'stm32-led-on': 'be7b7508d22cfe5ece9477899d201d5b63ee464308e8bca91de401f4c5c8ca91',
  'stm32-led-off': '583cc4927d716a9ce7808654d4422c1bbf7b786f4f5d0b2450cd41183d47bcb3',
});
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('X72 exposes one concise five-part learning progression for all 21 examples', () => {
  const catalog = cards();
  assert.equal(catalog.length, 21);
  assert.equal(new Set(catalog.map(({ id }) => id)).size, 21);
  assert.deepEqual(Object.fromEntries(catalog.map(({ id, next }) => [id, next])), expectedNext);
  for (const card of catalog) {
    for (const field of ['learn', 'try', 'limits', 'next']) assert.match(card[field], /\S/u, `${card.id}.${field}`);
    assert.match(card.observe ?? card.outcome, /\S/u, `${card.id}.observe`);
  }
});

test('X72 metadata leaves every baseline project byte-identical', () => {
  const projects = new Map();
  for (const card of exampleCatalog()) projects.set(card.id, createExampleProject(card.id).project);
  projects.set(TEMPERATURE_LCD_THRESHOLD_CARD.id, createTemperatureLcdThresholdExample().project);
  projects.set(THERMOSTAT_EXPERIMENT_CARD.id, createThermostatExperiment().project);
  for (const card of avrReferenceStarterCatalog()) projects.set(card.id, createAvrReferenceStarter(card.id).project);
  for (const profile of PROFILE_ORDER) {
    for (const card of supportedProfileExamples(profile)) {
      projects.set(card.id, createSupportedProfileExample(profile, card.id));
    }
  }
  assert.deepEqual(Object.fromEntries([...projects].map(([id, project]) => [id, hash(project)])), baselineProjectHashes);
});

test('X72 documentation mirrors each canonical Next sentence', async () => {
  const html = await readFile(new URL('../staging/examples.html', import.meta.url), 'utf8');
  assert.match(html, /<details class="progression-map panel">/u);
  for (const next of Object.values(expectedNext)) assert(html.includes(`Next: ${next}`), next);
});
