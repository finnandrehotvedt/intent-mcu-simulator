// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DOCKER_BUILD_RUNTIME_POLICY } from '../compiler/docker-runtime-policy.mjs';
import { parseCompilerImageLock } from '../compiler/image-lock-contract.mjs';
import { exactKeys, parseStrictJson } from './strict-json.mjs';

export const LOCAL_READINESS_FIXTURE_SCHEMA = 'intent-mcu-local-readiness-fixture@1';
export const LOCAL_READINESS_REPORT_SCHEMA = 'intent-mcu-local-readiness-report@1';
const FIXTURE_KEYS = ['schema', 'runtime', 'installedImages'];
const IMAGE_KEYS = ['avr', 'rp2040', 'stm32Builder', 'stm32Runtime'];
const HASH = /^sha256:[a-f0-9]{64}$/u;
const FILES = Object.freeze({
  compose: 'compose.yaml', package: 'package.json', broker: 'compiler/docker-broker.mjs',
  runtimePolicy: 'compiler/docker-runtime-policy.mjs', lockContract: 'compiler/image-lock-contract.mjs',
  avr: 'compiler/local-image-lock.json', rp2040: 'compiler/local-rp2040-image-lock.json',
  stm32Builder: 'stm32/builder-image-lock.json', stm32Runtime: 'stm32/runtime-image-lock.json',
});
const fail = (code, details = []) => { throw Object.assign(new Error(code), { code, details }); };
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;

function parseFixture(source) {
  const value = parseStrictJson(source, 16 * 1024);
  if (!exactKeys(value, FIXTURE_KEYS) || value.schema !== LOCAL_READINESS_FIXTURE_SCHEMA
      || !['docker-available', 'runtime-missing'].includes(value.runtime)
      || !exactKeys(value.installedImages, IMAGE_KEYS)) fail('LOCAL_READINESS_FIXTURE_INVALID');
  for (const entry of Object.values(value.installedImages)) {
    if (entry !== null && !HASH.test(entry)) fail('LOCAL_READINESS_IMAGE_ID_INVALID');
  }
  return value;
}

function inspectCompose(source) {
  if (source.includes('\t')) fail('LOCAL_READINESS_COMPOSE_AMBIGUOUS');
  const lines = source.split(/\r?\n/u);
  if (lines.filter((line) => line === 'services:').length !== 1) fail('LOCAL_READINESS_COMPOSE_AMBIGUOUS');
  const starts = lines.flatMap((line, index) => line === '  local-compiler:' ? [index] : []);
  if (starts.length !== 1) fail('LOCAL_READINESS_COMPOSE_AMBIGUOUS');
  const start = starts[0];
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].trim() && !lines[index].startsWith('    ')) { end = index; break; }
  }
  const local = lines.slice(start + 1, end);
  const direct = new Map();
  const sections = new Map();
  let section = null;
  for (const line of local) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const directMatch = /^    ([A-Za-z0-9_]+):(?: (.*))?$/u.exec(line);
    if (directMatch) {
      const [, key, value = ''] = directMatch;
      if (direct.has(key)) fail('LOCAL_READINESS_COMPOSE_AMBIGUOUS');
      direct.set(key, value.trim()); section = value.trim() ? null : key;
      if (section) sections.set(section, []);
      continue;
    }
    if (!section || !line.startsWith('      ')) fail('LOCAL_READINESS_COMPOSE_AMBIGUOUS');
    sections.get(section).push(line.slice(6));
  }
  const environment = new Map();
  for (const line of sections.get('environment') || []) {
    const match = /^([A-Z0-9_]+): (.+)$/u.exec(line);
    if (!match || environment.has(match[1])) fail('LOCAL_READINESS_COMPOSE_AMBIGUOUS');
    environment.set(match[1], match[2].replace(/^"|"$/gu, ''));
  }
  const host = environment.get('STAGING_HOST') || null;
  const exactNumber = (key, expression) => expression.test(direct.get(key) || '') ? Number(direct.get(key).replace(/m$/u, '')) : null;
  return {
    profile: direct.get('profiles') === '["local-compiler"]',
    loopbackOnly: host === '127.0.0.1', host,
    readOnly: direct.get('read_only') === 'true', restartDisabled: direct.get('restart') === '"no"',
    dockerSocketReadOnly: (sections.get('volumes') || []).filter((line) => line === '- /var/run/docker.sock:/var/run/docker.sock:ro').length === 1,
    gatewayLimits: {
      cpus: exactNumber('cpus', /^2\.0$/u), memoryMiB: exactNumber('mem_limit', /^512m$/u),
      pids: exactNumber('pids_limit', /^128$/u),
    },
    lockBindings: {
      avr: environment.get('COMPILER_IMAGE_LOCK') === '/workspace/compiler/local-image-lock.json',
      rp2040: environment.get('RP2040_COMPILER_IMAGE_LOCK') === '/workspace/compiler/local-rp2040-image-lock.json',
      stm32Builder: environment.get('STM32_BUILDER_IMAGE_LOCK') === '/workspace/stm32/builder-image-lock.json',
      stm32Runtime: environment.get('STM32_RUNTIME_IMAGE_LOCK') === '/workspace/stm32/runtime-image-lock.json',
    },
  };
}

function inspectBrokerPolicy() {
  const policy = DOCKER_BUILD_RUNTIME_POLICY;
  return {
    networkNone: policy.network === 'none', readOnly: policy.readOnly,
    noPrivileges: policy.noNewPrivileges, capabilitiesDropped: policy.capabilities.length === 0,
    pids: policy.pids, memoryMiB: policy.memoryMiB === policy.memorySwapMiB ? policy.memoryMiB : null,
    cpus: policy.cpus,
    ephemeralWrites: policy.tmpfs.length === 2 && policy.tmpfs.some((value) => value.startsWith('/workspace:rw,noexec,nosuid,nodev,size=32m,'))
      && policy.tmpfs.some((value) => value.startsWith('/tmp:rw,noexec,nosuid,nodev,size=16m,')),
  };
}

function parseLock(source, name) {
  try {
    const value = parseCompilerImageLock(source);
    return { image: value.image, imageId: value.imageId };
  } catch { return fail('LOCAL_READINESS_LOCK_INVALID', [name]); }
}

async function optionalRead(filename) {
  try { return await readFile(filename, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function assessLocalReadiness(checkoutRoot, fixtureSource) {
  const fixture = parseFixture(fixtureSource);
  const root = path.resolve(checkoutRoot);
  const [composeSource, packageSource, brokerSource, runtimePolicySource, lockContractSource] = await Promise.all([
    readFile(path.join(root, FILES.compose), 'utf8'), readFile(path.join(root, FILES.package), 'utf8'),
    readFile(path.join(root, FILES.broker), 'utf8'), readFile(path.join(root, FILES.runtimePolicy), 'utf8'),
    readFile(path.join(root, FILES.lockContract), 'utf8'),
  ]);
  const packageValue = parseStrictJson(packageSource, 512 * 1024);
  const compose = inspectCompose(composeSource);
  const broker = inspectBrokerPolicy();
  const blockers = [];
  if (!compose.profile || !compose.loopbackOnly) blockers.push('LOCAL_BIND_NOT_LOOPBACK');
  if (!compose.readOnly || !compose.restartDisabled || !compose.dockerSocketReadOnly) blockers.push('LOCAL_GATEWAY_BOUNDARY_INVALID');
  if (compose.gatewayLimits.cpus !== 2 || compose.gatewayLimits.memoryMiB !== 512 || compose.gatewayLimits.pids !== 128) blockers.push('LOCAL_GATEWAY_LIMIT_INVALID');
  if (!broker.networkNone || !broker.readOnly || !broker.noPrivileges || !broker.capabilitiesDropped
      || !broker.ephemeralWrites || broker.cpus !== 1 || broker.memoryMiB !== 256 || broker.pids !== 64) {
    blockers.push('LOCAL_CHILD_BOUNDARY_INVALID');
  }
  const expectedScripts = {
    build: 'node scripts/build-staging.mjs', setupAvr: 'sh scripts/setup-local-toolchain.sh',
    setupRp2040: 'sh scripts/setup-rp2040-toolchain.sh', setupStm32: 'sh scripts/setup-stm32-public-images.sh',
  };
  if (packageValue.scripts?.build !== expectedScripts.build
      || packageValue.scripts?.['setup:toolchain'] !== expectedScripts.setupAvr
      || packageValue.scripts?.['setup:rp2040-toolchain'] !== expectedScripts.setupRp2040
      || packageValue.scripts?.['setup:stm32-public-images'] !== expectedScripts.setupStm32) {
    blockers.push('LOCAL_RECIPE_MISMATCH');
  }
  const locks = {}; const lockHashes = {};
  for (const name of IMAGE_KEYS) {
    if (!compose.lockBindings[name]) { blockers.push(`LOCAL_LOCK_BINDING_MISSING:${name}`); continue; }
    const source = await optionalRead(path.join(root, FILES[name]));
    if (source === null) { blockers.push(`LOCAL_LOCK_MISSING:${name}`); continue; }
    locks[name] = parseLock(source, name); lockHashes[name] = sha256(source);
    const installed = fixture.installedImages[name];
    if (installed === null) blockers.push(`LOCAL_IMAGE_MISSING:${name}`);
    else if (installed !== locks[name].imageId) blockers.push(`LOCAL_IMAGE_MISMATCH:${name}`);
  }
  if (fixture.runtime !== 'docker-available') blockers.push('LOCAL_RUNTIME_MISSING:docker');
  const configurationSha256 = sha256(canonical({
    compose: sha256(composeSource), package: sha256(packageSource), broker: sha256(brokerSource),
    runtimePolicy: sha256(runtimePolicySource), lockContract: sha256(lockContractSource), locks: lockHashes,
  }));
  return Object.freeze({
    schema: LOCAL_READINESS_REPORT_SCHEMA, configurationSha256,
    source: Object.freeze({ composeSha256: sha256(composeSource), packageSha256: sha256(packageSource),
      brokerSha256: sha256(brokerSource), runtimePolicySha256: sha256(runtimePolicySource),
      lockContractSha256: sha256(lockContractSource), lockSha256: Object.freeze(lockHashes) }),
    profiles: Object.freeze({ avr: locks.avr ? 'assessed' : 'unavailable', rp2040: locks.rp2040 ? 'assessed' : 'unavailable',
      stm32: locks.stm32Builder && locks.stm32Runtime ? 'assessed' : 'unavailable',
      esp32c3: 'unavailable-separate-licensed-images' }),
    status: Object.freeze({ configurationAssessed: blockers.length ? 'blocked' : 'ready',
      serviceHealthy: 'not-checked', compilerRuntimeReady: 'not-checked', realFirmwareExecutionTested: 'not-tested' }),
    blockers: Object.freeze(blockers),
    boundaries: Object.freeze({ loopbackOnly: compose.loopbackOnly, childNetwork: 'none', childReadOnly: broker.readOnly,
      childCpu: broker.cpus, childMemoryMiB: broker.memoryMiB, childPids: broker.pids,
      storage: 'ephemeral-tmpfs', secretsCollected: false, remoteRegistration: false }),
    nextCommands: Object.freeze([
      'npm ci --ignore-scripts --no-audit --no-fund', 'npm run build', 'npm run setup:toolchain',
      'npm run setup:rp2040-toolchain', 'npm run setup:stm32-public-images',
      'DOCKER_GID=$(stat -c %g /var/run/docker.sock) docker compose --profile local-compiler up --build -d local-compiler',
    ]),
    distribution: 'Toolchain images and licensed runtime assets are local prerequisites, not project release artifacts.',
  });
}

export function canonicalLocalReadinessReport(report) { return canonical(report); }

export async function reopenLocalReadinessReport(reportSource, checkoutRoot, fixtureSource) {
  const saved = parseStrictJson(reportSource, 128 * 1024);
  if (!saved || saved.schema !== LOCAL_READINESS_REPORT_SCHEMA || typeof saved.configurationSha256 !== 'string') {
    fail('LOCAL_READINESS_REPORT_INVALID');
  }
  const current = await assessLocalReadiness(checkoutRoot, fixtureSource);
  return Object.freeze({ sameConfiguration: saved.configurationSha256 === current.configurationSha256,
    savedConfigurationSha256: saved.configurationSha256, currentConfigurationSha256: current.configurationSha256 });
}
