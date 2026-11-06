// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BuildProtocolError,
  normalizeBuildRequestValue,
} from '../compiler/build-protocol.mjs';
import { dockerBuildRuntimeArguments } from '../compiler/docker-runtime-policy.mjs';
import { normalizeCompilerImageLock } from '../compiler/image-lock-contract.mjs';
import {
  VISUINO_PRIVATE_MOUNT_PATH,
  VISUINO_WATER_TANK_INTAKE_SOURCE_SHA256,
  VISUINO_WATER_TANK_MANIFEST_SHA256,
  VISUINO_WATER_TANK_POLICY_ID,
  VISUINO_WATER_TANK_SOURCE_CONTENT_SHA256,
} from '../compiler/visuino-private-policy.mjs';

const dependency = () => ({
  schema: 'intent-private-dependency-mount@1',
  policyId: VISUINO_WATER_TANK_POLICY_ID,
  sourcePath: '/srv/intent-mcu-progress-preview/private-dependencies/receipt-fixed/private-dependencies',
  mountPath: VISUINO_PRIVATE_MOUNT_PATH,
  manifestSha256: VISUINO_WATER_TANK_MANIFEST_SHA256,
  intakeSourceSha256: VISUINO_WATER_TANK_INTAKE_SOURCE_SHA256,
  sourceContentSha256: VISUINO_WATER_TANK_SOURCE_CONTENT_SHA256,
  readOnly: true,
});

const lock = () => ({
  schema: 'teach-lab-compiler-image-lock@1',
  image: 'local/compiler:private-candidate',
  imageId: `sha256:${'a'.repeat(64)}`,
  runtimeImageIds: [],
  toolchainManifestSha256: 'b'.repeat(64),
  privateDependency: dependency(),
});

const request = (content) => ({
  schema: 'teach-lab-build-request@1',
  board: 'board.atmega328p-16mhz-v1',
  files: [{ name: 'main.ino', content }],
});

test('private preview policy changes no ordinary AVR source behavior', () => {
  const value = request('#include <Arduino.h>\nvoid setup(){}\nvoid loop(){}\n');
  assert.deepEqual(
    normalizeBuildRequestValue(value, { privatePolicyId: VISUINO_WATER_TANK_POLICY_ID }),
    normalizeBuildRequestValue(value),
  );
});

test('private headers remain denied for every nonmatching source, including one-byte mutations', () => {
  for (const content of [
    '#include <Mitov.h>\nvoid setup(){}\nvoid loop(){}\n',
    '#include <OpenWire.h>\n#include <Arduino.h>\nvoid setup(){}\nvoid loop(){}\n',
  ]) {
    assert.throws(
      () => normalizeBuildRequestValue(request(content), { privatePolicyId: VISUINO_WATER_TANK_POLICY_ID }),
      (error) => error instanceof BuildProtocolError && error.code === 'UNSUPPORTED_INCLUDE',
    );
  }
});

test('private lock is exact, digest-bound, receipt-scoped and read-only', () => {
  const normalized = normalizeCompilerImageLock(lock());
  assert.equal(normalized.privateDependency.policyId, VISUINO_WATER_TANK_POLICY_ID);
  assert(Object.isFrozen(normalized.privateDependency));
  const vm103 = lock();
  vm103.privateDependency.sourcePath = '/srv/codex-workspaces/rust-station/handoffs/receipt-fixed/private-dependencies';
  assert.equal(
    normalizeCompilerImageLock(vm103).privateDependency.sourcePath,
    vm103.privateDependency.sourcePath,
  );
  const mutations = [
    (value) => { value.privateDependency.policyId += '-other'; },
    (value) => { value.privateDependency.sourcePath = '/tmp/private-dependencies'; },
    (value) => { value.privateDependency.mountPath = '/opt/other'; },
    (value) => { value.privateDependency.manifestSha256 = 'c'.repeat(64); },
    (value) => { value.privateDependency.intakeSourceSha256 = 'c'.repeat(64); },
    (value) => { value.privateDependency.sourceContentSha256 = 'c'.repeat(64); },
    (value) => { value.privateDependency.readOnly = false; },
    (value) => { value.privateDependency.extra = true; },
  ];
  for (const mutate of mutations) {
    const value = lock(); mutate(value);
    assert.throws(() => normalizeCompilerImageLock(value), { code: 'INVALID_IMAGE_LOCK' });
  }
  for (const sourcePath of [
    '/srv/codex-workspaces/other-station/handoffs/receipt-fixed/private-dependencies',
    '/srv/codex-workspaces/rust-station/handoffs/receipt-fixed/nested/private-dependencies',
    '/srv/codex-workspaces/rust-station/handoffs/../receipt-fixed/private-dependencies',
  ]) {
    const value = lock(); value.privateDependency.sourcePath = sourcePath;
    assert.throws(() => normalizeCompilerImageLock(value), { code: 'INVALID_IMAGE_LOCK' });
  }
});

test('private dependency runtime argument is one exact read-only bind with policy metadata only', () => {
  const args = dockerBuildRuntimeArguments('job-fixed', 'local/compiler:private-candidate', dependency());
  assert(args.includes(`type=bind,src=${dependency().sourcePath},dst=${VISUINO_PRIVATE_MOUNT_PATH},readonly`));
  assert(args.includes(`INTENT_PRIVATE_DEPENDENCY_POLICY_ID=${VISUINO_WATER_TANK_POLICY_ID}`));
  assert.equal(args.some((value) => value.includes('c62b54') || value.includes('02a844')), false);
  assert.equal(args.includes('--read-only'), true);
  assert.equal(args.includes('--network'), true);
  assert.equal(args[args.indexOf('--network') + 1], 'none');
});
