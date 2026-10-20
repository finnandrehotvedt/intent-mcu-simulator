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
  const manifest = JSON.parse(await readFile(new URL('../src/x49-private-runtime-manifest.json', import.meta.url)));
  assert.deepEqual(manifest.runtimeMembers.map((item) => item.path), [...X49_PRIVATE_RUNTIME_MEMBERS]);
  assert.deepEqual(manifest.evidenceToolMembers.map((item) => item.path), [...X49_PRIVATE_TOOL_MEMBERS]);
  assert.deepEqual(manifest.externalContracts, ['avr8js@0.21.1']);
});

test('approved private work leaves adapter, public runtime/model and save schemas byte-identical', async () => {
  const expected = {
    'src/atmega328p-adapter.mjs': '65136d0b607336db992ba7dab81447813331b103136ec7c5348e6fc1ca9300de',
    'src/runtime-kernel.mjs': 'bebaeddfd8aa26564b6caf6972e4371aabb9b64f24f484c76b78c957e27c29dd',
    'src/simulator.worker.mjs': '6ea2c7328fce143f192c3a27d1dfac66502075e3f7924d53fd0318c57dbbcdaa',
    'staging/main.mjs': 'efa2a74b992bfdf56fcfacca34392ab2d267e8172135c1a6f34a84c7c16e2365',
    'scripts/generate-model-library-snapshots.mjs': 'd817ba0cbf3c2a22d1e733636ab287abf455d07c337ce917703cddbf7bc324d8',
    'src/model-library.mjs': 'b0f38db2ece5d7a3ff7bdbb4d6dc9463e89bcff2a771b72d84ea1f1173389d1d',
    'src/model-library-snapshots.mjs': '88dbd7af2268172b155c4d0b7fb1253461daa959a5c41dc185dce34f95fe58c5',
    'src/project-v2.mjs': '7d4004e1c34ba58978593eb3577d2f7e49152ee5c652ef5c578871d84f982339',
    'src/project-envelope.mjs': 'ff4ab3f6680d2b5f0c6aabc16537062465fc85381d4b6d1fc642a39a14094adf',
  };
  for (const [path, hash] of Object.entries(expected)) {
    const bytes = await readFile(new URL(`../${path}`, import.meta.url));
    assert.equal(sha256(bytes), hash, path);
    assert.doesNotMatch(bytes.toString(), /x49-private\.worker|x49-private-instrumented-runtime/u, path);
  }
});

test('saved projects reject private runtime fields instead of migrating them', () => {
  const project = createEmptyProject(); project.privateRuntime = { implementationId: 'forbidden' };
  assert.deepEqual(validateProjectV2(project), { ok: false, code: 'PROJECT_SHAPE', details: [] });
});
