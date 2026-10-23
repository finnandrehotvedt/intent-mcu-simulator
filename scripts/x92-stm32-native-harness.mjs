// Copyright 2026 IntentForce
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';

import { sourceForStm32 } from '../stm32/protocol.mjs';
import { STM32_EXECUTION_IDENTITIES } from '../src/stm32-execution-identities.mjs';

const root = new URL('../', import.meta.url);
const lockUrl = new URL('../stm32/x92-native-harness-lock.json', import.meta.url);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const lock = JSON.parse(await readFile(lockUrl, 'utf8'));
const source = sourceForStm32('STM32 PUBLIC', true);
const distMainSha256 = hash(await readFile(new URL('../staging/main.mjs', import.meta.url)));

function fail(code) { throw Object.assign(new Error(code), { code }); }
function preflight() {
  if (lock.schema !== 'intent-mcu-x92-stm32-native-harness-lock@1'
      || lock.defaultArmed !== false || lock.sourceSha256 !== hash(source)
      || lock.distMainSha256 !== distMainSha256
      || lock.compilerImageIdentity !== STM32_EXECUTION_IDENTITIES.compilerImageIdentity
      || lock.compilerToolchainIdentity !== STM32_EXECUTION_IDENTITIES.compilerToolchainIdentity
      || lock.runtimeImageIdentity !== STM32_EXECUTION_IDENTITIES.runtimeImageIdentity
      || lock.runtimeBinaryIdentity !== STM32_EXECUTION_IDENTITIES.runtimeBinaryIdentity
      || JSON.stringify(lock.allowance) !== JSON.stringify({ builds: 1, runs: 1, scenarios: 0, retries: 0 })) {
    fail('X92_STM32_NATIVE_HARNESS_LOCK_MISMATCH');
  }
  return { schema: lock.schema, status: 'ready-not-armed', producerContacts: 0,
    sourceSha256: lock.sourceSha256, distMainSha256, allowance: lock.allowance };
}

const args = process.argv.slice(2);
if (!args.includes('--execute')) {
  process.stdout.write(`${JSON.stringify(preflight())}\n`);
  process.exit(0);
}

preflight();
const value = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const authorityPath = value('--authority');
const evidencePath = value('--evidence');
const origin = value('--origin');
if (!authorityPath || !evidencePath || !/^https:\/\//u.test(origin ?? '')) fail('X92_STM32_NATIVE_HARNESS_DISARMED');
const authority = JSON.parse(await readFile(authorityPath, 'utf8'));
if (authority.schema !== 'intent-mcu-x92-stm32-native-authority@1'
    || authority.lockSha256 !== hash(await readFile(lockUrl))
    || !/^sha256:[a-f0-9]{64}$/u.test(authority.graphIdentity ?? '')
    || !/^[A-Za-z0-9_-]{16,64}$/u.test(authority.requestNonce ?? '')) fail('X92_STM32_NATIVE_AUTHORITY_INVALID');

await mkdir(evidencePath, { recursive: false });
const consumed = await open(`${authorityPath}.consumed`, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
await consumed.writeFile(`${JSON.stringify({ authoritySha256: hash(await readFile(authorityPath)), consumedAt: new Date().toISOString() })}\n`);
await consumed.close();
const headers = { 'Content-Type': 'application/json', Origin: origin, 'X-Intent-MCU-STM32': '1' };
async function rawPost(name, path, body) {
  const response = await fetch(`${origin}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await response.text();
  await writeFile(`${evidencePath}/${name}.http.json`, `${JSON.stringify({ status: response.status,
    headers: Object.fromEntries(response.headers), body: text })}\n`, { flag: 'wx', mode: 0o600 });
  let parsed; try { parsed = JSON.parse(text); } catch { fail('X92_STM32_NATIVE_HTTP_JSON_INVALID'); }
  if (!response.ok) fail(`X92_STM32_NATIVE_${name.toUpperCase()}_FAILED`);
  return parsed;
}
const built = await rawPost('01-build', '/api/stm32/build', { schema: lock.schemas.build,
  profile: lock.profile, sourceRevision: 1, source });
const binding = { schema: 'intent-mcu-x92-stm32-execution-binding@1', profile: lock.profile,
  requestNonce: authority.requestNonce, projectGeneration: authority.projectGeneration,
  sourceIdentity: `sha256:${lock.sourceSha256}`, graphIdentity: authority.graphIdentity,
  elfIdentity: `sha256:${built.artifact.sha256}`, modelIdentity: lock.modelIdentity,
  compiler: { imageIdentity: lock.compilerImageIdentity, toolchainIdentity: lock.compilerToolchainIdentity },
  runtime: { imageIdentity: lock.runtimeImageIdentity, binaryIdentity: lock.runtimeBinaryIdentity } };
const ran = await rawPost('02-run', '/api/stm32/run', { schema: lock.schemas.run, profile: lock.profile,
  sourceRevision: 1, source, sourceSha256: lock.sourceSha256, artifact: built.artifact, x92Binding: binding });
const quiescence = await rawPost('03-quiescence', '/api/stm32/quiescence', {
  schema: lock.schemas.quiescence, binding, completion: ran.completion });
if (ran.engine?.id !== lock.runner.id || ran.engine?.version !== lock.runner.version
    || ran.engine.actualExecution !== true || ran.elfSha256 !== built.artifact.sha256
    || quiescence.completion?.operationId !== ran.completion?.operationId) fail('X92_STM32_NATIVE_ASSERTION_FAILED');
await writeFile(`${evidencePath}/04-result.json`, `${JSON.stringify({ ok: true, binding,
  buildArtifact: built.artifact, runtime: ran, quiescence })}\n`, { flag: 'wx', mode: 0o600 });
