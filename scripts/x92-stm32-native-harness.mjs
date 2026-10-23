// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { sourceForStm32 } from '../stm32/protocol.mjs';
import { STM32_EXECUTION_IDENTITIES } from '../src/stm32-execution-identities.mjs';
const execute = promisify(execFile); const root = new URL('../', import.meta.url);
const lockUrl = new URL('../stm32/x92-native-harness-lock.json', import.meta.url);
const authorityUrl = new URL('../stm32/x92-native-authority.json', import.meta.url);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const lock = JSON.parse(await readFile(lockUrl, 'utf8'));
const git = (await execute('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
function fail(code) { throw Object.assign(new Error(code), { code }); }
const exact = lock.schema === 'intent-mcu-x92-stm32-native-harness-lock@1'
  && lock.productOrigin === 'https://lab.teachthecompany.com'
  && lock.sourceSha256 === hash(sourceForStm32('STM32 PUBLIC', true))
  && lock.distMainSha256 === hash(await readFile(new URL('../dist/main.js', import.meta.url)))
  && lock.compilerImageIdentity === STM32_EXECUTION_IDENTITIES.compilerImageIdentity
  && lock.compilerToolchainIdentity === STM32_EXECUTION_IDENTITIES.compilerToolchainIdentity
  && lock.runtimeImageIdentity === STM32_EXECUTION_IDENTITIES.runtimeImageIdentity
  && lock.runtimeBinaryIdentity === STM32_EXECUTION_IDENTITIES.runtimeBinaryIdentity
  && JSON.stringify(lock.allowance) === JSON.stringify({ builds: 1, runs: 1, scenarios: 0, retries: 0 });
if (!exact) fail('X92_STM32_NATIVE_HARNESS_LOCK_MISMATCH');
const armed = lock.defaultArmed === true && /^[a-f0-9]{40}$/u.test(lock.expectedGitCommit ?? '')
  && /^[a-f0-9]{64}$/u.test(lock.authoritySha256 ?? '');
const state = { schema: lock.schema, status: armed ? 'armed' : 'ready-not-armed',
  producerContacts: 0, gitCommit: git, sourceSha256: lock.sourceSha256,
  distMainSha256: lock.distMainSha256, allowance: lock.allowance };
if (!process.argv.includes('--execute')) { process.stdout.write(`${JSON.stringify(state)}\n`); process.exit(0); }
if (!armed || git !== lock.expectedGitCommit) fail('X92_STM32_NATIVE_HARNESS_DISARMED');
const authorityBytes = await readFile(authorityUrl); const authority = JSON.parse(authorityBytes);
if (hash(authorityBytes) !== lock.authoritySha256 || authority.gitCommit !== git
    || authority.productOrigin !== lock.productOrigin || authority.builds !== 1
    || authority.runs !== 1 || authority.scenarios !== 0 || authority.retries !== 0) {
  fail('X92_STM32_NATIVE_AUTHORITY_INVALID');
}
const evidence = process.env.X92_STM32_NATIVE_EVIDENCE;
if (!evidence) fail('X92_STM32_NATIVE_EVIDENCE_REQUIRED');
await mkdir(evidence, { recursive: false });
const marker = await open(lock.consumptionMarker, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
await marker.writeFile(`${JSON.stringify({ authoritySha256: lock.authoritySha256, gitCommit: git })}\n`); await marker.close();
await execute(process.execPath, ['test/x92-stm32-native-product-browser.cjs'], { cwd: root,
  env: { ...process.env, X92_STM32_NATIVE_ORIGIN: lock.productOrigin,
    X92_STM32_NATIVE_EVIDENCE: evidence }, maxBuffer: 1024 * 1024 });
