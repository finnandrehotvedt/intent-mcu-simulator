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
  adc: 'Load Trimmer calibration to compare a set-and-retain adjustment with a rotary control.',
  trimmer: 'Load PWM fade to turn a measured range into a variable output.',
  pwm: 'Load PWM pulse to compare exact duty-cycle boundaries.',
  'pwm-pulse': 'Load Temperature display to combine analogue input with several outputs.',
  'temperature-lcd-threshold': 'Load Thermostat boundary test to turn the threshold into saved scenarios and requirements.',
  'avr-thermostat-boundary-v1': 'Open Scenario timeline to change one timed input and rerun its requirement after a fresh Build.',
  'avr-ground-reference-input': 'Load SPST toggle input to keep an input state without holding a button.',
  'avr-ground-power-references': 'Load SPST toggle input to replace a momentary ground path with a maintained contact.',
  'avr-toggle-input': 'Load SPDT input selector to choose between two explicit sources.',
  'avr-spdt-selector': 'Load Quadrature encoder to observe ordered changes across two inputs.',
  'avr-light-analogue': 'Load Digital light threshold to compare continuous and thresholded sensing.',
  'avr-light-threshold': 'Load Thermostat boundary test to express a threshold as an executable requirement.',
  'avr-active-buzzer': 'Load Traffic light sequence to coordinate three current-limited outputs.',
  'avr-traffic-light': 'Load Seven-segment digits to coordinate a larger group of outputs.',
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
  trimmer: 'dbde3666dc62c374c1978c5ef927853b4c5ccc67dc59df5e1d8ff884ff2bcc1b',
  pwm: 'aa1ab663a65b804adf1e471b5c15e20e61c7bbaf1c09c9d528ec8b5cb9a28a42',
  'pwm-pulse': '6c046293b5e08ddf505b0775d73ef3d6984e02f33c4958825855b8548e8982db',
  'temperature-lcd-threshold': 'de518c3c0754502f8c3d499249e329339214862578284e0a4ef3fbe585eaffd1',
  'avr-thermostat-boundary-v1': '1b7bcd61cb63bc7c9ae0e6166ef924b1b97ecb299ea93b5fabda1caf26783b89',
  'avr-ground-reference-input': '668eb900d712781b7b3c26cd7da619a6d743f654f3a40ef926139bf453ae15c6',
  'avr-ground-power-references': '0a152cce7144196e00d80c7e0dec3b1ad31c7eebf9e5359cd64f2160ad200a9d',
  'avr-toggle-input': '06e0ceb7dcacc2ba9fa59a5cd3a39cdd455a7b17e4e79caa0e6a6611e4835ae8',
  'avr-spdt-selector': 'cb16776f2abc4f4533e022333582cbee1fffcdc38d35de636847771e0b1efad9',
  'avr-light-analogue': 'd4b20faf2c75fc16fe902010cc11b231c649e50d8c8e3b7272fac148a7263f64',
  'avr-light-threshold': 'e087aabdf60ed40497635c1f069eb9f88dfb948f01d270a43a557ceea303aeb1',
  'avr-active-buzzer': '999a45c11f65edf45e02d29815ab9df38d29534cb41c9609482cd1b3f9ae03d6',
  'avr-traffic-light': 'b0bf4f28a757bf9e5ec89f8b4401638971add650761db1c9248fc28c67389e59',
  'avr-seven-segment': 'b8bbdca870e92d26026eef5ceb1219a1771f62422eb789fb8652180360b88733',
  'avr-rotary-encoder': 'b86effd37b2593b7740c903cb0916a821f826f32ce5e0723d7539f382478a817',
  'pico-led-on': 'e2e4f928148c45041ee6d2cba1deba6b60436425800add0cd8069607e9f47d3e',
  'pico-led-off': '5197b7127bb70e224f707da86bf6d55619ce309f79764733a782c58345da14de',
  'c3-led-on': '579a0a7c617498531b5b2338ae250911bfafbb491f28757fc6a026b926f77dbc',
  'c3-led-off': '85916840a1df532a1f5b7eaadcf101a953e3b8c9778ad57d6e48a3ec9fc17707',
  'stm32-led-on': '706ff978e55f583df148eb2553e74ce0628997dd3cb5bc95512591b485dd8b79',
  'stm32-led-off': 'b1ae7f4239f9059e6ae1272ffeb93906ae2572c9b2f1f522b825fd8ed39aec29',
});
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('X72 exposes one concise five-part learning progression for all 24 examples', () => {
  const catalog = cards();
  assert.equal(catalog.length, 24);
  assert.equal(new Set(catalog.map(({ id }) => id)).size, 24);
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
