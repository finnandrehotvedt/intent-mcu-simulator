// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { sourceForStm32 } from '../stm32/protocol.mjs';
import { STM32_EXECUTION_IDENTITIES } from '../src/stm32-execution-identities.mjs';
import { CURRENT_MODEL_LIBRARY_LOCK } from '../src/model-library.mjs';
import { validateExternalAuthority } from './x92-stm32-native-authority.mjs';
const execute = promisify(execFile); const root = new URL('../', import.meta.url);
const lockUrl = new URL('../stm32/x92-native-harness-lock.json', import.meta.url);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const lock = JSON.parse(await readFile(lockUrl, 'utf8'));
const git = (await execute('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
const gitStatus = (await execute('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root })).stdout;
const serviceSourceSha256 = hash(await readFile(new URL('../stm32/public-service.mjs', import.meta.url)));
const runnerSourceSha256 = hash(await readFile(new URL('../stm32/renode-runner.py', import.meta.url)));
const harnessSha256 = hash(await readFile(new URL('./x92-stm32-native-harness.mjs', import.meta.url)));
const browserSha256 = hash(await readFile(new URL('../test/x92-stm32-native-product-browser.cjs', import.meta.url)));
const authorityValidatorSha256 = hash(await readFile(new URL('./x92-stm32-native-authority.mjs', import.meta.url)));
function fail(code) { throw Object.assign(new Error(code), { code }); }
const exact = lock.schema === 'intent-mcu-x92-stm32-native-harness-lock@1'
  && lock.productOrigin === 'http://127.0.0.1:18766'
  && lock.sourceSha256 === hash(sourceForStm32('STM32 PUBLIC', true))
  && lock.distMainSha256 === hash(await readFile(new URL('../dist/main.js', import.meta.url)))
  && lock.modelIdentity === `sha256:${CURRENT_MODEL_LIBRARY_LOCK.implementationSha256}`
  && lock.serviceSourceSha256 === serviceSourceSha256
  && lock.runnerSourceSha256 === runnerSourceSha256
  && lock.harnessSha256 === harnessSha256
  && lock.browserSha256 === browserSha256
  && lock.authorityValidatorSha256 === authorityValidatorSha256
  && lock.compilerImageIdentity === STM32_EXECUTION_IDENTITIES.compilerImageIdentity
  && lock.compilerToolchainIdentity === STM32_EXECUTION_IDENTITIES.compilerToolchainIdentity
  && lock.runtimeImageIdentity === STM32_EXECUTION_IDENTITIES.runtimeImageIdentity
  && lock.runtimeBinaryIdentity === STM32_EXECUTION_IDENTITIES.runtimeBinaryIdentity
  && JSON.stringify(lock.allowance) === JSON.stringify({ builds: 1, runs: 1, scenarios: 0, retries: 0 });
if (!exact) fail('X92_STM32_NATIVE_HARNESS_LOCK_MISMATCH');
const state = { schema: lock.schema, status: 'ready-not-armed',
  producerContacts: 0, gitCommit: git, gitClean: gitStatus.length === 0, sourceSha256: lock.sourceSha256,
  distMainSha256: lock.distMainSha256, allowance: lock.allowance };
const executeRequested = process.argv.includes('--execute');
const preflightRequested = process.argv.includes('--preflight');
if (!executeRequested && !preflightRequested) { process.stdout.write(`${JSON.stringify(state)}\n`); process.exit(0); }
const authorityPath = process.env.X92_STM32_NATIVE_AUTHORITY;
const receiptId = process.env.X92_STM32_RECEIPT_ID;
if (!authorityPath || !receiptId) fail('X92_STM32_NATIVE_AUTHORITY_REQUIRED');
if (gitStatus.length !== 0 || lock.defaultArmed !== false || lock.expectedGitCommit !== null
    || lock.authoritySha256 !== null) fail('X92_STM32_NATIVE_HARNESS_DISARMED');
const preparationLockSha256 = hash(await readFile(lockUrl));
const { authority, authoritySha256 } = await validateExternalAuthority({ authorityPath, receiptId,
  productRoot: fileURLToPath(root), preparationGitCommit: git, preparationLockSha256,
  harnessSha256, browserSha256, productOrigin: lock.productOrigin,
  consumptionMarker: lock.consumptionMarker });
if (preflightRequested) {
  process.stdout.write(`${JSON.stringify({ ...state, status: 'authority-valid', receiptId,
    authoritySha256, consumptionMarkerCreated: false })}\n`); process.exit(0);
}
if (authority.mode !== 'execute') fail('X92_STM32_NATIVE_EXECUTION_NOT_AUTHORIZED');
const evidence = process.env.X92_STM32_NATIVE_EVIDENCE;
if (!evidence) fail('X92_STM32_NATIVE_EVIDENCE_REQUIRED');
await mkdir(evidence, { recursive: false });
const marker = await open(lock.consumptionMarker, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
await marker.writeFile(`${JSON.stringify({ receiptId, authoritySha256, gitCommit: git,
  preparationLockSha256 })}\n`); await marker.close();
await execute(process.execPath, ['test/x92-stm32-native-product-browser.cjs'], { cwd: root,
  env: { ...process.env, X92_STM32_NATIVE_ORIGIN: lock.productOrigin,
    X92_STM32_NATIVE_EVIDENCE: evidence, X92_STM32_TARGET_NONCE: authority.targetNonce,
    X92_STM32_EXPECTED_GIT: git, X92_STM32_EXPECTED_DIST: lock.distMainSha256,
    X92_STM32_EXPECTED_MODEL: lock.modelIdentity,
    X92_STM32_EXPECTED_SERVICE: lock.serviceSourceSha256,
    X92_STM32_EXPECTED_RUNNER: lock.runnerSourceSha256,
    X92_STM32_EXPECTED_HARNESS: lock.harnessSha256,
    X92_STM32_EXPECTED_BROWSER: lock.browserSha256,
    X92_STM32_EXPECTED_COMPILER_IMAGE: lock.compilerImageIdentity,
    X92_STM32_EXPECTED_COMPILER_TOOLCHAIN: lock.compilerToolchainIdentity,
    X92_STM32_EXPECTED_RUNTIME_IMAGE: lock.runtimeImageIdentity,
    X92_STM32_EXPECTED_RUNTIME_BINARY: lock.runtimeBinaryIdentity }, maxBuffer: 1024 * 1024 });
