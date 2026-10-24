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
} from '../src/compile-targets.mjs';
import {
  SHARED_WORKBENCH_SCHEMA,
  SHARED_WORKBENCH_DIALOGS,
  SHARED_WORKBENCH_SURFACES,
  SHARED_WORKBENCH_VIEW_MODES,
  sharedWorkbenchAdapters,
} from '../src/shared-workbench-shell.mjs';

test('four real profiles declare the same shared workbench surfaces', () => {
  const adapters = sharedWorkbenchAdapters();
  assert.deepEqual(adapters.map(({ profile }) => profile), [
    AVR_PROFILE, RP2040_PROFILE, ESP32C3_PROFILE, STM32F429ZI_PROFILE,
  ]);
  for (const adapter of adapters) {
    assert.equal(adapter.schema, SHARED_WORKBENCH_SCHEMA);
    assert.deepEqual(adapter.surfaces, SHARED_WORKBENCH_SURFACES);
    for (const surface of SHARED_WORKBENCH_SURFACES) assert.equal(typeof adapter[surface], 'string');
    assert.match(adapter.groupId, /^architecture\.[a-z0-9-]+-v1$/u);
    assert.match(adapter.groupLabel, /^(?:AVR|RP2040|ESP32|STM32)$/u);
  }
  assert.equal(new Set(adapters.map(({ groupId }) => groupId)).size, 4);
});

test('top workbench exposes exactly seven accessible popup surfaces around one real active canvas', async () => {
  assert.deepEqual(SHARED_WORKBENCH_DIALOGS, [
    'project', 'parts', 'inspector', 'firmware', 'brief', 'instruments', 'help',
  ]);
  const [html, shell, css] = await Promise.all([
    readFile(new URL('../staging/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/shared-workbench-shell.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../staging/styles.css', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="top-workbench-shell"/);
  assert.match(html, /id="active-canvas-mount"/);
  for (const name of SHARED_WORKBENCH_DIALOGS) {
    assert.match(html, new RegExp(`id="workbench-${name}-dialog"`));
    assert.match(html, new RegExp(`aria-controls="workbench-${name}-dialog"`));
    assert.match(html, new RegExp(`data-workbench-popup-mount="${name}"`));
  }
  assert.match(shell, /showModal\(\)/);
  assert.match(shell, /event\.key !== 'Tab'/);
  assert.match(shell, /addEventListener\('cancel'/);
  assert.match(shell, /target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(shell, /resolvedProfileNodes/);
  assert.doesNotMatch(shell, /cloneNode/);
  assert.match(shell, /if \(serial\) serial\.hidden = false/);
  assert.match(shell, /if \(serial\) serial\.hidden = true/);
  assert.match(shell, /serialTab\.setAttribute\('aria-expanded', 'true'\)/);
  assert.match(shell, /serialTab\.setAttribute\('aria-expanded', 'false'\)/);
  assert.match(shell, /mount\.scrollTop = Math\.max\(0, serial\.offsetTop - 12\)/);
  assert.match(css, /height:\s*max\(560px,\s*calc\(100vh - 200px\)\)/);
  assert.match(css, /max-height:\s*88vh/);
  assert.match(css, /#quick-pause,[\s\S]+#quick-reset\s*\{\s*min-width:\s*64px;/u);
  assert.match(html, /<details id="regression-matrix"[^>]*>[\s\S]+<summary class="advanced-testing-summary"/u);
  assert.doesNotMatch(html, /<details id="regression-matrix"[^>]*\sopen(?:\s|>)/u);
  assert.match(html, /Nothing here starts automatically/u);
});

test('X59 keeps finite presentation-only view state inside the X48-owned shared UI module', async () => {
  assert.deepEqual(SHARED_WORKBENCH_VIEW_MODES, ['simple', 'advanced']);
  const [html, shell, css, modelGenerator] = await Promise.all([
    readFile(new URL('../staging/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/shared-workbench-shell.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../staging/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/generate-model-library-snapshots.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /body data-workbench-view="simple"/);
  assert.match(html, /id="workbench-view-simple"[^>]+aria-pressed="true"/);
  assert.match(html, /id="workbench-view-advanced"[^>]+aria-pressed="false"/);
  assert.match(shell, /let viewMode = 'simple'/);
  assert.match(shell, /setViewMode\('simple'\)/);
  assert.match(shell, /SHARED_WORKBENCH_VIEW_MODE_UNKNOWN/);
  assert.match(shell, /viewMode\(\) \{ return viewMode; \}/);
  assert.match(shell, /activePopup === 'brief'/);
  assert.doesNotMatch(shell, /localStorage|sessionStorage|indexedDB/u);
  assert.match(css, /body\[data-workbench-view="simple"\][^}]+#regression-matrix/s);
  assert.doesNotMatch(css, /data-workbench-view="simple"[^}]+#firmware-open/s);
  assert.match(modelGenerator, /shared-workbench-shell\.mjs/u);
});

test('unsupported common controls carry profile-specific truthful reasons', () => {
  const adapters = Object.fromEntries(sharedWorkbenchAdapters().map((adapter) => [adapter.profile, adapter]));
  assert.equal(adapters[AVR_PROFILE].pause.supported, true);
  assert.equal(adapters[RP2040_PROFILE].pause.supported, true);
  assert.match(adapters[ESP32C3_PROFILE].pause.reason, /QEMU/);
  assert.match(adapters[ESP32C3_PROFILE].reset.reason, /Reset replay/);
  assert.match(adapters[STM32F429ZI_PROFILE].pause.reason, /Renode/);
  assert.equal(adapters[STM32F429ZI_PROFILE].reset.supported, true);
});

test('browser entry point mounts the shared shell without replacing profile implementations', async () => {
  const [html, browser, shell, css] = await Promise.all([
    readFile(new URL('../staging/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../staging/main.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/shared-workbench-shell.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../staging/styles.css', import.meta.url), 'utf8'),
  ]);
  for (const id of ['workbench-workspace', 'pico-public-workbench', 'c3-public-workbench', 'stm32-public-workbench']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(browser, /mountSharedWorkbenchShell/);
  assert.match(browser, /sharedWorkbenchShell\.activate/);
  assert.match(shell, /openDialog\(name/);
  assert.match(shell, /openDialog\(name, opener = null, options = \{\}\)/);
  assert.match(shell, /\{ initialFocus = true \}/);
  assert.match(browser, /openDialog\('firmware',[^{]+\{ initialFocus: false \}\)/);
  assert.match(browser, /closeDialog\(\{ restoreFocus: false \}\)/);
  assert.match(browser, /elements\.serialtab\.addEventListener\('click',[\s\S]+sharedWorkbenchShell\.openSerial\(\)/u);
  assert.match(browser, /sharedWorkbenchShell\.activeDialog\(\) === 'instruments'/u);
  for (const prefix of ['pico', 'c3', 'stm32']) assert.match(html, new RegExp(`id="${prefix}-fullscreen"`));
  assert.match(shell, /requestFullscreen/);
  assert.match(shell, /FULLSCREEN_API_UNAVAILABLE/);
  assert.match(shell, /event\.key === 'Escape'/);
  assert.match(css, /shared-canvas-focus-open/);
  assert.match(css, /--canvas-workbench:\s*#08141f/);
  assert.match(css, /\.pico-editor-canvas[^}]+background-color:\s*var\(--canvas-workbench\)/s);
  assert.match(css, /\.circuit-canvas[^}]+background-color:\s*var\(--canvas-workbench\)/s);
  assert.match(shell, /instrumentCapability/);
  assert.match(shell, /RECORDED INSTRUMENT BOUNDARY/);
  assert.match(shell, /item\.status === 'unavailable'/);
  assert.match(css, /\.instrument-boundary-list/);
});

test('shared Serial export names its retained full-log scope accessibly', async () => {
  const [html, shell] = await Promise.all([
    readFile(new URL('../staging/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/shared-workbench-shell.mjs', import.meta.url), 'utf8'),
  ]);
  for (const source of [html, shell]) {
    assert.match(source, /Export full log \(\.txt\)/);
    assert.match(source, /Exports the current retained accepted log, including rows hidden by Clear view\./);
    assert.match(source, /data-shared-serial-export aria-describedby=/);
  }
});
