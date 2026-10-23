// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import path from 'node:path';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { access, lstat, mkdir, open, readFile, realpath } from 'node:fs/promises';

const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_SHA = /^[a-f0-9]{40}$/u;
const RECEIPT = /^desktop-[a-z0-9](?:[a-z0-9-]{0,190}[a-z0-9])?$/u;
const NONCE = /^[A-Za-z0-9_-]{32,96}$/u;
const AUTHORITY_KEYS = Object.freeze([
  'schema', 'mode', 'receiptId', 'receiverStationId', 'preparationId', 'preparationGitCommit',
  'preparationLockSha256', 'harnessSha256', 'browserSha256', 'productOrigin',
  'builds', 'runs', 'scenarios', 'retries', 'targetNonce',
]);
const PREPARATION = /^x92-stm32-[a-z0-9-]{8,96}$/u;

function fail(code) { throw Object.assign(new Error(code), { code }); }
function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

export async function validateExternalAuthority({ authorityPath, receiptId, productRoot,
  preparationId, preparationGitCommit, preparationLockSha256, harnessSha256, browserSha256,
  productOrigin, consumptionRoot }) {
  if (!path.isAbsolute(authorityPath ?? '') || !RECEIPT.test(receiptId ?? '')) {
    fail('X92_STM32_NATIVE_AUTHORITY_PATH_INVALID');
  }
  const resolvedProduct = await realpath(productRoot);
  const resolvedAuthority = await realpath(authorityPath);
  if (resolvedAuthority === resolvedProduct || resolvedAuthority.startsWith(`${resolvedProduct}${path.sep}`)
      || path.basename(resolvedAuthority) !== 'x92-stm32-native-authority.json'
      || path.basename(path.dirname(resolvedAuthority)) !== receiptId) {
    fail('X92_STM32_NATIVE_AUTHORITY_PATH_INVALID');
  }
  const metadata = await lstat(authorityPath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600
      || metadata.uid !== process.getuid()) fail('X92_STM32_NATIVE_AUTHORITY_PATH_INVALID');
  const bytes = await readFile(authorityPath);
  let authority;
  try { authority = JSON.parse(bytes); } catch { fail('X92_STM32_NATIVE_AUTHORITY_INVALID'); }
  const valid = exactKeys(authority, AUTHORITY_KEYS)
    && authority.schema === 'intent-mcu-x92-stm32-external-authority@2'
    && (authority.mode === 'preflight-only' || authority.mode === 'execute')
    && authority.receiptId === receiptId && authority.receiverStationId === 'intentforce-ct109'
    && PREPARATION.test(authority.preparationId ?? '') && authority.preparationId === preparationId
    && GIT_SHA.test(authority.preparationGitCommit ?? '')
    && authority.preparationGitCommit === preparationGitCommit
    && SHA256.test(authority.preparationLockSha256 ?? '')
    && authority.preparationLockSha256 === preparationLockSha256
    && authority.harnessSha256 === harnessSha256 && authority.browserSha256 === browserSha256
    && authority.productOrigin === productOrigin && authority.builds === 1 && authority.runs === 1
    && authority.scenarios === 0 && authority.retries === 0 && NONCE.test(authority.targetNonce ?? '');
  if (!valid) fail('X92_STM32_NATIVE_AUTHORITY_INVALID');
  if (!path.isAbsolute(consumptionRoot ?? '')) fail('X92_STM32_NATIVE_CONSUMPTION_ROOT_INVALID');
  const consumptionKey = createHash('sha256')
    .update(`${preparationId}\0${preparationGitCommit}\0${receiptId}`, 'utf8').digest('hex');
  const consumptionMarker = path.join(consumptionRoot, preparationId, `${consumptionKey}.json`);
  try { await access(consumptionMarker, constants.F_OK); fail('X92_STM32_NATIVE_AUTHORITY_ALREADY_CONSUMED'); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  return Object.freeze({ authority, consumptionMarker,
    authoritySha256: createHash('sha256').update(bytes).digest('hex') });
}

export async function consumeExternalAuthority({ consumptionMarker, receiptId, authoritySha256,
  preparationId, preparationGitCommit, preparationLockSha256 }) {
  if (!path.isAbsolute(consumptionMarker ?? '') || !RECEIPT.test(receiptId ?? '')
      || !SHA256.test(authoritySha256 ?? '') || !PREPARATION.test(preparationId ?? '')
      || !GIT_SHA.test(preparationGitCommit ?? '') || !SHA256.test(preparationLockSha256 ?? '')) {
    fail('X92_STM32_NATIVE_CONSUMPTION_INVALID');
  }
  await mkdir(path.dirname(consumptionMarker), { recursive: true, mode: 0o700 });
  const marker = await open(consumptionMarker,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    await marker.writeFile(`${JSON.stringify({ receiptId, authoritySha256,
      gitCommit: preparationGitCommit, preparationId, preparationLockSha256 })}\n`);
  } finally { await marker.close(); }
  return Object.freeze({ consumptionMarker, created: true });
}
