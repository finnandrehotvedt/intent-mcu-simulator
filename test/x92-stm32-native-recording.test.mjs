// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'; import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { createRequire } from 'node:module'; import test from 'node:test';
const { createRecorder } = createRequire(import.meta.url)('./x92-stm32-native-recording.cjs');
test('target drift, raw failures and hard producer caps are durable before continuation', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'x92-stm32-recorder-')); context.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'raw.json'); const recorder = createRecorder(file); let continued = false;
  assert.equal(recorder.attest({ gitCommit: 'wrong' }, { gitCommit: 'right', distMainSha256: 'd' }), false);
  assert.deepEqual(recorder.counts, { build: 0, run: 0, quiescence: 0 });
  assert.equal(recorder.admit('build'), true); assert.equal(recorder.admit('build'), false);
  await recorder.checkpoint({ kind: 'http', name: 'build', status: 500, body: 'failed' }, async () => {
    const saved = JSON.parse(await readFile(file, 'utf8')); assert.equal(saved.at(-1).status, 500); continued = true;
  }); assert.equal(continued, true);
  await recorder.checkpoint({ kind: 'transport-error', name: 'run', message: 'closed' }, async () => {});
  const saved = JSON.parse(await readFile(file, 'utf8')); assert.equal(saved.at(-1).kind, 'transport-error');
});
