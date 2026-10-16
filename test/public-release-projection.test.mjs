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

test('public projection exposes four bounded public execution profiles', () => {
  const expected = [AVR_PROFILE, ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE];
  const views = publicControllerViews();
  assert.deepEqual(views.map((view) => view.profile), expected);
  assert.ok(views.every((view) => view.schema === PUBLIC_CONTROLLER_VIEW_SCHEMA));
  assert.deepEqual(views.filter((view) => view.publicExecution).map((view) => view.profile),
    [AVR_PROFILE, ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE]);
  const c3 = publicControllerView(ESP32C3_PROFILE);
  assert.equal(c3.status, 'supported-bounded');
  assert.equal(c3.publicSupport, true);
  assert.equal(candidateCompilerTarget(ESP32C3_PROFILE).compileAvailable, true);
  assert.match(c3.action, /Build ESP32-C3/i);
  const stm32 = publicControllerView(STM32F429ZI_PROFILE);
  assert.equal(stm32.status, 'supported-bounded');
  assert.equal(stm32.publicSupport, true);
  assert.equal(candidateCompilerTarget(STM32F429ZI_PROFILE).compileAvailable, true);
  assert.match(stm32.action, /Build STM32F429ZI/i);
});

test('bounded C3 evidence separates actual QEMU from the project-owned GPIO model', () => {
  const c3 = publicControllerView(ESP32C3_PROFILE);
  assert.match(c3.summary, /actual Espressif QEMU CPU\/UART/);
  assert.match(c3.circuit, /Project-owned GPIO2 register model/);
  assert.match(c3.limitation, /QEMU pin state is not observed/);
  const rp2040 = publicControllerView(RP2040_PROFILE);
  assert.equal(rp2040.publicSupport, true);
  assert.equal(rp2040.publicExecution, true);
  assert.match(rp2040.runtime, /browser worker/i);
  assert.match(rp2040.circuit, /physical pin 1.*physical pin 3/i);
  assert.match(rp2040.limitation, /not a complete Pico/i);
  const stm32 = publicControllerView(STM32F429ZI_PROFILE);
  assert.match(stm32.runtime, /Actual Renode 1\.17\.0/i);
  assert.match(stm32.circuit, /Renode-observed PB0/i);
  assert.match(stm32.limitation, /not arbitrary C or ELF/i);
});

test('public browser and server entry points contain no private runtime route or C3 broker mount', async () => {
  const [browserSource, serverSource, indexSource, gatewaySource] = await Promise.all([
    readFile(new URL('../staging/main.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../staging/server.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../staging/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../compiler/http-gateway.mjs', import.meta.url), 'utf8'),
  ]);
  assert.equal(browserSource.includes('/private-c3'), false);
  assert.equal(browserSource.includes('Esp32C3CandidateBroker'), false);
  assert.equal(serverSource.includes('CandidateBuildRouter'), false);
  assert.equal(serverSource.includes('Esp32C3CandidateBroker'), false);
  assert.match(serverSource, /PUBLIC_PROJECTION_PRIVATE_TARGET_FORBIDDEN/);
  assert.equal(/<script(?![^>]*\bsrc=)[^>]*>/u.test(indexSource), false);
  assert.equal(gatewaySource.includes("'sha256-"), false);
});
