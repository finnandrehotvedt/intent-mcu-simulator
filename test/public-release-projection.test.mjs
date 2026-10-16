// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AVR_PROFILE,
  ESP32C3_PROFILE,
  RP2040_PROFILE,
  STM32F429ZI_PROFILE,
  candidateCompilerTarget,
} from '../src/compile-targets.mjs';
import {
  PUBLIC_CONTROLLER_VIEW_SCHEMA,
  publicControllerView,
  publicControllerViews,
} from '../src/public-controller-workbench-view.mjs';

test('public projection exposes AVR and bounded Pico execution plus two preview-only profiles', () => {
  const expected = [AVR_PROFILE, ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE];
  const views = publicControllerViews();
  assert.deepEqual(views.map((view) => view.profile), expected);
  assert.ok(views.every((view) => view.schema === PUBLIC_CONTROLLER_VIEW_SCHEMA));
  assert.deepEqual(views.filter((view) => view.publicExecution).map((view) => view.profile), [AVR_PROFILE, RP2040_PROFILE]);
  for (const profile of [ESP32C3_PROFILE, STM32F429ZI_PROFILE]) {
    const view = publicControllerView(profile);
    const target = candidateCompilerTarget(profile);
    assert.equal(view.status, 'preview-only');
    assert.equal(view.publicSupport, false);
    assert.equal(target.compileAvailable, false);
    assert.equal(target.compileOnly, false);
    assert.match(view.action, /not enabled/i);
  }
});

test('preview evidence remains exact and does not imply wired or public runtime support', () => {
  const c3 = publicControllerView(ESP32C3_PROFILE);
  assert.match(c3.summary, /actual QEMU UART/);
  assert.match(c3.circuit, /No validated GPIO pin-level or wired-circuit support/);
  assert.match(c3.limitation, /fair multi-user admission/);
  const rp2040 = publicControllerView(RP2040_PROFILE);
  assert.equal(rp2040.publicSupport, true);
  assert.equal(rp2040.publicExecution, true);
  assert.match(rp2040.runtime, /browser worker/i);
  assert.match(rp2040.circuit, /physical pin 1.*physical pin 3/i);
  assert.match(rp2040.limitation, /not a complete Pico/i);
  const stm32 = publicControllerView(STM32F429ZI_PROFILE);
  assert.match(stm32.runtime, /private Renode source \+ fixture evidence/i);
  assert.match(stm32.limitation, /not a general STM32/i);
});

test('public browser and server entry points contain no private runtime route or C3 broker mount', async () => {
  const [browserSource, serverSource] = await Promise.all([
    readFile(new URL('../staging/main.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../staging/server.mjs', import.meta.url), 'utf8'),
  ]);
  assert.equal(browserSource.includes('/private-c3'), false);
  assert.equal(browserSource.includes('Esp32C3CandidateBroker'), false);
  assert.equal(serverSource.includes('CandidateBuildRouter'), false);
  assert.equal(serverSource.includes('Esp32C3CandidateBroker'), false);
  assert.match(serverSource, /PUBLIC_PROJECTION_PRIVATE_TARGET_FORBIDDEN/);
});
