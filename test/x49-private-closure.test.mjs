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

test('later approved increments preserve X49 runtime bytes and never import its private owners', async () => {
  const immutableRuntime = {
    'src/atmega328p-adapter.mjs': '65136d0b607336db992ba7dab81447813331b103136ec7c5348e6fc1ca9300de',
    'src/runtime-kernel.mjs': 'cf2d19836d808f5187642f9788d8c84b29a265e8ee70ad88cb03131d934385b3',
    'src/simulator.worker.mjs': 'c7a1f5d3923e4a8ab8fe5d68bc2193d0b08c82a6489ffa7f382ddf2df8b57af5',
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
