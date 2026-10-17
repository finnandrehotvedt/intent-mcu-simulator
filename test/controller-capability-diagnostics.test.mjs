// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  CAPABILITY_STATUS, CONTROLLER_CAPABILITIES, CONTROLLER_CAPABILITY_SCHEMA, PERIPHERAL_KEYS,
} from '../src/controller-capabilities.mjs';
import {
  AVR_PROFILE, ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE,
} from '../src/compile-targets.mjs';
import {
  boundedPolicyDiagnostic, normalizeSourceDiagnostics, sourceSelection,
} from '../src/source-diagnostics.mjs';

const PROFILES = [AVR_PROFILE, RP2040_PROFILE, ESP32C3_PROFILE, STM32F429ZI_PROFILE];

test('C02/C03 catalogue covers every profile and exact peripheral/language boundary', () => {
  assert.equal(CONTROLLER_CAPABILITIES.schema, CONTROLLER_CAPABILITY_SCHEMA);
  assert.deepEqual(Object.keys(CONTROLLER_CAPABILITIES.profiles), PROFILES);
  for (const profileId of PROFILES) {
    const entry = CONTROLLER_CAPABILITIES.profiles[profileId];
    assert.deepEqual(Object.keys(entry.peripherals), PERIPHERAL_KEYS);
    for (const key of PERIPHERAL_KEYS) {
      assert(CAPABILITY_STATUS.includes(entry.peripherals[key].status));
      assert(entry.peripherals[key].boundary.length > 20);
    }
    assert(entry.sourceFile && entry.language.dialect && entry.language.grammar);
    assert(entry.language.files.length && entry.language.headers.length && entry.language.libraries.length);
  }
  assert.equal(CONTROLLER_CAPABILITIES.profiles[ESP32C3_PROFILE].peripherals.gpio.status, 'project-model');
  assert.equal(CONTROLLER_CAPABILITIES.profiles[RP2040_PROFILE].peripherals.adc.status, 'unavailable');
  assert.equal(CONTROLLER_CAPABILITIES.profiles[STM32F429ZI_PROFILE].peripherals.uart.status, 'tested');
});

test('C04 normalization admits only exact current project files and valid source locations', () => {
  const source = 'first\nsecond\nthird\n';
  const diagnostics = normalizeSourceDiagnostics([
    { file: '/workspace/private/main.c', line: 2, column: 3, severity: 'error', code: 'COMPILE_FAILED', message: '<bad>\u0000' },
    { file: '/etc/passwd', line: 1, severity: 'error', message: 'must not navigate' },
    { file: 'main.c', line: 99, severity: 'warning', message: 'outside source' },
  ], { profile: RP2040_PROFILE, revision: 8, source, files: [{ name: 'main.c', content: source }] });
  assert.deepEqual(diagnostics[0], {
    profile: RP2040_PROFILE, revision: 8, source, file: 'main.c', line: 2, column: 3,
    severity: 'error', code: 'COMPILE_FAILED', message: '<bad>', navigable: true,
  });
  assert.equal(diagnostics[1].file, null);
  assert.equal(diagnostics[1].navigable, false);
  assert.equal(diagnostics[2].line, null);
  assert.equal(diagnostics[2].navigable, false);
});

test('C04 bounded policy diagnostic identifies the first actual divergent line and fails closed for empty source', () => {
  const patterns = [/^A$/u, /^B$/u, /^C$/u];
  const located = boundedPolicyDiagnostic({
    profile: STM32F429ZI_PROFILE, revision: 3, source: 'A\nWRONG\nC', file: 'main.c', linePatterns: patterns,
  });
  assert.equal(located.line, 2);
  assert.equal(located.navigable, true);
  const empty = boundedPolicyDiagnostic({
    profile: STM32F429ZI_PROFILE, revision: 4, source: '', file: 'main.c', linePatterns: patterns,
  });
  assert.equal(empty.line, null);
  assert.equal(empty.navigable, false);
});

test('C04 source selection is strict and never clamps stale line or column data', () => {
  assert.deepEqual(sourceSelection('one\ntwo\nthree', 2), { start: 4, end: 7 });
  assert.deepEqual(sourceSelection('one\ntwo\nthree', 2, 2), { start: 5, end: 6 });
  assert.equal(sourceSelection('one', 2), null);
  assert.equal(sourceSelection('one', 1, 9), null);
});

test('public controller and support pages expose the bounded catalogue and diagnostic contract', async () => {
  const [controllers, support] = await Promise.all([
    readFile(new URL('../staging/controllers.html', import.meta.url), 'utf8'),
    readFile(new URL('../staging/support.html', import.meta.url), 'utf8'),
  ]);
  for (const value of ['peripheral-capability-matrix', 'language-api-matrix', 'GPIO', 'ADC', 'PWM', 'UART', 'Timers', 'Interrupts', 'Project model', 'Unavailable']) {
    assert(controllers.includes(value), `controllers page omitted ${value}`);
  }
  for (const entry of Object.values(CONTROLLER_CAPABILITIES.profiles)) {
    assert(controllers.includes(entry.label.split(' · ')[0]));
    assert(controllers.includes(`<code>${entry.sourceFile}</code>`));
  }
  assert(controllers.includes('Successful compilation does not prove every API, library or peripheral is simulated.'));
  assert(support.includes('id="compiler-diagnostics"') && support.includes('stale-source'));
});
