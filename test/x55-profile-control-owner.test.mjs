// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('X55 AVR quick-control owner restores complete state and remains the dispatch target', async () => {
  const source = await readFile(new URL('../staging/main.mjs', import.meta.url), 'utf8');
  const owner = source.match(/function renderAvrQuickControls\(\) \{(?<body>[\s\S]*?)\n\}/u)?.groups?.body;
  assert.ok(owner, 'renderAvrQuickControls owner missing');
  for (const expected of [
    "elements.quickbuild.textContent = 'Build'",
    "elements.quickrun.textContent = 'Run'",
    "elements.quickpause.textContent = 'Pause'",
    "elements.quickreset.textContent = 'Reset'",
    'elements.quickrun.disabled = elements.run.disabled',
    'elements.quickpause.disabled = elements.pause.disabled',
    'elements.quickreset.disabled = elements.reset.disabled',
    "elements.quickpause.title = ''",
    "elements.quickreset.title = ''",
  ]) assert.match(owner, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.match(source, /if \(avr\) renderAvrQuickControls\(\);/u);
  assert.match(source, /else elements\.pause\.click\(\);/u);
  assert.match(source, /else elements\.reset\.click\(\);/u);
});

test('X92 Pico direct, quick and exported advancing controls share one boundary-guarded owner', async () => {
  const source = await readFile(new URL('../staging/main.mjs', import.meta.url), 'utf8');
  assert.match(source, /advanceGuard: \(\) => x92AdvancingBoundary\(\)/u);
  assert.match(source, /else if \(selectedCompilerProfile === RP2040_PROFILE\) void picoPublicWorkbench\.run\(\);/u);
  assert.match(source, /if \(selectedCompilerProfile === RP2040_PROFILE\) picoPublicWorkbench\.reset\(\);/u);
  assert.match(source, /build: \(\) => picoPublicWorkbench\.build\(\),[\s\S]*run: \(\) => picoPublicWorkbench\.run\(\),[\s\S]*reset: \(\) => picoPublicWorkbench\.reset\(\),/u);
});
