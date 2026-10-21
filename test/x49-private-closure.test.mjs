// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';
import { createEmptyProject } from '../src/project-editor.mjs';
import { validateProjectV2 } from '../src/project-v2.mjs';
import {
  X49_PRIVATE_RUNTIME_MEMBERS, X49_PRIVATE_TOOL_MEMBERS,
} from '../src/x49-private-runtime-contract.mjs';

const execute = promisify(execFile);
const repository = new URL('..', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('generated private runtime and evidence-tool closures are exact and fresh', async () => {
  const { stdout } = await execute(process.execPath,
    ['scripts/generate-x49-private-runtime-manifest.mjs'], { cwd: repository });
  const result = JSON.parse(stdout); assert.equal(result.runtimeMembers, 15);
  assert.equal(result.evidenceToolMembers, 2);
  assert.equal(result.trustAnchors, 1);
  const manifest = JSON.parse(await readFile(new URL('../src/x49-private-runtime-manifest.json', import.meta.url)));
  assert.deepEqual(manifest.runtimeMembers.map((item) => item.path), [...X49_PRIVATE_RUNTIME_MEMBERS]);
  assert.deepEqual(manifest.evidenceToolMembers.map((item) => item.path), [...X49_PRIVATE_TOOL_MEMBERS]);
  assert.deepEqual(manifest.externalContracts, ['avr8js@0.21.1']);
});

test('approved X48 worker increment preserves X49 runtime dependencies and private-owner isolation', async () => {
  const immutableRuntime = {
    'src/atmega328p-adapter.mjs': '65136d0b607336db992ba7dab81447813331b103136ec7c5348e6fc1ca9300de',
    'src/runtime-kernel.mjs': 'bebaeddfd8aa26564b6caf6972e4371aabb9b64f24f484c76b78c957e27c29dd',
    'src/simulator.worker.mjs': '270a95f7b9058a185f368375e93d519611d7be4f1d305dc9fac0e351f4139405',
  };
  for (const [path, hash] of Object.entries(immutableRuntime)) {
    const bytes = await readFile(new URL(`../${path}`, import.meta.url));
    assert.equal(sha256(bytes), hash, path);
  }
  for (const path of [
    ...Object.keys(immutableRuntime), 'staging/main.mjs',
    'scripts/generate-model-library-snapshots.mjs', 'src/model-library.mjs',
    'src/model-library-snapshots.mjs', 'src/project-v2.mjs', 'src/project-envelope.mjs',
  ]) {
    const bytes = await readFile(new URL(`../${path}`, import.meta.url));
    assert.doesNotMatch(bytes.toString(), /x49-private\.worker|x49-private-instrumented-runtime/u, path);
  }
});

test('saved projects reject private runtime fields instead of migrating them', () => {
  const project = createEmptyProject(); project.privateRuntime = { implementationId: 'forbidden' };
  assert.deepEqual(validateProjectV2(project), { ok: false, code: 'PROJECT_SHAPE', details: [] });
});
