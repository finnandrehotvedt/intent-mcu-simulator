// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import assert from 'node:assert/strict';
import test from 'node:test';
import { BuildCoordinator } from '../compiler/build-coordinator.mjs';
import {
  BuildProtocolError,
  RP2040_BUILD_REQUEST_SCHEMA,
  normalizeBuildRequestValue,
  sha256,
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

test('STM32 remains public-unavailable while Pico has one exact bounded public target', () => {
  for (const profileId of [STM32F429ZI_PROFILE]) {
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
  const pico = candidateCompilerTarget(RP2040_PROFILE);
  assert.equal(pico.compileAvailable, true);
  assert.equal(pico.compileOnly, false);
  assert.equal(pico.requestSchema, RP2040_BUILD_REQUEST_SCHEMA);
  assert.equal(pico.fqbn, 'intent:rp2040:pico-bounded-c11');
  assert.equal(pico.toolchainIdentitySha256, '8f6903f8ceb084d9227b9ef991490413014d991874a1e34074443c2a72b14dbd');
  assert.deepEqual(pico.availability && [
    pico.availability.installedCompiler.status,
    pico.availability.verifiedCompileTarget.status,
    pico.availability.emulatorRuntime.status,
    pico.availability.validatedPeripherals.status,
  ], ['installed', 'verified', 'verified', 'validated-subset']);
});

test('availability snapshots reject stale state, wrong family and silent promotion', () => {
  const rp2040 = targetAvailabilitySnapshot(RP2040_PROFILE);
  assert.equal(validateTargetAvailabilitySnapshot(rp2040), true);
  const stale = structuredClone(rp2040); stale.revision = 'installed-inventory-stale';
  assert.equal(validateTargetAvailabilitySnapshot(stale), false);
  const demoted = structuredClone(rp2040); demoted.installedCompiler.status = 'private-verified';
  assert.equal(validateTargetAvailabilitySnapshot(demoted), false);
  const wrongFamily = structuredClone(rp2040); wrongFamily.profile = STM32F429ZI_PROFILE;
  assert.equal(validateTargetAvailabilitySnapshot(wrongFamily), false);
  assert.equal(validateTargetAvailabilitySnapshot({ ...rp2040, unexpected: true }), false);
});

test('C3 dedicated service and STM32 preview cannot cross into the generic compiler queue', () => {
  let brokerCalls = 0;
  const coordinator = new BuildCoordinator({
    broker: { async compile() { brokerCalls += 1; throw new Error('broker must not run'); } },
    imageLock: { imageId: `sha256:${'a'.repeat(64)}`, toolchainManifestSha256: 'b'.repeat(64) },
  });
  const c3Request = requestFor(ESP32C3_PROFILE);
  expectCode(() => normalizeBuildRequestValue(c3Request), 'UNKNOWN_COMPILER_TARGET');
  expectCode(() => coordinator.submit(JSON.stringify(c3Request), 'origin'), 'UNKNOWN_COMPILER_TARGET');
  const stm32Request = requestFor(STM32F429ZI_PROFILE);
  expectCode(() => normalizeBuildRequestValue(stm32Request), 'COMPILER_TARGET_UNAVAILABLE');
  expectCode(() => coordinator.submit(JSON.stringify(stm32Request), 'origin'), 'COMPILER_TARGET_UNAVAILABLE');
  for (const profileId of [ESP32C3_PROFILE, STM32F429ZI_PROFILE]) {
    expectCode(() => normalizeBuildRequestValue(requestFor(profileId, { fqbn: 'wrong:family:target' })), 'UNKNOWN_COMPILER_TARGET');
    expectCode(() => normalizeBuildRequestValue(requestFor(profileId, { toolchainIdentitySha256: '0'.repeat(64) })), 'UNKNOWN_COMPILER_TARGET');
  }
  const crossed = requestFor(STM32F429ZI_PROFILE, { fqbn: candidateCompilerTarget(RP2040_PROFILE).fqbn });
  expectCode(() => normalizeBuildRequestValue(crossed), 'UNKNOWN_COMPILER_TARGET');
  const privateSource = requestFor(STM32F429ZI_PROFILE);
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

test('public Pico source request accepts only the exact three-call grammar', () => {
  const sourceText = `/* Intent MCU Simulator public RP2040 source v1 */\nint main(void)\n{\n  intent_gpio0_output(1u);\n  intent_uart0_text("PUBLIC TEST");\n  intent_halt();\n}\n`;
  const accepted = normalizeBuildRequestValue({
    schema: RP2040_BUILD_REQUEST_SCHEMA,
    board: RP2040_PROFILE,
    files: [{ name: 'main.c', content: sourceText }],
  });
  assert.equal(accepted.board, RP2040_PROFILE);
  assert.equal(accepted.files[0].content, sourceText);
  for (const rejected of [
    sourceText.replace('1u', '2u'),
    sourceText.replace('PUBLIC TEST', 'lowercase'),
    sourceText.replace('  intent_halt();\n', '  *(volatile unsigned *)0x40000000 = 1;\n  intent_halt();\n'),
    sourceText.replace('intent_uart0_text', 'system'),
  ]) {
    expectCode(() => normalizeBuildRequestValue({
      schema: RP2040_BUILD_REQUEST_SCHEMA,
      board: RP2040_PROFILE,
      files: [{ name: 'main.c', content: rejected }],
    }), 'SOURCE_POLICY_REJECTED');
  }
});

test('public Pico artifact rejects non-canonical base64 before firmware parsing', async () => {
  const sourceText = `/* Intent MCU Simulator public RP2040 source v1 */\nint main(void)\n{\n  intent_gpio0_output(1u);\n  intent_uart0_text("PUBLIC TEST");\n  intent_halt();\n}\n`;
  const coordinator = new BuildCoordinator({
    broker: {
      async compile() {
        return {
          status: 'succeeded', code: 'BUILD_OK', imageId: `sha256:${'a'.repeat(64)}`,
          isolation: {},
          artifact: {
            schema: 'intent-mcu-rp2040-compile-artifact@1',
            profile: RP2040_PROFILE,
            sourceSha256: sha256(sourceText),
            compiler: {
              id: 'arm-none-eabi-gcc', version: '14.3.1', release: '14.3.rel1',
              archiveSha256: '8f6903f8ceb084d9227b9ef991490413014d991874a1e34074443c2a72b14dbd',
            },
            contract: {},
            elf: { bytes: 1, sha256: '1'.repeat(64) },
            uf2: { bytes: 512, sha256: '2'.repeat(64), base64: 'A===' },
          },
        };
      },
    },
    imageLock: { imageId: `sha256:${'a'.repeat(64)}`, toolchainManifestSha256: 'b'.repeat(64) },
  });
  const submitted = coordinator.submit(JSON.stringify({
    schema: RP2040_BUILD_REQUEST_SCHEMA,
    board: RP2040_PROFILE,
    files: [{ name: 'main.c', content: sourceText }],
  }), 'origin');
  await new Promise((resolve) => setImmediate(resolve));
  const result = coordinator.status(submitted.jobId, submitted.capability, 'origin');
  assert.equal(result.status, 'failed');
  assert.equal(result.error, 'RP2040_ARTIFACT_INVALID');
});

test('prior private compile artifacts cannot cross into the public projection', () => {
  const manifest = c3Manifest();
  assert.equal(validateCandidateCompileArtifact(manifest, ESP32C3_PROFILE), false);
  assert.equal(validateCandidateCompileArtifact(manifest, RP2040_PROFILE), false);
  assert.equal(validateCandidateCompileArtifact(manifest, STM32F429ZI_PROFILE), false);
  const wrongProfile = structuredClone(manifest); wrongProfile.profile = RP2040_PROFILE;
  assert.equal(validateCandidateCompileArtifact(wrongProfile, ESP32C3_PROFILE), false);
});
