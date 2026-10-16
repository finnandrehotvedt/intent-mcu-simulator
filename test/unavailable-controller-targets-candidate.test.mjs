// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { BuildCoordinator } from '../compiler/build-coordinator.mjs';
import {
  BuildProtocolError,
  normalizeBuildRequestValue,
} from '../compiler/build-protocol.mjs';
import {
  CANDIDATE_BUILD_REQUEST_SCHEMA,
  ESP32C3_FQBN,
  ESP32C3_PROFILE,
  ESP32C3_TOOLCHAIN_IDENTITY,
  RP2040_PROFILE,
  STM32F429ZI_PROFILE,
  candidateCompilerTarget,
  targetAvailabilitySnapshot,
  validateCandidateCompileArtifact,
  validateTargetAvailabilitySnapshot,
} from '../compiler/candidate-target-contract.mjs';
import {
  CONTROLLER_ADAPTER_PROFILES,
  CONTROLLER_COMPILER_PROFILES,
} from '../expansion-drafts/controller-adapter-contract-v1.mjs';

const expectCode = (fn, code) => assert.throws(
  fn,
  (error) => error instanceof BuildProtocolError && error.code === code,
);
const source = 'void setup(){} void loop(){}';
const requestFor = (profile, overrides = {}) => {
  const target = candidateCompilerTarget(profile);
  return {
    schema: CANDIDATE_BUILD_REQUEST_SCHEMA,
    target: {
      profile,
      fqbn: target.fqbn,
      toolchainIdentitySha256: target.toolchainIdentitySha256,
      ...overrides,
    },
    files: [{ name: 'main.ino', content: source }],
  };
};
const c3Manifest = () => ({
  schema: 'intent-mcu-compile-artifact-manifest@1',
  profile: ESP32C3_PROFILE,
  fqbn: ESP32C3_FQBN,
  toolchainIdentitySha256: ESP32C3_TOOLCHAIN_IDENTITY,
  runtimeStatus: 'unsupported',
  runtimeRejectCode: 'ADAPTER_EXECUTION_BLOCKED',
  files: {
    firmware: { format: 'flash-image', sha256: '1'.repeat(64), bytes: 10 },
    debug: { format: 'elf', sha256: '2'.repeat(64), bytes: 20 },
    mergedFlash: { format: 'merged-flash-image', sha256: '3'.repeat(64), bytes: 30 },
  },
});

test('RP2040 and STM32 retain public-unavailable profiles while reporting newer private evidence', () => {
  for (const profileId of [RP2040_PROFILE, STM32F429ZI_PROFILE]) {
    const target = candidateCompilerTarget(profileId);
    const priorCompiler = CONTROLLER_COMPILER_PROFILES.find((item) => item.profile === profileId);
    const priorAdapter = CONTROLLER_ADAPTER_PROFILES.find((item) => item.profile === profileId);
    assert.ok(priorCompiler && priorAdapter, `${profileId} did not reuse a prior profile`);
    assert.equal(priorCompiler.status, 'unavailable');
    assert.equal(priorAdapter.status, 'unsupported');
    assert.equal(target.fqbn, priorCompiler.fqbn);
    assert.equal(target.compileAvailable, false);
    assert.equal(target.runtimeStatus, 'unavailable');
    assert.equal(target.requestSchema, null);
    assert.equal(target.toolchainIdentitySha256, null);
    assert.deepEqual(target.fixedBuildFlags, []);
    assert.deepEqual({
      installedCompiler: target.availability.installedCompiler.status,
      verifiedCompileTarget: target.availability.verifiedCompileTarget.status,
      emulatorRuntime: target.availability.emulatorRuntime.status,
      validatedPeripherals: target.availability.validatedPeripherals.status,
    }, {
      installedCompiler: 'private-verified',
      verifiedCompileTarget: 'private-verified',
      emulatorRuntime: 'private-proof',
      validatedPeripherals: 'private-subset',
    });
    const publicContract = JSON.stringify(target);
    assert.equal(publicContract.includes('requiredVersion'), false);
    assert.equal(publicContract.includes('observedVersion'), false);
    assert.equal(publicContract.includes('sizeBytes'), false);
    assert.equal(publicContract.includes('packageBytes'), false);
  }
});

test('availability snapshots reject stale state, wrong family and silent promotion', () => {
  const rp2040 = targetAvailabilitySnapshot(RP2040_PROFILE);
  assert.equal(validateTargetAvailabilitySnapshot(rp2040), true);
  const stale = structuredClone(rp2040); stale.revision = 'installed-inventory-stale';
  assert.equal(validateTargetAvailabilitySnapshot(stale), false);
  const promoted = structuredClone(rp2040); promoted.installedCompiler.status = 'installed';
  assert.equal(validateTargetAvailabilitySnapshot(promoted), false);
  const wrongFamily = structuredClone(rp2040); wrongFamily.profile = STM32F429ZI_PROFILE;
  assert.equal(validateTargetAvailabilitySnapshot(wrongFamily), false);
  assert.equal(validateTargetAvailabilitySnapshot({ ...rp2040, unexpected: true }), false);
});

test('all public preview requests fail before queue while profile mismatches remain unknown', () => {
  let brokerCalls = 0;
  const coordinator = new BuildCoordinator({
    broker: { async compile() { brokerCalls += 1; throw new Error('broker must not run'); } },
    imageLock: { imageId: `sha256:${'a'.repeat(64)}`, toolchainManifestSha256: 'b'.repeat(64) },
  });
  for (const profileId of [ESP32C3_PROFILE, RP2040_PROFILE, STM32F429ZI_PROFILE]) {
    const request = requestFor(profileId);
    expectCode(() => normalizeBuildRequestValue(request), 'COMPILER_TARGET_UNAVAILABLE');
    expectCode(() => coordinator.submit(JSON.stringify(request), 'origin'), 'COMPILER_TARGET_UNAVAILABLE');
    expectCode(() => normalizeBuildRequestValue(requestFor(profileId, { fqbn: 'wrong:family:target' })), 'UNKNOWN_COMPILER_TARGET');
    expectCode(() => normalizeBuildRequestValue(requestFor(profileId, { toolchainIdentitySha256: '0'.repeat(64) })), 'UNKNOWN_COMPILER_TARGET');
  }
  const crossed = requestFor(RP2040_PROFILE, { fqbn: candidateCompilerTarget(STM32F429ZI_PROFILE).fqbn });
  expectCode(() => normalizeBuildRequestValue(crossed), 'UNKNOWN_COMPILER_TARGET');
  const privateSource = requestFor(RP2040_PROFILE);
  privateSource.files[0].content = '// PRIVATE_UNAVAILABLE_SOURCE_MARKER\nvoid setup(){} void loop(){}';
  try {
    normalizeBuildRequestValue(privateSource);
    assert.fail('unavailable target was accepted');
  } catch (error) {
    const responseBoundary = JSON.stringify({ code: error.code, message: error.message });
    assert.equal(responseBoundary.includes('PRIVATE_UNAVAILABLE_SOURCE_MARKER'), false);
    assert.equal(responseBoundary.includes('/srv/'), false);
    assert.equal(responseBoundary.includes('/workspace/'), false);
  }
  assert.equal(brokerCalls, 0);
  assert.equal(coordinator.queue.length, 0);
  assert.equal(coordinator.jobs.size, 0);
});

test('prior private compile artifacts cannot cross into the public projection', () => {
  const manifest = c3Manifest();
  assert.equal(validateCandidateCompileArtifact(manifest, ESP32C3_PROFILE), false);
  assert.equal(validateCandidateCompileArtifact(manifest, RP2040_PROFILE), false);
  assert.equal(validateCandidateCompileArtifact(manifest, STM32F429ZI_PROFILE), false);
  const wrongProfile = structuredClone(manifest); wrongProfile.profile = RP2040_PROFILE;
  assert.equal(validateCandidateCompileArtifact(wrongProfile, ESP32C3_PROFILE), false);
});
