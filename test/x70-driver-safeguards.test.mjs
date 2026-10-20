// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('native acceptance driver uses exact status, download observation and emergency Pause hold', async () => {
  const source = await readFile(new URL('./x70-driver-control-fixture.cjs', import.meta.url), 'utf8');
  assert.match(source, /function waitForExactStatus/u);
  assert.match(source, /textContent\?\.trim\(\) === text/u);
  assert.match(source, /function observeDownloads/u);
  assert.match(source, /page\.on\('download'/u);
  assert.match(source, /function emergencyPauseAndHold/u);
  assert.match(source, /\['running', 'starting', 'pausing'\]/u);
  assert.match(source, /waitForExactStatus\(page, '#pico-state', 'paused', 2_000\)/u);
  assert.match(source, /rejected-while-running-before-pause/u);
  assert.match(source, /await emergencyPauseAndHold\(page\)/u);
});

