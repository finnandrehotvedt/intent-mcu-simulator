// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('final UX native adapter preserves browser capability and same-origin mutation context', async () => {
  const source = await readFile(new URL('./final-ux-runtime-acceptance-browser.cjs', import.meta.url), 'utf8');
  assert.match(source, /const browserHeaders = request\.headers\(\)/u);
  assert.match(source, /headers = \{ \.\.\.browserHeaders, origin: compilerBase/u);
  assert.match(source, /referer: `\$\{compilerBase\.replace/u);
  assert.match(source, /delete headers\.host; delete headers\['content-length'\]/u);
  assert.match(source, /postBody = request\.method\(\) === 'POST' \? request\.postDataBuffer\(\) : undefined/u);
  assert.match(source, /body: postBody/u);
  assert.doesNotMatch(source, /headers: \{ 'content-type': 'application\/json' \}/u);
  assert.doesNotMatch(source, /const expectedCommit/u);
  assert.match(source, /verifyRuntimeCandidate/u);
  assert.match(source, /commit: candidate\.checkoutSha/u);
  assert.match(source, /FINAL_UX_RETAINED_HEX is required/u);
  assert.match(source, /assert\.match\(running\.serial, \/ON/u);
  assert.match(source, /running\.runtime\.runtimeIdentity\.artifactIdentity/u);
  assert.match(source, /routeFailure = failureLedgerRecord/u);
  assert.match(source, /status: 'failed', stage: 'compiler-route'/u);
  assert.match(source, /finally \{ await context\.close\(\); await browser\.close\(\)/u);
});
