// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('final UX native adapter preserves browser capability and same-origin mutation context', async () => {
  const source = await readFile(new URL('./final-ux-runtime-acceptance-browser.cjs', import.meta.url), 'utf8');
  assert.match(source, /headers = \{ \.\.\.request\.headers\(\), origin: compilerBase/u);
  assert.match(source, /referer: `\$\{compilerBase\.replace/u);
  assert.match(source, /delete headers\.host; delete headers\['content-length'\]/u);
  assert.match(source, /body: request\.method\(\) === 'POST' \? request\.postDataBuffer\(\) : undefined/u);
  assert.doesNotMatch(source, /headers: \{ 'content-type': 'application\/json' \}/u);
});
