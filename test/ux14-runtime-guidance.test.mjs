// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('UX14 exposes a contextual Pause or Resume action without claiming AVR Stop', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../staging/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../staging/main.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="beginner-runtime-toggle"[^>]+hidden>Pause</u);
  assert.match(source, /\['running', 'paused'\]\.includes\(phase\)/u);
  assert.match(source, /source, wiring and current project are preserved/u);
  assert.match(source, /Stop is unavailable; use Pause or Reset/u);
  assert.match(source, /beginnerruntimetoggle\.dataset\.state === 'paused'\) elements\.quickrun\.click/u);
  assert.doesNotMatch(source, /beginnerruntimetoggle[^\n]+quickstop\.click/u);
});

test('UX07 and UX13 keep one primary Open action and move teaching tools under Details', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../staging/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../staging/main.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="project-open"[^>]*>Open file</u);
  assert.match(html, /id="project-open-input"[^>]+hidden/u);
  assert.match(html, /<summary>View<\/summary>/u);
  assert.match(html, /project-file-advanced-actions[^]*id="walkthrough-open"[^]*id="teaching-exercise-open"/u);
  assert.match(source, /profile === selectedCompilerProfile/u);
  assert.match(source, /structuredClone\(workbench\.circuitEditor\.snapshot\(\)\.draft\)/u);
  assert.equal(source.match(/queueMicrotask\(\(\) => persistControllerDraft\([^\n]+PublicWorkbench\)\)/gu)?.length, 3,
    'initial and authored profile persistence must wait until each workbench assignment is complete');
});
