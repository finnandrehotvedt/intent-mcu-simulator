// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBoundedSource } from '../c3/protocol.mjs';
import { validateStm32Source } from '../stm32/protocol.mjs';
import {
  AVR_PROFILE, ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE,
} from '../src/compile-targets.mjs';
import { exampleCatalog, createExampleProject } from '../src/example-projects.mjs';
import { validateEsp32C3Circuit } from '../src/esp32c3-public-circuit.mjs';
import { normalizeRp2040PublicProject } from '../src/rp2040-public-workbench.mjs';
import { validateRp2040PicoCircuit } from '../src/rp2040-pico-circuit.mjs';
import { validateStm32Circuit } from '../src/stm32-public-circuit.mjs';
import {
  SUPPORTED_EXAMPLE_COVERAGE, SUPPORTED_EXAMPLE_FUNCTIONS,
  createSupportedProfileExample, supportedProfileExamples,
} from '../src/supported-example-pack.mjs';

const profiles = [AVR_PROFILE, RP2040_PROFILE, ESP32C3_PROFILE, STM32F429ZI_PROFILE];

test('U03 coverage is explicit and every supported cell has multiple examples', () => {
  assert.deepEqual(SUPPORTED_EXAMPLE_FUNCTIONS, ['button', 'adc', 'pwm', 'serial']);
  for (const profile of profiles) {
    const coverage = SUPPORTED_EXAMPLE_COVERAGE.profiles[profile];
    assert.deepEqual(Object.keys(coverage), SUPPORTED_EXAMPLE_FUNCTIONS);
    for (const entry of Object.values(coverage)) {
      assert(['supported', 'unavailable'].includes(entry.status));
      assert.equal(entry.status === 'supported' ? entry.examples.length >= 2 : entry.examples.length === 0, true);
    }
  }
});

test('AVR adds a second strict PWM example without changing its tested circuit', () => {
  const entry = exampleCatalog().find((example) => example.id === 'pwm-pulse');
  assert(entry);
  const created = createExampleProject('pwm-pulse');
  assert.equal(created.project.circuit.components.length, 3);
  assert.deepEqual(created.project.instruments.logicChannels, ['D3']);
  assert.match(created.project.source.files[0].content, /analogWrite\(3, 64\)/u);
  assert.match(created.project.source.files[0].content, /analogWrite\(3, 191\)/u);
});

test('every narrow example uses its existing strict project, source and circuit validators', () => {
  for (const profile of [RP2040_PROFILE, ESP32C3_PROFILE, STM32F429ZI_PROFILE]) {
    const entries = supportedProfileExamples(profile);
    assert.equal(entries.length, 2);
    for (const entry of entries) {
      const project = createSupportedProfileExample(profile, entry.id);
      if (profile === RP2040_PROFILE) {
        assert.equal(normalizeRp2040PublicProject(project).profile, profile);
        assert.equal(validateRp2040PicoCircuit(project.circuit).ok, true);
      } else if (profile === ESP32C3_PROFILE) {
        assert.equal(validateBoundedSource(project.source).marker, entry.marker);
        assert.equal(validateEsp32C3Circuit(project.circuit).ok, true);
      } else {
        assert.equal(validateStm32Source(project.source).marker, entry.marker);
        assert.equal(validateStm32Circuit(project.circuit).ok, true);
      }
    }
  }
  assert.throws(() => createSupportedProfileExample(RP2040_PROFILE, 'not-an-example'), /SUPPORTED_EXAMPLE_UNKNOWN/u);
});
