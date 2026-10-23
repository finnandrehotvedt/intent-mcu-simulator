// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateExternalAuthority } from '../scripts/x92-stm32-native-authority.mjs';

const receiptId = 'desktop-etvt6l5-ct109-lab-x92-stm32-native-proof-20990101-001';
const gitCommit = 'a'.repeat(40);
const lockSha256 = 'b'.repeat(64);
const harnessSha256 = 'c'.repeat(64);
const browserSha256 = 'd'.repeat(64);
const preparationId = 'x92-stm32-refreeze-20990101-v1';

async function fixture(context) {
  const root = await mkdtemp(path.join(tmpdir(), 'x92-stm32-authority-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const receipt = path.join(root, receiptId); await mkdir(receipt);
  const authorityPath = path.join(receipt, 'x92-stm32-native-authority.json');
  const authority = { schema: 'intent-mcu-x92-stm32-external-authority@2', mode: 'preflight-only', receiptId,
    receiverStationId: 'intentforce-ct109', preparationId, preparationGitCommit: gitCommit,
    preparationLockSha256: lockSha256, harnessSha256, browserSha256,
    productOrigin: 'http://127.0.0.1:18766', builds: 1, runs: 1, scenarios: 0,
    retries: 0, targetNonce: 'TargetNonce_0123456789abcdef0123456789' };
  await writeFile(authorityPath, `${JSON.stringify(authority)}\n`); await chmod(authorityPath, 0o600);
  return { root, authorityPath, authority, consumptionRoot: path.join(root, 'preparations') };
}

function options(value) {
  return { authorityPath: value.authorityPath, receiptId, productRoot: process.cwd(),
    preparationId, preparationGitCommit: gitCommit, preparationLockSha256: lockSha256,
    harnessSha256, browserSha256, productOrigin: 'http://127.0.0.1:18766',
    consumptionRoot: value.consumptionRoot };
}

test('external receipt authority validates without consumption or producer contact', async (context) => {
  const value = await fixture(context); const result = await validateExternalAuthority(options(value));
  assert.equal(result.authority.receiptId, receiptId); assert.match(result.authoritySha256, /^[a-f0-9]{64}$/u);
  assert.match(result.consumptionMarker, new RegExp(`preparations/${preparationId}/[a-f0-9]{64}\\.json$`, 'u'));
  await assert.rejects(import('node:fs/promises').then(({ access }) => access(result.consumptionMarker)), { code: 'ENOENT' });
});

test('wrong receipt, preparation source and tracked lock hash fail closed', async (context) => {
  const value = await fixture(context);
  await assert.rejects(validateExternalAuthority({ ...options(value), receiptId: `${receiptId}-wrong` }),
    /X92_STM32_NATIVE_AUTHORITY_PATH_INVALID/u);
  await assert.rejects(validateExternalAuthority({ ...options(value), preparationGitCommit: 'e'.repeat(40) }),
    /X92_STM32_NATIVE_AUTHORITY_INVALID/u);
  await assert.rejects(validateExternalAuthority({ ...options(value), preparationLockSha256: 'f'.repeat(64) }),
    /X92_STM32_NATIVE_AUTHORITY_INVALID/u);
  await writeFile(value.authorityPath, `${JSON.stringify({ ...value.authority, mode: 'run-now' })}\n`);
  await chmod(value.authorityPath, 0o600);
  await assert.rejects(validateExternalAuthority(options(value)), /X92_STM32_NATIVE_AUTHORITY_INVALID/u);
});

test('preparation receipt marker rejects copied or renamed authority while legacy global state is independent', async (context) => {
  const value = await fixture(context); const first = await validateExternalAuthority(options(value));
  await mkdir(path.dirname(first.consumptionMarker), { recursive: true });
  await writeFile(first.consumptionMarker, '{}\n');
  await assert.rejects(validateExternalAuthority(options(value)), /X92_STM32_NATIVE_AUTHORITY_ALREADY_CONSUMED/u);
});

test('old schema and another preparation fail closed before consumption lookup', async (context) => {
  const value = await fixture(context);
  await writeFile(value.authorityPath, `${JSON.stringify({ ...value.authority,
    schema: 'intent-mcu-x92-stm32-external-authority@1' })}\n`); await chmod(value.authorityPath, 0o600);
  await assert.rejects(validateExternalAuthority(options(value)), /X92_STM32_NATIVE_AUTHORITY_INVALID/u);
  await writeFile(value.authorityPath, `${JSON.stringify({ ...value.authority,
    preparationId: 'x92-stm32-another-preparation-v1' })}\n`); await chmod(value.authorityPath, 0o600);
  await assert.rejects(validateExternalAuthority(options(value)), /X92_STM32_NATIVE_AUTHORITY_INVALID/u);
});
