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

test('every target attestation field is mandatory before producer contact', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'x92-stm32-attestation-')); context.after(() => rm(directory, { recursive: true, force: true }));
  const recorder = createRecorder(join(directory, 'raw.json'));
  const expected = { gitCommit: 'a'.repeat(40), distMainSha256: 'b'.repeat(64), modelIdentity: `sha256:${'c'.repeat(64)}`,
    serviceSourceSha256: 'd'.repeat(64), runnerSourceSha256: 'e'.repeat(64), harnessSha256: 'f'.repeat(64),
    browserSha256: '1'.repeat(64), compilerImageIdentity: `sha256:${'2'.repeat(64)}`,
    compilerToolchainIdentity: `sha256:${'3'.repeat(64)}`, runtimeImageIdentity: `sha256:${'4'.repeat(64)}`,
    runtimeBinaryIdentity: `sha256:${'5'.repeat(64)}` };
  const target = { schema: 'intent-mcu-x92-stm32-private-target@1', serviceSchema: 'intent-mcu-stm32-service-attestation@1',
    ...expected, gitClean: true,
    stm32Service: true, defaultProviders: true, imagesVerified: true, readiness: true };
  assert.equal(recorder.attest(target, expected), true);
  for (const field of Object.keys(target)) {
    const drifted = { ...target }; delete drifted[field];
    assert.equal(recorder.attest(drifted, expected), false, field);
    assert.deepEqual(recorder.counts, { build: 0, run: 0, quiescence: 0 });
  }
});

test('non-2xx, malformed, transport, fake failure and second claim checkpoints survive continuation', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'x92-stm32-failures-')); context.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'raw.json'); const recorder = createRecorder(file);
  assert.equal(recorder.admit('build'), true);
  await assert.rejects(recorder.checkpoint({ kind: 'http', name: 'build', status: 503, body: '{broken' }, async () => {
    throw new Error('FAKE_CONTINUATION_FAILURE');
  }), /FAKE_CONTINUATION_FAILURE/u);
  assert.equal(recorder.admit('build'), false);
  await recorder.checkpoint({ kind: 'transport-error', name: 'run', message: 'socket closed' }, async () => {});
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved[0].status, 503); assert.equal(saved[0].body, '{broken');
  assert.equal(saved[1].kind, 'blocked-extra-producer'); assert.equal(saved[2].kind, 'transport-error');
});
