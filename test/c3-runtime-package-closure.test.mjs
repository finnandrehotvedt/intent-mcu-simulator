// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveC3RuntimeClosure } from '../scripts/check-c3-runtime-closure.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('C3 runtime package contains the complete finite qemu-runner ESM closure', async () => {
  const closure = await resolveC3RuntimeClosure({ root });
  assert.deepEqual(closure.members, [
    'c3/artifact.mjs', 'c3/flash-loader.mjs', 'c3/gpio2-adapter.mjs', 'c3/protocol.mjs',
    'c3/qemu-gpio-observer.mjs', 'c3/qemu-runner.mjs', 'c3/rsp-observer.mjs',
    'src/component-catalog.mjs',
  ]);
  const dockerfile = await readFile(path.join(root, 'Dockerfile.esp32c3-runtime'), 'utf8');
  assert.match(dockerfile, /COPY src\/component-catalog\.mjs \/rootfs\/opt\/intent-mcu\/src\/component-catalog\.mjs/u);
  assert.match(dockerfile, /check-c3-runtime-closure\.mjs --root \/rootfs\/opt\/intent-mcu/u);
  assert.match(dockerfile, /INTENT_MCU_C3_IMPORT_CHECK=1 node/u);
});

test('C3 runtime closure gate rejects a known-bad missing transitive dependency', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'intent-mcu-c3-closure-'));
  await mkdir(path.join(fixture, 'c3'));
  await writeFile(path.join(fixture, 'c3/qemu-runner.mjs'), "import './missing.mjs';\n");
  await assert.rejects(resolveC3RuntimeClosure({ root: fixture }),
    /C3_RUNTIME_CLOSURE_MISSING:c3\/missing\.mjs/u);
});

test('qemu-runner import-check mode is explicitly non-executing', async () => {
  const source = await readFile(path.join(root, 'c3/qemu-runner.mjs'), 'utf8');
  assert.match(source, /if \(process\.env\.INTENT_MCU_C3_IMPORT_CHECK !== '1'\) await main\(\);/u);
});
