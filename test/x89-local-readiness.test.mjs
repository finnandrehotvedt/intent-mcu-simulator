// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assessLocalReadiness, canonicalLocalReadinessReport, reopenLocalReadinessReport,
} from '../src/local-readiness-assessor.mjs';

const sourceRoot = new URL('../', import.meta.url).pathname;
const imageIds = {
  avr: `sha256:${'1'.repeat(64)}`, rp2040: `sha256:${'2'.repeat(64)}`,
  stm32Builder: 'sha256:a5ce68a44d599f77d67389db0c4eb3a3690af82ec71cd6a1f3edd5f92c1ec0ea',
  stm32Runtime: 'sha256:f52ebf0eac4ece7914de8bbde13233d263ec51a0395037e85ce83ccc7c103b18',
};
const fixture = (runtime = 'docker-available', installedImages = imageIds) => JSON.stringify({
  schema: 'intent-mcu-local-readiness-fixture@1', runtime, installedImages,
});
const lock = (name, imageId) => `${JSON.stringify({
  schema: 'teach-lab-compiler-image-lock@1', image: `local/${name}:fixed`, imageId,
  runtimeImageIds: [], toolchainManifestSha256: 'a'.repeat(64), toolchainFilesSha256: 'b'.repeat(64),
  architecture: 'linux/amd64', distribution: 'local test fixture',
}, null, 2)}\n`;

async function preparedCheckout() {
  const root = await mkdtemp(path.join(tmpdir(), 'intent-mcu-x89-'));
  await mkdir(path.join(root, 'compiler'), { recursive: true });
  await mkdir(path.join(root, 'stm32'), { recursive: true });
  for (const file of ['compose.yaml', 'package.json', 'compiler/docker-broker.mjs',
    'stm32/builder-image-lock.json', 'stm32/runtime-image-lock.json']) {
    await cp(path.join(sourceRoot, file), path.join(root, file));
  }
  await writeFile(path.join(root, 'compiler/local-image-lock.json'), lock('avr', imageIds.avr));
  await writeFile(path.join(root, 'compiler/local-rp2040-image-lock.json'), lock('rp2040', imageIds.rp2040));
  return root;
}

test('X89 complete fixture assesses exact current recipes without claiming health, readiness or execution', async () => {
  const root = await preparedCheckout();
  const report = await assessLocalReadiness(root, fixture());
  assert.equal(report.status.configurationAssessed, 'ready');
  assert.equal(report.status.serviceHealthy, 'not-checked');
  assert.equal(report.status.compilerRuntimeReady, 'not-checked');
  assert.equal(report.status.realFirmwareExecutionTested, 'not-tested');
  assert.deepEqual(report.blockers, []);
  assert.deepEqual(report.boundaries, {
    loopbackOnly: true, childNetwork: 'none', childReadOnly: true, childCpu: 1,
    childMemoryMiB: 256, childPids: 64, storage: 'ephemeral-tmpfs',
    secretsCollected: false, remoteRegistration: false,
  });
  assert.equal(report.profiles.esp32c3, 'unavailable-separate-licensed-images');
});

test('X89 incomplete actual checkout names concrete local prerequisites and never reports green', async () => {
  const source = await readFile(new URL('../examples/local-readiness/incomplete.fixture.json', import.meta.url), 'utf8');
  const report = await assessLocalReadiness(sourceRoot, source);
  assert.equal(report.status.configurationAssessed, 'blocked');
  assert(report.blockers.includes('LOCAL_LOCK_MISSING:avr'));
  assert(report.blockers.includes('LOCAL_LOCK_MISSING:rp2040'));
  assert(report.blockers.includes('LOCAL_IMAGE_MISSING:stm32Builder'));
  assert(report.blockers.includes('LOCAL_IMAGE_MISSING:stm32Runtime'));
  assert(report.blockers.includes('LOCAL_RUNTIME_MISSING:docker'));
});

test('X89 fails closed for image mismatch, public bind, bad/missing limits, writable child and missing lock pin', async () => {
  const mismatchRoot = await preparedCheckout();
  const mismatch = { ...imageIds, avr: `sha256:${'9'.repeat(64)}` };
  assert((await assessLocalReadiness(mismatchRoot, fixture('docker-available', mismatch))).blockers
    .includes('LOCAL_IMAGE_MISMATCH:avr'));

  const composeRoot = await preparedCheckout();
  const composePath = path.join(composeRoot, 'compose.yaml');
  const compose = await readFile(composePath, 'utf8');
  await writeFile(composePath, compose.replace('STAGING_HOST: 127.0.0.1', 'STAGING_HOST: 0.0.0.0')
    .replace('pids_limit: 128', 'pids_limit: 1024'));
  const composeReport = await assessLocalReadiness(composeRoot, fixture());
  assert(composeReport.blockers.includes('LOCAL_BIND_NOT_LOOPBACK'));
  assert(composeReport.blockers.includes('LOCAL_GATEWAY_LIMIT_INVALID'));

  const brokerRoot = await preparedCheckout();
  const brokerPath = path.join(brokerRoot, 'compiler/docker-broker.mjs');
  await writeFile(brokerPath, (await readFile(brokerPath, 'utf8')).replace("'--read-only'", "'--read-write'"));
  assert((await assessLocalReadiness(brokerRoot, fixture())).blockers.includes('LOCAL_CHILD_BOUNDARY_INVALID'));

  const lockRoot = await preparedCheckout();
  await writeFile(path.join(lockRoot, 'compiler/local-image-lock.json'), '{}\n');
  await assert.rejects(assessLocalReadiness(lockRoot, fixture()), /LOCAL_READINESS_LOCK_INVALID/u);
});

test('X89 rejects unknown fixture fields and never interprets caller text as commands', async () => {
  const root = await preparedCheckout();
  const hostile = JSON.parse(fixture()); hostile.command = 'curl secret.invalid';
  await assert.rejects(assessLocalReadiness(root, JSON.stringify(hostile)), /LOCAL_READINESS_FIXTURE_INVALID/u);
  const unknown = JSON.parse(fixture()); unknown.installedImages.unknownProfile = imageIds.avr;
  await assert.rejects(assessLocalReadiness(root, JSON.stringify(unknown)), /LOCAL_READINESS_FIXTURE_INVALID/u);
  const report = await assessLocalReadiness(root, fixture());
  const rendered = canonicalLocalReadinessReport(report);
  assert.doesNotMatch(rendered, /\/home\/|SECRET_VALUE|curl secret/u);
});

test('X89 reopens the same report and detects a one-byte recipe change as stale', async () => {
  const root = await preparedCheckout();
  const source = fixture();
  const report = await assessLocalReadiness(root, source);
  const saved = canonicalLocalReadinessReport(report);
  assert.equal((await reopenLocalReadinessReport(saved, root, source)).sameConfiguration, true);
  const packagePath = path.join(root, 'package.json');
  await writeFile(packagePath, `${await readFile(packagePath, 'utf8')} `);
  const reopened = await reopenLocalReadinessReport(saved, root, source);
  assert.equal(reopened.sameConfiguration, false);
  assert.notEqual(reopened.currentConfigurationSha256, reopened.savedConfigurationSha256);
});
