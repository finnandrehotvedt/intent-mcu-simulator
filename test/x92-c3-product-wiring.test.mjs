// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ESP32C3_EXECUTION_IDENTITIES } from '../src/esp32c3-execution-identities.mjs';

const readJson = async (name) => JSON.parse(await readFile(new URL(`../${name}`, import.meta.url), 'utf8'));

test('C3 browser identity projection is exact to the fixed compiler and runtime locks', async () => {
  const [compiler, runtime] = await Promise.all([
    readJson('compiler/esp32c3-image-lock.json'), readJson('c3/runtime-image-lock.json'),
  ]);
  assert.deepEqual(ESP32C3_EXECUTION_IDENTITIES, {
    compilerImageIdentity: compiler.imageId,
    compilerToolchainIdentity: `sha256:${compiler.toolchainManifestSha256}`,
    runtimeImageIdentity: runtime.imageId,
    runtimeBinaryIdentity: `sha256:${runtime.toolchainFilesSha256}`,
  });
});

test('rendered main owns C3 manual, Quick and API Build/Run through one product gate', async () => {
  const source = await readFile(new URL('../staging/main.mjs', import.meta.url), 'utf8');
  assert.match(source, /dispatchAction: \(action, task\) => executeC3ManualAction\(action, task\)/u);
  assert.match(source, /executeC3ManualAction\('firmware\.build'/u);
  assert.match(source, /executeC3ManualAction\('runtime\.run'/u);
  assert.match(source, /task\(permit, binding\)/u);
  assert.match(source, /x92Binding: binding/u);
  assert.match(source, /x92C3OwnedPrivateResult/u);
  assert.match(source, /const result = await x92C3Integration\.executeBudgeted\(source\)/u);
  assert.match(source, /return x92C3Integration\.executeManual\(\(\) => x92BudgetExecutor\.execute\(source\)/u);
  assert.doesNotMatch(source, /__X92_C3_REHEARSAL__|candidate-src/u);
});
